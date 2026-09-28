import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileSchema } from '../src/xsd/compile.js';

/** @param {string} body */
const xsd = (body) => `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" version="9">${body}</xs:schema>`;

test('compiles types, groups, attribute groups, extensions and the root element', () => {
  const m = compileSchema(xsd(`
    <xs:annotation><xs:documentation>doc</xs:documentation></xs:annotation>
    <xs:simpleType name="unit"><xs:restriction base="xs:double">
      <xs:minInclusive value="0"/><xs:maxInclusive value="1"/></xs:restriction></xs:simpleType>
    <xs:simpleType name="modes"><xs:restriction base="xs:string">
      <xs:enumeration value="a"/><xs:enumeration value="b"/><xs:pattern value="a"/><xs:pattern value="b"/>
      <xs:maxLength value="4"/><xs:minLength value="1"/><xs:length value="1"/>
      <xs:minExclusive value="0"/><xs:maxExclusive value="9"/></xs:restriction></xs:simpleType>
    <xs:simpleType name="nums"><xs:list itemType="xs:double"/></xs:simpleType>
    <xs:simpleType name="either"><xs:union memberTypes="xs:double unit">
      <xs:simpleType><xs:restriction base="xs:string"><xs:enumeration value="auto"/></xs:restriction></xs:simpleType>
    </xs:union></xs:simpleType>
    <xs:simpleType name="inlineList"><xs:list><xs:simpleType><xs:restriction base="xs:int"/></xs:simpleType></xs:list></xs:simpleType>
    <xs:attributeGroup name="inner"><xs:attribute name="z" type="xs:int" default="3"/></xs:attributeGroup>
    <xs:attributeGroup name="common"><xs:attribute name="id" type="xs:ID" use="required"/>
      <xs:attributeGroup ref="inner"/></xs:attributeGroup>
    <xs:group name="items"><xs:choice><xs:element name="item" type="itemType"/>
      <xs:element name="note"><xs:complexType><xs:simpleContent><xs:extension base="xs:string">
        <xs:attribute name="lang" type="xs:string"/></xs:extension></xs:simpleContent></xs:complexType></xs:element>
    </xs:choice></xs:group>
    <xs:complexType name="itemType"><xs:attribute name="v" use="required">
      <xs:simpleType><xs:restriction base="xs:string"><xs:enumeration value="x"/></xs:restriction></xs:simpleType>
    </xs:attribute></xs:complexType>
    <xs:complexType name="baseType"><xs:sequence><xs:element name="head" type="itemType" minOccurs="0"/></xs:sequence>
      <xs:attributeGroup ref="common"/></xs:complexType>
    <xs:complexType name="derivedType"><xs:complexContent><xs:extension base="baseType">
      <xs:group ref="items" minOccurs="0" maxOccurs="unbounded"/>
      <xs:attribute name="extra" type="xs:boolean"/></xs:extension></xs:complexContent></xs:complexType>
    <xs:complexType name="attrsOnlyType"><xs:complexContent><xs:extension base="itemType">
      <xs:attribute name="w" type="xs:double"/></xs:extension></xs:complexContent></xs:complexType>
    <xs:complexType name="textType"><xs:simpleContent><xs:extension base="unit">
      <xs:attribute name="k" type="xs:string"/></xs:extension></xs:simpleContent></xs:complexType>
    <xs:complexType name="textMoreType"><xs:simpleContent><xs:extension base="textType">
      <xs:attribute name="k2" type="xs:string"/></xs:extension></xs:simpleContent></xs:complexType>
    <xs:element name="doc"><xs:complexType><xs:sequence>
      <xs:element name="d" type="derivedType" maxOccurs="3"/>
      <xs:element name="t" type="textMoreType" minOccurs="0"/>
      <xs:element name="a" type="attrsOnlyType" minOccurs="0"/>
    </xs:sequence></xs:complexType></xs:element>
  `));
  assert.equal(m.version, '9');
  assert.deepEqual(m.root, { name: 'doc', type: '/doc' });
  assert.deepEqual(m.simpleTypes.unit, { kind: 'restriction', base: 'xs:double', facets: { minInclusive: '0', maxInclusive: '1' } });
  assert.deepEqual(m.simpleTypes.modes?.kind === 'restriction' && m.simpleTypes.modes.facets, {
    enumeration: ['a', 'b'], patterns: ['a', 'b'], maxLength: 4, minLength: 1, length: 1, minExclusive: '0', maxExclusive: '9',
  });
  assert.deepEqual(m.simpleTypes.nums, { kind: 'list', itemType: 'xs:double' });
  assert.deepEqual(m.simpleTypes.either, { kind: 'union', memberTypes: ['xs:double', 'unit', 'either~1'] });
  assert.deepEqual(m.simpleTypes['inlineList'], { kind: 'list', itemType: 'inlineList~1' });
  assert.deepEqual(m.simpleTypes['itemType@v'], { kind: 'restriction', base: 'xs:string', facets: { enumeration: ['x'] } });

  const derived = m.complexTypes.derivedType;
  assert.deepEqual(Object.keys(derived?.attributes ?? {}), ['id', 'z', 'extra']);
  assert.deepEqual(derived?.attributes.z, { type: 'xs:int', required: false, default: '3' });
  assert.deepEqual(derived?.attributes.id, { type: 'xs:ID', required: true, default: null });
  assert.deepEqual(derived?.content, {
    kind: 'elements',
    particle: { kind: 'sequence', min: 1, max: 1, items: [
      { kind: 'sequence', min: 1, max: 1, items: [{ kind: 'element', name: 'head', min: 0, max: 1 }] },
      { kind: 'choice', min: 0, max: null, items: [
        { kind: 'element', name: 'item', min: 1, max: 1 }, { kind: 'element', name: 'note', min: 1, max: 1 }] },
    ] },
    elementTypes: { head: 'itemType', item: 'itemType', note: 'items/note' },
  });
  assert.deepEqual(m.complexTypes['items/note'], {
    attributes: { lang: { type: 'xs:string', required: false, default: null } },
    content: { kind: 'simple', type: 'xs:string' },
  });
  assert.deepEqual(m.complexTypes.attrsOnlyType?.content, { kind: 'empty' });
  assert.deepEqual(Object.keys(m.complexTypes.attrsOnlyType?.attributes ?? {}), ['v', 'w']);
  assert.deepEqual(m.complexTypes.textMoreType?.content, { kind: 'simple', type: 'unit' });
  assert.deepEqual(Object.keys(m.complexTypes.textMoreType?.attributes ?? {}), ['k', 'k2']);
  assert.deepEqual(m.complexTypes['/doc']?.content.kind === 'elements' && m.complexTypes['/doc'].content.elementTypes,
    { d: 'derivedType', t: 'textMoreType', a: 'attrsOnlyType' });
});

