import struct
from PIL import Image

# Exact offsets:
# Offset 0: TIFF header (8 bytes, ends at 7)
# Offset 8: 0th IFD (30 bytes, ends at 37)
# Offset 38: Exif IFD (18 bytes, ends at 55)
# Offset 56: Date Time Original string (20 bytes, ends at 75)
# Offset 76: GPS IFD (54 bytes, ends at 129)
# Offset 130: GPS Lat values (24 bytes, ends at 153)
# Offset 154: GPS Lon values (24 bytes, ends at 177)

tiff = bytearray()

# Offset 0: TIFF header
tiff.extend(b'MM\x00\x2a\x00\x00\x00\x08')

# Offset 8: 0th IFD
tiff.extend(struct.pack('>H', 2)) # 2 entries
# Entry 1 (Exif IFD): tag=0x8769, type=4 (LONG), count=1, offset=38
tiff.extend(struct.pack('>HHII', 0x8769, 4, 1, 38))
# Entry 2 (GPS IFD): tag=0x8825, type=4 (LONG), count=1, offset=76
tiff.extend(struct.pack('>HHII', 0x8825, 4, 1, 76))
# Next IFD offset
tiff.extend(struct.pack('>I', 0))

# Offset 38: Exif IFD
tiff.extend(struct.pack('>H', 1))
# Entry 1 (0x9003 - Date Time Original): tag=0x9003, type=2 (ASCII), count=20, offset=56
tiff.extend(struct.pack('>HHII', 0x9003, 2, 20, 56))
# Next IFD offset
tiff.extend(struct.pack('>I', 0))

# Offset 56: Date Time Original string (20 bytes)
tiff.extend(b'2026:06:01 12:00:00\x00')

# Offset 76: GPS IFD
tiff.extend(struct.pack('>H', 4))
# Entry 1 (0x0001 - LatRef): tag=0x0001, type=2 (ASCII), count=2, value='N\x00' (stored inline, left-aligned)
tiff.extend(struct.pack('>HHI4s', 0x0001, 2, 2, b'N\x00\x00\x00'))
# Entry 2 (0x0002 - Lat): tag=0x0002, type=5 (RATIONAL), count=3, offset=130
tiff.extend(struct.pack('>HHII', 0x0002, 5, 3, 130))
# Entry 3 (0x0003 - LonRef): tag=0x0003, type=2 (ASCII), count=2, value='E\x00' (stored inline, left-aligned)
tiff.extend(struct.pack('>HHI4s', 0x0003, 2, 2, b'E\x00\x00\x00'))
# Entry 4 (0x0004 - Lon): tag=0x0004, type=5 (RATIONAL), count=3, offset=154
tiff.extend(struct.pack('>HHII', 0x0004, 5, 3, 154))
# Next IFD offset
tiff.extend(struct.pack('>I', 0))

# Offset 130: GPS Lat values (19/1, 6/1, 49/1)
tiff.extend(struct.pack('>IIIIII', 19, 1, 6, 1, 49, 1))

# Offset 154: GPS Lon values (72/1, 56/1, 42/1)
tiff.extend(struct.pack('>IIIIII', 72, 1, 56, 1, 42, 1))

# Inject into JPEG
exif_data = b'Exif\x00\x00' + tiff
img = Image.new('RGB', (10, 10), color='blue')
img.save('test_be.jpg')

with open('test_be.jpg', 'rb') as f:
    jpeg_bytes = f.read()

app1_payload = struct.pack('>H', len(exif_data) + 2) + exif_data
new_jpeg_bytes = jpeg_bytes[:2] + b'\xff\xe1' + app1_payload + jpeg_bytes[2:]

with open('test_be.jpg', 'wb') as f:
    f.write(new_jpeg_bytes)

print("Successfully created test_be.jpg with Big Endian EXIF")
