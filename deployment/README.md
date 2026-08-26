# reCast deployment

This directory documents the deployment boundary for the hosted Studio.

## Intended topology

- `recast.castelmei.com` — browser Studio
- `api.recast.castelmei.com` — render API boundary
- render workers — Chromium + FFmpeg
- object storage — source assets and completed renders

The browser Studio remains usable without a hosted renderer. The hosted renderer must be added behind an authenticated API; never expose arbitrary shell/FFmpeg execution directly to the public browser.

## Cloudflare

Point `recast.castelmei.com` at the static Studio host using the existing DNS record. Keep the current CNAME target until it has been inspected and verified.

For the render API, use a separate hostname such as `api.recast.castelmei.com` and route it to a controlled Worker/service. The Worker should authenticate jobs, validate the composition manifest, enqueue work, and return a job ID. Actual Chromium/FFmpeg rendering should run in a suitable worker/container environment rather than inside a request handler.

Do not store Cloudflare API tokens, GitHub tokens, or renderer credentials in this repository. Use Cloudflare/GitHub encrypted secrets.
