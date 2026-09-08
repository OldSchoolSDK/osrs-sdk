import { isDeepStrictEqual } from "node:util";

export const categories = ["npcs", "regions", "models", "spotAnims", "playerAnimations", "items", "objects", "sounds"];
const record = (value) => value && typeof value === "object" && !Array.isArray(value);
const id = (value) => Number.isSafeInteger(value) && value >= 0;

export function validateAssets(assets, label = "assets") {
  if (!record(assets)) throw new Error(`${label} must be an object`);
  for (const [category, entries] of Object.entries(assets)) {
    if (!categories.includes(category) || !record(entries)) throw new Error(`Invalid category ${label}.${category}`);
    for (const [name, entry] of Object.entries(entries)) {
      const path = `${label}.${category}.${name}`;
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) || !record(entry) || !id(entry.id))
        throw new Error(`Invalid asset ${path}`);
      for (const field of Object.keys(entry)) {
        if (!["id", "animations", "clickbox"].includes(field)) throw new Error(`Unknown option ${path}.${field}`);
      }
      if (
        entry.animations !== undefined &&
        (!["npcs", "models"].includes(category) ||
          !record(entry.animations) ||
          Object.values(entry.animations).some((value) => !id(value)))
      )
        throw new Error(`Invalid animations in ${path}`);
      if (
        entry.clickbox !== undefined &&
        (category !== "npcs" ||
          !record(entry.clickbox) ||
          Object.keys(entry.clickbox).some((key) => key !== "faceAlpha") ||
          !id(entry.clickbox.faceAlpha) ||
          entry.clickbox.faceAlpha > 255)
      )
        throw new Error(`Invalid clickbox in ${path}`);
    }
  }
}

function combine(previous, next, path) {
  if (previous.id !== next.id) throw new Error(`Conflicting ID for ${path}; use overrides explicitly`);
  if (previous.clickbox && next.clickbox && !isDeepStrictEqual(previous.clickbox, next.clickbox))
    throw new Error(`Conflicting clickbox for ${path}; use overrides explicitly`);
  const animations = { ...previous.animations };
  for (const [name, value] of Object.entries(next.animations ?? {})) {
    if (name in animations && animations[name] !== value)
      throw new Error(`Conflicting animation ${path}.${name}; use overrides explicitly`);
    animations[name] = value;
  }
  return { ...previous, ...next, ...(Object.keys(animations).length ? { animations } : {}) };
}

/** Keep manifest order stable because player pose indices use declaration order. */
export function mergeAssets(base, client = {}, overrides = {}) {
  validateAssets(base, "SDK assets");
  validateAssets(client);
  validateAssets(overrides, "overrides");
  const merged = Object.fromEntries(categories.map((category) => [category, {}]));
  for (const category of categories) {
    const entries = merged[category];
    for (const source of [base, client]) {
      for (const [name, entry] of Object.entries(source[category] ?? {})) {
        // Overrides are applied after additive SDK/client merging.
        if (overrides[category]?.[name]) continue;
        entries[name] = entries[name] ? combine(entries[name], entry, `${category}.${name}`) : { ...entry };
      }
    }
    for (const [name, entry] of Object.entries(overrides[category] ?? {})) {
      if (!base[category]?.[name] && !client[category]?.[name])
        throw new Error(`Override targets unknown asset ${category}.${name}`);
      entries[name] = { ...entry };
    }
    const byId = new Map();
    for (const [name, entry] of Object.entries(entries)) {
      byId.set(
        entry.id,
        byId.has(entry.id) ? combine(byId.get(entry.id), entry, `${category}.${name} (ID ${entry.id})`) : entry,
      );
    }
    for (const name of Object.keys(entries)) entries[name] = byId.get(entries[name].id);
  }
  const aliases = new Map();
  for (const [name, entry] of Object.entries(merged.items)) {
    const alias = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (aliases.has(alias) && aliases.get(alias) !== entry.id) throw new Error(`Conflicting item alias ${name}`);
    aliases.set(alias, entry.id);
  }
  return merged;
}

export function uniqueEntries(entries) {
  const unique = new Map();
  for (const [name, entry] of Object.entries(entries)) if (!unique.has(entry.id)) unique.set(entry.id, [name, entry]);
  return [...unique.values()];
}
