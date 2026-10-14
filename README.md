# Browser tools for delivery reporting

[![Check tools](https://github.com/cdtm88/xlsx2pptx/actions/workflows/check.yml/badge.svg)](https://github.com/cdtm88/xlsx2pptx/actions/workflows/check.yml)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![SheetJS](https://img.shields.io/badge/SheetJS-0.20.3-217346)
![PptxGenJS](https://img.shields.io/badge/PptxGenJS-3.12.0-C43E1C)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)
![Offline](https://img.shields.io/badge/runs-100%25_offline-555)

Single-file web tools for delivery work. Each one is a self-contained `.html`
file: open it from disk in any modern browser. No server, no install, no network
requests. Your data never leaves the machine.

## Tools

| Tool | What it does |
|---|---|
| [`delivery-plan.html`](delivery-plan.html) | Turns an Excel delivery plan into a PowerPoint Gantt chart. |
| [`waqti-exceptions.html`](waqti-exceptions.html) | Checks a Waqti timesheet export against approved demands and drafts the correction email. |
| [`waqti-demand-summary.html`](waqti-demand-summary.html) | Summarises a Waqti export as hours per demand, person and feature. |
| [`project-cost-tracker.html`](project-cost-tracker.html) | Tracks a project's spend, burn-up and forecast against its estimate. |
| [`pi-planning-capacity.html`](pi-planning-capacity.html) | Works out each team's real sprint capacity for a PI after leave and holidays. |
| [`vendor-spend-tracker.html`](vendor-spend-tracker.html) | Tracks vendor estimates, POs and invoices against annual budgets. |

Full behaviour of every tool is in [`docs/tools.md`](docs/tools.md).

## Quick start

1. Download the `.html` file you need.
2. Open it in Chrome, Edge, Firefox or Safari.
3. Drop in your spreadsheet, or start from scratch.

## Report Kit and design

Every tool is built on the **Report Kit**, a shared foundation in
[`framework/`](framework/README.md) that keeps the tools looking and behaving
the same.

| Part | What it is |
|---|---|
| [`report-kit-2.css`](framework/report-kit-2.css) | The current design language: header, stat cards, tables, dialogs, drawer and chips. |
| [`report-kit.js`](framework/report-kit.js) | Shared runtime (`window.RK`): file loading, clipboard, storage, dialogs, sorting and the rules JSON module. |
| [`DESIGN.md`](framework/DESIGN.md) | Principles, tokens, components and a checklist for new tools. |
| [`starter.src.html`](framework/starter.src.html) | A small working page to copy when starting a new tool. |
| [`report-kit.css`](framework/report-kit.css) | Kit 1, frozen. Kept for older tools; not for new ones. |

The design in short: answer first, numbers in mono, colour only for status,
quiet chrome, keyboard accessible, and offline enforced by a strict
Content-Security-Policy. [`vendor-spend-tracker.html`](vendor-spend-tracker.html)
is the reference implementation.

## Contributing

The shipped `.html` files are built from `reports/*.src.html` and the Report
Kit. Don't edit them by hand.

```sh
python3 framework/build.py          # rebuild every tool
python3 framework/build.py --check  # verify built files are current
node tests/smoke.cjs                # headless smoke test (needs Playwright)
```

CI runs both checks on every pull request. New tools start from the starter page
and follow [`DESIGN.md`](framework/DESIGN.md).

## Repository layout

| Path | Contents |
|---|---|
| `*.html` | The built tools, ready to open |
| `reports/` | Source for each tool |
| `framework/` | Report Kit, vendored libraries and the build script |
| `docs/` | Tool guides, rules and design notes |
| `tests/` | Smoke test and fixtures |
| `assets/` | Logos, favicon and the blank delivery-plan Excel template |
| `BACKLOG.md` | Known bugs and refactors, prioritised |
