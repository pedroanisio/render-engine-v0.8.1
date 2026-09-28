import { createCanvas, GlobalFonts, Path2D } from "@napi-rs/canvas";
import { digest } from "./resolve.js";
import { fontBytes } from "./font-container.js";
import * as fontkit from "fontkit";
import bidiFactory from "bidi-js";
import Hypher from "hypher";
import english from "hyphenation.en-us";
import portuguese from "hyphenation.pt";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  textTransform,
  textPathPoint,
  combineTransforms,
} from "./text-animation.js";
import { strokePath } from "../render/geometry/path.js";
import { canvasPaint } from "./canvas-paint.js";
import { rgbaSurface } from "./color.js";
/** Map common BCP-47 language subtags to OpenType language-system tags. */
const languages = /** @type {Record<string,string>} */ ({
  en: "ENG",
  pt: "PTG",
  ar: "ARA",
  fa: "FAR",
  ur: "URD",
  he: "IWR",
  hi: "HIN",
  bn: "BEN",
  ta: "TAM",
  te: "TEL",
  kn: "KAN",
  ml: "MAL",
  mr: "MAR",
  gu: "GUJ",
  pa: "PAN",
  ne: "NEP",
  th: "THA",
  vi: "VIT",
  id: "IND",
  ms: "MLY",
  ja: "JAN",
  ko: "KOR",
  fr: "FRA",
  de: "DEU",
  es: "ESP",
  it: "ITA",
  nl: "NLD",
  tr: "TRK",
  sr: "SRB",
  hr: "HRV",
  ru: "RUS",
  uk: "UKR",
  bg: "BGR",
  mk: "MKD",
  pl: "PLK",
  cs: "CSY",
  sk: "SKY",
  hu: "HUN",
  el: "ELL",
  ro: "ROM",
  sv: "SVE",
  da: "DAN",
  fi: "FIN",
  no: "NOR",
  et: "ETI",
  lt: "LTH",
  lv: "LVI",
  sl: "SLV",
  is: "ISL",
  az: "AZE",
  ka: "KAT",
  hy: "HYE",
});
/** @param {string|undefined} language */
function shapingLanguage(language) {
  if (!language) return undefined;
  const primary = language.toLowerCase().split("-")[0] ?? "";
  return primary === "zh"
    ? /hant|tw|hk/i.test(language)
      ? "ZHT"
      : "ZHS"
    : (languages[primary] ?? language.toUpperCase());
}
const bidi = bidiFactory();
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @typedef {Record<string,any>} Style */
/** @typedef {{text:string,style:Style,role:string,width:number,line?:number,x?:number,y?:number}} Item */
/** Explicit XML attributes override inherited style; schema defaults do not. @param {Node} n @param {Map<string,Node>} styles @param {Style} [parent] @returns {Style} */
export function textStyle(n, styles, parent = {}) {
  const id = n.attributes.basedOn ?? n.attributes.style;
  const ref = id === undefined ? undefined : styles.get(String(id));
  const inherited = ref ? textStyle(ref, styles, parent) : parent;
  const explicit = Object.fromEntries(
    (n.specifiedAttributes ?? Object.keys(n.attributes)).map((k) => [
      k,
      n.attributes[k],
    ]),
  );
  return { ...n.attributes, ...inherited, ...explicit };
}
/** @param {string} value */
export function settings(value) {
  return Object.fromEntries(
    String(value)
      .split(/[,;]/)
      .filter(Boolean)
      .map((entry) => {
        if (/^[A-Za-z0-9]{4}$/.test(entry.trim())) return [entry.trim(), 1];
        const match =
          /["']?([A-Za-z0-9]{4})["']?\s*(?:=|:|\s)\s*(-?\d+(?:\.\d+)?|on|off)/.exec(
            entry.trim(),
          );
        if (!match) throw new Error(`invalid font setting ${entry}`);
        return [
          String(match[1]),
          match[2] === "on" ? 1 : match[2] === "off" ? 0 : Number(match[2]),
        ];
      }),
  );
}
/** @param {Node} scene @param {(n:Node,src:string)=>Uint8Array} read @param {(n:Node,path:string,bytes:Uint8Array)=>void} [systemFont] */
export function createTypography(scene, read, systemFont) {
  const styles = new Map(
    (scene.children.find((n) => n.name === "styles")?.children ?? []).map(
      (n) => [String(n.attributes.id), n],
    ),
  );
  const assets = new Map(
    (scene.children.find((n) => n.name === "assets")?.children ?? []).map(
      (n) => [String(n.attributes.id), n],
    ),
  );
  /** @type {Map<string,{font:any,family:string}>} */ const fonts = new Map();
  /** @param {Style} s @param {Node} owner */
  function font(s, owner) {
    const asset = assets.get(String(s.fontAsset)),
      src = String(s.fontFile ?? asset?.attributes.src ?? ""),
      family = String(s.font ?? asset?.attributes.family ?? "sans-serif"),
      key = JSON.stringify([
        src,
        family,
        s.weight,
        s.fontStyle,
        s.variation,
        asset?.attributes.collectionIndex,
      ]);
    let found = fonts.get(key);
    if (found) return found;
    const path =
      src ||
      execFileSync(
        "fc-match",
        [
          "-f",
          "%{file}",
          `${family}:weight=${Number(s.weight ?? 400) >= 600 ? "bold" : "regular"}:slant=${s.fontStyle === "italic" ? "italic" : "roman"}`,
        ],
        { encoding: "utf8" },
      );
    const bytes = src ? read(owner, src) : readFileSync(path);
    if (!src) systemFont?.(owner, path, bytes);
    const unwrapped = fontBytes(bytes);
    let parsed = fontkit.create(unwrapped);
    if (parsed.fonts)
      parsed = parsed.fonts[Number(asset?.attributes.collectionIndex ?? 0)];
    if (!parsed) throw new Error(`font collection index unavailable: ${src}`);
    const variations = {
      ...(parsed.variationAxes?.wght && s.weight !== undefined
        ? { wght: Number(s.weight) }
        : {}),
      ...(s.variation ? settings(s.variation) : {}),
    };
    if (Object.keys(variations).length) {
      if (!parsed.getVariation)
        throw new Error("variation requires a variable font");
      parsed = parsed.getVariation(variations);
    }
    const alias = `SceneFont${digest(unwrapped).slice(0, 20)}`;
    GlobalFonts.register(unwrapped, alias);
    found = { font: parsed, family: alias };
    fonts.set(key, found);
    return found;
  }
  /** @param {Style} s @param {string} text @param {Node} owner */
  function selectedFont(s, text, owner) {
    const candidates = [
      s,
      ...String(s.fallback ?? "")
        .split(",")
        .filter(Boolean)
        .map((f) => ({
          ...s,
          font: f.trim(),
          fontAsset: undefined,
          fontFile: undefined,
        })),
    ];
    for (const candidate of candidates) {
      const found = font(candidate, owner);
      if (
        [...text].every(
          (c) =>
            /\s/.test(c) || found.font.hasGlyphForCodePoint(c.codePointAt(0)),
        )
      )
        return found;
    }
    return font(s, owner);
  }
  /** @param {string} text @param {Style} s @param {Node} owner */
  function shape(text, s, owner) {
    const found = selectedFont(s, text, owner),
      features = s.features
        ? Object.fromEntries(
            Object.entries(settings(s.features)).map(([k, v]) => [k, !!v]),
          )
        : undefined;
    return {
      found,
      run: found.font.layout(
        text,
        features,
        undefined,
        shapingLanguage(s.language),
        s.direction === "auto" ? undefined : s.direction,
      ),
    };
  }
  /** @param {Item} item @param {Node} owner */
  function measure(item, owner) {
    const { found, run } = shape(item.text, item.style, owner),
      size = Number(item.style.size),
      spacing =
        Number(item.style.letterSpacing ?? 0) +
        (Number(item.style.tracking ?? 0) * size) / 1000;
    return (
      ((run.positions.reduce(
        (/** @type {number} */ sum, /** @type {any} */ p) => sum + p.xAdvance,
        0,
      ) *
        size) /
        found.font.unitsPerEm) *
        Number(item.style.stretch ?? 1) +
      Math.max(0, Array.from(item.text).length) * spacing
    );
  }
  /** @param {Node} asset @param {number} scale @param {Style} [animated] */
  function layout(asset, scale = 1, animated = {}) {
    const root = { ...textStyle(asset, styles), ...animated },
      vertical = root.writingMode !== "horizontal-tb",
      width = Number(vertical ? root.height : root.width),
      height = Number(vertical ? root.width : root.height),
      spans = asset.children.filter((c) => c.name === "span"),
      source = spans.length
        ? spans
        : [
            {
              ...asset,
              value: root.text ?? "",
              attributes: /** @type {Node['attributes']} */ ({}),
              specifiedAttributes: [],
            },
          ];
    /** @param {number} size */
    const build = (size) => {
      /** @type {Item[]} */ const tokens = [];
      for (const span of source) {
        const s = /** @type {Style} */ ({
            ...textStyle(span, styles, root),
            size:
              (Number(span.attributes.size ?? root.size) * size) /
              Number(root.size),
          }),
          raw = String(span.value ?? "");
        let text =
          s.textTransform === "uppercase"
            ? raw.toLocaleUpperCase(s.language)
            : s.textTransform === "lowercase"
              ? raw.toLocaleLowerCase(s.language)
              : s.textTransform === "capitalize"
                ? raw.replace(/\b\p{L}/gu, (c) =>
                    c.toLocaleUpperCase(s.language),
                  )
                : raw;
        if (s.hyphenate) {
          const dictionary = String(s.language ?? "en").startsWith("pt")
            ? portuguese
            : english;
          const hypher = new Hypher(dictionary);
          text = text.replace(/\p{L}{5,}/gu, (word) =>
            hypher.hyphenate(word).join("\u00ad"),
          );
        }
        const parts =
          s.wrap === "character"
            ? Array.from(
                new Intl.Segmenter(s.language, {
                  granularity: "grapheme",
                }).segment(text),
                (v) => v.segment,
              )
            : text.split(/(\n|[ \t]+|\u00ad)/).filter(Boolean);
        for (const text of parts) {
          const item = {
            text,
            style: s,
            role: String(span.attributes.role ?? ""),
            width: 0,
          };
          item.width =
            text === "\n" || text === "\u00ad" ? 0 : measure(item, asset);
          tokens.push(item);
        }
      }
      let limit = width;
      const total = tokens.reduce((n, t) => n + t.width, 0);
      if (root.wrap === "balance")
        limit = Math.min(
          width,
          total / Math.max(1, Math.ceil(total / width)) + Number(root.size),
        );
      /** @type {Item[][]} */ const lines = [[]];
      let used = 0,
        soft = false;
      for (const item of tokens) {
        if (item.text === "\n") {
          lines.push([]);
          used = 0;
          continue;
        }
        if (item.text === "\u00ad") {
          soft = true;
          continue;
        }
        if (
          root.wrap !== "none" &&
          used + item.width > limit &&
          lines[lines.length - 1]?.length
        ) {
          if (soft) {
            const hyphen = { ...item, text: "-", width: 0 };
            hyphen.width = measure(hyphen, asset);
            lines.at(-1)?.push(hyphen);
          }
          lines.push([]);
          used = 0;
          if (/^\s+$/.test(item.text)) continue;
        }
        lines[lines.length - 1]?.push(item);
        used += item.width;
        soft = false;
      }
      return {
        lines,
        overflow:
          lines.some((l) => l.reduce((n, t) => n + t.width, 0) > width) ||
          lines.length * size * Number(root.lineHeight) > height ||
          lines.length > Number(root.maxLines ?? Infinity),
      };
    };
    let size = Number(root.size),
      result = build(size);
    if (root.autoFit !== "none") {
      let lo = Number(root.minSize ?? 1),
        hi = Number(
          root.maxSize ?? (root.autoFit === "shrink" ? size : size * 4),
        );
      if (root.autoFit === "grow") lo = size;
      if (root.autoFit === "shrink") hi = Math.min(hi, size);
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (build(mid).overflow) hi = mid;
        else lo = mid;
      }
      size = lo;
      result = build(size);
    }
    const lineHeight = size * Number(root.lineHeight),
      maxLines = Math.max(
        1,
        Math.min(
          Number(root.maxLines ?? Infinity),
          root.overflow === "ellipsis"
            ? Math.floor(height / lineHeight)
            : Infinity,
        ),
      );
    let lines = result.lines;
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      if (root.overflow === "ellipsis") {
        const last = lines.at(-1);
        if (last) {
          const style = last.at(-1)?.style ?? { ...root, size };
          const ellipsis = { text: "…", style, role: "", width: 0 };
          ellipsis.width = measure(ellipsis, asset);
          while (
            last.length &&
            last.reduce((n, t) => n + t.width, 0) + ellipsis.width > width
          )
            last.pop();
          last.push(ellipsis);
        }
      }
    }
    const blockHeight = lines.length * lineHeight,
      top =
        root.verticalAlign === "middle"
          ? (height - blockHeight) / 2
          : root.verticalAlign === "bottom"
            ? height - blockHeight
            : 0;
    lines.forEach((line, li) => {
      const text = line.map((t) => t.text).join(""),
        levels = bidi.getEmbeddingLevels(
          text,
          root.direction === "auto" ? undefined : root.direction,
        ),
        rtl = levels.paragraphs[0]?.level % 2 === 1;
      let offset = 0;
      const entries = line.map((item) => {
        const level = Number(levels.levels[offset] ?? 0);
        offset += item.text.length;
        item.style = { ...item.style, direction: level % 2 ? "rtl" : "ltr" };
        return { item, level };
      });
      const highest = Math.max(0, ...entries.map((e) => e.level)),
        lowest = Math.min(
          ...entries.filter((e) => e.level % 2).map((e) => e.level),
        );
      for (let level = highest; level >= lowest; level--) {
        for (let i = 0; i < entries.length; i++) {
          if (Number(entries[i]?.level) < level) continue;
          let end = i;
          while (
            end + 1 < entries.length &&
            Number(entries[end + 1]?.level) >= level
          )
            end++;
          entries.splice(
            i,
            end - i + 1,
            ...entries.slice(i, end + 1).reverse(),
          );
          i = end;
        }
      }
      const visual = entries.map((e) => e.item),
        used = line.reduce((n, t) => n + t.width, 0),
        align =
          root.align === "start"
            ? rtl
              ? "right"
              : "left"
            : root.align === "end"
              ? rtl
                ? "left"
                : "right"
              : root.align;
      let x =
        align === "center"
          ? (width - used) / 2
          : align === "right"
            ? width - used
            : 0;
      for (const item of visual) {
        item.x = x;
        item.y = top + li * lineHeight + size;
        item.line = li;
        x += item.width;
      }
    });
    return { root, size, width, height, lines, scale };
  }
  /** @param {Node} asset @param {number} scale @param {Style} [animated] @param {Node} [layer] @param {import('../render/frame.js').FrameRenderer} [host] @param {Parameters<typeof canvasPaint>[1]} [paintEnv] */
  function render(asset, scale, animated = {}, layer, host, paintEnv) {
    const counter = layer?.children.find(
      (n) => n.name === "textAnimator" && n.attributes.preset === "counter",
    );
    if (counter && asset.attributes.text !== undefined) {
      const at = counter.attributes,
        local = layer
          ? (host?.runtime?.timeline.spans.get(layer)?.local(host.time) ??
            host?.time ??
            0)
          : 0,
        p = Math.max(
          0,
          Math.min(
            1,
            (local - Number(at.presetStart ?? 0)) /
              Number(at.presetDuration ?? 1),
          ),
        );
      animated = {
        ...animated,
        text: String(Math.round(Number(asset.attributes.text) * p)),
      };
    }
    const data = layout(asset, scale, animated),
      { root, lines, width, height } = data,
      vertical = root.writingMode !== "horizontal-tb",
      outputWidth = Number(root.width),
      outputHeight = Number(root.height),
      overflow = root.overflow === "visible",
      extra = overflow
        ? Math.ceil(
            Math.max(
              data.size * 2,
              ...lines
                .flat()
                .map(
                  (t) =>
                    Math.abs(Number(t.style.shadowOffsetX ?? 0)) +
                    Math.abs(Number(t.style.shadowOffsetY ?? 0)) +
                    Number(t.style.shadowBlur ?? 0) * 3 +
                    Number(t.style.strokeWidth ?? 0),
                ),
            ),
          )
        : 0,
      canvasWidth = overflow
        ? Math.max(
            outputWidth,
            ...lines.map((l) => l.reduce((n, t) => n + t.width, 0)),
          ) +
          extra * 2
        : outputWidth,
      canvasHeight = overflow
        ? Math.max(
            outputHeight,
            lines.length * data.size * Number(root.lineHeight),
          ) +
          extra * 2
        : outputHeight,
      c = createCanvas(
        Math.max(1, Math.ceil(canvasWidth * scale)),
        Math.max(1, Math.ceil(canvasHeight * scale)),
      ),
      ctx = c.getContext("2d");
    ctx.scale(scale, scale);
    ctx.translate(extra, extra);
    if (vertical) {
      ctx.translate(root.writingMode === "vertical-rl" ? outputWidth : 0, 0);
      ctx.transform(0, 1, root.writingMode === "vertical-rl" ? -1 : 1, 0, 0, 0);
    }
    const paintFill = paintEnv
      ? canvasPaint(ctx, paintEnv, width, height, scale)
      : (/** @type {string} */ value) => value;
    // Referenced paints may animate or sample media, so a render that used one
    // is reported as dynamic and never reused across frames.
    let dynamicPaint = false;
    const fill = (/** @type {string} */ value) => {
      if (value.startsWith("url(")) dynamicPaint = true;
      return paintFill(value);
    };
    const animatorNodes =
        layer?.children.filter((n) => n.name === "textAnimator") ?? [],
      pathNode = layer?.children.find((n) => n.name === "textPath"),
      all = lines.flat(),
      total = all.reduce((n, t) => n + Array.from(t.text).length, 0),
      roles = [...new Set(all.map((t) => t.role))];
    let character = 0,
      word = 0;
    const padding = Number(root.backgroundPadding ?? 0),
      radius = Number(root.backgroundRadius ?? 0);
    /** @param {string} color @param {number} x @param {number} y @param {number} w @param {number} h */
    const rectangle = (color, x, y, w, h) => {
      ctx.fillStyle = fill(color);
      ctx.beginPath();
      ctx.roundRect(
        x - padding,
        y - padding,
        w + padding * 2,
        h + padding * 2,
        radius,
      );
      ctx.fill();
    };
    if (root.background && root.backgroundMode === "block")
      rectangle(root.background, 0, 0, width, height);
    for (const line of lines) {
      if (root.background && root.backgroundMode === "line" && line.length)
        rectangle(
          root.background,
          Number(line[0]?.x),
          Number(line[0]?.y) - data.size,
          line.reduce((n, t) => n + t.width, 0),
          data.size * Number(root.lineHeight),
        );
      for (const item of line) {
        const s = item.style,
          { found, run } = shape(item.text, s, asset),
          size = Number(s.size),
          factor = size / found.font.unitsPerEm,
          x = Number(item.x),
          y = Number(item.y) - Number(s.baselineShift ?? 0),
          stretch = Number(s.stretch ?? 1),
          spacing =
            Number(s.letterSpacing ?? 0) +
            (Number(s.tracking ?? 0) * size) / 1000;
        if (s.highlight)
          rectangle(
            s.highlight,
            x,
            y - size,
            item.width,
            size * Number(root.lineHeight),
          );
        ctx.save();
        ctx.fillStyle = fill(String(s.color ?? "#FFFFFFFF"));
        ctx.strokeStyle = fill(String(s.strokeColor ?? "#00000000"));
        ctx.lineWidth = Number(s.strokeWidth ?? 0);
        ctx.shadowColor = String(s.shadowColor ?? "#00000000");
        ctx.shadowBlur = Number(s.shadowBlur ?? 0);
        ctx.shadowOffsetX = Number(s.shadowOffsetX ?? 0);
        ctx.shadowOffsetY = Number(s.shadowOffsetY ?? 0);
        if (
          root.emoji === "color" &&
          /\p{Extended_Pictographic}/u.test(item.text)
        ) {
          ctx.font = `${size}px "${found.family}", "Noto Color Emoji", sans-serif`;
          ctx.fillText(item.text, x, y);
        } else {
          let cursor = x;
          run.glyphs.forEach(
            (/** @type {any} */ glyph, /** @type {number} */ i) => {
              const p = run.positions[i];
              ctx.save();
              let gx = cursor + p.xOffset * factor * stretch,
                gy = y - p.yOffset * factor,
                rotation = 0;
              const unit = {
                index: character,
                count: total,
                word,
                words: all.length,
                line: Number(item.line),
                lines: lines.length,
                span: roles.indexOf(item.role),
                spans: roles.length,
                role: item.role,
                text: String.fromCodePoint(...glyph.codePoints),
                size,
              };
              character += Math.max(1, glyph.codePoints.length);
              if (pathNode) {
                const at =
                    host?.runtime?.attributes(pathNode, host.time) ??
                    pathNode.attributes,
                  point = textPathPoint(
                    at,
                    cursor,
                    p.xAdvance * factor,
                    all.reduce((n, t) => n + t.width, 0),
                  );
                gx = point.x;
                gy = point.y;
                rotation = point.rotation;
              }
              let drawingGlyph = glyph;
              /** @type {Style[]} */ const transformations = [];
              for (const animator of animatorNodes) {
                const rawAt =
                    host?.runtime?.attributes(animator, host.time) ??
                    animator.attributes,
                  at = /** @type {Style} */ ({
                    ...rawAt,
                    unit:
                      rawAt.preset === "word-by-word"
                        ? "word"
                        : rawAt.preset === "line-by-line"
                          ? "line"
                          : rawAt.unit,
                  }),
                  local = layer
                    ? (host?.runtime?.timeline.spans
                        .get(layer)
                        ?.local(host.time) ??
                      host?.time ??
                      0)
                    : 0;
                const transform = textTransform(
                  at,
                  unit,
                  local,
                  host?.runtime?.textSelector(
                    animator,
                    host.time,
                    unit.index,
                    unit.count,
                  ),
                );
                transformations.push({
                  ...transform,
                  combine: at.combine,
                  highlightColor: at.fill ?? "#FFFF00",
                });
              }
              const combined = combineTransforms(transformations);
              for (const transform of [combined]) {
                gx += transform.x + transform.tracking * unit.index;
                gy +=
                  transform.y -
                  transform.baselineShift +
                  transform.lineSpacing * unit.line;
                rotation += transform.rotation;
                ctx.globalAlpha *= transform.opacity;
                ctx.filter = `blur(${transform.blur}px)`;
                ctx.translate(gx + transform.anchorX, gy + transform.anchorY);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.transform(
                  transform.scaleX,
                  0,
                  Math.tan((transform.skew * Math.PI) / 180),
                  transform.scaleY,
                  0,
                  0,
                );
                ctx.translate(-transform.anchorX, -transform.anchorY);
                gx = gy = rotation = 0;
                if (transform.characterOffset)
                  drawingGlyph = found.font.glyphForCodePoint(
                    Math.max(
                      0,
                      Math.min(
                        0x10ffff,
                        Number(glyph.codePoints[0] ?? 32) +
                          Math.round(transform.characterOffset),
                      ),
                    ),
                  );
                if (transform.variation)
                  drawingGlyph = font(
                    { ...s, variation: transform.variation },
                    asset,
                  ).font.getGlyph(glyph.id);
                if (transform.strokeWidth !== undefined)
                  ctx.lineWidth = transform.strokeWidth / factor;
                if (transform.fill) ctx.fillStyle = fill(transform.fill);
                if (transform.stroke) ctx.strokeStyle = fill(transform.stroke);
                if (transform.reveal !== undefined) {
                  ctx.beginPath();
                  ctx.rect(
                    0,
                    -size,
                    p.xAdvance * factor * transform.reveal,
                    size * 1.4,
                  );
                  ctx.clip();
                }
                if (transform.highlight) {
                  ctx.save();
                  ctx.fillStyle = String(transform.highlightColor ?? "#FFFF00");
                  ctx.globalAlpha *= transform.highlight;
                  ctx.fillRect(0, -size, p.xAdvance * factor, size * 1.2);
                  ctx.restore();
                }
              }
              ctx.translate(gx, gy);
              ctx.rotate((rotation * Math.PI) / 180);
              if (
                s.fontStyle &&
                s.fontStyle !== "normal" &&
                !found.font.italicAngle
              )
                ctx.transform(1, 0, -0.2, 1, 0, 0);
              ctx.scale(factor * stretch, -factor);
              ctx.fillStyle = fill(
                String(combined.fill ?? s.color ?? "#FFFFFFFF"),
              );
              ctx.strokeStyle = fill(
                String(combined.stroke ?? s.strokeColor ?? "#00000000"),
              );
              const path = new Path2D(drawingGlyph.path.toSVG());
              const strokeWidth = Number(
                combined.strokeWidth ?? s.strokeWidth ?? 0,
              );
              if (strokeWidth > 0) {
                ctx.save();
                ctx.fillStyle = ctx.strokeStyle;
                ctx.fill(
                  strokePath(path, {
                    strokeWidth: strokeWidth / factor,
                    strokePosition: s.strokePosition ?? "center",
                  }),
                );
                ctx.restore();
              }
              ctx.fill(path);
              if (combined.karaoke !== undefined) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(
                  0,
                  -found.font.unitsPerEm,
                  Math.max(0, combined.karaoke) * p.xAdvance,
                  found.font.unitsPerEm * 2,
                );
                ctx.clip();
                ctx.fillStyle = fill(
                  String(combined.highlightColor ?? "#FFFF00"),
                );
                ctx.fill(path);
                ctx.restore();
              }
              if (
                Number(s.weight ?? 400) >= 600 &&
                !found.font.variationAxes?.wght &&
                Number(found.font["OS/2"]?.usWeightClass ?? 400) < 600
              ) {
                ctx.save();
                ctx.strokeStyle = ctx.fillStyle;
                ctx.lineWidth = found.font.unitsPerEm / 40;
                ctx.stroke(path);
                ctx.restore();
              }
              ctx.restore();
              cursor += p.xAdvance * factor * stretch + spacing;
            },
          );
        }
        ctx.shadowColor = "#00000000";
        if (s.decoration && s.decoration !== "none") {
          const yy =
            s.decoration === "line-through"
              ? y - size * 0.3
              : s.decoration === "overline"
                ? y - size
                : y + size * 0.1;
          ctx.fillRect(x, yy, item.width, Math.max(1, size / 16));
        }
        ctx.restore();
        word++;
      }
    }
    const surface = rgbaSurface(
      ctx.getImageData(0, 0, c.width, c.height).data,
      c.width,
      c.height,
    );
    Object.assign(surface, {
      originX: -extra,
      originY: -extra,
      logicalWidth: outputWidth,
      logicalHeight: outputHeight,
      overflow,
    });
    return {
      surface,
      baseline: data.size,
      layout: data,
      dynamic:
        dynamicPaint ||
        counter !== undefined ||
        pathNode !== undefined ||
        animatorNodes.length > 0,
    };
  }
  // Resolve every declared font reference before cache lookup, including inherited styles.
  for (const asset of assets.values())
    if (asset.name === "font") font({ fontAsset: asset.attributes.id }, asset);
    else if (asset.name === "text") {
      const root = textStyle(asset, styles);
      font(root, asset);
      for (const family of String(root.fallback ?? "")
        .split(",")
        .filter(Boolean))
        font(
          {
            ...root,
            fontAsset: undefined,
            fontFile: undefined,
            font: family.trim(),
          },
          asset,
        );
      for (const span of asset.children)
        if (span.name === "span") font(textStyle(span, styles, root), asset);
    }
  return {
    render,
    layout,
    canvasStyle: (/** @type {Node} */ owner, /** @type {string} */ id) => {
      const node = styles.get(id),
        s = node ? textStyle(node, styles) : {};
      return { ...s, font: font(s, owner).family };
    },
  };
}
