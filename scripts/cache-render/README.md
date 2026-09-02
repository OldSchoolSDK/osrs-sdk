# Cache-render asset pipeline

This directory is Node-only TypeScript (`.mts`) and is deliberately outside
the browser SDK bundle.

- `build.mts` is the one-command developer workflow: acquire a cache, then
  extract the derived browser bundle, including models and sound definitions.
- `download.mts` owns OpenRS2 download and cache metadata.
- `extract.mts` serialises model payloads and the soundpack, then writes the
  versioned manifest.
- `serve.mts` is the small local development server for that manifest.
- `adapter.mts` is the revision-sensitive boundary to `osrscachereader`.
- `scene-touchups.mts` contains presentation edits as declarative recipe data.

The next seams to extract from `adapter.mts` are terrain compilation and model
payload conversion. Keeping them behind this adapter means the SDK runtime
never depends on cache-reader implementation details.
