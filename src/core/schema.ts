// ── compiled RELAX NG grammars, kept once and shared by every document ─────
// Compiling a large RNG takes the better part of a second, so a grammar is
// compiled the first time it is asked for and kept until one of the files it
// was read from changes (invalidate).
import { convertRNGToPattern, type Grammar, type Resource } from 'salve-annos';

/** Reads the text of an RNG (or a file it includes) by URL. */
export type ReadText = (url: URL) => Promise<string>;

interface Entry { grammar: Promise<Grammar>; files: Set<string> }

export class Grammars {
  private entries = new Map<string, Entry>();
  private readText: ReadText;

  constructor(readText: ReadText) {
    this.readText = readText;
  }

  /** The grammar of the RNG at url, compiled once. */
  get(url: string): Promise<Grammar> {
    const known = this.entries.get(url);
    if (known) return known.grammar;
    const files = new Set<string>();
    const resourceLoader = {
      load: async (u: URL): Promise<Resource> => {
        files.add(u.href);
        const text = await this.readText(u);
        return { url: u, getText: async () => text };
      },
    };
    // the options type wants every field; salve fills in the others
    const grammar = convertRNGToPattern(new URL(url), { resourceLoader } as Parameters<typeof convertRNGToPattern>[1])
      .then(r => r.pattern);
    const entry = { grammar, files };
    this.entries.set(url, entry);
    // a schema that failed to compile is tried again next time
    grammar.catch(() => { if (this.entries.get(url) === entry) this.entries.delete(url); });
    return grammar;
  }

  /** Forget every grammar read from url, or all of them. Returns whether any was dropped. */
  invalidate(url?: string): boolean {
    if (url === undefined) {
      const any = this.entries.size > 0;
      this.entries.clear();
      return any;
    }
    let dropped = false;
    for (const [key, e] of this.entries) {
      if (key === url || e.files.has(url)) { this.entries.delete(key); dropped = true; }
    }
    return dropped;
  }
}
