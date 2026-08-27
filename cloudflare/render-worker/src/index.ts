import { Container, getContainer } from "@cloudflare/containers";

export interface Env {
  RECAST_RENDER: DurableObjectNamespace<RecastRenderContainer>;
  RECAST_API_TOKEN?: string;
}

export class RecastRenderContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "30m";
  enableInternet = false;
  envVars = {
    NODE_ENV: "production",
    PUPPETEER_EXECUTABLE_PATH: "/usr/bin/chromium"
  };
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const token = env.RECAST_API_TOKEN;
    if (!token) return new Response(JSON.stringify({ error: "Render API is not configured" }), { status: 503, headers: { "content-type": "application/json" } });
    if (request.headers.get("authorization") !== `Bearer ${token}`) return unauthorized();

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "reCast render API" });
    }

    if (!url.pathname.startsWith("/v1/render")) {
      return new Response("Not found", { status: 404 });
    }

    let jobId = url.pathname.match(/^\/v1\/render\/([^/]+)/)?.[1];
    if (request.method === "POST" && url.pathname === "/v1/render") {
      jobId = crypto.randomUUID();
      const container = getContainer(env.RECAST_RENDER, jobId);
      const forwarded = new Request(new URL("/render", request.url), request);
      forwarded.headers.set("x-recast-job-id", jobId);
      forwarded.headers.set("x-recast-token", token);
      return container.fetch(forwarded);
    }

    if (!jobId) return new Response("Not found", { status: 404 });
    const container = getContainer(env.RECAST_RENDER, jobId);
    const path = url.pathname.endsWith("/output") ? "/output" : "/status";
    const forwarded = new Request(new URL(path, request.url), { method: "GET", headers: { "x-recast-token": token, "x-recast-job-id": jobId } });
    return container.fetch(forwarded);
  }
};
