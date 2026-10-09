const GPS_MATCH_RADIUS_METERS = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

function isFiniteNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function readAscii(view, offset, length) {
  let value = '';
  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(offset + index);
    if (code === 0) break;
    value += String.fromCharCode(code);
  }
  return value;
}

function parseExifDate(value) {
  const match = String(value || '').match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readExifValue(view, tiffStart, littleEndian, type, count, valueOffset) {
  if (valueOffset == null || !Number.isFinite(valueOffset)) return null;
  const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type];
  if (!typeSize) return null;
  const byteLength = typeSize * count;
  const dataOffset = byteLength <= 4 ? valueOffset : tiffStart + view.getUint32(valueOffset, littleEndian);
  if (!Number.isFinite(dataOffset) || dataOffset < 0 || dataOffset + byteLength > view.byteLength) return null;

  const readRational = (offset, signed = false) => {
    const numerator = signed ? view.getInt32(offset, littleEndian) : view.getUint32(offset, littleEndian);
    const denominator = signed ? view.getInt32(offset + 4, littleEndian) : view.getUint32(offset + 4, littleEndian);
    return denominator ? numerator / denominator : 0;
  };

  const values = [];
  for (let index = 0; index < count; index += 1) {
    const offset = dataOffset + (index * typeSize);
    if (type === 1 || type === 7) values.push(view.getUint8(offset));
    else if (type === 2) return readAscii(view, dataOffset, count);
    else if (type === 3) values.push(view.getUint16(offset, littleEndian));
    else if (type === 4) values.push(view.getUint32(offset, littleEndian));
    else if (type === 5) values.push(readRational(offset));
    else if (type === 9) values.push(view.getInt32(offset, littleEndian));
    else if (type === 10) values.push(readRational(offset, true));
  }
  return count === 1 ? values[0] : values;
}

function readIfd(view, tiffStart, littleEndian, ifdOffset) {
  if (ifdOffset == null || !Number.isFinite(ifdOffset)) return {};
  const offset = tiffStart + ifdOffset;
  if (!Number.isFinite(offset) || offset < 0 || offset + 2 > view.byteLength) return {};
  const entryCount = view.getUint16(offset, littleEndian);
  const tags = {};
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = offset + 2 + (index * 12);
    if (entryOffset + 12 > view.byteLength) break;
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    tags[tag] = readExifValue(view, tiffStart, littleEndian, type, count, entryOffset + 8);
  }
  return tags;
}

function dmsToDecimal(parts, reference) {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  // Coerce parts to numbers safely. Some EXIF parsers may return rational-like strings.
  const coerce = (p) => {
    if (p == null) return NaN;
    if (typeof p === 'number') return p;
    if (typeof p === 'string') {
      // handle "num/den" strings
      const m = p.match(/^\s*(-?\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?\s*$/);
      if (m) {
        const n = Number(m[1]);
        const d = m[2] ? Number(m[2]) : 1;
        return d ? n / d : NaN;
      }
      const n = Number(p);
      return Number.isFinite(n) ? n : NaN;
    }
    // Arrays or objects: try numeric coercion on first element
    if (Array.isArray(p) && p.length) return coerce(p[0]);
    return NaN;
  };

  const deg = coerce(parts[0]);
  const min = coerce(parts[1]);
  const sec = coerce(parts[2]);
  if (![deg, min, sec].every((v) => Number.isFinite(v))) return null;

  const decimal = Math.abs(deg) + (Math.abs(min) / 60) + (Math.abs(sec) / 3600);
  if (!Number.isFinite(decimal)) return null;

  // Normalize reference tag (can be missing, empty, or the literal 'Unknown')
  let ref = '';
  if (reference !== null && reference !== undefined) {
    if (Array.isArray(reference)) ref = reference.join('').trim().toUpperCase();
    else ref = String(reference).trim().toUpperCase();
  }

  // Standard EXIF references
  if (ref === 'S' || ref === 'W') return -decimal;
  if (ref === 'N' || ref === 'E') return decimal;

  // If the reference is missing, empty, or explicitly unknown, infer from sign
  // of the degree value as a best-effort fallback (Realme, some Xiaomi/Oppo).
  // Latitude: positive => N, negative => S. Longitude: positive => E, negative => W.
  // We cannot always know if this is latitude or longitude here; callers pass the
  // coordinate parts in the usual order. Use the sign of the degree value as the
  // indicator: positive => keep positive, negative => invert.
  return deg < 0 ? -decimal : decimal;
}

function parseTiffExif(view, tiffStart) {
  const byteOrder = view.getUint16(tiffStart, false);
  const littleEndian = byteOrder === 0x4949;
  if (!littleEndian && byteOrder !== 0x4d4d) return {};

  const rootIfd = readIfd(view, tiffStart, littleEndian, view.getUint32(tiffStart + 4, littleEndian));
  const exifIfd = rootIfd[0x8769] ? readIfd(view, tiffStart, littleEndian, rootIfd[0x8769]) : {};
  const gpsIfd = rootIfd[0x8825] ? readIfd(view, tiffStart, littleEndian, rootIfd[0x8825]) : {};
  return {
    capturedAt: parseExifDate(exifIfd[0x9003] || exifIfd[0x9004] || rootIfd[0x0132]),
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

function parsePngExif(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 12 || view.getUint32(0, false) !== 0x89504e47) return {};

  let offset = 8;
  while (offset + 12 <= view.byteLength) {
    const size = view.getUint32(offset, false);
    const type = readAscii(view, offset + 4, 4);
    if (type === 'eXIf') return parseTiffExif(view, offset + 8);
    offset += 12 + size;
  }
  return {};
}

function parseWebpExif(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 20 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WEBP') return {};

  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const type = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    if (type === 'EXIF') {
      const payloadStart = offset + 8;
      const tiffStart = readAscii(view, payloadStart, 6) === 'Exif' ? payloadStart + 6 : payloadStart;
      return parseTiffExif(view, tiffStart);
    }
    offset += 8 + size + (size % 2);
  }
  return {};
}

function parseImageExif(buffer, fileType) {
  if (fileType === 'image/jpeg' || fileType === 'image/jpg') return parseJpegExif(buffer);
  if (fileType === 'image/png') return parsePngExif(buffer);
  if (fileType === 'image/webp') return parseWebpExif(buffer);
  return {};
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const radius = 6371000;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function readDimensions(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }

  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(previewUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      reject(new Error('Could not read image dimensions.'));
    };
    image.src = previewUrl;
  });
}

