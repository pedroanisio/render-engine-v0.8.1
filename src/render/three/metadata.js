/** Spherical Video RFC V1/V2; preserve media offsets and codec configuration. */
import { projectionBoxes } from "./projection-mesh.js";
const UUID = Buffer.from("ffcc8263f8554a938814587a02521fdd", "hex");
/** @param {string} type @param {Buffer} data */
function box(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length + 8);
  head.write(type, 4, "ascii");
  return Buffer.concat([head, data]);
}
/** @param {Buffer} bytes */
function boxes(bytes) {
  const result = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("truncated MP4 box");
    let size = bytes.readUInt32BE(offset),
      header = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length)
        throw new Error("truncated extended MP4 box");
      size = Number(bytes.readBigUInt64BE(offset + 8));
      header = 16;
    }
    if (size === 0) size = bytes.length - offset;
    if (size < header || offset + size > bytes.length)
      throw new Error("invalid MP4 box size");
    result.push({
      type: bytes.toString("ascii", offset + 4, offset + 8),
      start: offset,
      end: offset + size,
      data: bytes.subarray(offset + header, offset + size),
    });
    offset += size;
  }
  return result;
}
/** @param {Buffer} file @param {Record<string,any>} projection @returns {Buffer} */
export function sphericalMetadata(file, projection) {
  const stereo = String(projection.stereo ?? "mono");
  if (!["mono", "top-bottom", "left-right"].includes(stereo))
    throw new Error("invalid stereo metadata");
  const xml = Buffer.from(
    `<?xml version="1.0"?><rdf:SphericalVideo xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:GSpherical="http://ns.google.com/videos/1.0/spherical/"><GSpherical:Spherical>true</GSpherical:Spherical><GSpherical:Stitched>true</GSpherical:Stitched><GSpherical:StitchingSoftware>scene-render-js</GSpherical:StitchingSoftware><GSpherical:ProjectionType>equirectangular</GSpherical:ProjectionType><GSpherical:StereoMode>${stereo}</GSpherical:StereoMode></rdf:SphericalVideo>`,
  );
  const metadata =
      projection.layout === "equirectangular"
        ? box("uuid", Buffer.concat([UUID, xml]))
        : Buffer.alloc(0),
    v2 = projectionBoxes(String(projection.layout), stereo),
    top = boxes(file),
    moov = top.find((b) => b.type === "moov");
  if (!moov) throw new Error("MP4 has no moov");
  const tracks = boxes(moov.data).filter((b) => b.type === "trak");
  const video = (/** @type {Buffer} */ data) =>
    boxes(data)
      .filter((b) => b.type === "mdia")
      .some((b) =>
        boxes(b.data).some(
          (c) =>
            c.type === "hdlr" && c.data.toString("ascii", 8, 12) === "vide",
        ),
      );
  const count = tracks.filter((t) => video(t.data)).length;
  if (!count) throw new Error("MP4 has no video track");
  let delta = 0;
  /** @param {Buffer} data @param {string} parent @returns {Buffer} */
  const rewrite = (data, parent) =>
    Buffer.concat(
      boxes(data)
        .filter(
          (b) => !(b.type === "uuid" && b.data.subarray(0, 16).equals(UUID)),
        )
        .map((b) => {
          /** @type {Buffer} */ let payload = Buffer.from(b.data);
          if (["moov", "trak", "mdia", "minf", "stbl"].includes(b.type)) {
            payload = rewrite(payload, b.type);
            if (b.type === "trak" && video(b.data))
              payload = Buffer.concat([payload, metadata]);
          }
          if (b.type === "stsd") {
            payload = Buffer.concat([
              payload.subarray(0, 8),
              ...boxes(payload.subarray(8)).map((entry) => {
                if (
                  !["avc1", "avc3", "hvc1", "hev1", "vp09", "av01"].includes(
                    entry.type,
                  )
                )
                  return box(entry.type, entry.data);
                if (entry.data.length < 78)
                  throw new Error("invalid visual sample entry");
                const children = boxes(entry.data.subarray(78)).filter(
                  (c) => !["st3d", "sv3d"].includes(c.type),
                );
                const mandatory = children.filter(
                    (c) => !["clap", "pasp"].includes(c.type),
                  ),
                  optional = children.filter((c) =>
                    ["clap", "pasp"].includes(c.type),
                  );
                return box(
                  entry.type,
                  Buffer.concat([
                    entry.data.subarray(0, 78),
                    ...mandatory.map((c) => box(c.type, c.data)),
                    v2,
                    ...optional.map((c) => box(c.type, c.data)),
                  ]),
                );
              }),
            ]);
          }
          if (["stco", "co64"].includes(b.type)) {
            const n = payload.readUInt32BE(4),
              stride = b.type === "stco" ? 4 : 8;
            if (8 + n * stride > payload.length)
              throw new Error("invalid chunk offset table");
            for (let i = 0; i < n; i++) {
              const p = 8 + i * stride,
                value =
                  stride === 4
                    ? BigInt(payload.readUInt32BE(p))
                    : payload.readBigUInt64BE(p);
              if (value >= BigInt(moov.end)) {
                const next = value + BigInt(delta);
                if (stride === 4) {
                  if (next > 0xffffffffn)
                    throw new Error("MP4 chunk offset overflow");
                  payload.writeUInt32BE(Number(next), p);
                } else payload.writeBigUInt64BE(next, p);
              }
            }
          }
          return box(b.type, payload);
        }),
    );
  delta = rewrite(moov.data, "moov").length - moov.data.length;
  return Buffer.concat(
    top.map((b) =>
      b.type === "moov"
        ? box("moov", rewrite(b.data, "moov"))
        : file.subarray(b.start, b.end),
    ),
  );
}
