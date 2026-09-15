// ZIP store method: interoperable archive without adding a runtime dependency.
export function zipFiles(
  files: { name: string; data: Uint8Array }[],
): Uint8Array {
  const encoder = new TextEncoder(),
    chunks: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const file of files) {
    const name = encoder.encode(file.name),
      sum = crc(file.data),
      header = new Uint8Array(30 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint16(12, 33, true); // January 1, 1980: valid DOS archive date.
    h.setUint32(14, sum, true);
    h.setUint32(18, file.data.length, true);
    h.setUint32(22, file.data.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    chunks.push(header, file.data);
    const directory = new Uint8Array(46 + name.length),
      d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint16(14, 33, true);
    d.setUint32(16, sum, true);
    d.setUint32(20, file.data.length, true);
    d.setUint32(24, file.data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    directory.set(name, 46);
    central.push(directory);
    offset += header.length + file.data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const all = [...chunks, ...central, end],
    result = new Uint8Array(offset + size + 22);
  let cursor = 0;
  for (const bytes of all) {
    result.set(bytes, cursor);
    cursor += bytes.length;
  }
  return result;
}
