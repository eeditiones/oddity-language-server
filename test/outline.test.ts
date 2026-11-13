import assert from 'node:assert/strict';
import { test } from 'node:test';
import { oddOutline, teiOutline, elementOutline, type OutlineSymbol } from '../src/core/outline.ts';

const tree = (s: OutlineSymbol[]): unknown[] => s.map(x => x.children.length ? [x.name, tree(x.children)] : x.name);

test('ODD outline: tagsDecl, schemaSpec, specs and nested models', () => {
  const odd = '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader/><text><body>' +
    '<tagsDecl><rendition xml:id="r1"/></tagsDecl>' +
    '<schemaSpec ident="my" source="teipublisher.odd"><moduleRef key="core" include="p hi"/>' +
    '<elementSpec ident="hi" mode="change"><modelSequence><model behaviour="inline"/></modelSequence>' +
    '<model output="web" predicate="@rend" behaviour="block"/></elementSpec></schemaSpec></body></text></TEI>';
  const out = oddOutline(odd);
  assert.deepEqual(tree(out), [['tagsDecl', ['r1']], ['my', ['core', ['hi', [['modelSequence', ['inline']], 'web · @rend · block']]]]]);
  assert.equal(out[1].detail, 'source: teipublisher.odd');
  assert.equal(odd.slice(out[1].nameFrom, out[1].nameTo), 'schemaSpec');
});

test('TEI outline: divisions by their heads', () => {
  const tei = '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader/><text><body>' +
    '<div xml:id="d1"><head>Chapter <hi>One</hi></head><p/><div type="section" n="2"><p/></div></div></body></text></TEI>';
  const out = teiOutline(tei);
  assert.deepEqual(tree(out), [['TEI', ['teiHeader', ['text', [['body', [['Chapter One', ['section 2']]]]]]]]]);
  assert.equal(out[0].children[1].children[0].children[0].detail, 'div #d1');
});

test('other XML: a plain element tree', () => {
  assert.deepEqual(tree(elementOutline('<a><b id="x"/><c/></a>')), [['a', ['b', 'c']]]);
});
