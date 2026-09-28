import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadScene,
  compileRuntime,
  capabilities,
  semanticRules,
  fpsOf,
  timecode,
} from "../src/index.js";
import { compileExpression, noise } from "../src/eval/expression.js";
import { spring, add, interpolate } from "../src/eval/value.js";
import { resolveParameters, rows } from "../src/scene/parameters.js";
import { FrameRenderer } from "../src/render/frame.js";
const close = (a, b, e = 1e-6) =>
  assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
function scene(body = "", sections = "", attrs = "") {
  const after = [
    ...sections.matchAll(/<(effects|audioMix|captions)>[\s\S]*?<\/\1>/g),
  ]
    .map((m) => m[0])
    .join("");
  sections = sections.replace(
    /<(effects|audioMix|captions)>[\s\S]*?<\/\1>/g,
    "",
  );
  const r = loadScene(
    `<scene version="1.1"><project width="32" height="32" duration="10" fps="30000/1001"/>${sections}<composition><shape id="s" shape="rect" width="10" height="10" ${attrs}>${body}</shape></composition>${after}</scene>`,
  );
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  return r.scene;
}
const runtime = (body, sections, attrs, options) =>
  compileRuntime(scene(body, sections, attrs), options);
const get = (r, prop, t = 0, id = "s") => r.value(r.ids.get(id), prop, t);
const anim = (prop, a, b, extra = "", k = "") =>
  `<animate property="${prop}" ${extra}><key time="0" value="${a}" ${k}/><key time="10" value="${b}"/></animate>`;
