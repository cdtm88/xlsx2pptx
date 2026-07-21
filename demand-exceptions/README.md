# demand-exceptions (planning + fixtures)

Reviewed spec and test fixtures for the **demand-exceptions** tool: a single offline HTML
file that takes a timesheet export plus a per-person approved-demand allowlist and produces
a copy-paste email listing every booking made against a demand the person is not approved
for.

The tool is built and lives at the repo root as **`../waqti-exceptions.html`**. This folder
holds the reviewed brief, the review, and the verified test data the tool is checked
against. It follows the same single-file, inline-vendored, fully-offline pattern as
`../delivery-plan.html` in this repo.

## Verifying the build

Open `../waqti-exceptions.html` directly from disk (works over `file://`, offline). Drop a
fixture from `fixtures/`, import `fixtures/rules.fixture.json`, and compare against
`fixtures/EXPECTED.md`. Both fixtures were run through the built tool's `parseExport` /
`applyRules` / `buildEmail` functions and reproduce `EXPECTED.md` exactly, with zero
network requests and injected script payloads rendered inert.

## Contents

| File | What it is |
|---|---|
| `build-brief.md` | The build brief, revision 1.1 (reviewed and disambiguated). Build against this. |
| `REVIEW.md` | The PRD review: verification run, findings, and every change made in 1.1. |
| `fixtures/rules.fixture.json` | Approved-demand allowlist for the four sample staff. |
| `fixtures/staff-details-sample.xlsx` | Sample timesheet export (dummy data). Happy path. |
| `fixtures/staff-details-edge.xlsx` | Sample plus one unmatched staff ID and two invalid hour cells. Exercises quarantine and the data-quality panel. |
| `fixtures/EXPECTED.md` | Deterministic expected outputs for both workbooks. Re-run after any parsing or matching change. |

## Quick truth check

- Sample: 61 bookings, 1 excluded, 4 exception lines, 6.0 hours, 2 staff, 0 unmatched.
- Edge: same 4 exception lines and 6.0 hours, but 1 unmatched staff (`S100505`) and 2
  data-quality rows (spreadsheet rows 8 and 11); total parsed hours drop to 92.5.

The exception lines are identical across both files by design: unmatched staff and invalid
hours must change the banners and totals but never the exception engine.
