# Browser tools for Excel exports

A small collection of **single-file, fully offline** web tools that turn an Excel
export into something shareable. Each tool is one self-contained `.html` file:
open it directly from disk in any modern browser. SheetJS (and PptxGenJS where
needed) are vendored inline, so there is no server, no build step, and no network
requests — your data never leaves the machine.

## Tools

| File | Turns | Into |
|---|---|---|
| [`delivery-plan.html`](delivery-plan.html) | an Excel delivery plan | a PowerPoint Gantt-chart slide (`.pptx`) |
| [`waqti-exceptions.html`](waqti-exceptions.html) | a Waqti timesheet export + an approved-demand allowlist | a copy-paste correction email |
| [`waqti-demand-summary.html`](waqti-demand-summary.html) | a Waqti timesheet export | an on-screen per-demand summary of hours by person and feature |

Common to all: a single HTML file, inline-vendored libraries, works over `file://`
with the network off, light theme, and brand-consistent styling.

---

## `delivery-plan.html` — delivery plan to Gantt slide

Turn an Excel delivery plan into a PowerPoint Gantt-chart slide, entirely in your browser.

1. Open **`delivery-plan.html`**.
2. Drag in an `.xlsx` delivery plan — or click **Download blank template** to start from the provided workbook.
3. Adjust the title, start/today dates, sprint range, and which tasks are shown.
4. Preview the slide, then **Download PPTX**.

**Excel format** — the template's columns (row 3 headers):

| Column | Meaning |
|---|---|
| Task / Milestone | Task name |
| Category | Optional grouping — tasks with the same value share a swimlane |
| Status | `Done`, `In Progress`, `Not Started`, `Blocked`, or `Milestone` |
| Start Sprint / End Sprint | Sprint labels, e.g. `Q2.1` |
| Milestone | Checkbox — renders the bar in the milestone colour |
| Notes | Free text (not shown on the slide) |
| Q2.1 … | Sprint columns; bars are computed from Start/End Sprint |

Row 1 holds the plan metadata (title, start sprint + date, and the "Now" sprint). The
blank template keeps its formatting, conditional formatting, and sheet protection.

**Features:** sprint range selector and per-task selection (out-of-range tasks are listed,
not silently dropped); bar colour by status or a single colour; category swimlanes with a
coloured side band; a proportional "Today" marker; PowerPoint-safe margins.

---

## `waqti-exceptions.html` — timesheet exceptions to email

Drop a Waqti timesheet export, apply a per-person approved-demand allowlist, and get a
copy-paste email listing every booking made against a demand the person is not approved for.

1. Open **`waqti-exceptions.html`**.
2. Drop an `.xlsx` timesheet export.
3. In **Settings**, import a `rules.json` allowlist or build one in the staff-by-demand
   grid (with a raw-JSON editor for staff or demands not in the export).
4. Review the results, untick any rows you don't want to send, and copy the email
   (rich HTML or plain text).

**What it flags:**

- **Demand exceptions** — bookings against a demand the person is not approved for, grouped by demand.
- **Needs attention** — generic (GEN) and no-demand bookings, to check the application is assigned.
- **No time logged** — staff in the rules with no bookings in the export (a chase list).
- **Not in rules** — staff in the export but not in the allowlist (treated as approved for nothing).
- Annual leave (blank demand/feature/application) is ignored; bad hours are surfaced in a data-quality panel.

**Notes:** staff IDs are matched case-insensitively; every result table has per-row
checkboxes to exclude rows from the email; rules autosave to the browser, and "Save tool
with rules" bakes the rules and email wording into a pre-configured copy of the tool. The
allowlist (`rules.json`) is the source of truth. There are no time-bounded approvals yet,
so treat the output as month-level.

---

## `waqti-demand-summary.html` — timesheet demand summary (view online)

Drop the same Waqti timesheet export and view it on-screen: pick one or more demands and
see who booked how many hours to which feature under each. No email — the page itself is
the report.

1. Open **`waqti-demand-summary.html`**.
2. Drop in an `.xlsx` timesheet export (the same shape `waqti-exceptions.html` reads). Once
   loaded, the drop zone collapses to a **Replace file** bar.
3. Tick the demands you want in the multi-select list (nothing is selected to start).
   Use the filter box to narrow a long list; blank/uncoded demands are hidden.
4. Read the summary: one table per demand of **Name**, **Feature**, and **Total Hours
   Booked**, aggregated per person and feature. Rows for the same person are grouped so the
   name appears once, with a demand total.

**Same column-mapping rules as Waqti Exceptions.** Row 1 holds the headers:

| Column | Meaning |
|---|---|
| Staff ID | Person identifier (required) |
| Work Day | Booking date (required) |
| Month | Period label, e.g. `June, 2026` (required) |
| Demand | `Code - Description`, split on the first ` - ` (required) |
| Feature | `Code - Description`, split on the first ` - ` (required) |
| Booked Hours | Numeric hours; non-numeric or negative values are flagged and excluded from totals (required) |
| Name | Display name (optional — auto-detected from `Name`/`Staff`/`Employee`/`Worker`/`Resource` headers) |
| Recharge Cost | Optional, not shown |

If some headers are not found automatically, a small mapper lets you match each field to a
column before confirming. Rows with an empty Staff ID are excluded.

**Staff names (Settings):** import the same `rules.json` used by Waqti Exceptions to map
each Staff ID to a display name. Only the `name` field is read (the approved-demand lists
are ignored). Imported names take priority over any Name column in the export; unlisted
staff fall back to the Name column, then the Staff ID. The imported names persist in the
browser.

---

## Files

- `delivery-plan.html` — delivery-plan to PPTX tool
- `waqti-exceptions.html` — timesheet exceptions to email tool
- `waqti-demand-summary.html` — timesheet demand summary (view online)
- `assets/` — logo variants, favicon, and the blank delivery-plan Excel template
