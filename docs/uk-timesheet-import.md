# UK timesheet import

How `project-cost-tracker.html` turns the raw UK timesheet export into actual
hours, and why it is deliberately cautious about doing so.

## 1. What the export looks like

The UK timesheet system exports one `.xlsx` row per person per day per project.
Five columns are read; everything else is ignored.

| Field | Column in the export | Used for |
|---|---|---|
| `date` | `Date` | which month the hours land in |
| `name` | `Name` | the identity shown in the review and on the team row |
| `employeeNo` | `EmployeeNumber` | the identity actually matched on (never shown) |
| `hours` | `Hours (Standard)` | the hours booked |
| `project` | `ProjectName` | which project the row belongs to |

`Hours (Exception)` is not read. Headers are matched case-insensitively against
a short alias list; if any required column is missing the tool falls back to the
Report Kit column mapper and asks which column is which, rather than failing.

Rows with no project code, no usable date, or hours of zero or less are skipped.
Dates arrive either as Excel serials (converted from the 1899-12-30 epoch, floored
so a date-time cannot round into the next day) or as text — `YYYY-MM-DD` first,
then `MM/DD/YYYY`, which is what the export writes into the formatted-text cell.

## 2. Identifying the project

A tracker covers exactly one project, so it needs to know which `ProjectName`
is its own. That is the **UK timesheet code**, stored on the project as
`ukCode`.

The whole file is parsed and grouped by code before anything is shown, so the
first import can present every code in the file — with its people count and
total hours, largest first — and let you pick. The choice is written back to the
project and the picker is not shown again. If a saved code is not present in a
later file, the picker returns and says so instead of silently importing nothing.

Codes that look like leave (`Absent…`, `Annual leave`, `Bank holiday`, `Sick`)
are tagged in the picker. They are not blocked — the tag is there so leave is
not picked as the project by mistake.

## 3. Matching people

In order: a remembered `EmployeeNumber` on the team member (`staffIds`), then an
exact case-insensitive name match, otherwise the person is new. Whenever a person
is matched or added, the `EmployeeNumber` from the file is recorded against them,
so a later rename doesn't break the match.

New people are added with a **zero day rate** and flagged twice — in the review
modal before you accept, and as a standing alert afterwards. They therefore cost
the project nothing until someone gives them a rate, which is a visible gap
rather than a silent understatement.

## 4. The rolling-window rule

This is the part that matters.

UK timesheets run mid-month to mid-month, and the intended use is a **weekly**
upload of a rolling export. So any given file:

- starts and ends part-way through a month, making its first and last months partial;
- will, as the window rolls forward, stop covering months it used to cover.

Two failure modes follow, and the import is built to make both impossible by
accident:

**A month absent from the file is never touched.** Only months that actually
appear in the file are considered at all. When the window rolls past March at
the FY boundary, March simply produces no row, and the hours recorded against it
stay exactly as they are. Missing is not zero.

**A month whose hours would go down is offered, but not selected.** A decrease
is the signature of a window that has moved on — the file now covers only part
of a month it previously covered in full. It is shown, marked, and counted in
the flags line ("… would go down"), but its checkbox starts clear, so accepting
the import as presented cannot reduce recorded time. If a decrease is genuinely
correct, tick it.

Increases are selected by default, because that is the normal week-to-week case.
Rows where the file and the record already agree (within 0.005 h) are not shown.

## 5. The review step

Nothing is written until you accept. The modal lists one row per person and
month with a real change:

| Person | Month | Recorded | In the file | Change | Apply | Use |

`Apply` is an editable number — whatever is in it is what gets written, so a
figure can be corrected by hand before submitting. `Use` is the per-row
opt-in. **Select all / Select none / Only increases** move them in bulk.
**Apply selected** writes; **Decline** (or Escape, or the close button) does
nothing at all. Apply is disabled when nothing is selected, so a file that
offers only decreases cannot be accepted with an empty click.

Accepting takes a single undo snapshot — one import is one undo step — writes
`actualHours` for each selected person-month, switches the team grid to the
actual-hours view, and opens the team panel so the change is visible where it
landed.

## 6. Known limits

- **UK only.** The UAE (Waqti) process is separate and is not read here. The
  parser is generic enough — five named columns and a mapper fallback — that a
  Waqti export could be added later behind the same review modal.
- **`.xlsx` only.** CSV is the preferable input and was asked for upstream; when
  it exists, it is a small addition to the same path (the Report Kit reader
  handles both) and not a rewrite.
- **Hours, not cost.** The import writes hours; cost still comes from the day
  rate and hours-per-day on the team row. That is what makes a zero-rate new
  joiner a flagged gap rather than a wrong number.
- **Days vs hours.** The tracker holds both a planned-days view and an
  actual-hours view; the import writes only actual hours and does not touch the
  plan.