test("typed tracks blend linear-light colors, discrete strings, numeric addition and z ordering", () => {
  const r = runtime(
    anim("fill", "#000000", "#FFFFFF") +
      anim("x", 0, 10) +
      anim("x", 2, 4, 'additive="true"') +
      anim("shape", "rect", "rounded-rect"),
  );
  close(get(r, "x", 5), 8);
  assert.equal(get(r, "shape", 5), "rect");
  assert.equal(get(r, "shape", 10), "rounded-rect");
  close(Number(String(get(r, "fill", 5)).split(",")[0]), 0.735356983, 1e-6);
  assert.equal(add(1, 2), 3);
  assert.deepEqual(add([1, 2], [3, 4]), [4, 6]);
  assert.throws(() => add("a", "b"), /additive/);
  assert.deepEqual(interpolate([0, 10], [10, 20], 0.5), [5, 15]);
  assert.equal(interpolate("a", "b", 1), "b");
  assert.equal(
    get(runtime(anim("visible", "true", "false")), "visible", 10),
    false,
  );
});
test("spring solves under, critical and over damping and advanced key curves remain finite", () => {
  close(spring(0), 0);
  close(spring(1, 100, 20, 1), 1 - 11 * Math.exp(-10));
  assert.ok(spring(1, 100, 40, 1) > 0);
  assert.throws(() => spring(1, 0), /invalid/);
  for (const interpolation of ["spring", "tcb"]) {
    const r = runtime(anim("x", 0, 10, "", `interpolation="${interpolation}"`));
    assert.ok(Number.isFinite(get(r, "x", 5)));
  }
  const spatial = runtime(
    '<animate property="x"><key time="0" value="0" spatialOut="10,0"/><key time="10" value="10" spatialIn="-10,0"/></animate>',
  );
  close(get(spatial, "x", 5), 5);
  const roving = runtime(
    '<animate property="x"><key time="0" value="0"/><key time="8" value="2" roving="true"/><key time="10" value="10"/></animate>',
  );
  close(get(roving, "x", 2), 2);
  const duplicate = runtime(
    '<animate property="x" extrapolateBefore="linear" extrapolateAfter="linear"><key time="0" value="0"/><key time="0" value="4"/><key time="1" value="5"/><key time="1" value="8"/></animate>',
  );
  assert.ok(Number.isFinite(get(duplicate, "x", -1)));
  assert.ok(Number.isFinite(get(duplicate, "x", 2)));
});
test("marker offsets, generated beats and rational timecodes resolve before evaluation", () => {
  const r = runtime(
    '<animate property="x"><key time="0" marker="beat.1" value="0"/><key time="0" marker="bar.1" value="30"/></animate>',
    '<markers><marker id="m" time="1"/><beatGrid bpm="60" beatsPerBar="4"/></markers>',
    'startMarker="m" endMarker="bar.1"',
  );
  close(get(r, "x", 2), 10);
  const s = r.ids.get("s");
  assert.equal(r.enabled(s, 0.5), false);
  assert.equal(r.enabled(s, 2), true);
  assert.equal(r.enabled(s, 4), false);
  close(r.timeline.beat(2.5), 2.5);
  assert.equal(r.timeline.marker("m"), 1);
  assert.throws(() => r.timeline.marker("missing"), /unknown marker/);
  assert.deepEqual(fpsOf("30000/1001"), {
    numerator: 30000,
    denominator: 1001,
    value: 30000 / 1001,
  });
  close(timecode("00:00:01:15", 30), 1.5);
  assert.equal(timecode("1.25", 30), 1.25);
  assert.throws(() => timecode("00:00:00:30", 30), /invalid/);
  assert.throws(() => fpsOf("0"), /positive/);
  assert.throws(
    () =>
      runtime(
        "",
        '<markers><beatGrid bpm="60"/><beatGrid bpm="120"/></markers>',
      ),
    /one beatGrid/,
  );
  assert.throws(
    () =>
      runtime(
        "",
        '<markers><beatGrid bpm="60"/><marker id="beat.0" time="1"/></markers>',
      ),
    /duplicate/,
  );
});
test("expressions are pure and random access, with seeded built-ins and no escape syntax", () => {
  const r = runtime(
    '<expression property="x" seed="42">value + random(2,4) + noise(time) + wiggle(2,1)</expression>' +
      anim("x", 0, 10),
  );
  const values = [8, 2, 5, 0, 5, 2].map((t) => get(r, "x", t));
  assert.equal(values[1], values[5]);
  assert.equal(values[2], values[4]);
  assert.notEqual(values[1], values[2]);
  assert.equal(noise(42, 1, 2), noise(42, 1, 2));
  for (const text of [
    "globalThis",
    "Math.random()",
    "(()=>1)()",
    "x=2",
    "a.b",
    "new Date()",
    "[...a]",
    "/a/",
    "null",
    "delete a",
    "1;2",
    "[,,]",
    'prop(param("p"))',
  ])
    assert.throws(() =>
      runtime(
        `<expression property="x">${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</expression>`,
      ),
    );
  assert.throws(() => compileExpression("1".repeat(32769)), /exceeds/);
  assert.throws(() => compileExpression("1/0").evaluate({}), /non-finite/);
  assert.throws(
    () => compileExpression("missing()").evaluate({}),
    /unknown function/,
  );
  assert.throws(
    () => compileExpression("missing").evaluate({}),
    /unknown value/,
  );
  const evaluate = (s) => compileExpression(s).evaluate({ x: 2 });
  for (const [s, v] of [
    ["2+3*4", 14],
    ["-2+ +3", 1],
    ["!false", true],
    ["2**3%3", 2],
    ["1<2?3:4", 3],
    ["1>2?3:4", 4],
    ["true&&2", 2],
    ["false||3", 3],
    ["0??2", 0],
    ['1=="1"', true],
    ["1!==2", true],
    ["2>=2", true],
    ["2<=2", true],
    ["2!=3", true],
    ["2===2", true],
    ["[1,2]", [1, 2]],
  ])
    assert.deepEqual(evaluate(s), v);
});
test("expression built-ins map ranges, query dependencies and reject cycles before rendering", () => {
  const r = runtime(
    '<expression property="x">linear(time,0,10,0,100)+markerTime("m")+param("p")</expression>',
    '<parameters><param id="p" type="number" default="2"/></parameters><markers><marker id="m" time="1"/></markers>',
  );
  close(get(r, "x", 5), 53);
  const formulas = [
    "ease(time,0,10,0,10)",
    "easeIn(time,0,10,0,10)",
    "easeOut(time,0,10,0,10)",
    "clamp(20,0,10)",
    "lerp(0,10,0.5)",
    "smoothstep(0,10,5)",
    "spring(time,100,10,1)",
    "sin(PI/2)+cos(0)+tan(0)+abs(-1)+sqrt(4)+floor(1.5)+ceil(1.5)+round(1.5)+min(2,3)+max(2,3)+pow(2,2)",
    "beat()",
    "random()",
    "random(10)",
    "valueAtTime(2)",
  ];
  for (const f of formulas)
    assert.ok(
      Number.isFinite(
        get(runtime(`<expression property="x">${f}</expression>`), "x", 5),
      ),
    );
  assert.throws(
    () => runtime('<expression property="x">prop("s.x")</expression>'),
    /cycle/,
  );
  assert.throws(
    () => runtime('<expression property="x">prop("missing.x")</expression>'),
    /unknown property/,
  );
  assert.throws(
    () => runtime('<expression property="x">param("missing")</expression>'),
    /unknown expression parameter/,
  );
  assert.throws(
    () => runtime('<expression property="x">audioAmplitude("a")</expression>'),
    /analysis provider/,
  );
  const off = runtime(
    '<expression property="x" enabled="false">forbidden()</expression>',
  );
  assert.equal(get(off, "x"), 0);
  assert.throws(() => get(r, "x", NaN), /finite/);
});
test("links apply mapping, clamping, delay and deterministic smoothing", () => {
  const r = runtime(
    anim("x", 0, 10) +
      '<link property="y" source="s.x" delay="1" smoothing="2" scale="2" offset="1" min="0" max="20"/>',
  );
  close(get(r, "y", 5), 7);
  const p = runtime(
    '<link property="x" source="param:p" scale="2"/>',
    '<parameters><param id="p" type="number" default="3"/></parameters>',
  );
  assert.equal(get(p, "x"), 6);
  const m = runtime(
    '<link property="x" source="marker:m"/>',
    '<markers><marker id="m" time="3"/></markers>',
  );
  assert.equal(get(m, "x"), 3);
  for (const source of [
    "s.x",
    "no.x",
    "param:no",
    "marker:no",
    "bad:thing",
    "audio:a",
  ])
    assert.throws(() => runtime(`<link property="x" source="${source}"/>`));
  assert.throws(
    () => runtime('<link property="x" source="s.y" min="3" max="1"/>'),
    /min/,
  );
  const audio = runtime('<link property="x" source="audio:a:low"/>', "", "", {
    audioAmplitude: (id, t, band) => (band === "low" ? t : 0),
  });
  assert.equal(get(audio, "x", 2), 2);
  const ex = runtime(
    '<expression property="x">audioAmplitude("a","high")</expression>',
    "",
    "",
    {
      audioAmplitude: () => 0.5,
    },
  );
  assert.equal(get(ex, "x"), 0.5);
});
test("SVG motion paths consume animated progress, arc length, orientation and native segments", () => {
  const r = runtime(
    '<motionPath path="M0 0 L10 0 L10 30" start="0" end="10" autoOrient="true" orientOffset="5"/>',
  );
  close(get(r, "x", 5), 10);
  close(get(r, "y", 5), 10);
  close(get(r, "rotation", 5), 95);
  const p = runtime(
    '<motionPath path="M0 0 L10 0 L10 30" constantSpeed="false"><animate property="progress"><key time="0" value="0"/><key time="10" value="1"/></animate></motionPath>',
  );
  close(get(p, "x", 5), 10);
  close(get(p, "y", 5), 0);
  assert.throws(() => runtime('<motionPath path="garbage"/>'));
});
test("parameters bind with declared precedence, constraints, substitution and data rows", () => {
  const sections =
    '<parameters><param id="p" type="number" default="1" min="0" max="10"/><param id="label" type="string" default="hello"/><bind param="p" target="s" property="x" map="1=2;3=4"/><variant id="v"><set param="p" value="3"/><override target="s" property="y" value="9"/></variant><data id="d">[{"p":5}]</data></parameters>';
  assert.equal(get(runtime("", sections), "x"), 2);
  const r = runtime("", sections, "", { variant: "v" });
  assert.equal(get(r, "x"), 4);
  assert.equal(get(r, "y"), 9);
  assert.equal(
    get(
      runtime("", sections, "", {
        variant: "v",
        data: "d",
        parameters: { p: 7 },
      }),
      "x",
    ),
    7,
  );
  assert.equal(get(runtime("", sections, "", { data: "d" }), "x"), 5);
  for (const options of [
    { variant: "missing" },
    { data: "missing" },
    { data: "d", row: 3 },
    { parameters: { p: 11 } },
    { parameters: { p: "NaN" } },
    { parameters: { missing: 1 } },
  ])
    assert.throws(() => runtime("", sections, "", options));
  const text = scene(
    "",
    '<parameters><param id="p" type="string" default="hi"/></parameters><assets><text id="text" text="{{p}}" width="10" height="10" size="10"/></assets>',
  );
  assert.equal(resolveParameters(text).ids.get("text").attributes.text, "hi");
  for (const [type, raw] of [
    ["boolean", "no"],
    ["color", "bad"],
    ["list", "{}"],
    ["time", "bad"],
  ])
    assert.throws(() =>
      runtime(
        "",
        `<parameters><param id="p" type="${type}" default="${raw}"/></parameters>`,
      ),
    );
  for (const attrs of [
    'type="number" required="true"',
    'type="enum" default="x" options="a,b"',
    'type="string" default="long" maxLength="2"',
    'type="string" default="x" pattern="^a$"',
    'type="asset" default="missing"',
  ])
    assert.throws(() =>
      runtime("", `<parameters><param id="p" ${attrs}/></parameters>`),
    );
  for (const [type, raw, expected] of [
    ["boolean", "true", true],
    ["boolean", "0", false],
    ["list", "[1,2]", [1, 2]],
    // Non-drop-frame labels count nominal 30 fps frames: 30 frames at 30000/1001.
    ["time", "00:00:01:00", 30 / (30000 / 1001)],
    ["color", "#FF0000", "#FF0000"],
  ])
    assert.deepEqual(
      runtime(
        "",
        `<parameters><param id="p" type="${type}" default="${raw}"/></parameters>`,
      ).params.p,
      expected,
    );
  assert.deepEqual(rows('a,b\n"hello, world","x""y"\n', ","), [
    { a: "hello, world", b: 'x"y' },
  ]);
  assert.deepEqual(rows("a\tb\n1\t2", "\t"), [{ a: "1", b: "2" }]);
  assert.throws(() => rows("a,a\n1,2", ","), /duplicate/);
  assert.throws(() => rows("a,b\n1", ","), /width/);
  assert.throws(() => rows('a\n"x', ","), /unterminated/);
});
test("conditions and evaluated paints reach pixels; skipped branches do not draw", () => {
  const r = runtime(
    anim("fill", "#000000", "#FFFFFF"),
    "",
    'condition="time &gt; 1"',
  );
  const f = new FrameRenderer(
    r.scene,
    r.tracks,
    { read: () => new Uint8Array() },
    1,
    r,
  );
  assert.equal(r.enabled(r.ids.get("s"), 0), false);
  assert.equal(r.enabled(r.ids.get("s"), 5), true);
  const a = f.render(0).toRgb8(),
    b = f.render(5).toRgb8();
  assert.notDeepEqual(a, b);
  const attrs = r.attributes(r.ids.get("s"), 5);
  assert.equal(attrs.fill, get(r, "fill", 5));
});
test("operational preflight reports ignored sections, values, attributes, and cross-field rules", () => {
  assert.deepEqual(capabilities(scene()), []);
  assert.deepEqual(capabilities(scene("", "", 'rotation="10"')), []);
  assert.deepEqual(
    capabilities(
      scene(
        "",
        '<paints><linearGradient id="paint"><stop offset="0" color="#000000"/><stop offset="1" color="#FFFFFF"/></linearGradient></paints>',
        'fill="url(#paint)"',
      ),
    ),
    [],
  );
  assert.deepEqual(capabilities(scene(anim("rotation", 0, 10))), []);
  assert.deepEqual(
    capabilities(scene("", '<effects><effect id="fx" type="blur"/></effects>')),
    [],
  );
  assert.throws(() => runtime("", "", 'start="5" end="2"'), /end precedes/);
  const raw = scene();
  const changed = {
    ...raw,
    children: [
      ...raw.children,
      {
        name: "unknown",
        type: "",
        attributes: {},
        children: [],
        value: null,
        path: "/unknown",
        loc: { line: 1, column: 1 },
      },
    ],
  };
  assert.equal(capabilities(changed).at(-1).path, "/unknown");
  const s = raw.children.at(-1).children[0];
  const malformed = {
    ...raw,
    children: [
      ...raw.children.slice(0, -1),
      {
        ...raw.children.at(-1),
        children: [
          { ...s, attributes: { ...s.attributes, width: 0, parent: "s" } },
        ],
      },
    ],
  };
  assert.ok(semanticRules(malformed).some((d) => /positive/.test(d.message)));
  assert.ok(semanticRules(malformed).some((d) => /cycle/.test(d.message)));
});

