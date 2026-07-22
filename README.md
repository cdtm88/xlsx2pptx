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

---

# Waqti Demand Summary

`waqti-demand-summary.html` is a second, self-contained page for viewing a
timesheet export online: pick one or more demands, and see who booked how many
hours to which feature under each. SheetJS is vendored inline, so it works fully
offline with no server and no external requests.

## Use it

1. Open **`waqti-demand-summary.html`** in any modern browser.
2. Drop in an `.xlsx` timesheet export (the same shape the Waqti Exceptions tool reads). Once loaded, the drop zone collapses to a **Replace file** bar.
3. Tick the demands you want in the multi-select list (nothing is selected to start). Use the filter box to narrow a long list; blank/uncoded demands are hidden.
4. Read the summary: one table per demand showing **Name**, **Feature**, and **Total Hours Booked**, aggregated per person and feature. Rows for the same person are grouped so the name appears once.

### Staff names (Settings)

Open **Settings** and import the same `rules.json` used by Waqti Exceptions to map each Staff ID to a display name. Only the `name` field is read (the approved-demand lists are ignored). Imported names take priority over any Name column in the export; unlisted staff fall back to the Name column, then the Staff ID. The imported names persist in the browser.

## Excel format

Row 1 holds the headers. The same column-mapping rules as Waqti Exceptions apply:

| Column | Meaning |
|---|---|
| Staff ID | Person identifier (required) |
| Work Day | Booking date (required) |
| Month | Period label, e.g. `June, 2026` (required) |
| Demand | `Code - Description`, split on the first ` - ` (required) |
| Feature | `Code - Description`, split on the first ` - ` (required) |
| Booked Hours | Numeric hours; non-numeric or negative values are flagged and excluded from totals (required) |
| Name | Display name (optional — falls back to Staff ID; also auto-detected from `Staff`/`Employee`/`Worker`/`Resource` headers) |
| Recharge Cost | Optional, not shown |

If some headers are not found automatically, a small mapper lets you match each
field to a column before confirming. Rows with an empty Staff ID are excluded.
