# Delivery Plan Generator

Turn an Excel delivery plan into a PowerPoint Gantt-chart slide — entirely in your browser.

`delivery-plan.html` is a single, self-contained page (SheetJS and PptxGenJS are
vendored inline, so it works fully offline with no server and no external requests).

## Use it

1. Open **`delivery-plan.html`** in any modern browser.
2. Drag in an `.xlsx` delivery plan — or click **Download blank template** to start from the provided workbook.
3. Adjust the title, start/today dates, sprint range, and which tasks are shown.
4. Preview the slide, then **Download PPTX**.

## Excel format

The template's columns (row 3 headers):

| Column | Meaning |
|---|---|
| Task / Milestone | Task name |
| Category | Optional grouping — tasks with the same value share a swimlane |
| Status | `Done`, `In Progress`, `Not Started`, `Blocked`, or `Milestone` |
| Start Sprint / End Sprint | Sprint labels, e.g. `Q2.1` |
| Milestone | Checkbox — renders the bar in the milestone colour |
| Notes | Free text (not shown on the slide) |
| Q2.1 … | Sprint columns; bars are computed from Start/End Sprint |

Row 1 holds the plan metadata (title, start sprint + date, and the "Now" sprint).
The blank template keeps all of its formatting, conditional formatting, and sheet
protection, so filled-in plans stay consistent.

## Features

- Sprint **range selector** and per-task selection; tasks outside the range (or with no dates) are listed, not silently dropped
- **Bar colour** by status or a single colour; milestones highlighted
- **Category swimlanes** with a coloured side band and dividers
- **Today** marker positioned proportionally by date
- PowerPoint-safe margins; branded, gradient-free styling

## Files

- `delivery-plan.html` — the app (open this)
- `assets/` — logo variants, favicon, and the blank Excel template
