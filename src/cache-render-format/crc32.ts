const CRC32_TABLE = new Uint32Array(256);

for (let index = 0; index < CRC32_TABLE.length; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC32_TABLE[index] = value >>> 0;
}

/** Return the standard CRC-32 checksum as eight lowercase hexadecimal digits. */
export function crc32(bytes: Uint8Array): string {
  let value = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) {
    value = CRC32_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8);
  }
  return ((value ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}
