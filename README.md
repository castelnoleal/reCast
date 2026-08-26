# reCast

**reCast** is a clean-room, independently implemented toolkit for turning HTML, CSS, media and scripted motion into deterministic video.

## Current architecture

reCast now has the first production-oriented rendering layer in place:

- **Core** — deterministic frame/time primitives and runtime injection.
- **Renderer/Producer path** — Puppeteer-driven frame seeking plus FFmpeg encoding.
- **CLI** — `init`, `check`, `preview`, `render`, `doctor`, and `upstream`.
- **Compatibility layer** — tracks HyperFrames upstream revisions and deliberately mirrors documented behavior and interfaces without copying its implementation.

HyperFrames currently documents a frame-by-frame, seek-driven renderer, bundled/browser rendering, FFmpeg encoding, deterministic Docker mode, preview hot reload, multiple output formats, quality presets, GPU paths, and separate core/engine/producer/studio/player packages. reCast is implementing the equivalent architectural responsibilities independently and incrementally. citeturn0search1turn0search2turn0search5

## Quick start

```bash
npm install
npm run build
node packages/cli/bin/recast.js init my-video
cd my-video
node ../packages/cli/bin/recast.js check
node ../packages/cli/bin/recast.js preview
node ../packages/cli/bin/recast.js render
```

## Deterministic rendering

Rendering evaluates one frame at a time and explicitly seeks Web Animations before capture. The renderer does not depend on realtime playback for frame timing. This follows the same important deterministic principle documented by HyperFrames while keeping the implementation independent. citeturn0search8

## Upstream tracking

Run:

```bash
npm run upstream
```

This checks the current HyperFrames `main` revision and latest release directly from GitHub. The CLI can use this as the compatibility checkpoint before development or rendering.

**Important:** reCast is not intended to blindly copy upstream source. Automatic tracking should update compatibility metadata and trigger compatibility work; source changes should remain independently implemented and reviewed. This prevents an upstream change from silently breaking reCast.

## Roadmap

- [x] Project foundation
- [x] Deterministic frame clock
- [x] Headless browser capture
- [x] FFmpeg MP4 encoding
- [x] Dependency diagnostics
- [x] HyperFrames upstream tracking
- [ ] PNG/WebM/MOV/GIF output profiles
- [ ] Audio extraction/mixing
- [ ] Asset manifest and cache
- [ ] Timeline/scene API
- [ ] Animation adapters for GSAP/Lottie/Three.js/custom runtimes
- [ ] Live-reload preview server
- [ ] Studio UI
- [ ] Embeddable player
- [ ] Component/catalog registry
- [ ] Docker deterministic render profile
- [ ] Automated upstream compatibility regression suite
- [ ] Cloud rendering adapters

## Name

`reCast` is intentionally distinct from the upstream project's branding and package namespace.

## License

Apache-2.0. See `LICENSE`.
