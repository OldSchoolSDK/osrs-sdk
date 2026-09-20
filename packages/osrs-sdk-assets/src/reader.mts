import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Load the live checkout, including its own installed dependencies. */
export async function loadReader(readerPath) {
  const entry = resolve(readerPath, "src/index.js");
  try {
    const reader = await import(pathToFileURL(entry).href);
    for (const name of ["RSCache", "IndexType", "ConfigType", "ModelGroup"]) {
      if (!reader[name]) throw new Error(`Missing reader export ${name}`);
    }
    return reader;
  } catch (error) {
    throw new Error(
      `Cannot load cache reader from ${entry}. Select a compatible checkout with --reader-path or OSRS_CACHE_READER_PATH and run npm ci in that checkout.`,
      { cause: error },
    );
  }
}
