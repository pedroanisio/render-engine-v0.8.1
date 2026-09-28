/** Output-space caption layout, font shaping and deterministic word animation. */
import { Surface } from "./surface.js";
import { createTypography, textStyle } from "../media/text.js";
import { safeArea } from "./geometry/layout.js";
import { length } from "./geometry/matrix.js";
import { clamp } from "./audio-dsp.js";
import { parseColor } from "./color.js";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @param {import('./frame.js').FrameRenderer} host */
export function captionPainter(host) {
  const typography = createTypography(
    host.scene,
    (_n, src) => host.effectRead(src),
    (node, path, bytes) => host.effectFiles.set("system-font:" + path, bytes),
  );
  const styles = new Map(
    (host.scene.children.find((n) => n.name === "styles")?.children ?? []).map(
      (n) => [String(n.attributes.id), n],
    ),
  );
  /** @param {Node} track @param {import('./surface.js').Surface} dst */
  return (track, dst) => {
    const a = track.attributes,
      time = host.time,
      scale = host.scale,
      w = host.width / scale,
      h = host.height / scale;
    const safe = host.scene.children
      .find((n) => n.name === "safeAreas")
      ?.children.find((n) => n.attributes.id === a.safeArea);
    const region = safe
      ? safeArea(safe.attributes, w, h)
      : { x: 0, y: 0, width: w, height: h };
    for (const cue of track.children.filter(
      (c) =>
        time >= Number(c.attributes.start) && time < Number(c.attributes.end),
    )) {
      const preset = String(a.preset ?? "classic"),
        start = Number(cue.attributes.start),
        end = Number(cue.attributes.end),
        progress = clamp(
          (time - start) / Math.min(0.25, (end - start) / 2),
          0,
          1,
        ),
        styleId = String(cue.attributes.style ?? a.style ?? ""),
        style = {
          ...JSON.parse(String(cue.attributes.sourceStyle ?? "{}")),
          ...(styles.has(styleId)
            ? textStyle(/** @type {Node} */ (styles.get(styleId)), styles)
            : {}),
        };
      const explicit = cue.children.filter((n) => n.name === "word"),
        tokens = String(cue.attributes.text ?? "")
          .split(/\s+/)
          .filter(Boolean);
      const words = explicit.length
          ? explicit
          : tokens.map((text, i) => ({
              ...cue,
              name: "word",
              attributes: {
                text,
                emphasis: false,
                start: start + ((end - start) * i) / tokens.length,
                end: start + ((end - start) * (i + 1)) / tokens.length,
              },
              children: [],
            })),
        active = words.find(
          (n) =>
            time >= Number(n.attributes.start) &&
            time < Number(n.attributes.end),
        );
      let text = String(cue.attributes.text ?? ""),
        selected = words;
      if (preset === "one-word" || preset === "boxed-word") {
        text = String(active?.attributes.text ?? "");
        selected = active ? [active] : [];
      }
      if (preset === "typewriter")
        text = Array.from(text)
          .slice(
            0,
            Math.ceil(
              Array.from(text).length *
                clamp((time - start) / (end - start), 0, 1),
            ),
          )
          .join("");
      if (cue.attributes.speaker)
        text = String(cue.attributes.speaker) + ": " + text;
      if (!text) continue;
      const size = Number(style.size ?? Math.max(12, h * 0.045)),
        width = Math.min(region.width, length(a.width ?? "85%", w, w, h)),
        height = Math.min(
          region.height,
          Math.max(1, text.split("\n").length) *
            size *
            Number(style.lineHeight ?? 1.25) +
            size * 0.5,
        );
      let x = length(a.x ?? "50%", w, w, h) - width / 2,
        y = length(a.y ?? "75%", h, w, h) - height / 2;
      const position = String(cue.attributes.position ?? "");
      if (position.startsWith("ass:")) {
        const align = Number(position.slice(4));
        x = region.x + (((align - 1) % 3) / 2) * (region.width - width);
        y =
          region.y +
          (1 - Math.floor((align - 1) / 3) / 2) * (region.height - height);
      }
      const line = /line:([\d.]+)%/.exec(position),
        pos = /position:([\d.]+)%/.exec(position);
      if (line) y = (Number(line[1]) / 100) * h - height / 2;
      if (pos) x = (Number(pos[1]) / 100) * w - width / 2;
      x = clamp(x, region.x, region.x + region.width - width);
      y = clamp(y, region.y, region.y + region.height - height);
      let factor = 1,
        opacity = 1;
      if (preset === "pop") factor = 0.8 + 0.2 * progress;
      if (preset === "enlarge")
        factor = 1 + 0.15 * Math.sin(Math.PI * progress);
      if (preset === "bounce")
        y -= Math.abs(Math.sin(progress * Math.PI * 2)) * size * (1 - progress);
      if (preset === "slide") x += (1 - progress) * width * 0.2;
      if (preset === "fade")
        opacity = Math.min(progress, clamp((end - time) / 0.25, 0, 1));
      const attrs = {
        ...style,
        id: "__caption",
        text,
        style: styleId,
        width,
        height,
        size,
        minSize: Math.min(size, 8),
        maxSize: size,
        autoFit: "shrink",
        wrap: "word",
        overflow: "visible",
        align: "center",
        verticalAlign: "middle",
        writingMode: "horizontal-tb",
        direction: "auto",
        language: a.language ?? "und",
        lineHeight: Number(style.lineHeight ?? 1.25),
        color: style.color ?? "#ffffffff",
      };
      /** @type {Node[]} */ const spans = [];
      if (
        (["karaoke", "highlight"].includes(preset) ||
          a.activeStyle ||
          a.activeColor) &&
        selected.length &&
        !cue.attributes.speaker
      ) {
        for (const word of selected) {
          const lit =
            preset === "karaoke"
              ? time >= Number(word.attributes.start)
              : word === active;
          const activeStyle = lit
            ? styles.has(String(a.activeStyle))
              ? textStyle(
                  /** @type {Node} */ (styles.get(String(a.activeStyle))),
                  styles,
                )
              : {}
            : {};
          spans.push({
            ...word,
            name: "span",
            type: "textSpanType",
            value: String(word.attributes.text) + " ",
            attributes: {
              ...(word.attributes.emphasis ? { weight: 700 } : {}),
              ...activeStyle,
              color: lit
                ? (a.activeColor ?? activeStyle.color ?? "#ffff00")
                : attrs.color,
            },
            specifiedAttributes: [
              "color",
              ...(word.attributes.emphasis ? ["weight"] : []),
              ...Object.keys(activeStyle),
            ],
            children: [],
          });
        }
      }
      const asset = {
        ...cue,
        name: "text",
        type: "textAssetType",
        attributes: attrs,
        specifiedAttributes: Object.keys(attrs),
        children: spans,
      };
      const surface = typography.render(
        asset,
        scale,
        {},
        undefined,
        host,
      ).surface;
      const px = (x + (width * (1 - factor)) / 2) * scale,
        py = (y + (height * (1 - factor)) / 2) * scale;
      if (preset === "boxed-line" || preset === "boxed-word")
        dst.fillRect(
          px,
          py,
          width * scale * factor,
          height * scale * factor,
          parseColor("#000000dd"),
          dst.bounds(),
        );
      if (host.suppressText) continue;
      dst.drawSurface(
        surface,
        px + surface.originX * scale * factor,
        py + surface.originY * scale * factor,
        factor,
        factor,
        opacity,
        dst.bounds(),
      );
      if (host.captureContrast) {
        const mask = new Surface(dst.width, dst.height);
        mask.drawSurface(
          surface,
          px + surface.originX * scale * factor,
          py + surface.originY * scale * factor,
          factor,
          factor,
          opacity,
          mask.bounds(),
        );
        host.recordTextMask(mask, `caption:${String(a.id)}`);
      }
    }
  };
}
