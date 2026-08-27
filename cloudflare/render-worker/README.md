# reCast Cloud Render API

This is the production deployment boundary for hosted rendering.

## Deploy

From `cloudflare/render-worker`:

```bash
npm install
npx wrangler login
npx wrangler secret put RECAST_API_TOKEN
npx wrangler deploy
```

Cloudflare Containers builds the Dockerfile and rolls out the container when `wrangler deploy` is run. Containers are available on the Workers Paid plan.

## Local development

Docker must be running. Then:

```bash
npx wrangler dev
```

The container image includes Chromium and FFmpeg and runs the existing reCast deterministic renderer.

## API

- `POST /v1/render` — queue a render.
- `GET /v1/render/:jobId` — inspect status/progress.
- `GET /v1/render/:jobId/output` — retrieve the completed MP4.
- `GET /health` — health check.

The API requires `Authorization: Bearer <RECAST_API_TOKEN>`.

**Never put `RECAST_API_TOKEN` into the Studio source code or Git repository.** The Studio asks the user for a token and keeps it in browser-local storage. For a public multi-user service, replace this shared-token model with Cloudflare Access/OIDC or another per-user authentication layer before opening rendering to the public internet.

## Production safety

The first version deliberately blocks outbound internet access inside the render container, limits HTML size, limits render dimensions/duration, and runs Chromium without network access. Remote assets therefore need to be uploaded into the project/assets system before rendering.

For production scale, move completed output files to R2 and keep job metadata in Durable Object SQLite rather than relying on the container's ephemeral filesystem.
