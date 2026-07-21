# PRD review: demand-exceptions build brief

Reviewed 2026-07-21 against the real sample export and the fixture. The brief is sound
and, on the numbers that matter, empirically correct. This document records the
verification, the ambiguities found, and how `build-brief.md` (revision 1.1) resolves
them. The original brief's intent is unchanged; nothing here weakens a requirement.

## Verification

The sample export and the fixture were parsed independently and the exception engine was
run by hand. Every headline number in the original brief reproduced exactly.

| Check | Brief | Actual | |
|---|---|---|---|
| Bookings parsed | 61 | 61 | pass |
| Rows excluded | 1 | 1 (trailing "Applied filters" row, null Staff ID) | pass |
| Exception lines | 4 | 4 | pass |
| Exception hours | 6.0 | 6.0 | pass |
| Staff affected | 2 | 2 | pass |
| Exact lines | S100202/1102,1104; S100404/1101,1103 | identical | pass |

The engine — split on first `" - "`, match on demand code alone, aggregate by
staff+demand+feature, quarantine unmatched — produced the Step 4 block character for
character. Total parsed hours are 94.0, so exceptions are 6.4% of total. See
`fixtures/EXPECTED.md`.

The real export has 27 columns on a sheet named `Export`; all required headers are present
by exact name, and `Month` is `Jul-26` on every row.

## What the real data changed

**`Month` is the period source.** The email's `Jul-26` was unexplained in the original;
the data shows `Month` is where it comes from. Now stated in Step 2, with a defined
multi-month rule (the sample is single-month, so that path was never specified).

**`Recharge Cost` is genuinely unused.** It is a required-to-map column in the original,
but Step 5 omits it and nothing else reads it. Demoted to optional in Step 2 (captured for
the deferred XLSX export, never blocking). This is the one place the original spec asked
for user effort with no payoff.

**The Step 5 email mock is abbreviated.** Real feature descriptions are long, e.g.
`DEMOART-1101 - [Sample] Booking Platform - BAU Enhancements Q2 FY26/27`. This confirms the
first-occurrence split is load-bearing and means plain-text column widths must be computed
from data, not from the mock. Both points are now called out.

## Ambiguities resolved in revision 1.1

Each is marked **[v1.1]** at the point of change in `build-brief.md`.

1. **Sort order.** The original's two examples disagreed (Step 4 sorted by staff ID
   ascending; Step 5 by hours descending). Pinned: person sections by descending exception
   hours (ties by staff ID); lines within a person by demand then feature code; preview and
   both email flavours share the order.
2. **Period label + multi-month.** Derived from `Month`; multi-month lists all months and
   shows a notice rather than silently picking one.
3. **Recharge Cost.** Demoted from required to optional (see above).
4. **Plain-text charset vs names.** Names are hand-edited and can exceed Windows-1252.
   Rich HTML prints them as-is; plain text transliterates to nearest ASCII, substitutes `?`
   where impossible, and states that a name was simplified. Never emits out-of-range bytes,
   never fails silently.
5. **Em-dash rule boundary.** Applies to tool-authored strings only; pass-through
   spreadsheet/rules text is printed verbatim after escaping.
6. **Multi-sheet workbooks.** Parse the first sheet; show its name so a wrong-sheet parse is
   visible, not silent.
7. **Header whitespace.** Trim headers before matching, so a stray trailing space does not
   force the manual mapper on every load.
8. **Duplicate headers.** Disambiguate mapper entries by column position.
9. **Data-quality "row numbers".** Defined as spreadsheet row numbers (header = row 1), so
   they point back to the exact cell.
10. **Trailing-row drop.** Keyed off the mapped Staff ID column, not column 1. In the real
    file the filter text lands in the `id` column while `Staff ID` is null, so a
    column-1-based drop would be wrong in general.
11. **Earliest/latest work day.** The original carried it in the aggregate but never
    displayed it; now shown as a date range on the preview line.
12. **Feature description on rename.** When one feature code has differing descriptions
    across rows, the aggregated line uses the latest work day's description, deterministically.
13. **Percentage rounding.** One decimal place.
14. **Grid scale at volume.** Acknowledged in the Step 6 volume check; raw JSON is the
    escape hatch and the grid may need to cap or virtualise.

## The gap the fixture could not close, now closed

The provided `rules.fixture.json` covers all four staff in the export, and every
`Booked Hours` value is clean. So the two behaviours the brief argues are the whole point
of the tool — **unmatched-staff quarantine** and the **data-quality panel** — had zero
coverage in the supplied test data. Step 3's own manual check ("delete one person, confirm
they appear in the warning panel") had no ready fixture to run against.

`fixtures/staff-details-edge.xlsx` closes that gap. It is the sample workbook with three
deliberate mutations (one unmatched staff ID booking against a demand it is not approved
for; two invalid `Booked Hours` cells). Its expected output is in `fixtures/EXPECTED.md`:
the banners and totals move, the four exception lines do not. That invariance is the test —
if unmatched or invalid rows ever leak into the engine, this fixture catches it.

## Recommendation

Build against `build-brief.md` (revision 1.1) and run both fixtures after every parsing or
matching change. The three decisions worth a second look before coding are the sort order
(1), the multi-month period rule (2), and the plain-text charset policy (4), since those
change what "correct output" means rather than just clarifying it.
