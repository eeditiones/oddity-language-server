// ── the language server, independent of how it is connected ──────────────
// node.ts runs it over IPC/stdio for VS Code; a browser entry can run it in a web worker.
import {
  type Connection, type CompletionItem, type Diagnostic, type DocumentSymbol, type InitializeResult, type SelectionRange,
  TextDocuments, TextDocumentSyncKind, CompletionItemKind, CompletionTriggerKind, DiagnosticSeverity,
  InsertTextFormat, MarkupKind,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Grammar } from 'salve-annos';
import { Grammars, type ReadText } from '../core/schema.ts';
import { schemaFor, isOdd, vocabulary, type Defaults, type Files, type SchemaChoice } from '../core/association.ts';
import { validate, type Problem } from '../core/validate.ts';
import { wellFormed } from '../core/wellformed.ts';
import { possibleAt } from '../core/complete.ts';
import { matchingTags } from '../core/tags.ts';
import { elementsAround } from '../core/elements.ts';
import { oddOutline, teiOutline, elementOutline, type OutlineSymbol } from '../core/outline.ts';

export const SOURCE = 'oddity-ls';

/** What the host gives the server: file access. */
export interface Host {
  files: Files;
  readText: ReadText;
  /** Default schemas used when the client does not name its own. */
  defaults?: Defaults;
}

export interface InitOptions {
  /** Default schema URL by vocabulary, e.g. { odd: 'file:///…/teipublisher_odds.rng', tei: 'file:///…/tei_all.rng' }. */
  defaultSchemas?: Defaults;
}

/** Custom request: the schema a document uses, or null. */
export const SCHEMA_FOR = 'oddity/schemaFor';
/** Custom notification to the client whenever a document's schema is known or changes. */
export const SCHEMA_CHANGED = 'oddity/schemaChanged';
/** Custom request: the elements the schema allows at an offset, [{ name, detail }], or null without a schema. */
export const ALLOWED_ELEMENTS = 'oddity/allowedElements';

const DELAY = 250;

