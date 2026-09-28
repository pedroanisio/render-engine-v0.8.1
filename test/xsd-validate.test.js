import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileSchema } from '../src/xsd/compile.js';
import { createValidator } from '../src/xsd/validate.js';
import { parseXml } from '../src/xml/parse.js';

const model = compileSchema(`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:simpleType name="unit"><xs:restriction base="xs:double"><xs:minInclusive value="0"/><xs:maxInclusive value="1"/></xs:restriction></xs:simpleType>
  <xs:complexType name="itemType">
    <xs:attribute name="id" type="xs:ID"/>
    <xs:attribute name="ref" type="xs:IDREF"/>
    <xs:attribute name="refs" type="xs:IDREFS"/>
    <xs:attribute name="o" type="unit" default="1"/>
    <xs:attribute name="n" type="xs:positiveInteger"/>
    <xs:attribute name="req" type="xs:string" use="required"/>
  </xs:complexType>
  <xs:complexType name="textType"><xs:simpleContent><xs:extension base="unit">
    <xs:attribute name="k" type="xs:string"/></xs:extension></xs:simpleContent></xs:complexType>
  <xs:element name="doc"><xs:complexType><xs:sequence>
    <xs:element name="head" type="itemType"/>
    <xs:element name="t" type="textType" minOccurs="0"/>
    <xs:element name="item" type="itemType" minOccurs="0" maxOccurs="unbounded"/>
  </xs:sequence></xs:complexType></xs:element>
</xs:schema>`);
const v = createValidator(model);

/** @param {string} xml @param {number} [max] */
function run(xml, max) {
  const p = parseXml(xml);
  assert.ok(p.ok, 'fixture must be well-formed');
  return v.validate(p.root, max === undefined ? {} : { maxDiagnostics: max });
}
/** @param {string} xml */
const codes = (xml) => run(xml).diagnostics.map((d) => d.code);

test('decodes a valid document into a typed tree with defaults applied', () => {
  const r = run('<doc>\n <head req="a" id="h" n="3"/>\n <t k="x"> 0.5 </t>\n <item req="b" ref="h" refs="h i2" o="0" id="i2"/>\n</doc>');
  assert.deepEqual(r.diagnostics, []);
  const doc = r.tree;
  assert.equal(doc.type, '/doc');
  assert.equal(doc.path, '/doc');
  const [head, t, item] = doc.children;
  assert.deepEqual(head?.attributes, { req: 'a', id: 'h', n: 3, o: 1 });
  assert.equal(head?.loc.line, 2);
  assert.equal(t?.value, 0.5);
  assert.deepEqual(t?.attributes, { k: 'x' });
  assert.deepEqual(item?.attributes.refs, ['h', 'i2']);
  assert.equal(item?.path, '/doc/item[1]');
  assert.equal(r.ids.get('h'), head);
  assert.equal(r.ids.get('i2'), item);
  assert.ok(Object.isFrozen(doc) && Object.isFrozen(doc.children) && Object.isFrozen(head?.attributes));
});

test('reports each attribute problem with its code', () => {
  assert.deepEqual(codes('<doc><head/></doc>'), ['E_ATTR_REQUIRED']);
  assert.deepEqual(codes('<doc><head req="a" zz="1"/></doc>'), ['E_ATTR_UNKNOWN']);
  assert.deepEqual(codes('<doc><head req="a" o="2"/></doc>'), ['E_ATTR_VALUE']);
  assert.deepEqual(codes('<doc xmlns:q="urn:q"><head req="a" q:x="1"/></doc>'), ['E_ATTR_UNKNOWN']);
  const r = run('<doc><head req="a" o="2"/></doc>');
  assert.match(r.diagnostics[0]?.message ?? '', /@o.*must be <= 1/);
  assert.equal(r.diagnostics[0]?.path, '/doc/head[1]');
});

