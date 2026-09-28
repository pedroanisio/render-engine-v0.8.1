import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadScene, compileRuntime } from "../src/index.js";
import {
  mixAudio,
  audioFormat,
  finishAudio,
  writeFloatWav,
  fade,
  measureAudio,
} from "../src/render/audio.js";
import { effect, biquad, filterPcm } from "../src/render/audio-dsp.js";
const dir = mkdtempSync(join(tmpdir(), "batch6-audio-"));
const node = (type, a = {}, children = []) => ({
  name: "audioEffect",
  type: "audioEffectType",
  attributes: { type, ...a },
  children,
  path: "",
});
const scene = (mix = "", attrs = "", assets = "") => {
  const r = loadScene(
    `<scene version="1.1"><project width="8" height="8" duration="2" fps="24"/><assets><audio id="a" src="a.wav" bpm="240"/>${assets}</assets><markers><marker id="mark" time=".25"/></markers><composition/><audioMix ${attrs}>${mix || "<master/>"}</audioMix></scene>`,
  );
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  return r.scene;
};
const ctrl = (n, k, t, f) => Number(n.attributes[k] ?? f);
const rate = 8000;
const signal = (f = 400, d = 1, amp = 0.2) =>
  Float32Array.from(
    { length: rate * d },
    (_, i) => amp * Math.sin((2 * Math.PI * f * i) / rate),
  );
