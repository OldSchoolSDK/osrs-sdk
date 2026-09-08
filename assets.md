# Asset pipeline

The SDK publishes the Node-only [osrs-sdk-assets](packages/osrs-sdk-assets/README.md)
CLI separately from its runtime package. Clients own their encounter requirements
and run extraction in their own projects.

Base requirements live in [src/assets/CacheAssets.ts](src/assets/CacheAssets.ts)
and are exported through `osrs-sdk/asset-manifest` without browser dependencies.
The sample owns [sample/assets.ts](sample/assets.ts) and its scene adjustments.
[osrs-assets.config.ts](osrs-assets.config.ts) configures the sample's build.

```sh
npm ci
npm run build
npm run assets
npm run start
```

The build reuses or downloads the OpenRS2 cache pinned in
`osrs-assets.config.ts`, together with its keys. Using the sibling
`osrscachereader` checkout (run `npm ci` there first), it extracts models,
textures, animations and sounds into `cache-render-bundle`. Host that folder and
configure the runtime manifest URL. During SDK development, webpack serves it at
`/cache-assets/`. Application images and imported audio remain outside this
pipeline. All RuneScape assets are property of Jagex.

## Releases

The SDK and asset tool are versioned and released together. The Prepare release
action updates both package versions and the lockfile in one version-bump PR.
Creating the matching GitHub release tag publishes both packages. Do not update
trainer registry dependencies until that shared version is published.
