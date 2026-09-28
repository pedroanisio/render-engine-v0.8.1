import sharp from "sharp";
/** @param {Uint8Array} rgba16 @param {number} width @param {number} height @param {string} format @param {number} quality */
export async function stillBytes(rgba16, width, height, format, quality) {
  const rgba = Buffer.alloc(width * height * 4);
  // Preserve straight alpha; libvips receives sRGB samples, not premultiplied values.
  for (let i = 0; i < rgba.length; i++)
    rgba[i] = Math.round(
      (Number(rgba16[2 * i]) + Number(rgba16[2 * i + 1]) * 256) / 257,
    );
  const image = sharp(rgba, { raw: { width, height, channels: 4 } }),
    q = Math.max(1, Math.round(quality * 100));
  if (format === "jpeg")
    return image
      .flatten({ background: "#000000" })
      .jpeg({ quality: q })
      .toBuffer();
  if (format === "webp") return image.webp({ quality: q }).toBuffer();
  if (format === "avif")
    return image.avif({ quality: q, effort: 4 }).toBuffer();
  if (format === "png")
    return image.png({ compressionLevel: Math.round(quality * 9) }).toBuffer();
  throw new Error(`Unsupported still format ${format}`);
}