export function startServer(connection: Connection, host: Host): void {
  const documents = new TextDocuments(TextDocument);
  const grammars = new Grammars(host.readText);
  let defaults: Defaults = { ...host.defaults };
  let stops: string[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const announced = new Map<string, string>();

  const choiceOf = (doc: TextDocument): SchemaChoice | null => schemaFor(doc.uri, doc.getText(), host.files, defaults, stops);

  connection.onInitialize((params): InitializeResult => {
    const options = (params.initializationOptions ?? {}) as InitOptions;
    defaults = { ...defaults, ...options.defaultSchemas };
    stops = (params.workspaceFolders ?? []).map(f => f.uri);
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: { triggerCharacters: ['<', ' ', '"', "'"] },
        linkedEditingRangeProvider: true,
        documentSymbolProvider: true,
        selectionRangeProvider: true,
      },
      serverInfo: { name: 'oddity-language-server' },
    };
  });

  async function grammarOf(choice: SchemaChoice | null): Promise<{ grammar?: Grammar; error?: string }> {
    if (!choice) return {};
    try {
      return { grammar: await grammars.get(choice.url) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  const toDiagnostic = (doc: TextDocument, p: Problem, code: string): Diagnostic => ({
    range: { start: doc.positionAt(p.from), end: doc.positionAt(p.to) },
    message: p.message,
    severity: DiagnosticSeverity.Error,
    source: SOURCE,
    code,
  });

  async function check(uri: string): Promise<void> {
    const doc = documents.get(uri);
    if (!doc) return;
    const version = doc.version, text = doc.getText();
    const choice = choiceOf(doc);
    const key = choice ? `${choice.via} ${choice.url}` : '';
    if (announced.get(uri) !== key) {
      announced.set(uri, key);
      void connection.sendNotification(SCHEMA_CHANGED, { uri, schema: choice });
    }
    const syntax = wellFormed(text);
    let diagnostics: Diagnostic[];
    if (syntax.length) {
      diagnostics = syntax.map(p => toDiagnostic(doc, p, 'well-formedness'));
    } else {
      const { grammar, error } = await grammarOf(choice);
      if (documents.get(uri)?.version !== version) return;
      if (error) {
        diagnostics = [{
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          message: `The schema ${choice!.url} could not be loaded: ${error}`,
          severity: DiagnosticSeverity.Warning, source: SOURCE, code: 'schema-load',
        }];
      } else {
        diagnostics = grammar ? validate(grammar, text).map(p => toDiagnostic(doc, p, 'schema')) : [];
      }
    }
    if (documents.get(uri)?.version !== version) return;
    void connection.sendDiagnostics({ uri, version, diagnostics });
  }

  function schedule(uri: string, delay = DELAY): void {
    clearTimeout(timers.get(uri));
    timers.set(uri, setTimeout(() => {
      timers.delete(uri);
      check(uri).catch(err => connection.console.error(`Checking ${uri} failed: ${err instanceof Error ? err.stack : err}`));
    }, delay));
  }

  const recheckAll = () => { for (const d of documents.all()) schedule(d.uri, 0); };

  documents.onDidOpen(e => schedule(e.document.uri, 0));
  documents.onDidChangeContent(e => schedule(e.document.uri));
  documents.onDidClose(e => {
    clearTimeout(timers.get(e.document.uri));
    timers.delete(e.document.uri);
    announced.delete(e.document.uri);
    void connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
  });

  connection.onDidChangeWatchedFiles(({ changes }) => {
    for (const c of changes) if (/\.rng$/i.test(c.uri)) grammars.invalidate(c.uri);
    recheckAll();
  });

  connection.onCompletion(async ({ textDocument, position, context }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc) return [];
    const { grammar } = await grammarOf(choiceOf(doc));
    if (!grammar) return [];
    const at = doc.offsetAt(position);
    const possible = possibleAt(grammar, doc.getText(), at);
    if (!possible) return [];
    const manual = context?.triggerKind !== CompletionTriggerKind.TriggerCharacter;
    // between tags elements are offered only on request, not on every space or quote
    if (!possible.inTag && !manual) return [];
    const range = { start: doc.positionAt(possible.from), end: position };
    return possible.suggestions.map((s, i): CompletionItem => {
      const item: CompletionItem = {
        label: s.label,
        // shown beside every entry of the list, as opm studio does; detail only in the expanded pane
        labelDetails: s.detail ? { description: s.detail } : undefined,
        detail: s.detail,
        documentation: s.info ? { kind: MarkupKind.PlainText, value: s.info } : undefined,
        sortText: String(i).padStart(5, '0'),
      };
      if (s.kind === 'element') {
        item.kind = CompletionItemKind.Class;
        item.textEdit = possible.inTag
          ? { range, newText: s.label }
          : { range, newText: `<${s.label}>$0</${s.label}>` };
        if (!possible.inTag) { item.insertTextFormat = InsertTextFormat.Snippet; item.filterText = s.label; }
      } else if (s.kind === 'attribute') {
        item.kind = CompletionItemKind.Property;
        item.textEdit = { range, newText: `${s.label}="$1"` };
        item.insertTextFormat = InsertTextFormat.Snippet;
        item.command = { title: 'Suggest values', command: 'editor.action.triggerSuggest' };
      } else {
        item.kind = CompletionItemKind.Value;
        item.textEdit = { range, newText: s.label };
      }
      return item;
    });
  });

  connection.languages.onLinkedEditingRange(({ textDocument, position }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc) return null;
    const ranges = matchingTags(doc.getText(), doc.offsetAt(position));
    if (!ranges) return null;
    return {
      ranges: ranges.map(r => ({ start: doc.positionAt(r.from), end: doc.positionAt(r.to) })),
      wordPattern: '[^\\s<>/="\']+',
    };
  });

  connection.onDocumentSymbol(({ textDocument }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc) return [];
    const text = doc.getText();
    let symbols: OutlineSymbol[];
    try {
      symbols = isOdd(doc.uri) ? oddOutline(text) : vocabulary(text) === 'tei' ? teiOutline(text) : elementOutline(text);
    } catch {
      return [];
    }
    const convert = (s: OutlineSymbol): DocumentSymbol => ({
      name: s.name || ' ',
      detail: s.detail,
      kind: s.kind as DocumentSymbol['kind'],
      range: { start: doc.positionAt(s.from), end: doc.positionAt(s.to) },
      selectionRange: { start: doc.positionAt(s.nameFrom), end: doc.positionAt(s.nameTo) },
      children: s.children.map(convert),
    });
    return symbols.map(convert);
  });

  // Expand Selection steps through the enclosing elements
  connection.onSelectionRanges(({ textDocument, positions }) => {
    const doc = documents.get(textDocument.uri);
    if (!doc) return [];
    const text = doc.getText();
    return positions.map(position => {
      const at = doc.offsetAt(position);
      // built from the outermost element in, so each range's parent is the next larger one
      let range: SelectionRange | undefined;
      for (const e of elementsAround(text, at).reverse()) {
        range = { range: { start: doc.positionAt(e.from), end: doc.positionAt(e.to) }, parent: range };
      }
      return range ?? { range: { start: position, end: position } };
    });
  });

  connection.onRequest(ALLOWED_ELEMENTS, async ({ uri, offset }: { uri: string; offset: number }) => {
    const doc = documents.get(uri);
    if (!doc) return null;
    const { grammar } = await grammarOf(choiceOf(doc));
    if (!grammar) return null;
    // what may start here: the text before, as if an element were begun at offset
    const before = doc.getText().slice(0, offset);
    const possible = possibleAt(grammar, before, offset);
    if (!possible) return null;
    return possible.suggestions.filter(s => s.kind === 'element').map(s => ({ name: s.label, detail: s.detail }));
  });

  connection.onRequest(SCHEMA_FOR, ({ uri }: { uri: string }) => {
    const doc = documents.get(uri);
    return doc ? choiceOf(doc) : null;
  });

  documents.listen(connection);
  connection.listen();
}
