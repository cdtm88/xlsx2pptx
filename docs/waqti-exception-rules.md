# Waqti Exceptions: current rules

How `waqti-exceptions.html` (source: `reports/waqti-exceptions.src.html`) turns a Waqti export into tables and an email. The logic lives in `reasonsFor` and `applyRules`.

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
| application | Application | No (if missing, the "No application" check is skipped and a warning shows) |
| createdBy | Created By | No (falls back to the last column) |
| taxonomy | Taxonomy | No (used for the ignore list; if missing, nothing is ignored) |
| staffArt | Staff ART | No |

Demand and Feature values are split on the first `" - "` into a code and a description. Approvals match on the **demand code** only.

## 2. Row filtering (before any rule)

1. **Empty Staff ID**: row dropped, counted as "excluded".
2. **Team filter**: if a Staff ART column exists, any row whose Staff ART is not `DN4 - dnata Travel Services` (case-insensitive) is dropped. With no Staff ART column, nothing is filtered.
3. **Ignored taxonomies**: rows whose Taxonomy is on the ignore list (exact match, case-insensitive) are skipped by every rule and counted in an "Ignored" note. They still count as time logged for rule 4.
4. **Data quality**: Booked Hours that is blank, non-numeric or negative is flagged with its sheet row. The row is still checked, but its hours count as 0.

Staff IDs are upper-cased, so matching against the People rules is case-insensitive.

### Ignored taxonomies

Stored in rules.json as `ignoredTaxonomies` and edited in **Settings > Rules > Ignored taxonomies** (edit, delete, add; taxonomies in the loaded export that are still being checked are listed with one-click add). A rules.json without the field uses this default list:

- Annual Leave
- Time Off In Lieu (TOIL)
- Sick Leave
- Waqti-MyTime Admin
- Prayers
- Training, Professional Development, Knowledge Sharing, On-Job Training
- Budgeting & Forecasting
- Cross Team/ART collaboration
- Department Meeting/Townhall/Pulse of IT

## 3. The rules

Every row left after the filters above is checked against all of these:

| # | Rule | Condition | Reason shown |
|---|---|---|---|
| 1 | Not approved | The demand code is not in the person's approved list in **Settings > People**. People not in the rules are approved for nothing. | `Not approved` |
| 1 | No demand | The Demand is blank. | `No demand` |
| 2 | No application | The Application is blank. | `No application` |
| 3 | System created | Created By is `GEN_LINES` (case-insensitive): a line Waqti created because some data was missing. | `System created (GEN_LINES)` |
| 4 | No time logged | Someone in the People rules has no rows at all in the export (after the filters above). | `No time logged` |

### Which table a row goes to

- **Rule 2 or 3 matches** → **Needs attention** only. The reason lists every rule the row matches, joined with `; `, including rule 1 (for example `System created (GEN_LINES); No application; Not approved for D200`). It is not repeated in Demand exceptions.
- **Only rule 1 matches** → **Demand exceptions**.
- **Nothing matches** → fine, not shown.
- **Rule 4** → **No time logged** (lower priority, its own table).

## 4. Tables (on screen)

Every row has a Send checkbox. Unticked rows are left out of the email and its totals.

| Table | Grouped by | Columns | Sorted by |
|---|---|---|---|
| Demand exceptions | staff + demand + feature (hours summed) | Staff name, Demand, Feature name, Reason, Hours | person's total hours (desc), then demand, feature |
| Needs attention | reason + staff + application (hours summed) | Staff, Reason, Application, Hours | reason, Staff ID, application |
| No time logged | person | Name, Staff ID, Reason | Staff ID |

## 5. Email

Section order:

1. Title: `Timesheet corrections needed: {period}`
2. Opening line (editable in Settings > Email text).
3. `Total to correct: X hours across N people.` (demand exceptions only)
4. **One table per demand** (heading `{code} - {description}`, or `No demand`): Staff, Feature, Reason, Hours. Demands sorted by total hours (desc).
5. **Needs attention** (amber): Staff, Reason, Application, Hours.
6. **No time logged (lower priority)** (grey): Name, Staff ID, Reason.
7. Closing action (editable). Default: "Please correct these in Waqti by {deadline}."

Empty sections are left out. Hours show to 1 decimal. Text is made Windows-1252 safe for the plain-text copy.

## 6. Things worth knowing

- **Anything not on the ignore list is checked.** A new leave-type taxonomy shows up in the tables (often as `No application; No demand`) until it is added to the list.
- **The team (ART) name is hard-coded** in `TARGET_ART` and in the on-screen "Ignored" note.
- **No time-bounded approvals**: approvals apply to the whole export period.
