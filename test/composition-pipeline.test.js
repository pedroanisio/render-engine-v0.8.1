import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { renderEpisode } from '../src/render/pipeline.js';
test('vector/include/layout exports reuse cache and invalidate edited included content', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vector-pipeline-'));
  try {
    const part = (color) =>
      `<scene version="1.1"><project width="32" height="16" fps="2" duration="1"/><composition><shape id="s" shape="ellipse" x="4" width="16" height="16" fill="${color}"/></composition></scene>`;
    writeFileSync(join(dir, 'part.xml'), part('#FF0000'));
    writeFileSync(
      join(dir, 'scene.xml'),
      `<scene version="1.1"><project width="32" height="16" fps="2" duration="1"/><output id="o" path="out.mp4" codec="h264" container="mp4" preset="ultrafast" layout="l"/><layouts><layout id="l" width="16" height="32" reframe="fit"/></layouts><composition><include id="part" src="part.xml"/></composition></scene>`,
    );
    const options = { sceneFile: join(dir, 'scene.xml') };
    const cold = await renderEpisode(options);
    assert.ok(cold.rendered > 0);
    const probe = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', cold.video], {
        encoding: 'utf8',
      }),
    );
    const stream = probe.streams.find((s) => s.codec_type === 'video');
    assert.equal(stream.width, 16);
    assert.equal(stream.height, 32);
    const frame = () =>
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-i',
        cold.video,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ]);
    const red = frame();
    assert.ok(red[(16 * 16 + 7) * 3] > 150);
    const warm = await renderEpisode(options);
    assert.equal(warm.rendered, 0);
    assert.ok(warm.cached > 0);
    writeFileSync(join(dir, 'part.xml'), part('#0000FF'));
    const changed = await renderEpisode(options);
    assert.ok(changed.rendered > 0);
    const blue = frame();
    assert.ok(blue[(16 * 16 + 7) * 3 + 2] > 150);
    assert.notDeepEqual(red, blue);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
