import { mkdir, writeFile, readFile, stat, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.PORT || 8080);
const ROOT = "/work";
const MAX_HTML = 2 * 1024 * 1024;
const MAX_ASSET_MANIFEST = 512 * 1024;
const jobs = new Map();

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": data.length, "cache-control": "no-store" });
  res.end(data);
}

function auth(req) {
  const expected = req.headers["x-recast-token"];
  return Boolean(expected && process.env.RECAST_CONTAINER_TOKEN && expected === process.env.RECAST_CONTAINER_TOKEN);
}

async function body(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function safeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || randomUUID();
}

async function renderJob(job) {
  const dir = join(ROOT, safeId(job.id));
  const configPath = join(dir, "recast.json");
  const htmlPath = join(dir, "index.html");
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(htmlPath, job.html, "utf8");
    await writeFile(configPath, JSON.stringify(job.config, null, 2), "utf8");
    jobs.set(job.id, { ...jobs.get(job.id), status: "running", progress: 0 });

    const child = spawn("node", ["/app/packages/cli/bin/recast.js", "render", configPath], {
      cwd: dir,
      env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: "/usr/bin/chromium", PUPPETEER_NO_SANDBOX: "1" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.stdout.on("data", chunk => {
      const text = chunk.toString();
      const match = text.match(/Rendering\s+(\d+)\/(\d+)\s+frames/);
      if (match) jobs.set(job.id, { ...jobs.get(job.id), progress: Math.min(99, Math.round((Number(match[1]) / Number(match[2])) * 90)) });
      if (text.includes("Encoding video")) jobs.set(job.id, { ...jobs.get(job.id), progress: 95 });
    });

    const code = await new Promise(resolveCode => child.on("close", resolveCode));
    if (code !== 0) throw new Error(stderr.trim() || `Renderer exited with code ${code}`);
    const output = resolve(dir, job.config.render?.output || `renders/${job.config.id || "recast"}.mp4`);
    const info = await stat(output);
    jobs.set(job.id, { ...jobs.get(job.id), status: "complete", progress: 100, output: output, size: info.size, completedAt: new Date().toISOString() });
  } catch (error) {
    jobs.set(job.id, { ...jobs.get(job.id), status: "failed", progress: 0, error: error instanceof Error ? error.message : String(error) });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health") return json(res, 200, { ok: true, service: "reCast renderer" });
  if (!auth(req)) return json(res, 401, { error: "Unauthorized" });

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "POST" && url.pathname === "/render") {
      const raw = await body(req, MAX_HTML + MAX_ASSET_MANIFEST);
      const payload = JSON.parse(raw);
      if (typeof payload.html !== "string" || payload.html.length > MAX_HTML) return json(res, 413, { error: "HTML exceeds the 2 MiB limit" });
      const config = payload.config || {};
      const width = Number(config.width), height = Number(config.height), fps = Number(config.fps), duration = Number(config.duration);
      if (![width, height, fps, duration].every(Number.isFinite) || width <= 0 || height <= 0 || fps <= 0 || duration <= 0) return json(res, 400, { error: "Invalid render dimensions, fps or duration" });
      if (width * height > 8294400 || duration > 300) return json(res, 400, { error: "Render exceeds configured resource limits" });
      const id = safeId(req.headers["x-recast-job-id"] || randomUUID());
      const job = { id, html: payload.html, config: { ...config, width, height, fps, duration, entry: "index.html", render: { format: "mp4", ...(config.render || {}), output: `renders/${id}.mp4` } } };
      jobs.set(id, { id, status: "queued", progress: 0, createdAt: new Date().toISOString() });
      void renderJob(job);
      return json(res, 202, { jobId: id, status: "queued" });
    }

    const match = url.pathname.match(/^\/(status|output)$/);
    if (match && req.headers["x-recast-job-id"]) {
      const id = safeId(req.headers["x-recast-job-id"]);
      const job = jobs.get(id);
      if (!job) return json(res, 404, { error: "Job not found" });
      if (match[1] === "status") return json(res, 200, job);
      if (job.status !== "complete") return json(res, 409, { error: "Render is not complete", status: job.status });
      const file = await readFile(job.output);
      res.writeHead(200, { "content-type": "video/mp4", "content-length": file.length, "content-disposition": `attachment; filename="${id}.mp4"`, "cache-control": "private, no-store" });
      return res.end(file);
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    return json(res, error?.message === "Request too large" ? 413 : 400, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`reCast renderer listening on ${PORT}`));
