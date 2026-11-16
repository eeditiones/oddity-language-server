# oddity-language-server

RELAX NG validation and schema-aware completion for TEI documents and ODDs, as a
language server. Used by the ODDity VS Code extension.

Completion only suggests elements and attributes that the schema allows at the
cursor position, and it respects their required order. For example, right after
`<TEI>` it suggests only `<teiHeader>`. Each suggestion shows the description
that the ODD provides for that element or attribute.

## Schema lookup

The language server tries to find the schema associated with a document by checking the following locations in order:

1. a local `.rng` named by the document's `<?xml-model?>`
2. for documents other than ODDs, `[editor] schema` in the nearest `opm.toml`
3. defaults by vocabulary: `schema/odd/teipublisher_odds.rng` for `.odd` files,
   and for documents recognised as TEI, DocBook or JATS `tei_all`, DocBook 5.2 or
   JATS 1.3 Archiving with MathML 3 (see `schema/README.md` for sources and licences)

An `<?xml-model?>` or `[editor] schema` naming one of these by its published URL
(e.g. the TEI's `tei_all.rng`) uses the bundled copy; other remote schemas are ignored.

If no schema can be determined, the language server still supports
well-formedness checks, an outline and tag renaming.

## Layout

- `src/core/`: editor-independent code (validation, completion, schema
  association, outline, tag matching), exported from `src/index.ts`.
  `validate.ts`, `complete.ts` and `toml.ts` come from opm studio.
- `src/server/server.ts`: the language server, independent of its transport.
- `src/node.ts`: Node entry (`--node-ipc` or `--stdio`), built to `dist/node.cjs`.
  `ODDITY_LS_SCHEMAS` points it at a `schema/` folder for the defaults; clients
  can pass `initializationOptions.defaultSchemas` instead.

Custom protocol: request `oddity/schemaFor { uri }` returns the schema in use;
notification `oddity/schemaChanged { uri, schema }` is sent when it changes.

## Development

    npm install
    npm test            # node --test, runs the TypeScript directly
    npm run check       # tsc
    npm run build       # dist/
    npm run schemas     # regenerate schema/ (opm compiles teipublisher_odds.odd from jinks)

`npm run schemas` looks for jinks in `$JINKS_DIR`, `../../apps/tei-publisher/jinks`
or `../jinks`, and falls back to GitHub.
