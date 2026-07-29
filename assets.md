## Asset Pipeline (for 3d mode)

**All assets are property of Jagex.** This tool is designed to assist players in overcoming difficult PVM encounters and as part of that, being faithful visually to the game is important.

## Sounds

Currently using https://github.com/lequietriot/Old-School-RuneScape-Cache-Tools. Sound IDs are just grabbed using Visual Sound Plugin or Runelite dev mode.

## Optimising Models

Install the [gltf-transform CLI](https://gltf-transform.dev/) using:

    npm install --global @gltf-transform/cli@3.10.1

**_NOTE:_** `gltf-transform` 4.x requires Node 20+. Since this project uses Node 16, we must use 3.x instead.

Then in the directory that contains GLTF files:

    for file in *.gltf; do
        gltf-transform optimize --compress meshopt $file $(echo $file | sed 's/\.gltf$/\.glb/')
    done

or single line:

    for f in *.gltf; do gltf-transform optimize --compress meshopt "$f" "${f%.gltf}.glb"; done

## Scene models

Currently using a branch of [OSRS-Environment-Exporter](https://github.com/Supalosa/OSRS-Environment-Exporter/pull/1) with hardcoded overrides for the Inferno region to remove ground clutter and clear the space around Zuk.

## Other models

Using Dezinator's `osrscachereader` at https://github.com/Dezinater/osrscachereader:

### Player models

The general command shape is:

    npm run cmd modelBuilder <type> <ids> <model-type> anim <animation-ids> name <output-name> [split]

Example:

    npm run cmd modelBuilder item 26684,27235,27238,27241,26235,28902,13237,22249,12926,20997,11959,25865,23975,23979,23971,7462,22109,21021,21024 maleModel0,maleModel1 anim 808,819,824,820,822,821,426,5061,7618,8057,8056,390 name player split

where:

    item
        - 26684 # tzkal slayer helmet
        - 27235 # masori mask (f)
        - 27238 # masori body (f)
        - 27241 # masori legs (f)
        - 26235 # zaryte vambracess
        - 28902 # dizana's max cape (l)
        - 13237 # pegasian boots
        - 22249 # anguish (or)
        - 20997 # twisted bow
        - 12926 # toxic blowpipe
        - 11959 # black chinchompa
        - 25865 # bow of faerdhinen
        - 23975 # crystal body
        - 23979 # crystal legs
        - 23971 # crystal helm
        - 7462 # barrows gloves
        - 22109 # ava's assembler
        - 21021 # ancestral top (buggy)
        - 21024 # ancestral bottom (buggy)
    anim
      - 808 # idle
      - 819 # walk
      - 824 # run
      - 820 # rotate 180
      - 822 # strafe left
      - 821 # strafe right
      - 426 # fire bow
      - 5061 # fire blowpipe
      - 7618 # throw chinchompa
      - 8057 # scythe idle
      - 8056 # scythe swing
      - 390  # sword slash

Practically speaking, your command should always look like this:

    npm run cmd modelBuilder item <ITEM_IDS> maleModel0,maleModel1 anim 808,819,824,820,822,821,426,5061,7618,8057,8056,390 name player split

See [Optimising Models](#optimising-models) on how to convert the GLTF files to GLB for inclucion in `oldschool-cdn`