test('refuses constructs outside the supported subset instead of guessing', () => {
  /** @type {Array<[RegExp, string]>} */
  const cases = [
    [/mixed/, '<xs:complexType name="t" mixed="true"/>'],
    [/fixed/, '<xs:complexType name="t"><xs:attribute name="a" type="xs:string" fixed="x"/></xs:complexType>'],
    [/prohibited/, '<xs:complexType name="t"><xs:attribute name="a" type="xs:string" use="prohibited"/></xs:complexType>'],
    [/untyped attribute/, '<xs:complexType name="t"><xs:attribute name="a"/></xs:complexType>'],
    [/duplicate attribute/, '<xs:complexType name="t"><xs:attribute name="a" type="xs:string"/><xs:attribute name="a" type="xs:int"/></xs:complexType>'],
    [/element reference/, '<xs:complexType name="t"><xs:sequence><xs:element ref="x"/></xs:sequence></xs:complexType>'],
    [/particle xs:all/, '<xs:complexType name="t"><xs:all/></xs:complexType>'],
    [/complexContent restriction/, '<xs:complexType name="t"><xs:complexContent><xs:restriction base="u"/></xs:complexContent></xs:complexType>'],
    [/simple-typed element/, '<xs:complexType name="t"><xs:sequence><xs:element name="e" type="xs:string"/></xs:sequence></xs:complexType>'],
    [/builtin type xs:decimal/, '<xs:simpleType name="s"><xs:restriction base="xs:decimal"/></xs:simpleType>'],
    [/unknown complex type nope/, '<xs:complexType name="t"><xs:sequence><xs:element name="e" type="nope"/></xs:sequence></xs:complexType>'],
    [/facet xs:whiteSpace/, '<xs:simpleType name="s"><xs:restriction base="xs:string"><xs:whiteSpace value="collapse"/></xs:restriction></xs:simpleType>'],
    [/inconsistent types/, `<xs:complexType name="a"/><xs:complexType name="b"/>
      <xs:complexType name="t"><xs:choice><xs:element name="e" type="a"/><xs:element name="e" type="b"/></xs:choice></xs:complexType>`],
    [/unknown group g/, '<xs:complexType name="t"><xs:group ref="g"/></xs:complexType>'],
    [/unknown attribute group g/, '<xs:complexType name="t"><xs:attributeGroup ref="g"/></xs:complexType>'],
    [/top-level <xs:notation>/, '<xs:notation name="n" public="p"/>'],
    [/circular extension/, `<xs:complexType name="a"><xs:complexContent><xs:extension base="b"/></xs:complexContent></xs:complexType>
      <xs:complexType name="b"><xs:complexContent><xs:extension base="a"/></xs:complexContent></xs:complexType>`],
    [/unknown complex type u/, '<xs:complexType name="t"><xs:complexContent><xs:extension base="u"/></xs:complexContent></xs:complexType>'],
    [/extension of simple content/, `<xs:complexType name="s"><xs:simpleContent><xs:extension base="xs:string"/></xs:simpleContent></xs:complexType>
      <xs:complexType name="t"><xs:complexContent><xs:extension base="s"/></xs:complexContent></xs:complexType>`],
    [/simpleContent restriction/, '<xs:complexType name="t"><xs:simpleContent><xs:restriction base="xs:string"/></xs:simpleContent></xs:complexType>'],
    [/is not simple/, `<xs:complexType name="e"><xs:sequence/></xs:complexType>
      <xs:complexType name="t"><xs:simpleContent><xs:extension base="e"/></xs:simpleContent></xs:complexType>`],
    [/no derivation/, '<xs:simpleType name="s"/>'],
    [/lacks a base/, '<xs:simpleType name="s"><xs:restriction/></xs:simpleType>'],
    [/derivation xs:extension/, '<xs:simpleType name="s"><xs:extension base="xs:string"/></xs:simpleType>'],
    [/unknown simple type nope/, '<xs:simpleType name="s"><xs:list itemType="nope"/></xs:simpleType>'],
    [/non-XSD element/, '<xs:simpleType name="s" xmlns:f="urn:f"><f:x/></xs:simpleType>'],
    [/both simple and complex/, '<xs:simpleType name="n"><xs:restriction base="xs:string"/></xs:simpleType><xs:complexType name="n"/>'],
    [/lacks @name/, '<xs:complexType/>'],
    [/untyped element/, '<xs:complexType name="t"><xs:sequence><xs:element name="e"/></xs:sequence></xs:complexType>'],
    [/inconsistent types/, `<xs:complexType name="a"/><xs:complexType name="b"/>
      <xs:complexType name="base"><xs:sequence><xs:element name="e" type="a"/></xs:sequence></xs:complexType>
      <xs:complexType name="t"><xs:complexContent><xs:extension base="base"><xs:sequence><xs:element name="e" type="b"/></xs:sequence></xs:extension></xs:complexContent></xs:complexType>`],
  ];
  const root = '<xs:element name="r"><xs:complexType/></xs:element>';
  for (const [re, body] of cases) assert.throws(() => compileSchema(xsd(body + root)), re, body);
  assert.throws(() => compileSchema(xsd(root + root)), /exactly one global element/);
  assert.throws(() => compileSchema(xsd('')), /exactly one global element/);
  assert.throws(() => compileSchema(xsd('<xs:element name="r" type="t"/><xs:complexType name="t"/>')), /inline complex type/);
  assert.throws(() => compileSchema('<schema/>'), /not an XSD/);
  assert.throws(() => compileSchema('<a'), /XML/);
});

test('compiles the scene-render 1.1 schema', () => {
  const m = compileSchema(readFileSync(new URL('../schema/scene-render-1.1.xsd', import.meta.url), 'utf8'));
  assert.equal(m.version, '1.1');
  assert.deepEqual(m.root, { name: 'scene', type: '/scene' });
  const named = Object.keys(m.complexTypes).filter((k) => !/[/@~]/.test(k));
  assert.equal(named.length, 115);
  assert.equal(Object.keys(m.simpleTypes).filter((k) => !/[/@~]/.test(k)).length, 45);
  const project = m.complexTypes.projectType;
  assert.deepEqual(project?.attributes.width, { type: 'xs:positiveInteger', required: true, default: null });
  assert.deepEqual(project?.attributes.mode, { type: 'projectType@mode', required: false, default: 'standard' });
});