test("nested group clocks and sequence placement preserve local/normalized time", () => {
  const r = loadScene(
    '<scene version="1.1"><project width="32" height="32" duration="20" fps="24"/><composition><group id="g" start="2" end="10" timeScale="2" timeOffset="1"><shape id="a" shape="rect" width="1" height="1"><animate property="x" timeBase="local"><key time="0" value="0"/><key time="10" value="10"/></animate></shape></group><sequence id="seq" start="0" end="20" timeGap="1"><shape id="first" shape="rect" width="1" height="1" start="0" end="2"/><shape id="second" shape="rect" width="1" height="1" start="0" end="3"><animate property="x" timeBase="normalized"><key time="0" value="0"/><key time="1" value="30"/></animate></shape></sequence></composition></scene>',
  );
  assert.ok(r.ok);
  const rt = compileRuntime(r.scene);
  close(get(rt, "x", 3, "a"), 3);
  close(rt.timeline.spans.get(rt.ids.get("second")).start, 3);
  close(get(rt, "x", 4.5, "second"), 15);
});
test("instances have independent clocks and local overrides", () => {
  const loaded = loadScene(
    '<scene version="1.1"><project width="32" height="32" duration="10" fps="24"/><symbols><symbol id="sym" duration="4"><shape id="inner" shape="rect" width="1" height="1"><animate property="x"><key time="0" value="0"/><key time="4" value="40"/></animate></shape></symbol></symbols><composition><instance id="i1" symbol="sym" start="2" speed="2"><override target="inner" property="y" value="9"/></instance><instance id="i2" symbol="sym" start="2" reverse="true"/></composition></scene>',
  );
  assert.ok(loaded.ok, JSON.stringify(loaded.diagnostics));
  const rt = compileRuntime(loaded.scene);
  close(rt.instanceValue("i1", "inner", "x", 3), 20);
  close(rt.instanceValue("i2", "inner", "x", 3), 30);
  assert.equal(rt.instanceValue("i1", "inner", "y", 3), 9);
  assert.equal(rt.instanceValue("i2", "inner", "y", 3), 0);
  assert.throws(
    () => rt.instanceValue("missing", "inner", "x", 0),
    /invalid instance/,
  );
  assert.throws(
    () => rt.instanceValue("i1", "missing", "x", 0),
    /unknown instance target/,
  );
});
test("loop expressions and finite extrapolation are independent of evaluation order", () => {
  for (const kind of ["loop", "ping-pong", "offset"]) {
    const r = runtime(
      '<animate property="x"><key time="2" value="2"/><key time="4" value="4"/></animate>' +
        `<expression property="x">loopOut("${kind}",1)</expression>`,
    );
    const expected = kind === "loop" ? 3 : kind === "ping-pong" ? 3 : 5;
    assert.equal(get(r, "x", 5), expected);
    assert.equal(get(r, "x", 3), 3);
    const before = runtime(
      '<animate property="x"><key time="2" value="2"/><key time="4" value="4"/></animate>' +
        `<expression property="x">loopIn("${kind}",1)</expression>`,
    );
    assert.ok(Number.isFinite(get(before, "x", 1)));
  }
  assert.equal(
    get(runtime('<expression property="x">loopOut()</expression>'), "x", 20),
    0,
  );
});

