import assert from 'node:assert/strict';
import { test } from 'node:test';
import { schemaFor, relativeHref, xmlModelEdits, projectRoot, vocabulary, type Files } from '../src/core/association.ts';

const files = (map: Record<string, string>): Files => ({
  exists: url => url in map,
  read: url => map[url],
});
const DEFAULTS = { odd: 'file:///ext/odds.rng', tei: 'file:///ext/tei_all.rng' };
const TEI = '<TEI xmlns="http://www.tei-c.org/ns/1.0"/>';
const pi = (href: string) => `<?xml-model href="${href}" schematypens="http://relaxng.org/ns/structure/1.0"?>`;

test('an xml-model PI wins when its RNG exists', () => {
  const fs = files({ 'file:///p/opm.toml': '[editor]\nschema = "odd/b.rng"', 'file:///p/odd/a.rng': '', 'file:///p/odd/b.rng': '' });
  assert.deepEqual(schemaFor('file:///p/data/x.xml', pi('../odd/a.rng') + TEI, fs, DEFAULTS), { url: 'file:///p/odd/a.rng', via: 'xml-model' });
});

test('opm.toml [editor] schema applies to documents, not ODDs', () => {
  const fs = files({ 'file:///p/opm.toml': '[editor]\nschema = "odd/b.rng"\n', 'file:///p/odd/b.rng': '' });
  assert.deepEqual(schemaFor('file:///p/data/sub/x.xml', TEI, fs, DEFAULTS), { url: 'file:///p/odd/b.rng', via: 'project' });
  assert.deepEqual(schemaFor('file:///p/odd/m.odd', TEI, fs, DEFAULTS), { url: DEFAULTS.odd, via: 'default' });
});

test('defaults by vocabulary; unknown XML has none', () => {
  const fs = files({});
  assert.deepEqual(schemaFor('file:///x.xml', TEI, fs, DEFAULTS), { url: DEFAULTS.tei, via: 'default' });
  assert.equal(schemaFor('file:///x.xml', '<doc/>', fs, DEFAULTS), null);
});

test('a missing or remote RNG falls through', () => {
  const fs = files({});
  assert.equal(schemaFor('file:///x.xml', pi('missing.rng') + TEI, fs, DEFAULTS)?.via, 'default');
  assert.equal(schemaFor('file:///x.xml', pi('https://example.org/a.rng') + TEI, fs, DEFAULTS)?.via, 'default');
});

test('the project search stops at a workspace folder', () => {
  const fs = files({ 'file:///opm.toml': '' });
  assert.equal(projectRoot('file:///w/a/x.xml', fs), 'file:///');
  assert.equal(projectRoot('file:///w/a/x.xml', fs, ['file:///w']), undefined);
});

test('relative hrefs', () => {
  assert.equal(relativeHref('file:///p/data/x.xml', 'file:///p/odd/a.rng'), '../odd/a.rng');
  assert.equal(relativeHref('file:///p/x.xml', 'file:///p/a.rng'), 'a.rng');
  assert.equal(relativeHref('file:///p/a/b/x.xml', 'file:///p/a/b/c/a.rng'), 'c/a.rng');
});

const apply = (text: string, edits: { from: number; to: number; insert: string }[]) =>
  [...edits].sort((a, b) => b.from - a.from).reduce((t, e) => t.slice(0, e.from) + e.insert + t.slice(e.to), text);

test('xml-model PIs are added after the declaration, replaced and removed', () => {
  const decl = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const added = apply(decl + TEI, xmlModelEdits(decl + TEI, 'a.rng'));
  assert.match(added, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<\?xml-model href="a\.rng" type="application\/xml" schematypens="http:\/\/relaxng\.org\/ns\/structure\/1\.0"\?>\n<TEI/);
  const replaced = apply(added, xmlModelEdits(added, 'b.rng'));
  assert.equal((replaced.match(/xml-model/g) ?? []).length, 1);
  assert.match(replaced, /href="b\.rng"/);
  assert.equal(apply(replaced, xmlModelEdits(replaced, null)), decl + TEI);
  assert.equal(apply(TEI, xmlModelEdits(TEI, 'a.rng')), pi('a.rng').replace(' schematypens', ' type="application/xml" schematypens') + '\n' + TEI);
});

test('a Schematron xml-model is left alone', () => {
  const sch = '<?xml-model href="a.sch" schematypens="http://purl.oclc.org/dsdl/schematron"?>\n';
  const out = apply(sch + TEI, xmlModelEdits(sch + TEI, 'a.rng'));
  assert.ok(out.includes('a.sch') && out.includes('a.rng'));
});

test('vocabularies: TEI, DocBook, JATS, and the rest', () => {
  assert.equal(vocabulary(TEI), 'tei');
  assert.equal(vocabulary('<article xmlns="http://docbook.org/ns/docbook" version="5.2"/>'), 'docbook');
  assert.equal(vocabulary('<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.3 20210610//EN" "x.dtd"><article/>'), 'jats');
  assert.equal(vocabulary('<article article-type="research-article" dtd-version="1.3"><front/></article>'), 'jats');
  assert.equal(vocabulary('<article><title>x</title></article>'), '');
});

test('published default schemas are used from the bundled copies', () => {
  const fs = files({ 'file:///p/opm.toml': '[editor]\nschema = "https://cdn.docbook.org/schema/5.2/rng/docbook.rng"\n' });
  const defaults = { ...DEFAULTS, docbook: 'file:///ext/docbook.rng' };
  assert.deepEqual(schemaFor('file:///x.xml', pi('http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_all.rng') + '<doc/>', fs, defaults),
    { url: DEFAULTS.tei, via: 'xml-model' });
  assert.deepEqual(schemaFor('file:///p/x.xml', '<doc/>', fs, defaults), { url: 'file:///ext/docbook.rng', via: 'project' });
});
