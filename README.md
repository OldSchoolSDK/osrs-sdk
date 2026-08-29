# OldSchoolSDK

- [Click here to try the Inferno Trainer](https://www.infernotrainer.com/)
- [Click here to try the Sol Heredit Trainer](https://colosim.com/)
- [Join our Discord](https://discord.gg/Z3ZyY7Yzt5)

## What is this project?

This project stemmed from my interest in Old School Runescape's Inferno, and my desire for an open source, relatively clean re-implementation of the Old School Runescape engine. The underlying code is designed closer to a true game engine compared to any other trainer or simulator. The goal is for there to be a clean, well-defined API between all "Game Content" code and any underlying "Engine" code

## What is the lineage of this project?

The [BISTools Line of Sight tool](https://bistools.github.io/inferno.html) inspired [artsicle's inferno tool](https://artsicleofficial.github.io/infernointeractive/inferno.html) which inspired the original 2D Inferno Trainer by [@Tesla Owner](https://github.com/TeslaOwner/), which inspired [@Supalosa](https://github.com/Supalosa/) to both bring an accurate 3D mode as well as the Colosim.

Without all of these contributors that built upon each other, the polished version we have today would not exist.

## How do I use it?

This is published at `osrs-sdk`. Please see [here](https://github.com/OldSchoolSDK/InfernoTrainer) for example implementations. Better instructions will come soon.

## I found a bug!

Likely. Please open a issue above. Videos, screenshots, proof of OSRS science, etc is appreciated. I want this to be a faithful re-implementation of OSRS and all bugs are appreciated.

## Can I contribute?

Sure. Right now the code is undergoing rapid development and the API is not stable. I am open to pull requests but I suggest you start small and [join our Discord](https://discord.gg/Z3ZyY7Yzt5), specifically the #development room.

## Development notes

### Developing the project from this project (with the "sample" environment):

    npm run start

Open up http://localhost:8000 in the browser.

### Developing the project from a client project:

Modify `package.json`:

    -  "main": "_bundles/main.js",
    +  "main": "src/sdk/index.js",
    -  "files": []

From this project:

    npm link

From client project

    npm link osrs-sdk

When done, revert the changes to `package.json` and `npm unlink osrs-sdk`, and re-install `osrs-sdk` at the desired SDK version.

### Running tests

    npx jest

## Releasing `osrs-sdk`

Releases are prepared through the **Prepare release** workflow in GitHub Actions.
This creates the version-bump pull request; it does not publish the package.

1. Merge the changes intended for the release into `main`.
2. In GitHub, open **Actions** → **Prepare release** → **Run workflow** and enter the next version without a `v` prefix, for example `0.1.9`.
3. The workflow validates the version, creates `release/<version>`, updates `package.json` and `package-lock.json`, and opens a release PR against `main`.
4. Review and merge that release PR.
5. Create a GitHub release with a tag matching the package version, for example `0.1.9`. This runs the `publish-npm` workflow, which tests, builds, and publishes the package to npm.
6. After the npm publish succeeds, open a client PR (such as in the Colosseum trainer) that updates its `osrs-sdk` dependency and lockfile to the published version.

Before using the workflow, repository settings must allow GitHub Actions to create pull requests: **Settings** → **Actions** → **General** → **Allow GitHub Actions to create and approve pull requests**.