const rms = (x, a = 0, b = x.length) =>
  Math.sqrt(x.slice(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
writeFloatWav(join(dir, "a.wav"), signal(400, 2), rate, 1);
const asset = () => ({ path: join(dir, "a.wav") });

test("audio format validation, silence and all fade curves", () => {
  assert.deepEqual(audioFormat(scene()), {
    rate: 48000,
    channels: 2,
    bits: 24,
    layout: "auto",
  });
  for (const [layout, channels] of Object.entries({
    mono: 1,
    stereo: 2,
    5.1: 6,
    7.1: 8,
    "7.1.4": 12,
    "ambisonic-1": 4,
    "ambisonic-3": 16,
  }))
    assert.equal(
      audioFormat(scene("", `channels="${channels}" channelLayout="${layout}"`))
        .channels,
      channels,
    );
  assert.throws(
    () => audioFormat(scene("", 'channels="1" channelLayout="stereo"')),
    /requires/,
  );
  assert.throws(() => audioFormat(scene("", 'sampleRate="1"')), /invalid/);
  assert.ok(mixAudio(scene(), asset, 0.01).pcm.every((v) => v === 0));
  for (const curve of [
    "linear",
    "equal-power",
    "logarithmic",
    "exponential",
    "s-curve",
  ]) {
    assert.equal(fade(0, curve), 0);
    assert.equal(fade(1, curve), 1);
    assert.ok(fade(0.4, curve) < fade(0.6, curve));
  }
  assert.throws(() => mixAudio(scene(), asset, Infinity), /budget/);
});
test("sample-accurate trim, negative start, repeats, reverse, speed, BPM fit and marker placement", () => {
  const ramp = Float32Array.from({ length: 8000 }, (_, i) => i / 10000);
  writeFloatWav(join(dir, "ramp.wav"), ramp, rate, 1);
  const render = (a) =>
    mixAudio(
      scene(
        `<audioTrack id="t" asset="a" ${a}/>`,
        `sampleRate="8000" channels="1"`,
      ),
      () => ({ path: join(dir, "ramp.wav") }),
      2,
    ).pcm;
  const reversed = render('start="0.000125" reverse="true"');
  assert.equal(reversed[0], 0);
  assert.ok(Math.abs(reversed[1] - 0.7999) < 1e-5);
  assert.ok(Math.abs(render('clipIn="0.25" clipOut="0.5"')[0] - 0.2) < 1e-5);
  assert.ok(Math.abs(render('start="-0.25"')[0] - 0.2) < 1e-5);
  assert.equal(render('loop="1"')[8001], ramp[1]);
  assert.equal(render('fitToDuration="true"')[8001], ramp[1]);
  assert.ok(
    render('speed="2" preservePitch="false"')
      .slice(4100)
      .every((v) => Math.abs(v) < 1e-8),
  );
  assert.ok(
    render('speed="-2"')
      .slice(4500)
      .every((v) => Math.abs(v) < 1e-8),
  );
  assert.throws(() => render('speed="0"'), /speed/);
  assert.throws(() => render('clipIn="1" clipOut="0.5"'), /trim/);
  assert.throws(() => render('clipOut="0.5" fitToDuration="true"'), /full bar/);
  const s = scene(
    '<audioTrack id="t" asset="a" startMarker="mark"/>',
    'sampleRate="8000" channels="1"',
  );
  const rt = compileRuntime(s),
    p = mixAudio(rt.scene, asset, 1, rt).pcm;
  assert.equal(rms(p, 0, 2000), 0);
  assert.ok(rms(p, 2100, 3000) > 0.1);
});
test("bus output routes exactly once; track/bus ducking follows audible signal, threshold, release and cycle checks", () => {
  const render = (xml) =>
    mixAudio(scene(xml, 'sampleRate="8000" channels="1"'), asset, 2);
  const base =
    '<audioTrack id="voice" asset="a" clipOut=".5" start=".5" gain="-6"/><audioTrack id="music" asset="a" bus="musicbus"/>';
  const routed = render(
    base +
      '<bus id="musicbus" output="out" duckUnder="voice" duckThreshold="-30" duckAmount="-20" duckAttack=".001" duckRelease=".01"/><bus id="out" gain="-6"/>',
  );
  assert.ok(
    rms(routed.stems.get("musicbus"), 5600, 6400) <
      rms(routed.stems.get("musicbus"), 800, 1600) * 0.12,
  );
  const quiet = render(
    base.replace('gain="-6"', 'gain="-120"') +
      '<bus id="musicbus" duckUnder="voice" duckThreshold="-40"/>',
  );
  assert.ok(rms(quiet.stems.get("musicbus"), 5600, 6400) > 0.13);
  const trackDuck = render(
    '<audioTrack id="voice" asset="a"/><audioTrack id="music" asset="a" duckUnder="voice" duckAttack="0" duckAmount="-12"/>',
  );
  assert.ok(rms(trackDuck.stems.get("music"), 4000, 5000) < 0.04);
  assert.throws(
    () => render('<bus id="a1" output="b"/><bus id="b" output="a1"/>'),
    /cycle/,
  );
  assert.throws(
    () =>
      render(
        '<audioTrack id="t" asset="a" duckUnder="b" bus="b"/><bus id="b"/>',
      ),
    /cycle/,
  );
  assert.throws(
    () => render('<audioTrack id="t" asset="a" bus="a"/>'),
    /unknown audio bus/,
  );
  assert.throws(() => render('<bus id="b" duckUnder="a"/>'), /unknown/);
});
test("all 16 DSP types run, bypass/mix are exact and delay/reverb retain tails", () => {
  const types =
    "eq highpass lowpass compressor limiter gate de-esser reverb delay chorus pitch-shift noise-reduction stereo-width gain distortion telephone".split(
      " ",
    );
  const input = signal(1000, 0.25);
  for (const type of types) {
    const e = node(
      type,
      { gain: 6, frequency: 700, threshold: -24, time: 0.02 },
      type === "eq"
        ? [
            {
              name: "band",
              attributes: { kind: "peak", frequency: 1000, gain: 6, q: 1 },
              children: [],
            },
          ]
        : [],
    );
    const out = effect(input, e, rate, 1, ctrl);
    assert.equal(out.length, input.length, type);
    assert.ok(out.every(Number.isFinite), type);
    assert.deepEqual(
      effect(
        input,
        { ...e, attributes: { ...e.attributes, enabled: false } },
        rate,
        1,
        ctrl,
      ),
      input,
      type,
    );
    assert.deepEqual(
      effect(
        input,
        { ...e, attributes: { ...e.attributes, mix: 0 } },
        rate,
        1,
        ctrl,
      ),
      input,
      type,
    );
  }
  const impulse = new Float32Array(8000);
  impulse[0] = 1;
  for (const type of ["delay", "reverb"])
    assert.ok(
      rms(
        effect(impulse, node(type, { time: 0.1 }), rate, 1, ctrl),
        700,
        5000,
      ) > 0,
      type,
    );
  assert.throws(() => effect(input, node("bogus"), rate, 1, ctrl), /unknown/);
});
test("DSP transfer functions, EQ bands, detector gain and automation affect actual samples", () => {
  const low = signal(100),
    high = signal(3000);
  assert.ok(
    rms(effect(high, node("lowpass", { frequency: 300 }), rate, 1, ctrl)) <
      0.01,
  );
  assert.ok(
    rms(effect(low, node("highpass", { frequency: 2000 }), rate, 1, ctrl)) <
      0.003,
  );
  assert.ok(
    rms(
      effect(
        high,
        node("compressor", {
          threshold: -30,
          ratio: 10,
          attack: 0,
          release: 0.01,
        }),
        rate,
        1,
        ctrl,
      ),
    ) < 0.05,
  );
  assert.ok(
    rms(
      effect(low, node("gate", { threshold: -5, ratio: 10 }), rate, 1, ctrl),
    ) < 0.005,
  );
  for (const kind of [
    "peak",
    "low-shelf",
    "high-shelf",
    "highpass",
    "lowpass",
    "notch",
  ])
    assert.ok(biquad(kind, 1000, 6, 0.707, rate).every(Number.isFinite));
  const automate = (n, k, t, f) =>
    k === "gain" ? (t < 0.5 ? 0 : -20) : ctrl(n, k, t, f);
  const p = effect(low, node("gain"), rate, 1, automate);
  assert.ok(rms(p, 5000, 7000) < rms(p, 1000, 3000) * 0.101);
  const stereo = Float32Array.from({ length: low.length * 2 }, (_, i) =>
      i % 2 ? 0 : low[Math.floor(i / 2)],
    ),
    mono = effect(stereo, node("stereo-width", { width: 0 }), rate, 2, ctrl);
  for (let i = 0; i < 1000; i += 2) assert.equal(mono[i], mono[i + 1]);
  const side = new Float32Array(low.length).fill(0.8);
  assert.ok(
    rms(
      effect(
        low,
        node("compressor", { threshold: -30, attack: 0 }),
        rate,
        1,
        ctrl,
        side,
      ),
    ) < 0.02,
  );
  assert.throws(
    () => effect(low, node("gain"), rate, 1, () => NaN),
    /non-finite/,
  );
});
test("normalization, independent true-peak limiter, silence, PCM bit depth, channels/rate and report", () => {
  for (const normalize of ["none", "integrated", "dynamic"]) {
    const s = scene(
      `<audioTrack id="t" asset="a" gain="24"/><master normalize="${normalize}" limiter="true" loudness="-18" truePeak="-2" dither="false"/>`,
      'sampleRate="8000" channels="1" bitDepth="16"',
    );
    const m = mixAudio(s, asset, 2),
      finished = finishAudio(
        m,
        s.children.find((n) => n.name === "audioMix").children.at(-1),
        dir,
      );
    assert.ok(finished.report.after.truePeak <= -1.8);
    if (normalize !== "none")
      assert.ok(Math.abs(finished.report.after.integrated + 18) < 1);
    const probe = JSON.parse(
      execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-of",
        "json",
        finished.path,
      ]),
    );
    assert.equal(probe.streams[0].sample_rate, "8000");
    assert.equal(probe.streams[0].bits_per_sample, 16);
    assert.equal(probe.streams[0].channels, 1);
  }
  const silent = mixAudio(
    scene("", 'sampleRate="8000" channels="1" bitDepth="32"'),
    asset,
    1,
  );
  const done = finishAudio(
    silent,
    node("master", { normalize: "integrated" }),
    dir,
  );
  assert.equal(done.report.before.integrated, null);
  assert.ok(readFileSync(done.path).length > 0);
  assert.throws(
    () => finishAudio(silent, node("master", { loudness: 0 }), dir),
    /loudness/,
  );
  assert.throws(() => measureAudio(join(dir, "missing.wav")), /measurement/);
});