test("loop expressions use the owning local clock and invalid loop arguments fail explicitly", () => {
  const r = runtime(
    '<animate property="x" timeBase="local"><key time="0" value="0"/><key time="2" value="20"/></animate><expression property="x">loopOut("offset")</expression>',
    "",
    'start="4"',
  );
  close(get(r, "x", 7), 30);
  for (const mode of ["linear", "hold"])
    assert.ok(
      Number.isFinite(
        get(
          runtime(
            anim("x", 0, 10) +
              `<expression property="x">loopOut("${mode}")</expression>`,
          ),
          "x",
          20,
        ),
      ),
    );
  for (const call of ['loopOut("unknown")', 'loopOut("loop",-1)'])
    assert.throws(
      () =>
        get(runtime(`<expression property="x">${call}</expression>`), "x", 20),
      /loop/,
    );
});
test("animated color tokens resolve, and invalid references or handle combinations are diagnosed", () => {
  const r = runtime(
    anim("fill", "var(--brand)", "#FFFFFF"),
    '<styles><token name="brand" value="#000000"/></styles>',
  );
  assert.ok(String(get(r, "fill", 5)).startsWith("0.735"));
  assert.throws(
    () => runtime(anim("fill", "var(--missing)", "#FFFFFF")),
    /unknown color token/,
  );
  assert.throws(
    () => runtime(anim("fill", "url(#missing)", "#FFFFFF")),
    /unknown paint/,
  );
  assert.throws(
    () => runtime(anim("x", 0, 1, "", 'easeOut="2,0.5"')),
    /normalized/,
  );
  assert.throws(
    () => runtime(anim("opacity", 0, 1, "", 'spatialOut="1,1"')),
    /spatial/,
  );
  assert.throws(
    () =>
      runtime(anim("fill", "#000000", "#FFFFFF", "", 'interpolation="tcb"')),
    /TCB/,
  );
  assert.throws(
    () =>
      runtime(
        "",
        '<styles><token name="a" value="var(--b)"/><token name="b" value="var(--a)"/></styles>',
      ),
    /token cycle/,
  );
  const pair = runtime(
    '<animate property="x"><key time="0" value="0"/><key time="8" value="0" roving="true"/><key time="10" value="8"/></animate><animate property="y"><key time="0" value="0"/><key time="8" value="4" roving="true"/><key time="10" value="4"/></animate>',
  );
  close(get(pair, "x", 10 / 3), 0);
  close(get(pair, "y", 10 / 3), 4);
  assert.throws(() => runtime("", "", 'condition="missing"'), /condition name/);
});
