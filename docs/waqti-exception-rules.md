# Waqti Exceptions: current rules

Extracted from `reports/waqti-exceptions.src.html` (the source for `waqti-exceptions.html`). Line numbers refer to that file.

## 1. Input columns

Matched by exact header name on the first sheet (a column mapper appears if any required header is missing).

| Field | Header | Required |
|---|---|---|
| staffId | Staff ID | Yes |
| workDay | Work Day | Yes |
| month | Month | Yes |
| demand | Demand | Yes |
| feature | Feature | Yes |
| bookedHours | Booked Hours | Yes |
| rechargeCost | Recharge Cost | No |
| application | Application | No |
| createdBy | Created By | No (falls back to the last column) |
| taxonomy | Taxonomy | No |
| staffArt | Staff ART | No |

Demand and Feature values are split on the first `" - "` into a code and a description. Approvals match on the **demand code** only.

## 2. Row filtering (before any rule)

Applied in this order (`parseExport`, ~line 246):

1. **Empty Staff ID** → row dropped, counted as "excluded".
2. **Rule 5, team filter** → if a Staff ART column exists, any row whose Staff ART is not `DN4 - dnata Travel Services` (case-insensitive) is dropped and counted as "other team". If there is no Staff ART column, nothing is filtered.
3. **Data quality** → Booked Hours that is blank, non-numeric or negative is flagged with its sheet row. The row is still kept and classified, but its hours are treated as null (excluded from all totals).

Staff IDs are upper-cased, so matching against the rules is case-insensitive.

## 3. Row classification (precedence order)

First match wins (`classify`, called from `applyRules`). Classification runs against the current rules, so editing the ATTN list in Settings re-sorts rows straight away.

| Order | Rule | Condition | Category | Outcome |
|---|---|---|---|---|
| 1 | Rule 1, ATTN-only | Taxonomy is NOT on the ATTN list (exact match, case-insensitive). Blank taxonomy counts as not on the list. | `ignored` | Ignored. Counted in a note only. |
| 2 | Rule 3, Auto-created | Created By = `GEN_LINES` (case-insensitive) | `attention` | Needs attention, reason "Auto-created (GEN_LINES)" |
| 3 | Rule 2, System bug | Feature present AND Application present AND Demand blank | `systembug` | Ignored. Counted in a note only. |
| 4 | Rule 4, Missing feature | Feature blank | `attention` | Needs attention, reason "Missing feature" |
| 5 | (uncovered) No demand | Demand blank | `attention` | Needs attention, reason "No demand" |
| 6 | Normal | Anything else | `normal` | Checked against the approved-demand allowlist |

If the export has no Taxonomy column at all, Rule 1 is skipped and every row is checked (Settings shows a warning).

### ATTN taxonomies (the only taxonomies processed)

Stored in rules.json as `attnTaxonomies` and edited in **Settings > ATTN taxonomies** (add, rename, delete; taxonomies in the loaded export that are being ignored are listed with one-click add). A rules.json without the field uses this default list:

- Programs & Project Execution
- Delivery Execution - Team Level
- Delivery Execution - ART Level
- Daily Stand-Up (DSU)
- ART connects (Syncs, Driver Connects, Cross ART-connects)
- Backlog Management & Refinement
- Miscellaneous Meetings
- PI Quarterly Planning, Show & Shares, and Retros
- Sprint Planning, Show & Shares and Retros
- Portfolio Execution

The old LEAVE list is gone: anything not on the ATTN list is ignored.

## 4. Demand exception rule (normal rows)

(`applyRules`, ~line 325)

- Staff **in rules.json**: a booking is an exception if its demand code is not in their `approvedDemands` list (exact, case-sensitive match).
- Staff **not in rules.json**: treated as approved for nothing, so every normal booking is an exception. They are also listed in a "Not in rules" warning panel.

## 5. "No time logged" rule

A staff ID in rules.json that does not appear anywhere in the export (after the empty-ID and Rule 5 filters) is listed as "No time logged". Any row counts as presence, including ignored and system-bug rows.

## 6. How the tables are built

### Demand exceptions (on screen, grouped by person)

- One line per **staff + demand code + feature code**; hours summed, row count kept, earliest/latest work day tracked. The description shown is the one from the latest work day.
- People sorted by total exception hours (desc), then Staff ID.
- Lines within a person sorted by demand code, then feature code.

### Needs attention

- One line per **reason + staff + application**; hours summed.
- Sorted by reason, then Staff ID, then application.
- Columns: Staff, Reason, Application, Hours.

### No time logged

- Columns: Name, Staff ID. Sorted by Staff ID.

### Every table on screen has an include checkbox per row. Unticked rows are left out of the email (and its totals).

## 7. How the email is built

(`buildEmail`, ~line 425)

Section order:

1. Title: `Timesheet corrections needed: {period}`
2. Opening line (editable in Settings). Default: "The following bookings were made against demands the person is not currently approved for."
3. `Total to correct: X hours across N people.` (demand exceptions only; attention and missing are not in the total)
4. **One table per demand**, regrouped from the per-person data:
   - Heading `{demand code} - {demand description}`
   - Columns: Staff (name, or Staff ID if no name), Feature, Hours
   - Demands sorted by total hours (desc), then demand code
   - Rows sorted by name, then feature
5. **Needs attention** table (amber): Staff, Reason, Application, Hours
6. **No time logged** table (grey): Name, Staff ID, with the line "these team members have no bookings in Waqti. Please update your timesheets."
7. Closing action (editable). Default: "Please correct these in Waqti by {deadline}."

Formatting notes:

- Hours shown to 1 decimal with "hrs".
- Rich HTML uses fixed 900px tables so all tables line up. Plain text uses padded columns.
- Text is forced to Windows-1252 safe characters (accents transliterated, unknown characters become `?`); a note appears if any name was simplified.
- A section is omitted entirely when it has no rows.

## 8. Things worth knowing before you change the rules

- **Total hours includes everything** (ignored, system-bug, attention rows), so the "exception %" denominator includes ignored rows.
- **Data-quality rows still classify.** A bad-hours row on an unapproved demand appears as an exception line with 0.0 hrs.
- **The Rule 5 ART name is hard-coded twice**: in `TARGET_ART` and in the UI "ignored" note.
- **The code used to refer to `Exception_Rules.md`**, which is not in the repo. This file is now the reference.
- **Rule numbering vs precedence**: the evaluation order is 1, 3, 2, 4, then "no demand", not numeric order.
- **No time-bounded approvals**: approvals apply to the whole export period.
