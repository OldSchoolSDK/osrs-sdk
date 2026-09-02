Most legacy Ogg sound effects in this directory were extracted using
https://github.com/lequietriot/Old-School-RuneScape-Cache-Tools.

Cache-derived sounds use a generated `cache-sound-effects.<sha256>.soundpack`.
It contains the raw index-4 definitions for the selected sound IDs; the SDK
synthesizes their 22,050 Hz mono PCM on first preload or playback and caches
the resulting `AudioBuffer`.

The cache IDs live in the shared [`CacheAssets.ts`](../CacheAssets.ts) registry.
The browser runtime and cache extraction pipeline both consume that registry,
so adding a cache-backed asset should start there rather than in an extractor
script.

`npm run assets` generates the pack alongside the cache-render model payloads,
records it in `cache-render-bundle/manifest.json`, and makes the whole asset
set deployable or serveable as one directory. To extract only the sounds from
an existing local cache, use:

```sh
npm run extract:sounds -- /path/to/cache
```

Edited or composite effects that cannot yet be represented by a known set of
cache sound IDs remain as Ogg files.
