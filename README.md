# reCast

**reCast** is a clean-room, independently implemented toolkit for turning HTML, CSS, media and scripted motion into deterministic video.

It is designed around a simple workflow:

1. Create a normal HTML composition.
2. Define its canvas, frame rate and duration in `recast.json`.
3. Preview it in a browser.
4. Render deterministic frames and encode them to MP4.

## Status

The repository is being developed as an independent implementation. The current foundation includes the composition model, timing utilities, runtime injection, starter-project generator, configuration validation and preview server. The rendering engine, asset pipeline and studio are being added as separate layers.

## Quick start

```bash
npm install
npm run build
node packages/cli/bin/recast.js init my-video
cd my-video
node ../packages/cli/bin/recast.js check
node ../packages/cli/bin/recast.js preview
```

Open `http://localhost:4173`.

## Design goals

- Independent implementation and terminology
- Small, composable packages
- Deterministic frame evaluation
- Browser-native HTML/CSS authoring
- Reusable animation adapters
- Efficient browser/process reuse during rendering
- Local-first development
- Optional cloud rendering adapters later
- Strong validation and tests

## Roadmap

- [x] Project foundation
- [x] Composition/timing primitives
- [x] Starter project generator
- [x] Configuration validation
- [x] Local preview server
- [ ] Headless browser frame renderer
- [ ] FFmpeg encoder pipeline
- [ ] Asset manifest and cache
- [ ] Timeline/scene API
- [ ] Animation adapters
- [ ] Audio mixing
- [ ] Studio UI
- [ ] Registry/components
- [ ] Cloud rendering adapters
- [ ] Performance and regression suite

## Name

`reCast` is the project name. It is intentionally distinct from the original project's branding and package namespace.

## License

Apache-2.0. See `LICENSE`.
