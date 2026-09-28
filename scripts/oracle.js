#!/usr/bin/env node
/**
 * Records libxml2's verdict for every corpus document into
 * test/oracle/verdicts.json. Run after changing the schema or the corpus
 * generator; the differential test fails until the verdicts are current.
 * Scratch files go to _tmp/oracle/.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { MODEL } from '../src/generated/model.js';
import { buildCorpus } from '../test/support/corpus.js';

const root = new URL('../', import.meta.url);
const dir = new URL('_tmp/oracle/', root);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const corpus = buildCorpus(MODEL);
const files = corpus.map((d, i) => {
  const f = new URL(`${String(i).padStart(5, '0')}.xml`, dir).pathname;
  writeFileSync(f, d.xml);
  return f;
});

// libxml2 through lxml: the system xmllint (libxml2 2.9.14) wrongly rejects
// whitespace around xs:unsignedLong values, which 2.14 fixed.
const schema = new URL('schema/scene-render-1.1.xsd', root).pathname;
const PY = `
import json, sys
from lxml import etree
s = etree.XMLSchema(etree.parse(sys.argv[1]))
out = {"oracle": "libxml2 %d.%d.%d via lxml %s" % (etree.LIBXML_VERSION + (etree.__version__,)), "verdicts": {}}
for f in sys.stdin.read().split("\\n"):
    if f:
        out["verdicts"][f] = s.validate(etree.parse(f))
print(json.dumps(out))
`;
const res = spawnSync('python3', ['-c', PY, schema], { input: files.join('\n'), encoding: 'utf8', maxBuffer: 1 << 28 });
if (res.status !== 0) throw new Error(`oracle failed: ${res.stderr}`);
const { oracle: version, verdicts: byName } = JSON.parse(res.stdout);
/** @type {Map<string, boolean>} */
const byFile = new Map(Object.entries(byName));
/** @type {Record<string, boolean>} */
const verdicts = {};
corpus.forEach((d, i) => {
  const v = byFile.get(/** @type {string} */ (files[i]));
  if (v === undefined) throw new Error(`xmllint gave no verdict for ${files[i]} (${d.label})`);
  verdicts[createHash('sha256').update(d.xml).digest('hex')] = v;
});
const schemaSha = createHash('sha256').update(readFileSync(schema)).digest('hex');
writeFileSync(new URL('test/oracle/verdicts.json', root), `${JSON.stringify({
  oracle: version, schemaSha256: schemaSha, documents: corpus.length, verdicts,
}, null, 1)}\n`);
const valid = Object.values(verdicts).filter(Boolean).length;
process.stdout.write(`${version}\n${corpus.length} documents: ${valid} valid, ${corpus.length - valid} invalid\n`);
