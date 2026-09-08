# osrs-sdk-assets

Node-only tools for building the static cache-render bundle used by `osrs-sdk`.
The browser application does not import this package or the cache reader.
Requires Node 20 or newer and an SDK that exports `osrs-sdk/asset-manifest`.
Extraction also requires a local `osrscachereader` checkout with its dependencies
installed using `npm ci`. The reader is loaded directly on each CLI invocation.

## Client setup

The tool has the same version as `osrs-sdk` and is released with it. Install both
at that shared version, with this tool as an exact development dependency. Commit
package.json and package-lock.json:

```sh
npm install --save-exact osrs-sdk@<version>
npm install --save-dev --save-exact osrs-sdk-assets@<same-version>
```

Keep the cache reader beside the trainer and install its locked dependencies:

```sh
git clone --branch feat/reader-only-entrypoint https://github.com/Supalosa/osrscachereader.git ../osrscachereader
npm --prefix ../osrscachereader ci
```

The default reader path is `../osrscachereader`, relative to the client config.
Use `readerPath` in the config, `OSRS_CACHE_READER_PATH`, or `--reader-path` to
select another checkout (CLI takes precedence, then environment, then config).

Keep client requirements in a browser-safe module:

```ts
// src/assets.ts
import type { CacheAssets } from "osrs-sdk/asset-manifest";

export const trainerAssets = {
  npcs: {
    boss: {
      id: 12345,
      animations: { attack: 6789, death: 6790 },
    },
  },
  regions: { arena: { id: 4321 } },
  spotAnims: { projectile: { id: 987 } },
  sounds: { bossAttack: { id: 654 } },
} as const satisfies CacheAssets;
```

Gameplay can import the same constants. The build configuration stays Node-only:

```ts
// osrs-assets.config.ts
import { defineConfig } from "osrs-sdk-assets";
import { trainerAssets } from "./src/assets";

export default defineConfig({
  cache: { openrs2: YOUR_OPENRS2_CACHE_ID },
  assets: trainerAssets,
  outDir: "./public/osrs-assets",
});
```

Replace `YOUR_OPENRS2_CACHE_ID` with a snapshot that contains the required
definitions and has XTEA coverage for the regions being extracted.

Add `"assets": "osrs-sdk-assets build"` to package.json scripts, then run:

```sh
npm run assets
```

`npx osrs-sdk-assets build` runs the same executable. Prefer the installed,
lockfile-pinned tool for repeatable builds. `osrs-sdk-assets --help` lists options.

Add the generated directory to the application's static files. For webpack with
`copy-webpack-plugin`:

```js
new CopyPlugin({
  patterns: [{ from: "public/osrs-assets", to: "osrs-assets" }],
});
```

Configure the SDK before creating the trainer:

```ts
import { CacheRender } from "osrs-sdk";

CacheRender.configure(
  new URL("osrs-assets/manifest.json", window.location.href).href,
);
```

Other build systems can copy or deploy `public/osrs-assets` directly. The
manifest and every referenced payload must be available under the same base URL.

Paths are relative to the configuration file, not the tool's installation.
The default cache directory is `.cache-render/openrs2`; `cacheDir` or
`--cache-dir` can point to a shared cache directory. A complete pinned cache is
reused without network access. Missing caches and their XTEA keys are downloaded
from OpenRS2. Builds never choose latest implicitly: change the committed cache
ID deliberately, or use `--cache <id>` for a one-off experiment.

## Requirements and merging

The tool resolves `osrs-sdk/asset-manifest` from the client's installation and
automatically includes that SDK's base player, equipment, spell and sound
requirements. The SDK sample is an ordinary client of this process.

Supported categories: `npcs`, `models`, `regions`, `spotAnims`, `items`,
`playerAnimations`, `objects`, and `sounds`. Cache definitions supply dependent
models, textures, idle/walk animations and animation-triggered sounds. Additional
attack/death animations and gameplay-triggered sounds must be declared explicitly.
Items extract male equipment models; inventory icons and application
images/audio remain application assets. Object IDs in scene replacement rules
are resolved automatically; the `objects` category is a named registry for those
rules, not a request to emit standalone object models.

Named definitions merge by category. Aliases with the same cache ID share one
extraction and union their animations. Conflicting IDs, named animations,
clickbox rules or normalized item aliases fail with an actionable error.
`overrides` explicitly replaces a whole named definition; it cannot target an
unknown name. When multiple aliases refer to the same ID, their requirements
must still agree. Inputs are not mutated.

Animation values are cache IDs. SDK player pose definitions are ordered runtime
data, so clients can add player animations but cannot replace SDK pose IDs.

## Scene adjustments

Optional `scenes` maps a declared region ID to `replacements`,
`rectangleReplacements`, and `removals`. Coordinates are region-local (0–63).
Each rule can specify `z` to restrict it to one plane. Exact replacements win
over rectangular replacements, which win over removals. Replacement rules use
`objectId` and optionally `orientation` (0–3).

```ts
scenes: {
  7216: {
    removals: [{ xMin: 10, xMax: 12, yMin: 10, yMax: 12, z: 0 }],
  },
},
```

For unusual cases, `hooks.sceneLocation(regionId, location)` can return a changed
location or null after declarative rules run. `hooks.clickboxFilter[npcId]` can
classify model faces. These are trusted build-time functions; keep them in the
configuration, never in browser imports. Function source is recorded for build
diagnostics, but it is not a complete fingerprint of arbitrary external state
used by hooks. Hooks should be deterministic.

## Hosting and development

Host the complete output directory on any static host and point the runtime's
manifest URL at `manifest.json`. Payload paths are relative, so the directory can
live under a subpath. Configure CORS when assets and the app use different origins.
Serve `.bin` and `.soundpack` as binary files, not an SPA HTML fallback. Hashed
files can use immutable caching; manifest.json should revalidate. `build-info.json`
records cache, SDK/tool versions, merged requirements and their hash.

Builds write payloads first, replace the manifest atomically, then remove obsolete
generated payloads. Unrelated output files are retained. Deploy the folder as one
release to avoid serving a mix of builds. `.build.lock` prevents simultaneous
writers to one output; after a killed process, remove its lock before retrying.

Ignore generated output, `.cache-render/`, and `.osrs-assets-config-*.mjs` in Git.
Cache archives and processed assets are not included in the npm package.

## SDK repository development

```sh
npm ci
npm run build
npm run test:assets
npm run assets
npm pack --workspace osrs-sdk-assets
```

The reader checkout must provide `src/reader.js`. Reader edits are picked up on
the next extraction without rebuilding the asset tool. Download and serve
commands, and the asset-tool build itself, do not require the reader.
