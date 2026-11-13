// ── start and end tags: matching pairs and closing tags ──────────────────
// A light scanner rather than a parser: it has to work on half-typed documents.

export interface Tag {
  kind: 'open' | 'close' | 'empty';
  name: string;
  /** Offset of the '<'. */
  from: number;
  nameFrom: number;
  nameTo: number;
  /** Offset just after the '>', or the end of the text for an unfinished tag. */
  to: number;
}

const SKIP: [string, string][] = [['<!--', '-->'], ['<![CDATA[', ']]>'], ['<?', '?>'], ['<!', '>']];

/** Every tag in text, skipping comments, CDATA, processing instructions and declarations. */
export function scanTags(text: string): Tag[] {
  const tags: Tag[] = [];
  let i = 0;
  while ((i = text.indexOf('<', i)) >= 0) {
    const skip = SKIP.find(([open]) => text.startsWith(open, i));
    if (skip) {
      const end = text.indexOf(skip[1], i + skip[0].length);
      if (end < 0) break;
      i = end + skip[1].length;
      continue;
    }
    const closing = text[i + 1] === '/';
    const nameFrom = i + (closing ? 2 : 1);
    const name = text.slice(nameFrom).match(/^[^\s<>/="']*/)![0];
    // the end of the tag: the first '>' outside a quoted value
    let j = nameFrom + name.length, quote = '';
    for (; j < text.length; j++) {
      const c = text[j];
      if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>' || c === '<') break;
    }
    const finished = text[j] === '>';
    const to = finished ? j + 1 : j;
    const kind = closing ? 'close' : finished && text[j - 1] === '/' ? 'empty' : 'open';
    tags.push({ kind, name, from: i, nameFrom, nameTo: nameFrom + name.length, to });
    i = finished ? to : Math.max(j, i + 1);
  }
  return tags;
}

/** Pairs of open and close tags, by index into tags, matched like a parser would. */
export function pairs(tags: Tag[]): Map<number, number> {
  const stack: number[] = [];
  const pair = new Map<number, number>();
  tags.forEach((t, i) => {
    if (t.kind === 'open') stack.push(i);
    else if (t.kind === 'close') {
      // close the nearest open tag of the same name; anything above it was left open
      const k = stack.map(s => tags[s].name).lastIndexOf(t.name);
      if (k < 0) return;
      pair.set(stack[k], i);
      pair.set(i, stack[k]);
      stack.length = k;
    }
  });
  return pair;
}

/** The name ranges of the tag whose name holds offset and its partner, for renaming both at once. */
export function matchingTags(text: string, offset: number): { from: number; to: number }[] | null {
  const tags = scanTags(text);
  const at = tags.findIndex(t => t.kind !== 'empty' && t.nameFrom <= offset && offset <= t.nameTo);
  if (at < 0) return null;
  const other = pairs(tags).get(at);
  if (other === undefined) return null;
  return [at, other].sort((a, b) => a - b).map(i => ({ from: tags[i].nameFrom, to: tags[i].nameTo }));
}

/** The innermost element still open at offset. */
export function openElementAt(text: string, offset: number): string | undefined {
  const tags = scanTags(text.slice(0, offset));
  const pair = pairs(tags);
  for (let i = tags.length - 1; i >= 0; i--) {
    if (tags[i].kind === 'open' && !pair.has(i) && tags[i].to <= offset && text[tags[i].to - 1] === '>') return tags[i].name;
  }
  return undefined;
}

/**
 * What to insert at offset, just after the user typed a character, to close a tag:
 * after the '>' of a start tag its end tag, after '</' the name of the open element.
 */
export function closeTagAt(text: string, offset: number): string | undefined {
  const before = text.slice(0, offset);
  if (before.endsWith('</')) {
    const name = openElementAt(text, offset - 2);
    if (!name) return undefined;
    return text.slice(offset).startsWith('>') ? name : `${name}>`;
  }
  if (!before.endsWith('>') || before.endsWith('/>')) return undefined;
  const tags = scanTags(before);
  const last = tags[tags.length - 1];
  if (!last || last.kind !== 'open' || last.to !== offset || !last.name) return undefined;
  const end = `</${last.name}>`;
  // already closed right after the cursor, e.g. when a '>' is retyped
  if (text.slice(offset).startsWith(end)) return undefined;
  return end;
}
