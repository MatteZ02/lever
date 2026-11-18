// Minimal ZIP reader for importing .z21 files (a ZIP holding Loco.sqlite and
// images). Supports stored and deflated entries, no ZIP64 or encryption,
// which is what the Z21 app writes. Avoids a dependency for one use.
import {inflateRawSync} from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
};

const findEndOfCentralDirectory = (zip: Buffer): number => {
  // The record is 22 bytes plus a comment of at most 65535 bytes.
  const stop = Math.max(0, zip.length - 22 - 0xffff);
  for (let offset = zip.length - 22; offset >= stop; offset--) {
    if (zip.readUInt32LE(offset) === EOCD_SIGNATURE) {
      return offset;
    }
  }
  throw new Error('Not a ZIP file');
};

export const zipEntries = (zip: Buffer): ZipEntry[] => {
  const eocd = findEndOfCentralDirectory(zip);
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error('Broken ZIP directory');
    }
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    entries.push({
      method: zip.readUInt16LE(offset + 10),
      compressedSize: zip.readUInt32LE(offset + 20),
      size: zip.readUInt32LE(offset + 24),
      localHeaderOffset: zip.readUInt32LE(offset + 42),
      name: zip.toString('utf8', offset + 46, offset + 46 + nameLength),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

export const readZipEntry = (zip: Buffer, entry: ZipEntry): Buffer => {
  const offset = entry.localHeaderOffset;
  if (zip.readUInt32LE(offset) !== LOCAL_SIGNATURE) {
    throw new Error(`Broken ZIP entry ${entry.name}`);
  }
  const start =
    offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
  const data = zip.subarray(start, start + entry.compressedSize);
  switch (entry.method) {
    case 0:
      return Buffer.from(data);
    case 8:
      return inflateRawSync(data);
    default:
      throw new Error(`Unsupported ZIP compression in ${entry.name}`);
  }
};
