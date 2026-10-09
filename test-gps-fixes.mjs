import fs from 'fs';
import struct from 'node:buffer';
import { extractImageMetadata } from './src/lib/imageMetadata.js';

function makeJpeg(tiffBytes) {
  // Minimal JPEG with APP1 EXIF segment containing the given TIFF bytes
  const exifHeader = Buffer.from('457869660000', 'hex'); // "Exif\0\0"
  const payload = Buffer.concat([exifHeader, tiffBytes]);
  const segLen = Buffer.alloc(2);
  segLen.writeUInt16BE(payload.length + 2);
  // FF D8 (SOI) + FF E1 (APP1) + length + payload + FF D9 (EOI)
  return Buffer.concat([
    Buffer.from('ffd8', 'hex'),
    Buffer.from('ffe1', 'hex'),
    segLen,
    payload,
    Buffer.from('ffd9', 'hex'),
  ]);
}

function writeRational(buf, offset, num, den) {
  buf.writeUInt32BE(num, offset);
  buf.writeUInt32BE(den, offset + 4);
}

function makeTiffWithGps({ latRef, lonRef, latDeg, latMin, latSec, lonDeg, lonMin, lonSec }) {
  // Big-endian TIFF with root IFD → GPS IFD only (no Exif IFD, keep it simple)
  // Layout:
  //   0: TIFF header  (8 bytes)
  //   8: Root IFD      (2 + 1*12 + 4 = 18 bytes, ends at 25)
  //  26: GPS IFD       (2 + 4*12 + 4 = 54 bytes, ends at 79)
  //  80: lat rationals (24 bytes, ends at 103)
  // 104: lon rationals (24 bytes, ends at 127)
  const buf = Buffer.alloc(128, 0);

  // TIFF header: MM, 0x002a, root IFD at offset 8
  buf.write('MM', 0, 'ascii');
  buf.writeUInt16BE(0x002a, 2);
  buf.writeUInt32BE(8, 4);

  // Root IFD: 1 entry (GPS IFD pointer)
  buf.writeUInt16BE(1, 8);
  // tag=0x8825, type=4 (LONG), count=1, value=26
  buf.writeUInt16BE(0x8825, 10);
  buf.writeUInt16BE(4, 12);
  buf.writeUInt32BE(1, 14);
  buf.writeUInt32BE(26, 18);
  buf.writeUInt32BE(0, 22); // next IFD = 0

  // GPS IFD at offset 26: 4 entries
  buf.writeUInt16BE(4, 26);
  let off = 28;

  // Entry 0: tag=0x0001 (LatRef), type=2 (ASCII), count=2, value inline
  buf.writeUInt16BE(0x0001, off); off += 2;
  buf.writeUInt16BE(2, off); off += 2;       // type ASCII
  buf.writeUInt32BE(2, off); off += 4;       // count
  if (latRef) {
    buf.write(latRef + '\0', off, 'ascii');
  }
  off += 4;

  // Entry 1: tag=0x0002 (Lat), type=5 (RATIONAL), count=3, offset=80
  buf.writeUInt16BE(0x0002, off); off += 2;
  buf.writeUInt16BE(5, off); off += 2;
  buf.writeUInt32BE(3, off); off += 4;
  buf.writeUInt32BE(80, off); off += 4;

  // Entry 2: tag=0x0003 (LonRef), type=2 (ASCII), count=2, value inline
  buf.writeUInt16BE(0x0003, off); off += 2;
  buf.writeUInt16BE(2, off); off += 2;
  buf.writeUInt32BE(2, off); off += 4;
  if (lonRef) {
    buf.write(lonRef + '\0', off, 'ascii');
  }
  off += 4;

  // Entry 3: tag=0x0004 (Lon), type=5 (RATIONAL), count=3, offset=104
  buf.writeUInt16BE(0x0004, off); off += 2;
  buf.writeUInt16BE(5, off); off += 2;
  buf.writeUInt32BE(3, off); off += 4;
  buf.writeUInt32BE(104, off); off += 4;

  // Next IFD = 0
  buf.writeUInt32BE(0, off);

  // Lat rationals at offset 80: [deg/1, min/1, sec/1]
  writeRational(buf, 80, Math.abs(latDeg), 1);
  writeRational(buf, 88, Math.abs(latMin), 1);
  writeRational(buf, 96, Math.abs(latSec), 1);

  // Lon rationals at offset 104
  writeRational(buf, 104, Math.abs(lonDeg), 1);
  writeRational(buf, 112, Math.abs(lonMin), 1);
  writeRational(buf, 120, Math.abs(lonSec), 1);

  return buf;
}

