# Fixtures

Recorded and doc-derived API responses used by the mapper tests.

- `perenual-species-list.json`, `perenual-species-details-*.json` are derived
  from the example bodies published at <https://perenual.com/docs/api>.
- The free-tier fixture reproduces the *shape* of tier gating. The exact
  sentinel wording Perenual substitutes into withheld fields is not published,
  so the sanitizer matches a family of upgrade-prompt patterns rather than one
  literal string, and `test/live/` asserts against the real response.

When a real key is available, re-record these from live responses and keep the
gating fixture in place -- it is the regression test for the one failure mode
that would otherwise put marketing copy into a model's context.
