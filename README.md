# Browser tools for Excel exports

A small collection of **single-file, fully offline** web tools that turn an Excel
export into something shareable. Each tool is one self-contained `.html` file:
open it directly from disk in any modern browser. Libraries (SheetJS, and
PptxGenJS where needed) are vendored inline, so there is no server, no build
step, and no network requests — your data never leaves the machine.

## Tools

| File | Turns | Into |
|---|---|---|
| [`delivery-plan.html`](delivery-plan.html) | an Excel delivery plan | a PowerPoint Gantt-chart slide (`.pptx`) |
| [`waqti-exceptions.html`](waqti-exceptions.html) | a Waqti timesheet export + an approved-demand allowlist | a copy-paste correction email |
| [`waqti-demand-summary.html`](waqti-demand-summary.html) | a Waqti timesheet export | an on-screen per-demand summary of hours by person and feature |

Common to all: a single HTML file, inline-vendored libraries, works over `file://`
with the network off, and brand-consistent styling.

---

## `delivery-plan.html`

Drag in an Excel delivery plan (or start from the built-in blank template),
adjust the title, dates, sprint range, and which tasks are shown, then download
a PowerPoint Gantt-chart slide. Bars are coloured by status or a single colour,
grouped into category swimlanes, with a proportional "Today" marker and
PowerPoint-safe margins.

## `waqti-exceptions.html`

Drop a Waqti timesheet export, apply a per-person approved-demand allowlist
(`rules.json`, built or imported in **Settings**), and get a copy-paste email.
Rows are sorted into a few tables — bookings against a demand the person isn't
approved for, rows that need attention in Waqti, and staff with no time logged —
following the classification rules in `Exception_Rules.md`. Untick any row to
leave it out, then copy the email as rich HTML or plain text.

## `waqti-demand-summary.html`

Drop the same Waqti export and read it on-screen: pick one or more demands and
see who booked how many hours to which feature under each. Copy the selected
tables to the clipboard (rich HTML plus plain text) for pasting into an email or
doc. Staff names can be mapped from the same `rules.json` or typed by hand.

---

## Building (for contributors)

The shipped `.html` files are **built**, not hand-edited. They're assembled from
a shared **Report Kit** (design system + rules-JSON module + vendored libraries)
so every tool looks and reads the same, while each shipped file stays a single
offline page.

- Shared code lives in [`framework/`](framework/README.md).
- Each report's source lives in `reports/<name>.src.html` and pulls the shared
  code in with `@include` directives.
- Build with `python3 framework/build.py` (or `--check` to verify the committed
  `.html` files are up to date). Edit the source or the kit, rebuild, commit both.

End users never build anything — they just open the `.html`. See
[`framework/README.md`](framework/README.md) for the authoring guide and the
rules-JSON compatibility/versioning policy.

## Files

- `delivery-plan.html` — delivery-plan to PPTX tool
- `waqti-exceptions.html` — timesheet exceptions to email tool
- `waqti-demand-summary.html` — timesheet demand summary (view online)
- `framework/` — the shared Report Kit + the inliner (`build.py`)
- `reports/` — the `*.src.html` sources the tools are built from
- `assets/` — logo variants, favicon, and the blank delivery-plan Excel template
