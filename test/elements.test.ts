import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectElement, removeElementTags, splitElement, surroundWithElement, type ElementEdit } from '../src/core/elements.ts';

/** Apply an edit; returns the text with the selection marked as [ ] (or | for a cursor). */
function apply(text: string, edit: ElementEdit | null): string | null {
  if (!edit) return null;
  const out = [...edit.changes].sort((a, b) => b.from - a.from).reduce((t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to), text);
  const { anchor, head } = edit.selection;
  const [from, to] = anchor <= head ? [anchor, head] : [head, anchor];
  return from === to ? out.slice(0, from) + '|' + out.slice(from) : out.slice(0, from) + '[' + out.slice(from, to) + ']' + out.slice(to);
}

/** The selection written into text as | or [ ]. */
function sel(marked: string): [string, number, number] {
  const c = marked.indexOf('|');
  if (c >= 0) return [marked.replace('|', ''), c, c];
  const from = marked.indexOf('['), to = marked.indexOf(']') - 1;
  return [marked.replace('[', '').replace(']', ''), from, to];
}

test('select element, then its parent', () => {
  const [t, f, to] = sel('<p>a <hi>b|c</hi> d</p>');
  assert.equal(apply(t, selectElement(t, f, to)), '<p>a [<hi>bc</hi>] d</p>');
  const [t2, f2, to2] = sel('<p>a [<hi>bc</hi>] d</p>');
  assert.equal(apply(t2, selectElement(t2, f2, to2)), '[<p>a <hi>bc</hi> d</p>]');
});

test('remove tags keeps the content selected', () => {
  const [t, f, to] = sel('<p>a <hi rend="i">b|c</hi> d</p>');
  assert.equal(apply(t, removeElementTags(t, f, to)), '<p>a [bc] d</p>');
  const [t2, f2, to2] = sel('<p>a <lb|/> b</p>');
  assert.equal(apply(t2, removeElementTags(t2, f2, to2)), '<p>a | b</p>');
});

test('split repeats the start tag without its id', () => {
  const [t, f] = sel('<p xml:id="p1" rend="x">one | two</p>');
  assert.equal(apply(t, splitElement(t, f)), '<p xml:id="p1" rend="x">one </p><p rend="x">| two</p>');
  const [t2, f2] = sel('<p>a <hi>b|</hi></p>');
  assert.equal(apply(t2, splitElement(t2, f2)), '<p>a <hi>b</hi><hi>|</hi></p>');
});

test('surround keeps the text selected and takes attributes', () => {
  const [t, f, to] = sel('<p>a [word] b</p>');
  assert.equal(apply(t, surroundWithElement(f, to, 'persName ref="#x"')), '<p>a <persName ref="#x">[word]</persName> b</p>');
});
