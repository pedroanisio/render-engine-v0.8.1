import { posix } from 'node:path';
/** Inline SVG raster dependencies through the audited project resolver.
 * @param {string} source @param {string} file @param {(path:string)=>Uint8Array} read @param {number} [depth] */
export function inlineSvg(source, file, read, depth = 0) {
  if (depth > 16) throw new Error('SVG dependency nesting exceeds 16');
  if (/<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b/i.test(source))
    throw new Error('SVG active content is forbidden');
  const embed = (/** @type {string} */ uri) => {
    if (uri.startsWith('#') || uri.startsWith('data:')) return uri;
    if (/^[a-z][a-z0-9+.-]*:|^\//i.test(uri))
      throw new Error('SVG external URI is forbidden');
    const path = posix.join(posix.dirname(file), uri.replace(/&amp;/g, '&')),
      bytes = read(path);
    let mime = 'image/png',
      data = bytes;
    if (/\.svg$/i.test(path)) {
      mime = 'image/svg+xml';
      data = new TextEncoder().encode(
        inlineSvg(new TextDecoder().decode(bytes), path, read, depth + 1),
      );
    } else if (bytes[0] === 255 && bytes[1] === 216) mime = 'image/jpeg';
    else if (new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF')
      mime = 'image/webp';
    return `data:${mime};base64,${Buffer.from(data).toString('base64')}`;
  };
  return source
    .replace(
      /((?:xlink:)?href\s*=\s*)(["'])(.*?)\2/gi,
      (_m, p, q, uri) => p + q + embed(uri) + q,
    )
    .replace(
      /url\(\s*(["']?)(.*?)\1\s*\)/gi,
      (_m, _q, uri) => `url("${embed(uri)}")`,
    );
}