function makeTiffNoGps() {
  // TIFF with a root IFD that has NO GPS IFD pointer at all
  const buf = Buffer.alloc(30, 0);
  buf.write('MM', 0, 'ascii');
  buf.writeUInt16BE(0x002a, 2);
  buf.writeUInt32BE(8, 4);
  // Root IFD: 0 entries
  buf.writeUInt16BE(0, 8);
  buf.writeUInt32BE(0, 10); // next IFD = 0
  return buf;
}

function fileMock(jpegBuf) {
  return {
    type: 'image/jpeg',
    arrayBuffer: async () => jpegBuf.buffer.slice(jpegBuf.byteOffset, jpegBuf.byteOffset + jpegBuf.byteLength),
    lastModified: Date.now(),
    name: 'test.jpg',
  };
}

const PROPERTY_MUMBAI = [19.1136, 72.8697];

async function runTests() {
  let pass = 0;
  let fail = 0;

  function assert(label, condition) {
    if (condition) {
      console.log(`  ✓ ${label}`);
      pass++;
    } else {
      console.log(`  ✗ ${label}`);
      fail++;
    }
  }

  // Test 1: No GPS tags at all → should report unknown, not (0,0)
  console.log('\n--- Test 1: No GPS tags (should be unknown, not 0,0) ---');
  {
    const jpeg = makeJpeg(makeTiffNoGps());
    const meta = await extractImageMetadata(fileMock(jpeg), PROPERTY_MUMBAI);
    assert('latitude is null', meta.latitude === null);
    assert('longitude is null', meta.longitude === null);
    assert('gpsDistanceMeters is null', meta.gpsDistanceMeters === null);
    assert('gpsMatchStatus is unknown', meta.gpsMatchStatus === 'unknown');
  }

  // Test 2: Valid GPS with standard N/E refs → should parse correctly
  console.log('\n--- Test 2: Valid GPS with N/E refs ---');
  {
    const tiff = makeTiffWithGps({ latRef: 'N', lonRef: 'E', latDeg: 19, latMin: 6, latSec: 49, lonDeg: 72, lonMin: 52, lonSec: 11 });
    const jpeg = makeJpeg(tiff);
    const meta = await extractImageMetadata(fileMock(jpeg), PROPERTY_MUMBAI);
    assert('latitude ≈ 19.1136', Math.abs(meta.latitude - 19.1136) < 0.01);
    assert('longitude ≈ 72.8697', Math.abs(meta.longitude - 72.8697) < 0.02);
    assert('gpsDistanceMeters is finite', Number.isFinite(meta.gpsDistanceMeters));
    assert('gpsMatchStatus is pass', meta.gpsMatchStatus === 'pass');
  }

  // Test 3: GPS with MISSING refs (Realme phone scenario) → should infer N/E
  console.log('\n--- Test 3: GPS with missing refs (Realme phone) ---');
  {
    const tiff = makeTiffWithGps({ latRef: null, lonRef: null, latDeg: 19, latMin: 6, latSec: 49, lonDeg: 72, lonMin: 52, lonSec: 11 });
    const jpeg = makeJpeg(tiff);
    const meta = await extractImageMetadata(fileMock(jpeg), PROPERTY_MUMBAI);
    assert('latitude ≈ 19.1136', Math.abs(meta.latitude - 19.1136) < 0.01);
    assert('longitude ≈ 72.8697', Math.abs(meta.longitude - 72.8697) < 0.02);
    assert('gpsDistanceMeters is finite', Number.isFinite(meta.gpsDistanceMeters));
    assert('gpsMatchStatus is pass', meta.gpsMatchStatus === 'pass');
  }

  // Test 4: Null-island (0,0) safety net
  console.log('\n--- Test 4: Null-island (0,0) filter ---');
  {
    const tiff = makeTiffWithGps({ latRef: 'N', lonRef: 'E', latDeg: 0, latMin: 0, latSec: 0, lonDeg: 0, lonMin: 0, lonSec: 0 });
    const jpeg = makeJpeg(tiff);
    const meta = await extractImageMetadata(fileMock(jpeg), PROPERTY_MUMBAI);
    assert('latitude is null (null-island filtered)', meta.latitude === null);
    assert('longitude is null (null-island filtered)', meta.longitude === null);
    assert('gpsMatchStatus is unknown', meta.gpsMatchStatus === 'unknown');
  }

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

runTests().catch((err) => { console.error(err); process.exit(1); });
