import { test, expect } from "playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../ui/", import.meta.url));
let server;
let baseURL;

const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

function startServer() {
  return new Promise((resolve, reject) => {
    server = createServer(async (req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const relative = normalize(pathname.replace(/^\/+/, ""));
        const file = join(root, relative || "index.html");
        if (!file.startsWith(root)) throw new Error("forbidden");
        const data = await readFile(file);
        res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        res.end(data);
      } catch {
        res.writeHead(404); res.end("Not found");
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      baseURL = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
}

await startServer();

test.afterAll(async () => server?.close());

test("Studio boots without console errors", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${baseURL}/index.html`);
  await expect(page.locator("#status")).toHaveText("Studio ready");
  await expect(page.locator("#sceneList .scene")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("core Studio controls work and pause freezes preview animations", async ({ page }) => {
  await page.goto(`${baseURL}/index.html`);
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.locator("#status")).toHaveText("Valid · 150 frames");

  await page.getByRole("button", { name: "Play" }).click();
  await expect(page.locator("#status")).toHaveText("Playing");
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: /Pause/ }).click();
  await expect(page.locator("#status")).toHaveText("Paused");
  const pausedAnimationTime = await page.locator("#preview").evaluate(frame => frame.contentDocument?.getAnimations?.()[0]?.currentTime);
  await page.waitForTimeout(150);
  const stillAnimationTime = await page.locator("#preview").evaluate(frame => frame.contentDocument?.getAnimations?.()[0]?.currentTime);
  expect(Number(stillAnimationTime)).toBeCloseTo(Number(pausedAnimationTime), 1);

  await page.getByRole("button", { name: "↶" }).click();
  await expect(page.locator("#time")).toHaveText("0.00s");

  await page.getByRole("button", { name: "＋ Add scene" }).click();
  await expect(page.locator("#sceneList .scene")).toHaveCount(2);
  await page.locator("#sceneList .scene").nth(1).click();
  await expect(page.locator("#status")).toHaveText("Selected Scene 2");
});

test("HTML open and save flows work", async ({ page }) => {
  await page.goto(`${baseURL}/index.html`);
  const html = "<!doctype html><html><body><h1 id='loaded'>Loaded</h1></body></html>";
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Open HTML" }).click();
  await (await chooser).setFiles({ name: "test.html", mimeType: "text/html", buffer: Buffer.from(html) });
  await expect(page.locator("#projectName")).toHaveText("test.html");
  await expect(page.locator("#preview")).toHaveAttribute("srcdoc", /Loaded/);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save HTML" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("test.recast");
});

test("Render MP4 never asks for a token and completes through the public API contract", async ({ page }) => {
  await page.goto(`${baseURL}/index.html`);
  let renderCalls = 0;
  await page.route("https://api.recast.castelmei.com/**", async route => {
    const url = route.request().url();
    renderCalls++;
    if (url.endsWith("/v1/render")) return route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ jobId: "e2e-job", status: "queued", expectedFrames: 150 }) });
    if (url.endsWith("/v1/render/e2e-job")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ jobId: "e2e-job", status: "complete", progress: 100 }) });
    if (url.endsWith("/v1/render/e2e-job/output")) return route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.from("fake-mp4") });
    return route.fulfill({ status: 404, body: "not found" });
  });

  const dialogs = [];
  page.on("dialog", async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Render MP4" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^reCast-e2e-job\.mp4$/);
  expect(dialogs).toEqual([]);
  expect(renderCalls).toBeGreaterThanOrEqual(3);
  await expect(page.locator("#status")).toHaveText("Render complete");
});
