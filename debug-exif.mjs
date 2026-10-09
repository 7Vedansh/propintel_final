import fs from 'fs';

function readAscii(view, offset, length) {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(offset + index);
    if (code === 0) break;
    value += String.fromCharCode(code);
  }
  return value;
}

function readExifValue(view, tiffStart, littleEndian, type, count, valueOffset) {
  const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type];
  if (!typeSize) {
    console.log('  readExifValue: invalid typeSize for type', type);
    return null;
  }
  const byteLength = typeSize * count;
  const dataOffset = byteLength <= 4 ? valueOffset : tiffStart + view.getUint32(valueOffset, littleEndian);
  console.log(`  readExifValue: type=${type}, count=${count}, byteLength=${byteLength}, valueOffset=${valueOffset}, dataOffset=${dataOffset}`);
  
  if (dataOffset < 0 || dataOffset + byteLength > view.byteLength) {
    console.log(`  readExifValue: bounds check failed (dataOffset=${dataOffset}, byteLength=${byteLength}, view.byteLength=${view.byteLength})`);
    return null;
  }

  const readRational = (offset, signed = false) => {
    const numerator = signed ? view.getInt32(offset, littleEndian) : view.getUint32(offset, littleEndian);
    const denominator = signed ? view.getInt32(offset + 4, littleEndian) : view.getUint32(offset + 4, littleEndian);
    console.log(`    readRational: offset=${offset}, num=${numerator}, den=${denominator}`);
    return denominator ? numerator / denominator : 0;
  };

  const values = [];
  for (let index = 0; index < count; index += 1) {
    const offset = dataOffset + (index * typeSize);
    if (type === 1 || type === 7) values.push(view.getUint8(offset));
    else if (type === 2) {
      const asciiVal = readAscii(view, dataOffset, count);
      console.log(`    readAscii: dataOffset=${dataOffset}, count=${count}, val=${JSON.stringify(asciiVal)}`);
      return asciiVal;
    }
    else if (type === 3) values.push(view.getUint16(offset, littleEndian));
    else if (type === 4) values.push(view.getUint32(offset, littleEndian));
    else if (type === 5) values.push(readRational(offset));
    else if (type === 9) values.push(view.getInt32(offset, littleEndian));
    else if (type === 10) values.push(readRational(offset, true));
  }
  const result = count === 1 ? values[0] : values;
  console.log('    readExifValue result:', result);
  return result;
}

function readIfd(view, tiffStart, littleEndian, ifdOffset) {
  const offset = tiffStart + ifdOffset;
  console.log(`readIfd: tiffStart=${tiffStart}, ifdOffset=${ifdOffset}, absoluteOffset=${offset}`);
  if (offset < 0 || offset + 2 > view.byteLength) {
    console.log('readIfd: offset out of bounds');
    return {};
  }
  const entryCount = view.getUint16(offset, littleEndian);
  console.log(`readIfd: entryCount=${entryCount}`);
  const tags = {};
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = offset + 2 + (index * 12);
    if (entryOffset + 12 > view.byteLength) {
      console.log('readIfd: entryOffset out of bounds');
      break;
    }
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    console.log(`readIfd entry ${index}: tag=0x${tag.toString(16)}, type=${type}, count=${count}, entryOffset=${entryOffset}`);
    tags[tag] = readExifValue(view, tiffStart, littleEndian, type, count, entryOffset + 8);
  }
  return tags;
}

function dmsToDecimal(parts, reference) {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const decimal = Number(parts[0]) + (Number(parts[1]) / 60) + (Number(parts[2]) / 3600);
  if (!Number.isFinite(decimal)) return null;
  return ['S', 'W'].includes(String(reference || '').toUpperCase()) ? -decimal : decimal;
}

function parseTiffExif(view, tiffStart) {
  const byteOrder = view.getUint16(tiffStart, false);
  const littleEndian = byteOrder === 0x4949;
  console.log(`parseTiffExif: byteOrder=0x${byteOrder.toString(16)}, littleEndian=${littleEndian}`);
  if (!littleEndian && byteOrder !== 0x4d4d) return {};

  const rootIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
  console.log(`parseTiffExif: rootIfdOffset=${rootIfdOffset}`);
  const rootIfd = readIfd(view, tiffStart, littleEndian, rootIfdOffset);
  console.log('parseTiffExif: rootIfd keys:', Object.keys(rootIfd).map(k => `0x${Number(k).toString(16)}`));
  
  const exifIfdOffset = rootIfd[0x8769];
  const gpsIfdOffset = rootIfd[0x8825];
  console.log(`parseTiffExif: exifIfdOffset=${exifIfdOffset}, gpsIfdOffset=${gpsIfdOffset}`);
  
  const exifIfd = exifIfdOffset ? readIfd(view, tiffStart, littleEndian, exifIfdOffset) : {};
  const gpsIfd = gpsIfdOffset ? readIfd(view, tiffStart, littleEndian, gpsIfdOffset) : {};
  
  return {
    latitude: dmsToDecimal(gpsIfd[0x0002], gpsIfd[0x0001]),
    longitude: dmsToDecimal(gpsIfd[0x0004], gpsIfd[0x0003]),
  };
}

function parseJpegExif(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return {};

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2, false);
    if (marker === 0xe1 && readAscii(view, offset + 4, 6) === 'Exif') {
      return parseTiffExif(view, offset + 10);
    }
    if (!size || size < 2) break;
    offset += 2 + size;
  }
  return {};
}

const buffer = fs.readFileSync('test_be.jpg');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const exif = parseJpegExif(arrayBuffer);
console.log('Parsed BE Exif:', exif);
