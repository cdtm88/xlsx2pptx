# Report Kit 2: design language

The look and behaviour every new tool in this repo should follow. It was taken
from [`vendor-spend-tracker.html`](../vendor-spend-tracker.html), which is the
reference implementation: when this document and that tool disagree, the tool
wins and this document gets fixed.

- **Styles:** [`report-kit-2.css`](report-kit-2.css)
- **Runtime:** the kit 2 helpers in [`report-kit.js`](report-kit.js) (`RK.modal`,
  `RK.confirm`, `RK.sortable` and friends, listed below)
- **Starting point:** [`starter.src.html`](starter.src.html), a small working
  page that uses every main part. Copy it to `reports/<name>.src.html`.

`report-kit.css` (v1) is frozen. It stays only so the tools already built on it
keep their look. Do not include both stylesheets in one page: kit 2 styles bare
`button`, `input`, `select` and `table` elements.

## Principles

1. **Answer first.** The page opens on the result, not the set-up. A one-line
   `page-summary` states the headline ("AED 682,245 of AED 800,000 committed or
   invoiced"), then the cards, then the detail. Set-up lives in **Settings**.
2. **Two views, one header.** Main view and Settings, switched by underline tabs
   in the header (`app-nav`). Search, secondary actions and one primary action
   sit on the right of the header. Exactly one `button.primary` in the header.
3. **Detail in a drawer, edits in a dialog.** Clicking a row opens a right-hand
   drawer (`.modal.drawer`) to read; Edit / New open a centred `.modal` to write.
   Never navigate away from the list.
4. **Numbers are mono.** Every money figure, percentage, count and timestamp is in
   `--font-mono` with tabular figures. Words are in the UI font. Money is shown in
   the base currency first, with the native currency as a smaller grey line
   beneath (`amt-value` / `amt-native`).
5. **Colour means state.** Teal is the brand, used as fill; `--accent` marks
   interaction and "selected". Green / yellow / red are reserved for status
   (fine / watch / act) and appear as `status-pill`s, never as decoration. A legend
   sits next to anything that uses fills, and the fills must match the legend
   exactly.
6. **Quiet chrome.** `--panel` surfaces on a `--bg` page, 1px `--border` lines,
   `--radius-card` cards, `--radius-control` controls, no heavy shadows except on
   dialogs. Gaps, padding and margins come from the `--space-*` scale.
7. **Everyone can use it.** Every clickable thing is a `button` or has
   `role="button"` + `tabindex="0"` + Enter/Space. Dialogs move focus in, trap it,
   close on Escape and return focus (all done by `RK.modal`). `/` focuses search
   (`RK.searchShortcut`). Text meets 4.5:1 in both themes, field edges and focus
   rings 3:1; controls grow to 40px on touch screens; transitions stop under
   `prefers-reduced-motion`.
8. **Single file, offline, enforced.** No external URLs, including icons: images
   are inlined as data URIs. The starter's `Content-Security-Policy` meta makes the
   browser refuse every request and load to the network (fetch, images, scripts,
   beacons), so keep it in every tool. It cannot stop the page navigating away, and
   it allows inline script, so escaping text with `RK.esc` stays the real defence
   against injected markup.
9. **Signed off.** Every tool ends with the same sign-off line in its footer,
   "Dreamt up by Christian, built with Claude: a human and AI double act 🤝".
   It lives once, in [`signoff.html`](signoff.html), and a page pulls it in with
   `<!--@include framework/signoff.html@-->` inside its `footer`, so changing it
   there changes every tool on the next build. The starter already has it; keep
   it in one footer that shows on every view. `tests/smoke.cjs` fails any built
   tool without it.

## Tokens

Colour comes in two layers. The **palette** (`--teal`, `--teal-dark`,
`--teal-deep`, `--teal-tint`, `--teal-tint-border`, `--charcoal`, `--slate`, the
greys) holds brand constants that never change. **Roles** say what a colour is for
and switch with the theme. Rules, in the kit and in a report's own CSS, use roles
only: never palette names or raw hex.

| Role | Light value | Use |
|---|---|---|
| `--bg` / `--panel` | `#F6F7F7` / `#fff` | page / surfaces |
| `--surface-quiet` / `--surface-zebra` | light-grey / lighter-grey | quiet fills (grey pills, disabled controls, currency tags) / zebra rows |
| `--border`, `--border-input`, `--divider`, `--track`, `--seg-track` | greys | decorative lines, field edges (3:1), row rules, empty bar, seg-tab track |
| `--text`, `--heading` | charcoal `#1A1A1A` | body text and headings |
| `--text-secondary` | slate `#3D3D3D` | secondary text in cells |
| `--text-dim` | mid-grey `#6B6B6B` | labels, hints |
| `--text-faint` | dim-grey `#6E6E6E` | small mono counts and timestamps |
| `--accent` / `--accent-hover` | teal-dark `#007694` / teal-deep `#005F77` | primary buttons, focus, selected borders, links and accent text / primary hover |
| `--accent-tint` / `--accent-tint-border` | `#E6F6FA` / `#BFE6F0` | selected backgrounds, soft chips |
| `--on-accent` | `#fff` | text on accent and red fills |
| `--inverse` / `--on-inverse` | charcoal / `#fff` | the toast, the active preset chip |
| `--table-head` / `--table-head-hover` / `--on-table-head` | teal-dark / teal-deep / `#fff` | sticky table header |
| `--bar-done` / `--bar-planned` | teal-dark / `#BFE6F0` | solid and planned bar segments; hatched in-flight uses brand `--teal` |
| `--green*`, `--yellow*`, `--red*`, `--red-hover`, `--red-soft` | | status only |
| `--font-ui`, `--font-mono` | Segoe UI stack, ui-monospace stack | |

Also `--space-2` to `--space-60`, `--radius-*`, the size tokens
(`--control-height`, `--dialog-width`, `--touch-target`…) and the shadows, including
`--focus-line` (a 2px accent ring with a 2px gap) and `--focus-halo` (inputs).

**Dark theme.** Every role has a dark value. Tools are light by default; a tool
opts in with `data-theme="dark"` on `<html>` (set it from
`matchMedia("(prefers-color-scheme: dark)")` in the first inline script to follow
the operating system) and changes its `color-scheme` meta to `light dark`. Check the
tool's own CSS uses roles first, or those parts will stay light.

Type scale, in `rem` (1rem = 16px) so a reader's browser text size is respected:
28 stat figure, 20 page headline and settings title, 16 dialog, drawer and panel
titles, 14 body, 13 controls and cells, 12 secondary text, pills, counts and
timestamps, and 11 for uppercase, letter-spaced labels only. Nothing in sentence
case is smaller than 12px. Line height is 1.5 for body text and hints, 1.3 for
headings and controls, 1.4 for table cells.

## Components

| Class(es) | What it is |
|---|---|
| `.wrap` | page container, max 1400px |
| `.app-header`, `.app-logo`, `.app-logo-mark`, `.app-nav`, `.app-nav-item`, `.app-header-spacer`, `.app-search`, `.search-hint-key` | header bar; collapses into ordered rows on narrow screens |
| `button`, `.primary`, `.danger`, `.danger-fill`, `.small`, `.icon-btn`, `.link-action` (+ `.inline` inside a sentence), `a` | buttons (icon-only buttons need an `aria-label`; disabled ones turn grey rather than fading); links are underlined |
| `.page-summary`, `-text`, `-sub`, `-main` | the one-line answer above the cards |
| `.legend`, `.legend-item`, `.legend-swatch` + `.swatch-solid` / `-hatched` / `-tint` | key for bar fills |
| `.stat-grid`, `.stat-card` (+ `.active`), `-name`, `-figure`, `-value`, `-of`, `-nums`, `-num` (+ `.neg`) | grid of headline cards; make them filters with `role="button"` |
| `.bar-track`, `.bar-fill` + `.solid` / `.hatched` / `.tint` / `.status-*`, `.bar-limit` | stacked bar. **Scale every segment to one maximum** (`max(limit, total)`) and put `.bar-limit` at `limit / max` |
| `.row-bar-cell`, `.row-bar-track`, `.row-bar-fill` | thin inline bar in a list row |
| `.status-pill` + `.pill-green` / `-yellow` / `-red` / `-teal` / `-grey` | state labels |
| `.toolbar`, `.toolbar-spacer`, `.seg-tabs`, `.seg-tab` (+ `.active`), `.seg-tab-count`, `.filter-chip` (+ `.warn`, `.active`), `.filter-chip-x`, `.toolbar-select`, `.list-meta` | list controls: tabs with counts, removable filter chips, a count on the right |
| `.table-container`, `table` (+ `.fixed`), `th[data-sort]`, `.sort-arrow`, `tr.clickable`, `td.nowrap`, `.cell-title`, `.cell-sub`, `td.amt`, `.amt-wrap`, `.amt-value`, `.amt-native`, `td.row-actions`, `.row-action-btn`, `.row-done-label`, `.empty-state` | data table with a sticky dark header. Text cells wrap; `td.num`, `td.amt`, `td.row-actions` and `td.nowrap` stay on one line (`td.wrap-cell` is now the default and kept for old markup). Never put `display:flex` on a `td`; wrap the content in a `div` |
| `.steps`, `.steps-top`, `.steps-label`, `.steps-count`, `.step-segs`, `.step-seg` | position in a fixed workflow (`RK.stepSegs`) |
| `.step-track`, `-seg`, `-bar`, `-label` (+ `.done`, `.target`) | larger labelled workflow track for a "move to next step" dialog |
| `.settings-header`, `.settings-nav`, `.settings-nav-item`, `-label`, `-count`, `.settings-content` (+ `.wide`), `.settings-panel-head` | settings view |
| `.setting-row`, `-label`, `.label-text`, `.label-hint`, `-control`, `.unit-suffix` | label left, control right |
| `.settings-table`, `.settings-table-row` (+ `.header`), `.col-num`, `.col-actions`, `[data-label]` | light grid list; stacks on phones using `data-label` |
| `.avatar-chip`, `.entity`, `.entity-text`, `.entity-name`, `.entity-sub` | a named thing with initials |
| `.modal-overlay`, `.modal` (+ `.modal-compact`, `.modal-wide`), `.modal-lead`, `.modal-actions` (+ `.start`), `.field`, `.field-row`, `.field-row-3`, `.hint`, `.callout` (+ `.ok`, `.warn`, `.danger`) | dialogs and forms; `.modal-wide` (980px) is for a dialog that holds a table |
| `.drawer-overlay`, `.drawer`, `.drawer-head`, `-head-top`, `-head-actions`, `-title-sub`, `-title`, `-close`, `-body`, `-section`, `-section-label`, `-foot` | right-hand detail drawer |
| `.figure-strip`, `.figure-box`, `.figure` | three headline figures in a bordered strip |
| `.detail-grid`, `.detail-label`, `.detail-value` | read-only key/value pairs |
| `.dist-row`, `.dist-label`, `.dist-count` | small ranked distribution |
| `.list-row`, `-main`, `-title`, `-sub`, `-figure`, `.muted-empty` | compact clickable list inside a drawer |
| `.tl-row`, `.tl-rail`, `.tl-dot` (+ `.note`), `.tl-line`, `.tl-body`, `.tl-title`, `.tl-time`, `.tl-text` | activity timeline: solid dot for system events, hollow for notes |
| `.chip-row`, `.chip` (+ `.active`) | choices that drive a hidden select (`RK.chipsFromSelect` + `.select-hidden-visually`) |
| `.preset-row`, `.preset-chip` | presets such as date ranges (active = charcoal) |
| `.quick-chip-row`, `.quick-chip` | quick-fill values such as 25% / 50% / 100% |
| `.amt-input-box`, `.amt-input-tag` | money input with its currency; a `.chip-row` inside it becomes a currency switch |
| `.impact-box`, `.impact-head`, `.impact-title`, `.impact-pct` | live "what this does to the total" preview inside a form |
| `.option-cards`, `.option-card`, `-title`, `-desc` | radio cards, e.g. export format |
| `.date-pair` | two date fields side by side |
| `.upload-area` (+ `.dragover`), `.big`, `.or`, `label.field` | file drop zone for `RK.upload`; `label.field` is what `RK.xlsx.renderMapper` emits |
| `.toast` (+ `.on`) | short confirmation at the foot of the screen, made by `RK.toast` |
| `footer`, `.signoff`, `.strapline`, `.app-version` | footer: the shared sign-off line (`framework/signoff.html`, principle 9), the offline strapline, and the version in mono |

## Runtime (`window.RK`, kit 1.4.0)

| Helper | Does |
|---|---|
| `RK.modal(overlay, { onClose })` | wires a `.modal-overlay`: role/aria, focus moved in on `open()`, Escape, Tab trap, focus returned on close, backdrop click closes only if nothing was typed. Returns `{ open(opener?), close(), markClean(), isOpen() }` |
| `RK.confirm(message, onConfirm, { okLabel, title, danger })` | in-page confirm dialog; builds its own markup |
| `RK.chipsFromSelect(select, row, labelFor?)` | chip buttons for a hidden select; returns `refresh()` |
| `RK.sortable(table, state, onSort)` | `th[data-sort]` click / Enter / Space flips `state.key` / `state.dir`, keeps `aria-sort` and arrows; returns `update()` |
| `RK.stepSegs(total, index)` | `.step-seg` HTML for `.step-segs` |
| `RK.searchShortcut(input, isActive?)` | `/` focuses the search box when nothing else has the keyboard |
| `RK.fmtNum2`, `RK.fmtWhole`, `RK.fmtMoney(n, ccy, whole?)` | number formatting |
| `RK.uid`, `RK.localDate(d)`, `RK.today()`, `RK.nowIso()` | ids and dates (local calendar day, not UTC) |
| `RK.csv.escape`, `.safeText`, `.fromRows`, `.BOM` | CSV that opens cleanly in Excel; `safeText` stops a text cell starting `=` `+` `-` `@`, tab or CR running as a formula |
| `RK.dict()`, `RK.has(o, k)` | a lookup with no prototype, and an own-key test: use them for anything keyed by file or user data |
| `RK.toast(message, ms?)` | shows a `.toast` and fades it after `ms` (default 2600); a new message replaces the one showing |
| `RK.fileDoc(opts)` | binds the page to one project file on disk (File System Access API) and writes every change into it: create, open, recent files, reconnect after a restart, one tab per file, stale-file and crash-copy handling, policy-block detection. The page supplies `serialise()` and `load(text)` and draws `status()` / `info()`; see the comment above it in `report-kit.js` and [`docs/storage-design.md`](../docs/storage-design.md). The UAT sign-off tracker and the project cost tracker use it; the UAT tracker is the simpler reference |
| `RK.download(filename, text, type)`, `RK.store(key)`, `RK.esc` | from kit 1, unchanged |

## Checklist for a new tool

- [ ] Started from `starter.src.html`; `report-kit-2.css` and `report-kit.js` included, nothing loaded from the network
- [ ] Favicon and logo mark are data URIs
- [ ] The offline `Content-Security-Policy` meta from the starter is in the head, unchanged
- [ ] Maps keyed by file data use `RK.dict()`; every text into HTML goes through `RK.esc`
- [ ] Has an entry in `tests/smoke.cjs` `FLOWS`, and `node tests/smoke.cjs` passes
- [ ] Page opens on a `page-summary` answer; set-up is under Settings
- [ ] Every figure is mono; money shows base currency first
- [ ] Bar fills match their legend and share one scale
- [ ] Status colours used only for status
- [ ] The tool's own CSS uses role and spacing tokens (`--text-secondary`, `--surface-quiet`, `--space-12`…), never palette names, raw hex or pixel gaps
- [ ] Rows open a drawer; New / Edit open a dialog through `RK.modal`
- [ ] Everything clickable works with Enter and Space; icon buttons have `aria-label`
- [ ] Empty states say why they are empty (nothing yet vs. filtered out)
- [ ] Works at phone width (header groups wrap in order, grids stack)
- [ ] Footer includes `framework/signoff.html` (the sign-off line) and shows on every view
- [ ] Version shown in Settings (`.app-version`), semver, bumped on release
- [ ] Report-specific CSS is short and prefixed; anything reusable goes into the kit instead
