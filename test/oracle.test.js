import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MODEL } from '../src/generated/model.js';
import { parseXml } from '../src/xml/parse.js';
import { createValidator } from '../src/xsd/validate.js';
import { buildCorpus } from './support/corpus.js';

const recorded = JSON.parse(readFileSync(new URL('./oracle/verdicts.json', import.meta.url), 'utf8'));
const validator = createValidator(MODEL);

/**
 * XSD verdict only: policy and semantic stages are outside libxml2's scope.
 * IDREF resolution is reported separately because libxml2 does not enforce
 * XSD 1.0 cvc-id for IDREFs; unit tests cover it against the specification.
 * @param {string} xml
 */
function xsdVerdict(xml) {
  const p = parseXml(xml);
  if (!p.ok) return { valid: false, danglingOnly: false, diagnostics: p.diagnostics };
  const v = validator.validate(p.root, { maxDiagnostics: 1000 });
  const schema = v.diagnostics.filter((d) => d.stage === 'schema');
  const other = schema.filter((d) => d.code !== 'E_IDREF_DANGLING');
  return { valid: other.length === 0, danglingOnly: schema.length > 0 && other.length === 0, diagnostics: other };
}

test('verdicts were recorded against the current schema', () => {
  const sha = createHash('sha256').update(readFileSync(new URL('../schema/scene-render-1.1.xsd', import.meta.url))).digest('hex');
  assert.equal(recorded.schemaSha256, sha, 'schema changed: run npm run oracle');
});

test('agrees with libxml2 on every corpus document', () => {
  const corpus = buildCorpus(MODEL);
  assert.equal(corpus.length, recorded.documents);
  /** @type {string[]} */
  const disagreements = [];
  let valid = 0;
  let dangling = 0;
  for (const d of corpus) {
    const hash = createHash('sha256').update(d.xml).digest('hex');
    const expected = recorded.verdicts[hash];
    assert.equal(typeof expected, 'boolean', `no recorded verdict for ${d.label}: run npm run oracle`);
    const got = xsdVerdict(d.xml);
    if (got.valid) valid += 1;
    if (got.danglingOnly) {
      dangling += 1;
      assert.equal(expected, true, `${d.label}: libxml2 now enforces IDREF resolution; drop the exclusion`);
    }
    if (got.valid !== expected) {
      disagreements.push(`${d.label}: libxml2=${expected} ours=${got.valid} ${got.diagnostics.map((x) => `${x.code} ${x.message}`).join('; ')}`);
    }
  }
  assert.deepEqual(disagreements, []);
  assert.ok(valid > 200 && corpus.length - valid > 1000, 'corpus must exercise both verdicts');
  assert.ok(dangling > 0, 'corpus must exercise dangling IDREFs');
});
