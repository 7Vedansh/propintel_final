import fs from 'fs';
import { extractImageMetadata } from './src/lib/imageMetadata.js';

async function test() {
  const buffer = fs.readFileSync('test_be.jpg');
  const fileMock = {
    type: 'image/jpeg',
    arrayBuffer: async () => {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
    lastModified: Date.now(),
    name: 'test_be.jpg'
  };

  const propertyCoords = [19.1136, 72.8697]; // Mumbai
  const metadata = await extractImageMetadata(fileMock, propertyCoords);
  console.log('Resulting BE metadata:', JSON.stringify(metadata, null, 2));
}

test().catch(console.error);
