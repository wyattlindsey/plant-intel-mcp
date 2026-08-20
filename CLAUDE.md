# Working in this repo

An MCP server giving agents structured plant data for garden planning. Read
`README.md` first for what it does; this file is about how to change it.

## Layered on purpose

```
domain/     pure logic and types -- no I/O, no Node imports
mappers/    upstream payload -> domain record; pure, fixture-tested
sources/    API clients; take injected fetch + cache
cache/      the Cache interface (portable) and its file implementation (not)
tools/      MCP tool registration and argument handling
services.ts the only place that reaches for the filesystem or global fetch
```

**Keep `domain/`, `mappers/`, and `sources/` free of Node imports.** They must
run unchanged in a browser or a Cloudflare Worker so the planned demo can reuse
the real logic instead of reimplementing it. `cache/json-file-cache.ts`,
`config.ts`, and `services.ts` are the deliberate exceptions.

## Conventions

- TypeScript ESM, Node >=20, native `fetch`. Runtime deps are `@modelcontextprotocol/sdk`
  and `zod` only -- adding a third needs a reason.
- Relative imports carry the `.js` extension (NodeNext resolution).
- `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are on.
  Build conditional objects with `...(x === undefined ? {} : { x })`.
- Conventional commits, one focused change each. Every commit should leave
  `npm test`, `npm run typecheck`, and `npm run build` green.

## The rules that matter

**Never let an upstream tier placeholder reach the model.** Perenual's free
tier substitutes upgrade prompts into fields it withholds. `isTierGated` in
`mappers/perenual.ts` catches them by pattern, not by literal string, because
the wording is undocumented and has changed. If you add a field to
`PERENUAL_DETAIL_FIELDS`, route it through `field()`.

**Say what is missing.** A null with no explanation reads as "zero" or "none".
`PlantProfile.notes` and the `caveats` arrays exist to make absence legible --
which fields a tier withheld, that a neutral companion verdict is absence of
evidence rather than compatibility, that Permapeople was never consulted.

**Never invent horticultural data.** No source in the roster publishes
spacing, days-to-maturity, or frost-hardiness class. Those stay null or become
caller-supplied inputs. Deriving a companion verdict from a stated mechanism is
fine; restating folklore is not.

**Errors are for the model.** Throw `ToolError` with a `remedy` naming the
concrete fix. Stack traces never reach a transcript.

**Charge the quota only for real network calls.** Cache hits are free. The
`onNetworkRequest` hook in `sources/http.ts` is what enforces that.

## Testing

- Mappers and domain logic: pure unit tests, fixtures in `test/fixtures/`.
- Tools: driven through a real MCP client over an in-memory transport
  (`test/helpers/harness.ts`), so the protocol path is exercised, not just the
  handler.
- `test/live/` is opt-in via `npm run test:live` and burns real quota. Its job
  is drift detection: the fixtures came from published documentation, so the
  live suite asserts the mapper's field assumptions still hold upstream.

When you touch a mapper, add the awkward real-world case to the fixture rather
than writing a test that only proves the happy path.
