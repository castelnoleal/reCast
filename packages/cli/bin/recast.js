#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawn, execFileSync } from "node:child_process";

const [, , command = "help", ...args] = process.argv;
const cwd = process.cwd();

function help() {
  console.log(`reCast 0.2.0\n\nHTML/CSS to deterministic video toolkit\n\nCommands:\n  recast init [directory]     Create a starter composition\n  recast preview [file]      Start a local preview server\n  recast render [file]       Render deterministic frames and encode video\n  recast check [file]        Validate composition metadata\n  recast doctor              Check local rendering dependencies\n  recast upstream            Check the latest HyperFrames revision`);
}

function loadConfig(file = "recast.json") {
  const path = resolve(cwd, file);
  if (!existsSync(path)) throw new Error(`Missing ${file}`);
  let config;
  try { config = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error(`${file} is not valid JSON`); }
  for (const key of ["width", "height", "fps", "duration", "entry"]) if (config[key] == null) throw new Error(`Missing configuration field: ${key}`);
  if (![config.width, config.height, config.fps, config.duration].every(Number.isFinite) || config.width <= 0 || config.height <= 0 || config.fps <= 0 || config.duration <= 0) throw new Error("Dimensions, fps and duration must be positive finite numbers");
  const entry = resolve(dirname(path), config.entry);
  if (!existsSync(entry)) throw new Error(`Entry file does not exist: ${config.entry}`);
  return { config, path, entry };
}

function init() {
  const dir = resolve(cwd, args[0] ?? "recast-project");
  mkdirSync(dir, { recursive: true });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>reCast Composition</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111;color:white;font-family:system-ui}main{width:100vw;height:100vh;display:grid;place-items:center}.title{font-size:72px;font-weight:800;animation:rise 1s both}@keyframes rise{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}</style></head><body><main><div class="title">Hello from reCast</div></main></body></html>`;
  writeFileSync(resolve(dir, "index.html"), html);
  writeFileSync(resolve(dir, "recast.json"), JSON.stringify({ id: "starter", width: 1920, height: 1080, fps: 30, duration: 5, entry: "index.html", render: { format: "mp4", quality: "standard" } }, null, 2) + "\n");
  console.log(`Created ${dir}`);
}

function check(file = "recast.json") { loadConfig(file); console.log(`✓ ${file} is valid`); }

async function preview(file = "recast.json") {
  const { entry } = loadConfig(file);
  const http = await import("node:http");
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(readFileSync(entry)); return; }
    res.writeHead(404); res.end("Not found");
  });
  server.listen(4173, () => console.log(`reCast preview: http://localhost:4173`));
}

function ffmpegAvailable() { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } }
function chromeAvailable() { try { execFileSync("node", ["-e", "import('puppeteer').then(async p=>{const b=await p.default.launch({headless:true});await b.close()}).catch(()=>process.exit(1))"], { stdio: "ignore" }); return true; } catch { return false; } }

async function render(file = "recast.json") {
  const { config, entry } = loadConfig(file);
  if (!ffmpegAvailable()) throw new Error("FFmpeg was not found. Install FFmpeg and run `recast doctor`.");
  const puppeteer = await import("puppeteer");
  const outDir = resolve(cwd, "renders");
  const framesDir = resolve(outDir, `.frames-${Date.now()}`);
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  const fps = config.fps;
  const total = Math.ceil(config.duration * fps);
  const output = resolve(cwd, config.render?.output ?? `renders/${config.id ?? "recast"}.mp4`);
  const browser = await puppeteer.default.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: config.width, height: config.height }, deviceScaleFactor: 1 });
    await page.goto(`file://${entry}`, { waitUntil: "networkidle0" });
    await page.evaluate(({ fps }) => { window.__reCastRender = true; window.__reCastFPS = fps; }, { fps });
    for (let frame = 0; frame < total; frame++) {
      const time = frame / fps;
      await page.evaluate((t) => {
        document.documentElement.style.setProperty('--recast-time', `${t}s`);
        window.__reCast = { frame: Math.round(t * window.__reCastFPS), fps: window.__reCastFPS, time: t };
        for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = t * 1000; } catch {} }
        window.dispatchEvent(new CustomEvent('recast:frame', { detail: window.__reCast }));
      }, time);
      await page.screenshot({ path: resolve(framesDir, `frame-${String(frame).padStart(7, "0")}.png`), type: "png" });
      if ((frame + 1) % Math.max(1, Math.floor(fps)) === 0) process.stdout.write(`\rRendering ${frame + 1}/${total} frames`);
    }
    process.stdout.write("\nEncoding video...\n");
    await new Promise((resolvePromise, reject) => {
      const ff = spawn("ffmpeg", ["-y", "-framerate", String(fps), "-i", resolve(framesDir, "frame-%07d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output], { stdio: "inherit" });
      ff.on("error", reject); ff.on("close", code => code === 0 ? resolvePromise() : reject(new Error(`FFmpeg exited with code ${code}`)));
    });
    console.log(`✓ Rendered ${output}`);
  } finally { await browser.close(); }
}

async function doctor() {
  console.log(`Node ${process.version}`);
  console.log(`FFmpeg: ${ffmpegAvailable() ? "available" : "missing"}`);
  console.log(`Puppeteer/Chromium: ${chromeAvailable() ? "available" : "missing (run npm install)"}`);
  console.log("Deterministic mode: frame-seeked capture");
  console.log("HyperFrames compatibility: documentation/behavior tracking enabled");
}

async function upstream() {
  const res = await fetch("https://api.github.com/repos/heygen-com/hyperframes/branches/main", { headers: { accept: "application/vnd.github+json", "user-agent": "reCast-upstream-check" } });
  if (!res.ok) throw new Error(`Unable to query HyperFrames: HTTP ${res.status}`);
  const data = await res.json();
  const releaseRes = await fetch("https://api.github.com/repos/heygen-com/hyperframes/releases/latest", { headers: { accept: "application/vnd.github+json", "user-agent": "reCast-upstream-check" } });
  const release = releaseRes.ok ? await releaseRes.json() : null;
  console.log(`HyperFrames main: ${data.commit.sha}`);
  if (release) console.log(`Latest release: ${release.tag_name}`);
  console.log("reCast policy: mirror documented behavior and interfaces; keep implementation independent.");
}

async function main() {
  if (["help", "--help", "-h"].includes(command)) return help();
  if (command === "init") return init();
  if (command === "check") return check(args[0]);
  if (command === "preview") return preview(args[0]);
  if (command === "render") return render(args[0]);
  if (command === "doctor") return doctor();
  if (command === "upstream") return upstream();
  help();
}
main().catch(error => { console.error(`reCast: ${error.message}`); process.exitCode = 1; });