function qualityStatus(width, height) {
  const shortestEdge = Math.min(width || 0, height || 0);
  if (shortestEdge >= 1080) return 'good';
  if (shortestEdge >= 640) return 'medium';
  return 'poor';
}

export async function extractImageMetadata(file, propertyCoordinates = []) {
  const [propertyLat, propertyLon] = propertyCoordinates;
  const dimensions = await readDimensions(file).catch(() => ({ width: 0, height: 0 }));
  let exif = {};
  if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
    try {
      exif = parseImageExif(await file.arrayBuffer(), file.type);
    } catch {
      exif = {};
    }
  }

  const capturedAt = exif.capturedAt || (file.lastModified ? new Date(file.lastModified) : null);
  const hasExifTimestamp = Boolean(exif.capturedAt);
  // Null-island filter: (0, 0) is in the Gulf of Guinea ocean — a DataView NaN→0
  // coercion artefact, never a real property coordinate.
  const isNullIsland = Number(exif.latitude) === 0 && Number(exif.longitude) === 0;
  const hasGps = isFiniteNumber(exif.latitude) && isFiniteNumber(exif.longitude) && !isNullIsland;
  const hasPropertyCoordinates = isFiniteNumber(propertyLat) && isFiniteNumber(propertyLon);
  const gpsDistanceMeters = hasGps && hasPropertyCoordinates
    ? Math.round(haversineMeters(Number(exif.latitude), Number(exif.longitude), Number(propertyLat), Number(propertyLon)))
    : null;
  const freshnessDays = capturedAt
    ? Math.max(0, Math.floor((Date.now() - capturedAt.getTime()) / DAY_MS))
    : null;
  const gpsMatchStatus = gpsDistanceMeters === null
    ? 'unknown'
    : gpsDistanceMeters <= GPS_MATCH_RADIUS_METERS
      ? 'pass'
      : 'fail';
  const metadataVerified = hasGps && hasExifTimestamp;

  return {
    metadataSource: metadataVerified ? 'embedded_exif' : hasGps || hasExifTimestamp ? 'partial_metadata' : 'file_only',
    captureVerificationStatus: metadataVerified ? 'metadata_verified' : 'unverified_upload',
    timestampVerificationStatus: hasExifTimestamp ? 'embedded_exif' : capturedAt ? 'file_timestamp_only' : 'unknown',
    locationVerificationStatus: gpsMatchStatus,
    capturedAt: capturedAt?.toISOString() || null,
    freshnessDays,
    latitude: hasGps ? Number(exif.latitude.toFixed(6)) : null,
    longitude: hasGps ? Number(exif.longitude.toFixed(6)) : null,
    gpsDistanceMeters,
    gpsMatchStatus,
    qualityStatus: qualityStatus(dimensions.width, dimensions.height),
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function summarizePacketMetadata(packet = {}) {
  const entries = Object.values(packet).filter(Boolean);
  const metadata = entries.map((entry) => entry.metadata || {});
  const gpsStatuses = metadata.map((item) => item.gpsMatchStatus);
  const freshnessValues = metadata.map((item) => item.freshnessDays).filter(isFiniteNumber).map(Number);
  const capturedTimes = metadata.map((item) => item.capturedAt).filter(Boolean).sort();
  const verifiedCount = metadata.filter((item) => item.captureVerificationStatus === 'metadata_verified').length;
  const embeddedGpsCount = metadata.filter((item) => isFiniteNumber(item.latitude) && isFiniteNumber(item.longitude)).length;
  const embeddedTimestampCount = metadata.filter((item) => item.timestampVerificationStatus === 'embedded_exif').length;

  return {
    uploadedByRole: 'unknown',
    gpsMatchStatus: gpsStatuses.includes('fail') ? 'fail' : gpsStatuses.includes('pass') ? 'pass' : 'unknown',
    captureVerificationStatus: entries.length > 0 && verifiedCount === entries.length ? 'metadata_verified' : 'unverified_upload',
    freshnessDays: freshnessValues.length ? Math.max(...freshnessValues) : null,
    capturedAt: capturedTimes.at(-1) || null,
    imageCount: entries.length,
    verifiedImageCount: verifiedCount,
    embeddedGpsCount,
    embeddedTimestampCount,
  };
}
