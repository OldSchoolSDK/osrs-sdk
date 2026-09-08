# Asset pipeline scripts

The asset tool is in [packages/osrs-sdk-assets](../../packages/osrs-sdk-assets/README.md).
These entry points provide the SDK repository's npm commands and test imports.
`npm run assets -- <OpenRS2 cache ID>` explicitly selects a cache; plain
`npm run assets` uses [osrs-assets.config.ts](../../osrs-assets.config.ts). There
is no implicit latest.

The extractor accepts client-owned requirements and scene rules. It loads the
local reader checkout at `../osrscachereader` by default; select another path with
`--reader-path` or `OSRS_CACHE_READER_PATH`. Run `npm ci` in the reader checkout.
