import { createHash } from "crypto";
import { readFileSync } from "fs";
import { parseSoundEffectPack } from "../src/sdk/audio/CacheSoundEffects";
import { synthesizeSoundEffect } from "../src/sdk/audio/SoundEffectSynth";
import { CACHE_SOUND_EFFECT_IDS } from "../src/assets/CacheAssets";

const EXPECTED_PCM = new Map<number, [number, string]>([
  [102, [33075, "becd666c5dc391f5943ff256129202586d220cdc4dc5e752d3c54d8a1c93ae8b"]],
  [106, [34177, "6d88e4a4755b49926254cb216e15dab6f405a2f990ab491dff3001cc244b973f"]],
  [168, [68355, "ec08ca86a921e58cd54464b11070974210b2c8136051f0665cd424eefd2ba28e"]],
  [171, [41895, "100458735beaf99b9d58ab960c13de6912d4d5dd996e3dc3f86747264ca8f756"]],
  [360, [11025, "7660f03a46172933b548ee3c2cf268ea631dd98b91a018c48b3664148f166961"]],
  [800, [11025, "3656e7f4d94bba6b00b775b8435c608ef686c4570073e6f3521c7b40e1bd1a8b"]],
  [1352, [20947, "8e637e4d6a71f081d79d93c1d8d3b3bc0072c06e8b8b0c70ae08ba615aee298b"]],
  [2524, [13230, "ac43816150e2ee8c433dc62c7cbc2b3996e92002c77ec9b6db5bf52113850f5f"]],
  [2696, [18742, "e1bd2be7c3449fb3ab1ac5733fe8f2ac1749997d88c3642bd00b6244f570149d"]],
  [2702, [22050, "f4f1ffb36170c2438fb97c0ca9d11400b6e5eea47d1667d02f07e9500b31d1f6"]],
  [2706, [20947, "55e37595afc0f99664f792f67f35a574df0b4a5602fc4221163bd0abd1e6a375"]],
  [4138, [12568, "870e7e09c61d7666d0de312e20d531cf9eb4b18ae79523a2cffaa5e930252a46"]],
  [4139, [20286, "c1e900f772c6e672188c6400588bf863c083e1898bd60271409aa6cbd0691836"]],
  [4140, [12568, "8e2cf5b6697ba3bc4f0714d1426d76094ae5c11a245d5df7e7c0f5a483e443d3"]],
  [4141, [12568, "93f908c5a3de4751eceda7cfa54239cf902fc7648c4ce0cef4cf273da871e813"]],
]);

test("cache sound pack synthesizes the reference PCM", () => {
  const packed = readFileSync("test/fixtures/cache-sound-effects.soundpack");
  const definitions = parseSoundEffectPack(packed);
  expect(CACHE_SOUND_EFFECT_IDS.every((id) => definitions.has(id))).toBe(true);
  // Shared Varl effects referenced by Sol's sequence definitions are pulled in
  // automatically even though they are not part of the named sound registry.
  expect([8066, 8289].every((id) => definitions.has(id))).toBe(true);

  EXPECTED_PCM.forEach(([length, hash], id) => {
    const raw = synthesizeSoundEffect(definitions.get(id));
    expect(raw.sampleRate).toBe(22050);
    expect(raw.samples).toHaveLength(length);
    expect(createHash("sha256").update(raw.samples).digest("hex")).toBe(hash);
  });
});
