import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadScene, compileAnimations } from "../src/index.js";
import { FrameRenderer, seed32 } from "../src/render/frame.js";
import { Surface } from "../src/render/surface.js";
import { decodePng, encodePng } from "../src/render/image.js";

const FONT = readFileSync("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf");
const close = (a, b, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

function png(w, h, rgba) {
  const s = new Surface(w, h);
  for (let i = 0; i < w * h; i++) s.data.set(rgba, i * 4);
  return encodePng(s);
}

const files = {
  "red.png": png(8, 8, [1, 0, 0, 1]),
  "font.ttf": new Uint8Array(FONT),
};

function renderer(body, scale = 1, extraAssets = "") {
  const r =
    loadScene(`<scene version="1.1"><project width="16" height="8" fps="24" duration="10" background="#000000FF"/>
    <styles><token name="ink" value="#0000FF"/><textStyle id="st" fontAsset="f" size="6" color="#FFFFFF"/></styles>
    <assets><image id="red" src="red.png" width="8" height="8"/><font id="f" src="font.ttf" family="D"/>
      <text id="t" text="Hi" width="16" height="8" size="6" style="st" align="center" verticalAlign="middle"/>${extraAssets}</assets>
    <composition>${body}</composition></scene>`);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.diagnostics));
  const reads = [];
  const fr = new FrameRenderer(
    r.scene,
    compileAnimations(r.scene).tracks,
    {
      read: (p) => {
        reads.push(p);
        return files[p];
      },
    },
    scale,
  );
  return { fr, reads };
}
const at = (s, x, y) =>
  Array.from(s.data.slice((y * s.width + x) * 4, (y * s.width + x) * 4 + 4));

test("seed32 takes the low 32 bits of bigint seeds", () => {
  assert.equal(seed32(131804n), 131804);
  assert.equal(seed32((1n << 40n) + 5n), 5);
  assert.equal(seed32(7), 7);
  assert.equal(seed32(undefined), 0);
});

test("PNG round-trip and box-filtered reduction", () => {
  const s = decodePng(png(4, 2, [0.25, 0.5, 1, 1]), 1);
  close(at(s, 0, 0)[1], 0.5, 0.01);
  close(at(s, 3, 1)[3], 1);
  const half = decodePng(png(4, 2, [1, 1, 1, 0.5]), 0.5);
  assert.equal(half.width, 2);
  close(at(half, 0, 0)[3], 0.5, 0.01);
});

test("draws background, z-ordered shapes, tokens and clipped groups", () => {
  const { fr } = renderer(`
    <shape id="top" shape="rect" x="0" y="0" width="16" height="8" fill="var(--ink)" z="5"/>
    <shape id="under" shape="rect" x="0" y="0" width="16" height="8" fill="#FF0000" z="1"/>
    <group id="g" x="8" y="0" width="4" height="4" clip="true" z="9">
      <shape id="big" shape="rect" x="0" y="0" width="16" height="16" fill="#00FF00"/>
    </group>
    <shape id="late" shape="rect" x="0" y="0" width="16" height="8" fill="#FFFFFF" z="10" start="5"/>`);
  const s = fr.render(1);
  assert.deepEqual(at(s, 0, 0), [0, 0, 1, 1]);
  assert.deepEqual(at(s, 9, 1), [0, 1, 0, 1]);
  assert.deepEqual(at(s, 13, 1), [0, 0, 1, 1]);
  assert.deepEqual(at(fr.render(6), 0, 0), [1, 1, 1, 1]);
  assert.deepEqual([...fr.unsupported], []);
});

test("group opacity, animated layer position, scale and anchor, stroked and rounded shapes", () => {
  const { fr, reads } = renderer(`
    <group id="g" opacity="0.5"><shape id="s" shape="rect" x="0" y="0" width="16" height="8" fill="#FFFFFF"/></group>
    <layer id="l" asset="red" x="0" y="0" z="2" scaleX="0.5" scaleY="0.5" anchorX="0" anchorY="0">
      <animate property="x"><key time="0" value="0"/><key time="2" value="8"/></animate></layer>
    <shape id="o" shape="rect" x="0" y="0" width="16" height="8" fill="#00000000" stroke="#00FF00" strokeWidth="2" z="3"/>
    <shape id="rr" shape="rounded-rect" x="4" y="2" width="8" height="4" radius="1" fill="#0000FF" z="4"/>`);
  const s = fr.render(1);
  assert.deepEqual(at(s, 8, 3), [0, 0, 1, 1]); // rounded rect, z 4
  close(at(s, 5, 1)[0], 1);
  close(at(s, 5, 1)[1], 0); // half-scale red plate at x = 4 at t = 1
  close(at(s, 2, 4)[0], 0.5);
  close(at(s, 2, 4)[3], 1); // white at group opacity 0.5 over black
  assert.equal(at(s, 0, 0)[1], 1);
  fr.render(1.5);
  assert.deepEqual(reads, ["red.png"]);
});

test("text layers are laid out once and cached", () => {
  const { fr, reads } = renderer('<layer id="tl" asset="t" x="0" y="0"/>', 2);
  const s = fr.render(0);
  let ink = 0;
  for (let i = 3; i < s.data.length; i += 4) ink += s.data[i] ?? 0;
  assert.ok(ink > 5);
  fr.render(0.5);
  assert.deepEqual(reads, ["font.ttf"]);
});

