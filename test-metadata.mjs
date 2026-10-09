import fs from 'fs';
import { extractImageMetadata } from './src/lib/imageMetadata.js';

async function test() {
  const buffer = fs.readFileSync('test.jpg');
  const fileMock = {
    type: 'image/jpeg',
    arrayBuffer: async () => {
      // In Node, we can get an ArrayBuffer from a Buffer
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
    lastModified: Date.now(),
    name: 'test.jpg'
  };

  const propertyCoords = [19.1136, 72.8697]; // Mumbai
  const metadata = await extractImageMetadata(fileMock, propertyCoords);
  console.log('Resulting metadata:', JSON.stringify(metadata, null, 2));
}

test().catch(console.error);