test('pitch shift and preservePitch are verified by measured frequency, with independent sample clocks',async()=>{
  const {spectrum}=await import('../src/media/audio.js');
  const peak=pcm=>{const bins=spectrum(Float64Array.from(pcm.slice(2048,6144)));return bins.indexOf(Math.max(...bins))*rate/4096;};
  const tone=signal(400,2);
  const shifted=effect(tone,node('pitch-shift',{semitones:12}),rate,1,ctrl);assert.ok(Math.abs(peak(shifted)-800)<4);
  const s=scene('<audioTrack id="t" asset="a" speed="2" preservePitch="true"/>','sampleRate="8000" channels="1"');
  assert.ok(Math.abs(peak(mixAudio(s,asset,2).pcm)-400)<4);
  const changed=scene('<audioTrack id="t" asset="a" speed="2" preservePitch="false"/>','sampleRate="8000" channels="1"');
  assert.ok(Math.abs(peak(mixAudio(changed,asset,2).pcm)-800)<4);
});
test('multichannel routing preserves channel identity and rejects implicit ambisonic conversion',()=>{
  for(const [layout,channels] of [['5.1',6],['7.1',8],['7.1.4',12],['ambisonic-1',4],['ambisonic-3',16]]) {
    const pcm=Float32Array.from({length:800*channels},(_,i)=>(i%channels+1)/100),path=join(dir,layout+'.wav');writeFloatWav(path,pcm,rate,channels);
    const s=scene('<audioTrack id="t" asset="a"/>',`sampleRate="8000" channels="${channels}" channelLayout="${layout}"`);
    const out=mixAudio(s,()=>({path}),.1);for(let c=0;c<channels;c++)assert.ok(Math.abs(out.pcm[40*channels+c]-(c+1)/100)<1e-6,layout+':'+c);
  }
  assert.throws(()=>mixAudio(scene('<audioTrack id="t" asset="a"/>','sampleRate="8000" channels="4" channelLayout="ambisonic-1"'),asset,.1),/ACN/);
});
test('effect controls consume runtime automation, named parameters, fades, wet mixes and long delays',()=>{
  const s=scene('<audioTrack id="t" asset="a" fadeIn=".1" fadeOut=".1" clipOut="1" fadeCurve="equal-power"><audioEffect type="gain"><animate property="gain"><key time="0" value="0"/><key time="1" value="-20"/></animate></audioEffect></audioTrack>','sampleRate="8000" channels="1"');
  const rt=compileRuntime(s),out=mixAudio(rt.scene,asset,2,rt).pcm;assert.ok(rms(out,800,1600)>rms(out,6000,7000)*2);assert.equal(out[0],0);assert.equal(out[7999],0);assert.equal(out[9000],0);
  const named=mixAudio(scene('<audioTrack id="t" asset="a"><audioEffect type="gain"><param name="gain" value="-20"/></audioEffect></audioTrack>','sampleRate="8000" channels="1"'),asset,1);assert.ok(rms(named.pcm)<.015);
  assert.throws(()=>effect(signal(),node('gain',{},[{name:'param',attributes:{name:'unknown',value:'1'}}]),rate,1,ctrl),/unsupported/);
  const impulse=new Float32Array(48000);impulse[0]=1;const delayed=effect(impulse,node('delay',{time:5,feedback:1}),rate,1,ctrl);assert.equal(delayed[40000],1);assert.equal(rms(delayed,0,39000),0);
  const original=signal();assert.deepEqual(effect(original,node('distortion',{amount:0}),rate,1,ctrl),original);
  const half=effect(original,node('gain',{gain:-20,mix:.5}),rate,1,ctrl);assert.ok(Math.abs(rms(half)/rms(original)-.55)<1e-6);
});