test("applies group effects and masks, shape glow, rain and rotation", () => {
  const r =
    loadScene(`<scene version="1.1"><project width="32" height="16" fps="24" duration="10" background="#000000FF"/>
    <assets><image id="red" src="red.png" width="8" height="8"/></assets>
    <composition>
      <group id="g" x="0" y="0" width="16" height="16" clip="true" effects="grain tone lines">
        <mask type="ellipse" x="0" y="0" width="16" height="16" feather="2"/>
        <shape id="bg" shape="rect" x="0" y="0" width="16" height="16" fill="#808080"/>
      </group>
      <shape id="seam" shape="rect" x="24" y="0" width="1" height="16" fill="#E3BC48" effects="halo"/>
      <particleEmitter id="rain1" preset="rain" start="0" end="10" x="16" y="0" emitterWidth="8" emitterHeight="16" rate="200"
        lifetime="1" speed="20" direction="90" spread="0" size="1" trail="0.1" color="#FFFFFF" seed="1" preroll="1" maxParticles="500" shape="streak"/>
      <layer id="rot" asset="red" x="4" y="4" anchorX="4" anchorY="4" rotation="45" z="9"/>
    </composition>
    <effects><effect id="grain" type="film-grain" amount="0.1" seed="3" mix="1"/><effect id="tone" type="halftone" size="4" angle="45" mix="0.2"/>
      <effect id="lines" type="scanlines" size="2" intensity="0.5" mix="1"/><effect id="halo" type="glow" radius="4" intensity="1" color="#E3BC48"/>
      <effect id="odd" type="vignette"/></effects></scene>`);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.diagnostics));
  const fr = new FrameRenderer(
    r.scene,
    compileAnimations(r.scene).tracks,
    { read: (p) => files[p] },
    1,
  );
  const s = fr.render(0.5);
  assert.deepEqual([...fr.unsupported], []);
  assert.ok((at(s, 8, 8)[0] ?? 0) > 0.05); // inside the ellipse
  close(at(s, 0, 15)[0], 0, 0.02); // corner masked away
  assert.ok(
    (at(s, 26, 8)[0] ?? 0) > 0 &&
      (at(s, 26, 8)[2] ?? 1) < (at(s, 26, 8)[0] ?? 0),
  ); // yellow glow beside the seam
  let rainInk = 0;
  for (let y = 0; y < 16; y++)
    for (let x = 16; x < 22; x++) rainInk += at(s, x, y)[1] ?? 0;
  assert.ok(rainInk > 0.5);
  close(at(s, 4, 4)[0], 1, 1e-3); // pivot stays covered after rotation
  const other =
    loadScene(`<scene version="1.1"><project width="8" height="8" fps="24" duration="10"/><composition>
    <group id="g" effects="odd"><mask type="rect" x="0" y="0" width="4" height="4"/></group>
    <particleEmitter id="p" preset="snow"/></composition><effects><effect id="odd" type="vignette"/></effects></scene>`);
  assert.ok(other.ok);
  const f2 = new FrameRenderer(
    other.scene,
    new Map(),
    { read: (p) => files[p] },
    1,
  );
  f2.render(0);
  assert.deepEqual([...f2.unsupported].sort(), []);
  assert.ok(f2.render(1).data.some((v) => v > 0));
});

test("reports every feature it cannot draw instead of ignoring it", () => {
  const r =
    loadScene(`<scene version="1.1"><project width="16" height="8" fps="24" duration="10"/>
    <assets><image id="red" src="red.png" width="8" height="8"/><audio id="aud" src="a.wav"/></assets>
    <paints><linearGradient id="p"><stop offset="0" color="#000000"/></linearGradient></paints>
    <composition>
      <shape id="s" shape="ellipse" x="0" y="0" width="4" height="4" fill="url(#p)"/>
      <shape id="r" shape="rect" x="50%" y="0" width="4" height="4" fill="#FFFFFF"/>
      <layer id="a" asset="aud" x="0" y="0"/>
      <adjustment id="adj" effects="e1"/>
    </composition><effects><effect id="e1" type="glow"/></effects></scene>`);
  assert.ok(r.ok, JSON.stringify(!r.ok && r.diagnostics));
  const fr = new FrameRenderer(
    r.scene,
    new Map(),
    { read: (p) => files[p] },
    1,
  );
  fr.render(0);
  assert.deepEqual([...fr.unsupported].sort(), ["<audio> assets"]);
});

test("group transforms and animated scale are rendered", () => {
  const { fr } = renderer(
    `<group id="g" x="8" scaleX="-2" scaleY="2"><shape id="r" shape="rect" width="2" height="2" fill="#FF0000"/></group>`,
  );
  assert.deepEqual(at(fr.render(0), 5, 1), [1, 0, 0, 1]);
  assert.equal(fr.unsupported.size, 0);
  const { fr: animated } = renderer(
    `<group id="g"><animate property="scaleX"><key time="0" value="1"/><key time="1" value="2"/></animate><shape id="r" shape="rect" width="2" height="2"/></group>`,
  );
  assert.equal(at(animated.render(0), 3, 1)[0], 0);
  assert.equal(at(animated.render(1), 3, 1)[0], 1);
  assert.equal(animated.unsupported.size, 0);
});
