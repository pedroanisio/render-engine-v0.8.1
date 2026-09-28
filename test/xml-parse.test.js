import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXml } from '../src/xml/parse.js';

test('parses elements, attributes, text and namespaces into a tree', () => {
  const r = parseXml('<a x="1" xmlns:q="urn:q" q:y="2">hi<b/><![CDATA[<c>]]></a>');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.root.name, 'a');
  assert.equal(r.root.ns, '');
  assert.deepEqual(
    r.root.attributes.map((a) => [a.local, a.ns, a.value]),
    [['x', '', '1'], ['y', 'urn:q', '2']],
  );
  assert.deepEqual(r.root.children.map((c) => c.kind), ['text', 'element', 'text']);
  const [t1, b, t2] = r.root.children;
  assert.equal(t1?.kind === 'text' && t1.text, 'hi');
  assert.equal(b?.kind === 'element' && b.name, 'b');
  assert.equal(t2?.kind === 'text' && t2.text, '<c>');
  assert.equal(r.root.loc.line, 1);
});

test('drops namespace declarations from the attribute list', () => {
  const r = parseXml('<a xmlns="urn:x" xmlns:p="urn:p"/>');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.root.ns, 'urn:x');
  assert.equal(r.root.attributes.length, 0);
});

test('normalises whitespace characters in attribute values per XML 1.0', () => {
  const r = parseXml('<a v="1\t2\n3"/>');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.root.attributes[0]?.value, '1 2 3');
});

test('ignores comments and processing instructions', () => {
  const r = parseXml('<?xml version="1.0"?><!-- c --><a><?pi x?><!-- d --></a>');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.root.children.length, 0);
});

test('reports malformed XML with a location', () => {
  const r = parseXml('<a>\n<b></a>');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.diagnostics[0]?.code, 'E_XML_SYNTAX');
  assert.equal(r.diagnostics[0]?.stage, 'parse');
  assert.equal(r.diagnostics[0]?.line, 2);
});

test('reports an unbound namespace prefix', () => {
  const r = parseXml('<a p:x="1"/>');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.diagnostics[0]?.code, 'E_XML_SYNTAX');
});

test('rejects empty input and a missing root', () => {
  for (const src of ['', '   ', '<!-- only -->']) {
    const r = parseXml(src);
    assert.equal(r.ok, false, JSON.stringify(src));
  }
});

test('rejects any DOCTYPE, which closes entity-expansion attacks', () => {
  const r = parseXml('<!DOCTYPE a [<!ENTITY e "x">]><a>&e;</a>');
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.diagnostics[0]?.code, 'E_DOCTYPE');
  assert.equal(r.diagnostics[0]?.stage, 'policy');
});

test('enforces the size, depth and element-count limits', () => {
  const size = parseXml('<a/>', { maxBytes: 3 });
  assert.equal(!size.ok && size.diagnostics[0]?.code, 'E_LIMIT_SIZE');
  const depth = parseXml('<a><b><c/></b></a>', { maxDepth: 2 });
  assert.equal(!depth.ok && depth.diagnostics[0]?.code, 'E_LIMIT_DEPTH');
  const count = parseXml('<a><b/><b/></a>', { maxElements: 2 });
  assert.equal(!count.ok && count.diagnostics[0]?.code, 'E_LIMIT_ELEMENTS');
  const fits = parseXml('<a><b/></a>', { maxDepth: 2, maxElements: 2, maxBytes: 11 });
  assert.equal(fits.ok, true);
});

test('measures the size limit in UTF-8 bytes', () => {
  const r = parseXml('<a>é</a>', { maxBytes: 8 });
  assert.equal(!r.ok && r.diagnostics[0]?.code, 'E_LIMIT_SIZE');
  assert.equal(parseXml('<a>é</a>', { maxBytes: 9 }).ok, true);
});
