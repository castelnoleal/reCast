#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , command = "help", ...args] = process.argv;
const cwd = process.cwd();

function help() {
  console.log(`reCast 0.1.0\n\nHTML/CSS to deterministic video toolkit\n\nCommands:\n  recast init [directory]     Create a starter composition\n  recast preview [file]      Start a local preview server\n  recast render [file]       Render the composition with FFmpeg\n  recast check [file]        Validate composition metadata\n  recast doctor              Check local rendering dependencies`);
}

function init() {
  const dir = resolve(cwd, args[0] ?? "recast-project");
  mkdirSync(dir, { recursive: true });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>reCast Composition</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111;color:white;font-family:system-ui}main{width:100vw;height:100vh;display:grid;place-items:center}.title{font-size:72px;font-weight:800;animation:rise 1s both}@keyframes rise{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}</style></head><body><main><div class="title">Hello from reCast</div></main></body></html>`;
  writeFileSync(resolve(dir, "index.html"), html);
  writeFileSync(resolve(dir, "recast.json"), JSON.stringify({ id: "starter", width: 1920, height: 1080, fps: 30, duration: 5, entry: "index.html" }, null, 2) + "\n");
  console.log(`Created ${dir}`);
}

function check(file = "recast.json") {
  const path = resolve(cwd, file);
  if (!existsSync(path)) throw new Error(`Missing ${file}`);
  const config = JSON.parse(readFileSync(path, "utf8"));
  for (const key of ["width", "height", "fps", "duration", "entry"]) if (config[key] == null) throw new Error(`Missing configuration field: ${key}`);
  if (config.width <= 0 || config.height <= 0 || config.fps <= 0 || config.duration <= 0) throw new Error("Dimensions, fps and duration must be positive");
  console.log(`✓ ${file} is valid`);
}

async function preview(file = "recast.json") {
  check(file);
  const config = JSON.parse(readFileSync(resolve(cwd, file), "utf8"));
  const entry = resolve(cwd, config.entry);
  const http = await import("node:http");
  const server = http.createServer((req, res) => {
    if (req.url === "/") { res.writeHead(200, { "content-type": "text/html" }); res.end(readFileSync(entry)); return; }
    res.writeHead(404); res.end("Not found");
  });
  server.listen(4173, () => console.log(`reCast preview: http://localhost:4173`));
}

async function main() {
  if (command === "help" || command === "--help" || command === "-h") return help();
  if (command === "init") return init();
  if (command === "check") return check(args[0]);
  if (command === "preview") return preview(args[0]);
  if (command === "render") return console.log("Render pipeline scaffolded; FFmpeg frame orchestration is the next engine layer.");
  if (command === "doctor") return console.log(`Node ${process.version}\nFFmpeg: check with 'ffmpeg -version'\nBrowser: Chromium-compatible renderer required for video export`);
  help();
}
main().catch(error => { console.error(`reCast: ${error.message}`); process.exitCode = 1; });
