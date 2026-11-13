import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchingTags, closeTagAt, openElementAt } from '../src/core/tags.ts';

const names = (text: string, offset: number) => matchingTags(text, offset)?.map(r => text.slice(r.from, r.to));

test('matching start and end tags, nested and with attributes', () => {
  const xml = '<a><b x="1>2"><b/></b><!-- <b> --></a>';
  assert.deepEqual(names(xml, 4), ['b', 'b']);
  assert.deepEqual(matchingTags(xml, 4), [{ from: 4, to: 5 }, { from: 20, to: 21 }]);
  assert.deepEqual(names(xml, xml.lastIndexOf('</a>') + 2), ['a', 'a']);
  assert.equal(matchingTags(xml, xml.indexOf('<b/>') + 1), null);
});

test('an unclosed element has no partner', () => {
  assert.equal(matchingTags('<a><b></a>', 4), null);
  assert.deepEqual(names('<a><b></a>', 1), ['a', 'a']);
});

test('closing tags after > and </', () => {
  assert.equal(closeTagAt('<p rend="x">', 12), '</p>');
  assert.equal(closeTagAt('<p/>', 4), undefined);
  assert.equal(closeTagAt('<p>a</p>', 8), undefined);
  assert.equal(closeTagAt('<div><p>a</p></', 15), 'div>');
  assert.equal(closeTagAt('<!-- <p> -->', 12), undefined);
  assert.equal(closeTagAt('<p></p>', 3), undefined);
  assert.equal(openElementAt('<a><b>x</b>', 11), 'a');
});