test('accepts xsi schema-location hints and refuses xsi:type and xsi:nil', () => {
  const xsi = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';
  assert.deepEqual(codes(`<doc ${xsi} xsi:noNamespaceSchemaLocation="s.xsd"><head req="a" xsi:schemaLocation="a b"/></doc>`), []);
  const r = run(`<doc ${xsi}><head req="a" xsi:type="itemType"/></doc>`);
  assert.deepEqual(r.diagnostics.map((d) => [d.code, d.stage]), [['E_XSI_UNSUPPORTED', 'policy']]);
  assert.deepEqual(codes(`<doc ${xsi}><head req="a" xsi:nil="true"/></doc>`), ['E_XSI_UNSUPPORTED']);
  assert.deepEqual(codes(`<doc ${xsi}><head req="a" xsi:other="1"/></doc>`), ['E_ATTR_UNKNOWN']);
});

test('reports content-model violations with the expected names', () => {
  const r = run('<doc><item req="a"/></doc>');
  assert.equal(r.diagnostics[0]?.code, 'E_ELEMENT_UNEXPECTED');
  assert.match(r.diagnostics[0]?.message ?? '', /<item> is not allowed here; expected <head>/);
  assert.deepEqual(codes('<doc/>'), ['E_CONTENT_INCOMPLETE']);
  assert.deepEqual(codes('<doc><head req="a"/><t>1</t><t>1</t></doc>'), ['E_ELEMENT_UNEXPECTED']);
  assert.deepEqual(codes('<doc><head req="a"/><zz/></doc>'), ['E_ELEMENT_UNEXPECTED']);
  assert.match(run('<doc><head req="a"/><t>1</t><t>1</t></doc>').diagnostics[0]?.message ?? '', /expected <item>/);
});

test('still validates the children of a misplaced but known element', () => {
  assert.deepEqual(codes('<doc><item req="a" o="7"/></doc>').sort(), ['E_ATTR_VALUE', 'E_ELEMENT_UNEXPECTED']);
});

test('reports text and child elements where the content type forbids them', () => {
  assert.deepEqual(codes('<doc>x<head req="a"/></doc>'), ['E_TEXT_NOT_ALLOWED']);
  assert.deepEqual(codes('<doc> <head req="a"/>\n</doc>'), []);
  assert.deepEqual(codes('<doc><head req="a"> </head></doc>'), ['E_TEXT_NOT_ALLOWED']);
  assert.deepEqual(codes('<doc><head req="a"><!-- c --></head></doc>'), []);
  assert.deepEqual(codes('<doc><head req="a">x</head></doc>'), ['E_TEXT_NOT_ALLOWED']);
  assert.deepEqual(codes('<doc><head req="a"><b/></head></doc>'), ['E_ELEMENT_UNEXPECTED']);
  assert.deepEqual(codes('<doc><head req="a"/><t>2</t></doc>'), ['E_TEXT_VALUE']);
  assert.deepEqual(codes('<doc><head req="a"/><t><b/>1</t></doc>'), ['E_ELEMENT_UNEXPECTED']);
  assert.deepEqual(codes('<doc><head req="a"/><t/></doc>'), ['E_TEXT_VALUE']);
});

test('checks namespaces and the root element', () => {
  assert.deepEqual(codes('<doc xmlns="urn:x"><head req="a"/></doc>'), ['E_NAMESPACE']);
  assert.deepEqual(codes('<head req="a"/>'), ['E_ROOT']);
  assert.deepEqual(codes('<doc xmlns:q="urn:q"><head req="a"/><q:item/></doc>'), ['E_NAMESPACE']);
});

test('enforces ID uniqueness and IDREF resolution across the document', () => {
  assert.deepEqual(codes('<doc><head req="a" id="x"/><item req="b" id="x"/></doc>'), ['E_ID_DUPLICATE']);
  assert.deepEqual(codes('<doc><head req="a" ref="nope"/></doc>'), ['E_IDREF_DANGLING']);
  assert.deepEqual(codes('<doc><head req="a" id="x" refs="x nope"/></doc>'), ['E_IDREF_DANGLING']);
});

test('flags integers beyond 2^53 as a semantic error', () => {
  const r = run('<doc><head req="a" n="9007199254740993"/></doc>');
  assert.deepEqual(r.diagnostics.map((d) => [d.code, d.stage]), [['E_INT_RANGE', 'semantic']]);
});

test('stops collecting after the diagnostic cap', () => {
  const many = `<doc><head req="a"/>${'<item/>'.repeat(20)}</doc>`;
  assert.equal(run(many).diagnostics.length, 20);
  assert.equal(run(many, 5).diagnostics.length, 5);
});
