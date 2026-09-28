/** Caption imports, deterministic transcription caches and bounded cue pagination. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { SaxesParser } from "saxes";
/** @typedef {import('../xsd/validate.js').ValidNode} Node */
/** @param {number} t */
export function vttTime(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0")}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
/** @param {string} s @param {number} [fps] */
export function captionTime(s, fps = 30) {
  if (/^(?:\d+(?:\.\d+)?|\.\d+)(ms|s|m|h|f|t)$/.test(s)) {
    const unit = s.replace(/[\d.]/g, "");
    /** @type {Record<string,number>} */
    const units = { ms: 0.001, s: 1, m: 60, h: 3600, f: 1 / fps, t: 1 / fps };
    return parseFloat(s) * Number(units[unit]);
  }
  const p = s.replace(",", ".").split(":").map(Number);
  const t =
    p.length === 4
      ? Number(p[0]) * 3600 +
        Number(p[1]) * 60 +
        Number(p[2]) +
        Number(p[3]) / fps
      : p.reduce((v, n) => v * 60 + n, 0);
  if (!Number.isFinite(t) || t < 0)
    throw new Error(`invalid caption time ${s}`);
  return t;
}
/** Returns ALL bounded lines. paginateTrack, not concatenation or truncation, enforces maxLines.
 * @param {string} text @param {number} maxChars @param {number} _maxLines @param {number} [maxWords] */
export function breakLines(text, maxChars, _maxLines, maxWords = Infinity) {
  if (maxChars < 1 || _maxLines < 1 || maxWords < 1)
    throw new Error("caption limits must be positive");
  const lines = [];
  let line = "",
    words = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const parts = Array.from(word);
    while (parts.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
        words = 0;
      }
      lines.push(parts.splice(0, maxChars).join(""));
    }
    const rest = parts.join("");
    if (!rest) continue;
    if (
      line &&
      (Array.from(line).length + 1 + parts.length > maxChars ||
        words >= maxWords)
    ) {
      lines.push(line);
      line = "";
      words = 0;
    }
    line += (line ? " " : "") + rest;
    words++;
  }
  if (line) lines.push(line);
  return lines;
}
/** @param {string} s */
const plain = (s) =>
  s
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
/** @param {Node} template @param {Record<string,any>} attributes @param {Node[]} [children] */
const cue = (template, attributes, children = []) => ({
  ...template,
  name: "cue",
  type: "cueType",
  attributes,
  children,
});
/** @param {Node} track @param {string} data @param {string} format */
export function parseCaptions(track, data, format) {
  /** @type {Node[]} */ const cues = [];
  if (format === "srt" || format === "vtt") {
    for (const block of data.replace(/\r/g, "").split(/\n\s*\n/)) {
      const lines = block.split("\n"),
        index = lines.findIndex((l) => l.includes("-->"));
      if (index < 0) continue;
      const m = /([\d:.,]+)\s+-->\s+([\d:.,]+)(.*)/.exec(String(lines[index]));
      if (!m) throw new Error("invalid subtitle timing");
      const start = captionTime(String(m[1])),
        end = captionTime(String(m[2])),
        body = lines.slice(index + 1).join("\n"),
        speaker = /<v(?:\.[^ >]+)?\s+([^>]+)>/.exec(body)?.[1];
      const words = [];
      const tokens = body.split(/<(\d{2}:\d{2}:\d{2}\.\d{3})>/);
      let time = start;
      for (let i = 0; i < tokens.length; i += 2) {
        const text = plain(String(tokens[i])).trim(),
          stop = tokens[i + 1] ? captionTime(String(tokens[i + 1])) : end;
        if (text)
          words.push({
            ...track,
            name: "word",
            type: "captionWordType",
            attributes: { start: time, end: stop, text },
            children: [],
          });
        time = stop;
      }
      cues.push(
        cue(
          track,
          {
            start,
            end,
            text: plain(body),
            ...(speaker ? { speaker } : {}),
            ...(m[3]?.trim() ? { position: m[3].trim() } : {}),
          },
          tokens.length > 1 ? words : [],
        ),
      );
    }
  } else if (format === "ass") {
    let fields =
      "Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text".split(
        /,\s*/,
      );
    /** @type {Record<string,Record<string,string>>} */ const importedStyles =
      {};
    let styleFields =
      "Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding".split(
        /,\s*/,
      );
    for (const line of data.split(/\r?\n/)) {
      if (line.startsWith("Format:") && line.includes("Fontname"))
        styleFields = line.slice(7).trim().split(/,\s*/);
      if (line.startsWith("Style:")) {
        const values = line.slice(6).trim().split(",");
        const style = Object.fromEntries(
          styleFields.map((key, i) => [key, String(values[i] ?? "")]),
        );
        importedStyles[String(style.Name)] = style;
      }
      if (line.startsWith("Format:") && line.includes("Start"))
        fields = line.slice(7).trim().split(/,\s*/);
      if (!line.startsWith("Dialogue:")) continue;
      const values = line.slice(9).trim().split(","),
        a = Object.fromEntries(
          fields.map((f, i) => [
            f,
            i === fields.length - 1 ? values.slice(i).join(",") : values[i],
          ]),
        );
      const source = importedStyles[String(a.Style)] ?? {};
      const color = String(source.PrimaryColour ?? "")
        .replace(/^&H/i, "")
        .replace(/&$/, "")
        .padStart(8, "0");
      const sourceStyle = {
        ...(source.Fontname ? { font: source.Fontname } : {}),
        ...(source.Fontsize ? { size: Number(source.Fontsize) } : {}),
        ...(source.PrimaryColour
          ? {
              color:
                "#" +
                color.slice(6, 8) +
                color.slice(4, 6) +
                color.slice(2, 4) +
                (255 - parseInt(color.slice(0, 2), 16))
                  .toString(16)
                  .padStart(2, "0"),
            }
          : {}),
        ...(source.Bold ? { weight: Number(source.Bold) ? 700 : 400 } : {}),
        ...(source.Italic
          ? { fontStyle: Number(source.Italic) ? "italic" : "normal" }
          : {}),
      };
      const start = captionTime(String(a.Start)),
        end = captionTime(String(a.End)),
        body = String(a.Text),
        words = [];
      let time = start;
      for (const m of body.matchAll(/\{\\[kK][fo]?(\d+)\}([^{}]*)/g)) {
        const stop = time + Number(m[1]) / 100;
        words.push({
          ...track,
          name: "word",
          type: "captionWordType",
          attributes: { start: time, end: stop, text: String(m[2]).trim() },
          children: [],
        });
        time = stop;
      }
      cues.push(
        cue(
          track,
          {
            start,
            end,
            text: body.replace(/\{[^}]*\}/g, "").replace(/\\[Nn]/g, "\n"),
            sourceStyle: JSON.stringify(sourceStyle),
            ...(a.Name ? { speaker: a.Name } : {}),
            ...(/\\an(\d)/.exec(body)
              ? { position: `ass:${/\\an(\d)/.exec(body)?.[1]}` }
              : source.Alignment
                ? { position: `ass:${source.Alignment}` }
                : {}),
          },
          words,
        ),
      );
    }
  } else if (format === "ttml" || format === "itt") {
    /** @type {Map<string,Record<string,string>>} */ const definitions=new Map();
    const definitionsParser=new SaxesParser({xmlns:true});
    definitionsParser.on('opentag',tag=>{const a=Object.fromEntries(Object.values(tag.attributes).map(a=>[a.local,a.value]));if(['style','region'].includes(tag.local)&&a.id)definitions.set(a.id,a);});
    definitionsParser.write(data).close();
    /** @param {string} id @param {Set<string>} [seen] @returns {Record<string,string>} */
    const resolve=(id,seen=new Set())=>{if(seen.has(id))throw new Error('caption style cycle');seen.add(id);const a=definitions.get(id)??{};return Object.assign({},...String(a.style??'').split(/\s+/).filter(Boolean).map(id=>resolve(id,new Set(seen))),a);};
    const parser = new SaxesParser({ xmlns: true });
    let fps=30,tickRate=30;
    /** @type {Array<{start:number,end:number,node?:Node,word?:Node,style:Record<string,string>,sequential:boolean,cursor:number}>} */const stack=[];
    const time=(/** @type {string} */s)=>captionTime(s,s.endsWith('t')?tickRate:fps);
    parser.on('opentag',tag=>{
      const a=Object.fromEntries(Object.values(tag.attributes).map(a=>[a.local,a.value]));
      if(a.frameRate)fps=Number(a.frameRate)*Number(a.frameRateMultiplier?.split(' ')[0]??1)/Number(a.frameRateMultiplier?.split(' ')[1]??1);
      if(a.tickRate)tickRate=Number(a.tickRate);
      const parent=stack.at(-1),base=parent?.sequential?parent.cursor:parent?.start??0,start=base+(a.begin?time(a.begin):0),end=a.end?base+time(a.end):a.dur?start+time(a.dur):parent?.end??Infinity;
      const inherited=Object.assign({},parent?.style??{},...String(a.region??'').split(/\s+/).filter(Boolean).map(id=>resolve(id)),...String(a.style??'').split(/\s+/).filter(Boolean).map(id=>resolve(id)),a);
      const sourceStyle={...(inherited.color?{color:inherited.color}:{}),...(inherited.fontSize?{size:parseFloat(inherited.fontSize)}:{}),...(inherited.fontFamily?{font:inherited.fontFamily}:{}),...(inherited.fontWeight?{weight:inherited.fontWeight==='bold'?700:400}:{}),...(inherited.fontStyle?{fontStyle:inherited.fontStyle}:{}),...(inherited.textAlign?{align:inherited.textAlign}:{})};
      const origin=inherited.origin?.split(/\s+/),extent=inherited.extent?.split(/\s+/);
      const position=origin?.every((/** @type {string} */v)=>v.endsWith('%'))?`position:${parseFloat(String(origin[0]))+parseFloat(String(extent?.[0]??0))/2}% line:${parseFloat(String(origin[1]))+parseFloat(String(extent?.[1]??0))/2}%`:undefined;
      const n=tag.local==='p'?cue(track,{start,end,text:'',sourceStyle:JSON.stringify(sourceStyle),...(position?{position}:{})}):undefined;
      const p=[...stack].reverse().find(s=>s.node)?.node;
      if(tag.local==='br'&&p)p.attributes={...p.attributes,text:String(p.attributes.text)+'\n'};
      const word=tag.local==='span'&&p&&(a.begin||a.end||a.dur)?{...track,name:'word',type:'captionWordType',attributes:{start,end,text:'',emphasis:inherited.fontWeight==='bold'},children:[]}:undefined;
      stack.push({start,end,node:n,word,style:inherited,sequential:a.timeContainer==='seq',cursor:start});
    });
    parser.on('text',text=>{
      const p=[...stack].reverse().find(s=>s.node)?.node,w=[...stack].reverse().find(s=>s.word)?.word;
      if(p)p.attributes={...p.attributes,text:String(p.attributes.text)+text};
      if(w)w.attributes={...w.attributes,text:String(w.attributes.text)+text};
    });
    parser.on('closetag',()=>{const item=stack.pop();const parent=stack.at(-1);if(parent?.sequential&&item)parent.cursor=item.end;if(item?.node)cues.push(item.node);if(item?.word){const p=[...stack].reverse().find(s=>s.node)?.node;if(p)p.children=[...p.children,item.word];}});
    parser.write(data).close();
  } else throw new Error(`unsupported caption source format ${format}`);
  if (!cues.length && data.trim())
    throw new Error("caption source contains no cues");
  return cues;
}
/** @param {Node} track @returns {Node} */
export function paginateTrack(track) {
  const a = track.attributes,
    maxChars = Number(a.maxCharsPerLine ?? 32),
    maxLines = Number(a.maxLines ?? 2),
    maxWords = Number(a.maxWordsPerLine ?? Infinity);
  const filtered = (/** @type {string} */ text) =>
    a.profanityFilter === true
      ? text.replace(
          /\b(fuck(?:ing)?|shit|merda|porra|caralho|puta)\b/giu,
          (w) => "•".repeat(Array.from(w).length),
        )
      : text;
  const children = [];
  for (const c of track.children.filter((n) => n.name === "cue")) {
    const start = Number(c.attributes.start),
      end = Number(c.attributes.end),
      words = c.children.filter((n) => n.name === "word");
    if (!Number.isFinite(start + end) || start < 0 || end <= start)
      throw new Error("caption cue requires finite start < end");
    for (const w of words)
      if (
        Number(w.attributes.start) < start ||
        Number(w.attributes.end) > end ||
        Number(w.attributes.end) <= Number(w.attributes.start)
      )
        throw new Error("caption word outside cue");
    const text = filtered(
      String(
        c.attributes.text ?? words.map((w) => w.attributes.text).join(" "),
      ),
    );
    const lines = breakLines(text, maxChars, maxLines, maxWords);
    // Preserve imported/inline word boundaries when pagination crosses a cue.
    const pages = [];
    for (let i = 0; i < lines.length; i += maxLines)
      pages.push(lines.slice(i, i + maxLines).join("\n"));
    let consumed = 0;
    const tokens = words.flatMap((w) => {
      const chars = Array.from(filtered(String(w.attributes.text))),
        parts = [];
      for (let i = 0; i < chars.length; i += maxChars)
        parts.push({
          ...w,
          attributes: {
            ...w.attributes,
            text: chars.slice(i, i + maxChars).join(""),
            start:
              Number(w.attributes.start) +
              ((Number(w.attributes.end) - Number(w.attributes.start)) * i) /
                chars.length,
            end:
              Number(w.attributes.start) +
              ((Number(w.attributes.end) - Number(w.attributes.start)) *
                Math.min(chars.length, i + maxChars)) /
                chars.length,
          },
        });
      return parts;
    });
    for (let i = 0; i < pages.length; i++) {
      const page = String(pages[i]),
        count = page.split(/\s+/).length,
        selected = tokens.slice(consumed, consumed + count);
      const from =
          i === 0
            ? start
            : Number(
                tokens[consumed]?.attributes.start ??
                  start + ((end - start) * i) / pages.length,
              ),
        to =
          i === pages.length - 1
            ? end
            : Number(
                tokens[consumed + count]?.attributes.start ??
                  start + ((end - start) * (i + 1)) / pages.length,
              );
      children.push({
        ...c,
        attributes: { ...c.attributes, start: from, end: to, text: page },
        children: selected.map((w) => ({
          ...w,
          attributes: {
            ...w.attributes,
            start: Math.max(from, Number(w.attributes.start)),
            end: Math.min(to, Number(w.attributes.end)),
          },
        })),
      });
      consumed += count;
    }
  }
  return {
    ...track,
    children: children.sort(
      (a, b) => Number(a.attributes.start) - Number(b.attributes.start),
    ),
  };
}
/** @param {Node} scene @param {(src:string)=>Uint8Array} read @param {(src:string)=>string} [path] */
export function prepareCaptions(scene, read, path) {
  return (
    scene.children.find((n) => n.name === "captions")?.children ?? []
  ).map((track) => {
    const a = track.attributes;
    let children = track.children;
    if (a.transcribe) {
      if (!a.cache || !a.cacheSha256)
        throw new Error(
          "transcription requires cache and cacheSha256; automatic network transcription is not performed",
        );
      const bytes = read(String(a.cache));
      if (createHash("sha256").update(bytes).digest("hex") !== a.cacheSha256)
        throw new Error("transcription cache SHA-256 mismatch");
      const data = JSON.parse(Buffer.from(bytes).toString());
      if (
        data.version !== 1 ||
        data.track !== a.transcribe ||
        !Array.isArray(data.cues)
      )
        throw new Error("invalid transcription cache contract");
      children = data.cues.map((/** @type {any} */ c) =>
        cue(
          track,
          { start: c.start, end: c.end, text: c.text, speaker: c.speaker },
          (c.words ?? []).map((/** @type {any} */ w) => ({
            ...track,
            name: "word",
            type: "captionWordType",
            attributes: w,
            children: [],
          })),
        ),
      );
    } else if (a.src) {
      const format = String(a.format ?? String(a.src).split(".").at(-1));
      const bytes = read(String(a.src));
      const data =
        format === "scc"
          ? execFileSync(
              "ffmpeg",
              [
                "-v",
                "error",
                "-f",
                "scc",
                "-i",
                "pipe:0",
                "-f",
                "webvtt",
                "pipe:1",
              ],
              { input: bytes, encoding: "utf8", maxBuffer: 1 << 24 },
            )
          : Buffer.from(bytes).toString("utf8");
      children = parseCaptions(track, data, format === "scc" ? "vtt" : format);
    }
    return paginateTrack({ ...track, children });
  });
}
/** @param {Node} track @param {number} start @param {number} end */
export function clipCaptions(track, start, end) {
  return {
    ...track,
    children: track.children
      .filter(
        (c) =>
          Number(c.attributes.start) < end && Number(c.attributes.end) > start,
      )
      .map((c) => ({
        ...c,
        attributes: {
          ...c.attributes,
          start: Math.max(start, Number(c.attributes.start)) - start,
          end: Math.min(end, Number(c.attributes.end)) - start,
        },
        children: c.children
          .filter(
            (w) =>
              Number(w.attributes.start) < end &&
              Number(w.attributes.end) > start,
          )
          .map((w) => ({
            ...w,
            attributes: {
              ...w.attributes,
              start: Math.max(start, Number(w.attributes.start)) - start,
              end: Math.min(end, Number(w.attributes.end)) - start,
            },
          })),
      })),
  };
}
/** @param {Node} track */
export function toVtt(track) {
  const escape = (/** @type {string} */ s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return (
    "WEBVTT\n\n" +
    paginateTrack(track)
      .children.map((c, i) => {
        let body = escape(String(c.attributes.text));
        if (c.children.length) {
          const boundaries = new Set();
          let count = 0;
          for (const line of String(c.attributes.text).split("\n")) {
            count += line.split(/\s+/).filter(Boolean).length;
            boundaries.add(count);
          }
          body = c.children
            .map(
              (w, j) =>
                `${j && Number(w.attributes.start) > Number(c.attributes.start) ? "<" + vttTime(Number(w.attributes.start)) + ">" : ""}${escape(String(w.attributes.text))}${j < c.children.length - 1 ? (boundaries.has(j + 1) ? "\n" : " ") : ""}`,
            )
            .join("");
        }
        if (c.attributes.speaker)
          body =
            "<v " + escape(String(c.attributes.speaker)) + ">" + body + "</v>";
        const position = String(c.attributes.position ?? "");
        return `${i + 1}\n${vttTime(Number(c.attributes.start))} --> ${vttTime(Number(c.attributes.end))}${position.includes(":") && !position.startsWith("ass:") ? " " + position : ""}\n${body}\n`;
      })
      .join("\n")
  );
}
