export type PackedSoundEffect = { id: number; bytes: Uint8Array };

export function createSoundEffectPack(entries: PackedSoundEffect[]): Uint8Array {
  const sortedEntries = [...entries].sort((a, b) => a.id - b.id);
  for (const entry of sortedEntries) {
    if (!Number.isInteger(entry.id) || entry.id < 0 || entry.id > 0xffff) {
      throw new Error(`Invalid sound effect ID ${entry.id}`);
    }
    if (entry.bytes.length > 0xffff) throw new Error(`Sound effect ${entry.id} is too large for the pack format`);
  }

  const size = 6 + sortedEntries.reduce((total, entry) => total + 4 + entry.bytes.length, 0);
  const output = new Uint8Array(size);
  const view = new DataView(output.buffer);
  output.set([0x53, 0x46, 0x58, 0x31]); // SFX1
  view.setUint16(4, sortedEntries.length);
  let offset = 6;
  for (const entry of sortedEntries) {
    view.setUint16(offset, entry.id);
    view.setUint16(offset + 2, entry.bytes.length);
    output.set(entry.bytes, offset + 4);
    offset += 4 + entry.bytes.length;
  }
  return output;
}
