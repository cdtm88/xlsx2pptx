# Report Kit

A tiny shared foundation for the browser report tools in this repo, so every
report looks the same, reads the same rules files, and is easy to build — while
each shipped report stays a **single, fully-offline `.html`** with no server,
no build step *for the user*, and no external requests.

## What's here

| File | Role |
|---|---|
| `report-kit.css` | The design system: tokens, cards, buttons, pills, tables (light header), upload zone, KPIs, the staff-name editor, callouts. |
| `report-kit.js` | `window.RK` — DOM/format helpers, file download, namespaced `localStorage`, clipboard (rich HTML + text), upload wiring, xlsx plumbing, the **rules JSON module**, and the reusable **staff-name editor**. |
| `vendor/sheetjs.js` | The vendored SheetJS mini build (read-only), inlined where a report reads `.xlsx`. One copy for all reports. |
| `build.py` | The inliner. Turns a `reports/<name>.src.html` into the shipped single-file `<name>.html`. |

## How a report is built

Reports are authored as **source** files under `reports/`. A source is normal
HTML with `@include` directives that the inliner replaces with file contents:

```html
<style>
/*@include framework/report-kit.css@*/
/* ...report-specific styles here... */
</style>
...
<script>
/*@include framework/vendor/sheetjs.js@*/
</script>
<script>
/*@include framework/report-kit.js@*/
</script>
<script> /* ...report app code, using window.RK... */ </script>
```

An optional first-line `<!-- @out: <path> -->` sets the output file (otherwise
`reports/foo.src.html` → `foo.html` at the repo root).

Build everything, or one report:

```
python3 framework/build.py                       # all reports/*.src.html
python3 framework/build.py reports/foo.src.html
python3 framework/build.py --check               # fail if any committed .html is stale
```

The built `.html` at the repo root is what users open and what ships. Always
rebuild after editing a source or a kit file, and commit both. `--check` is
there to catch a forgotten rebuild.

## What belongs in the kit vs a report

- **Kit** = anything shared: the look, the upload/parse plumbing, the rules
  JSON contract, the staff-name editor, clipboard/download.
- **Report** = what makes it that report: which columns it reads, how it
  aggregates, and how it draws its result (e.g. demand tables, a Gantt slide).

Keep report-specific CSS in the report's own `<style>` block, after the kit
include, using report-specific class names so it never collides with the kit.

## Rules JSON — compatibility contract

All tools that use an allowlist/name file share one schema, read and written by
`RK.rules`:

```json
{
  "schemaVersion": 1,
  "generatedAt": "…",
  "label": "…",
  "staff": { "S100404": { "name": "Steve D", "approvedDemands": ["PVE9001001"] } }
}
```

`RK.rules` enforces these rules so files stay interchangeable across reports and
across versions:

- **Case-insensitive staff IDs.** Keys are normalised to uppercase on read
  (`RK.rules.normId`), so `s100404` and `S100404` are the same person. Reports
  should uppercase the Staff ID they read from the spreadsheet too.
- **Backward compatibility.** `schemaVersion: 1` always loads. When the schema
  grows, bump `RK.rules.SCHEMA_VERSION` and keep parsing every older version.
- **Forward compatibility.** A file with a *newer* `schemaVersion` loads with a
  warning instead of being rejected, and any fields a tool doesn't recognise —
  extra top-level keys, or extra keys inside a staff entry — are **retained and
  written back out** unchanged by `RK.rules.serialise`. So a file edited in an
  older report doesn't lose data a newer report added.
- **Optional fields.** `name` and `approvedDemands` are both optional per entry
  (a names-only file is valid); when present they're type-checked.

### Versioning policy

- Additive changes (new optional fields) do **not** need a version bump —
  forward-compat retention covers them.
- A breaking change (renaming/removing a field, changing a meaning) bumps
  `SCHEMA_VERSION`; the parser must still accept all prior versions and migrate.
- Never repurpose an existing field. Add a new one.

## Adding a new report

1. Copy `reports/waqti-demand-summary.src.html` as a starting point.
2. Keep the header/card structure and the kit includes; change the title,
   the columns (`RK.xlsx`), and the rendering.
3. Reuse `RK.rules` + `RK.NameEditor` for anything staff/name related, and
   `RK.clipboard` for a copy button.
4. `python3 framework/build.py reports/<name>.src.html`, then open the built
   file and (ideally) drive it headless before shipping.
