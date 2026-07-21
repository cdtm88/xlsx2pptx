# Expected outputs

These numbers were produced by an independent parse of the workbooks (Python/openpyxl),
applying the same logic the tool must implement: drop rows with an empty Staff ID, split
`Demand`/`Feature` on the first `" - "`, exclude non-numeric/negative `Booked Hours`,
quarantine staff absent from the rules, and flag a booking when the staff ID is in the
rules and the demand code is not in that person's approved list.

Re-run the tool against these two files after any change to parsing or matching. If the
tool disagrees with the numbers below, the tool is wrong.

## `staff-details-sample.xlsx` + `rules.fixture.json` (happy path)

| Metric | Value |
|---|---|
| Sheet parsed | `Export` |
| Period | `Jul-26` |
| Bookings parsed | 61 |
| Rows excluded (empty Staff ID) | 1 (trailing "Applied filters" row) |
| Data-quality rows (bad Booked Hours) | 0 |
| Staff covered / unmatched | 4 / 0 |
| Total parsed hours | 94.0 |
| Exception lines | 4 |
| Exception hours | 6.0 |
| Exception % of total | 6.4% |
| Staff affected | 2 |

```
4 exception lines, 6.0 exception hours, 2 staff affected

S100202  PVE9001002  DEMOART-1102   1.0
S100202  PVE9001002  DEMOART-1104   0.5
S100404  PVE9001002  DEMOART-1101   2.5
S100404  PVE9001002  DEMOART-1103   2.0
```

Email person order (descending exception hours): **Steve D (S100404) 4.5 hrs**, then
**Priya R (S100202) 1.5 hrs**.

## `staff-details-edge.xlsx` + `rules.fixture.json` (edge path)

Derived from the sample workbook with three deliberate mutations, to exercise the two
safety behaviours the happy path cannot reach:

1. Two of Marcus (`S100303`)'s `PVE9001002` rows were reassigned to **`S100505`**, a staff
   ID absent from the rules file. Both are bookings against `PVE9001002` — a demand
   `S100505` is not listed as approved for — so this proves an **unmatched** person is
   never flagged as an exception, no matter what they booked.
2. Spreadsheet row **8** (Alice, `PVE9001001`) had its `Booked Hours` set to `-2` (negative).
3. Spreadsheet row **11** (Alice, `PVE9001001`) had its `Booked Hours` set to `N/A` (non-numeric).

| Metric | Value |
|---|---|
| Sheet parsed | `Export` |
| Period | `Jul-26` |
| Bookings parsed | 61 |
| Rows excluded (empty Staff ID) | 1 |
| Data-quality rows (bad Booked Hours) | 2 — spreadsheet rows 8 and 11 |
| Staff covered / unmatched | 4 / 1 |
| Unmatched staff IDs | `S100505` (2 bookings, both quarantined) |
| Total parsed hours | 92.5 |
| Exception lines | 4 (unchanged) |
| Exception hours | 6.0 (unchanged) |
| Exception % of total | 6.5% |
| Staff affected | 2 |

```
4 exception lines, 6.0 exception hours, 2 staff affected

S100202  PVE9001002  DEMOART-1102   1.0
S100202  PVE9001002  DEMOART-1104   0.5
S100404  PVE9001002  DEMOART-1101   2.5
S100404  PVE9001002  DEMOART-1103   2.0
```

Banner: **4 staff covered, 1 unmatched**. Warning panel: **S100505**. `S100505` appears in
**zero** exception lines. The four exception lines are identical to the happy path — the
whole point of this fixture is that unmatched staff and invalid hours change the banners
and the totals but never the exception engine.
