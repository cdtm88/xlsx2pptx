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
5. **Colour means state.** Teal is the brand and "selected". Green / yellow / red
   are reserved for status (fine / watch / act) and appear as `status-pill`s, never
   as decoration. A legend sits next to anything that uses fills, and the fills
   must match the legend exactly.
6. **Quiet chrome.** White panels on a `#F6F7F7` page, 1px `--border` lines,
   10px card radius, 6px control radius, no heavy shadows except on dialogs.
7. **Keyboard and screen reader work.** Every clickable thing is a `button` or
   has `role="button"` + `tabindex="0"` + Enter/Space. Dialogs move focus in,
   trap it, close on Escape and return focus (all done by `RK.modal`). `/`
   focuses search (`RK.searchShortcut`).
8. **Single file, offline, enforced.** No external URLs, including icons: images
   are inlined as data URIs. The starter's `Content-Security-Policy` meta makes the
   browser refuse any network access, so keep it in every tool.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--teal` / `--accent` | `#00A9CE` | primary buttons, selected states, focus |
| `--teal-dark` / `--accent-dark` | `#007A99` | table header, links, solid bar segments |
| `--teal-tint` / `--teal-tint-border` | `#E6F6FA` / `#BFE6F0` | selected backgrounds, soft chips, pipeline fill |
| `--charcoal` / `--text` | `#1A1A1A` | body text |
| `--slate` | `#3D3D3D` | secondary text in cells |
| `--mid-grey` / `--text-dim` | `#6B6B6B` | labels, hints |
| `--dim-grey` | `#8C8C8C` | mono counts, timestamps |
| `--bg` / `--panel` | `#F6F7F7` / `#fff` | page / surfaces |
| `--border`, `--border-input`, `--divider`, `--track` | greys | lines, inputs, row rules, empty bar |
| `--green*`, `--yellow*`, `--red*` | | status only |
| `--font-ui`, `--font-mono` | Segoe UI stack, ui-monospace stack | |

Type scale (px): 22 page headline, 20 settings title, 18 dialog/drawer title,
16 panel title, 14 body, 13 controls and cells, 12 secondary, 11 labels
(uppercase, letter-spaced) and pills.

## Components

| Class(es) | What it is |
|---|---|
| `.wrap` | page container, max 1400px |
| `.app-header`, `.app-logo`, `.app-logo-mark`, `.app-nav`, `.app-nav-item`, `.app-header-spacer`, `.app-search`, `.search-hint-key` | header bar; collapses into ordered rows on narrow screens |
| `button`, `.primary`, `.danger`, `.danger-fill`, `.small`, `.icon-btn`, `.link-action` | buttons (icon-only buttons need an `aria-label`) |
| `.page-summary`, `-text`, `-sub`, `-main` | the one-line answer above the cards |
| `.legend`, `.legend-item`, `.legend-swatch` + `.swatch-solid` / `-hatched` / `-tint` | key for bar fills |
| `.stat-grid`, `.stat-card` (+ `.active`), `-name`, `-figure`, `-value`, `-of`, `-nums`, `-num` (+ `.neg`) | grid of headline cards; make them filters with `role="button"` |
| `.bar-track`, `.bar-fill` + `.solid` / `.hatched` / `.tint` / `.status-*`, `.bar-limit` | stacked bar. **Scale every segment to one maximum** (`max(limit, total)`) and put `.bar-limit` at `limit / max` |
| `.row-bar-cell`, `.row-bar-track`, `.row-bar-fill` | thin inline bar in a list row |
| `.status-pill` + `.pill-green` / `-yellow` / `-red` / `-teal` / `-grey` | state labels |
| `.toolbar`, `.toolbar-spacer`, `.seg-tabs`, `.seg-tab` (+ `.active`), `.seg-tab-count`, `.filter-chip` (+ `.warn`, `.active`), `.filter-chip-x`, `.toolbar-select`, `.list-meta` | list controls: tabs with counts, removable filter chips, a count on the right |
| `.table-container`, `table` (+ `.fixed`), `th[data-sort]`, `.sort-arrow`, `tr.clickable`, `td.wrap-cell`, `.cell-title`, `.cell-sub`, `td.amt`, `.amt-wrap`, `.amt-value`, `.amt-native`, `td.row-actions`, `.row-action-btn`, `.row-done-label`, `.empty-state` | data table with a sticky dark header. Never put `display:flex` on a `td`; wrap the content in a `div` |
| `.steps`, `.steps-top`, `.steps-label`, `.steps-count`, `.step-segs`, `.step-seg` | position in a fixed workflow (`RK.stepSegs`) |
| `.step-track`, `-seg`, `-bar`, `-label` (+ `.done`, `.target`) | larger labelled workflow track for a "move to next step" dialog |
| `.settings-header`, `.settings-nav`, `.settings-nav-item`, `-label`, `-count`, `.settings-content` (+ `.wide`), `.settings-panel-head` | settings view |
| `.setting-row`, `-label`, `.label-text`, `.label-hint`, `-control`, `.unit-suffix` | label left, control right |
| `.settings-table`, `.settings-table-row` (+ `.header`), `.col-num`, `.col-actions`, `[data-label]` | light grid list; stacks on phones using `data-label` |
| `.avatar-chip`, `.entity`, `.entity-text`, `.entity-name`, `.entity-sub` | a named thing with initials |
| `.modal-overlay`, `.modal` (+ `.modal-compact`), `.modal-lead`, `.modal-actions` (+ `.start`), `.field`, `.field-row`, `.field-row-3`, `.hint`, `.callout` (+ `.warn`, `.danger`) | dialogs and forms |
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
| `footer`, `.strapline`, `.app-version` | footer line, version in mono |

## Runtime (`window.RK`, kit 1.2.0)

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
- [ ] Rows open a drawer; New / Edit open a dialog through `RK.modal`
- [ ] Everything clickable works with Enter and Space; icon buttons have `aria-label`
- [ ] Empty states say why they are empty (nothing yet vs. filtered out)
- [ ] Works at phone width (header groups wrap in order, grids stack)
- [ ] Version shown in Settings (`.app-version`), semver, bumped on release
- [ ] Report-specific CSS is short and prefixed; anything reusable goes into the kit instead
