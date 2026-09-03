import { Container, getContainer } from "@cloudflare/containers";

export interface Env {
  RECAST_RENDER: DurableObjectNamespace<RecastRenderContainer>;
}

const ALLOWED_ORIGIN = "https://recast.castelmei.com";

export class RecastRenderContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "30m";
  enableInternet = false;
  envVars = {
    NODE_ENV: "production",
    PUPPETEER_EXECUTABLE_PATH: "/usr/bin/chromium",
  };
}

function json(body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": ALLOWED_ORIGIN,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "authorization,content-type",
      "cache-control": "no-store",
      ...extra
    }
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, 401);
}

function cors(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", ALLOWED_ORIGIN);
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "authorization,content-type");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": ALLOWED_ORIGIN,
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "authorization,content-type",
          "access-control-max-age": "86400"
        }
      });
    }

    if (url.pathname === "/health") return json({ ok: true, service: "reCast render API", publicStudio: true });
    if (!url.pathname.startsWith("/v1/render")) return json({ error: "Not found" }, 404);
    const origin = request.headers.get("origin");
    if (origin && origin !== ALLOWED_ORIGIN) return json({ error: "Forbidden origin" }, 403);

    let jobId = url.pathname.match(/^\/v1\/render\/([^/]+)/)?.[1];
    if (request.method === "POST" && url.pathname === "/v1/render") {
      jobId = crypto.randomUUID();
      const container = getContainer(env.RECAST_RENDER, jobId);
      const forwarded = new Request(new URL("/render", request.url), request);
      forwarded.headers.set("x-recast-job-id", jobId);
      return cors(await container.fetch(forwarded));
    }

    if (!jobId) return json({ error: "Not found" }, 404);
    const container = getContainer(env.RECAST_RENDER, jobId);
    const path = url.pathname.endsWith("/output") ? "/output" : "/status";
    const forwarded = new Request(new URL(path, request.url), {
      method: "GET",
      headers: { "x-recast-job-id": jobId }
    });
    return cors(await container.fetch(forwarded));
  }
};
