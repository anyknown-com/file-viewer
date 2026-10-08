// Test helper: a gradient JPEG made in the browser, optionally with an EXIF Orientation tag.

/** APP1 with a big-endian TIFF header and one IFD entry: Orientation (0x0112, SHORT) = `value`. */
function exifOrientation(value: number): Uint8Array<ArrayBuffer> {
  const tiff = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8];
  const ifd = [0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, value, 0, 0, 0, 0, 0, 0];
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff, ...ifd];
  const length = body.length + 2;
  return Uint8Array.from([0xff, 0xe1, length >> 8, length & 0xff, ...body]);
}

export async function makeJpeg(w: number, h: number, orientation?: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context.");
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, "#e04030");
  gradient.addColorStop(1, "#3050e0");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  const jpeg = await canvas.convertToBlob({ type: "image/jpeg" });
  if (orientation === undefined) return jpeg;
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  return new Blob([bytes.subarray(0, 2), exifOrientation(orientation), bytes.subarray(2)], {
    type: "image/jpeg",
  });
}
