# PI capacity: the cadence, and what reduces it

Reference for `pi-planning-capacity.html` — how sprint dates are derived, and
the rules the capacity number follows.

## The cadence

A **PI is one quarter**, and a quarter is **seven sprints**:

| Sprints | Length | Working days |
|---|---|---|
| 1–6 | two weeks, Wednesday → Tuesday | 10 each |
| 7 | one week, Wednesday → Tuesday | 5 |

That is `6 × 14 + 7 = 91` days — exactly 13 weeks. Four quarters are
`4 × 91 = 364` days, exactly 52 weeks, so **every sprint in every future
financial year starts on a Wednesday** with no drift and no correction.

Sprints are named `Q<quarter>.<sprint>` — `Q2.4`, `Q2.7`, `Q3.1` — and PIs
`FY<yy><yy>Q<n>`, e.g. `FY2627Q1`.

### One anchor sets everything

The tool stores a single **anchor**: the Wednesday on which sprint `Q1.1` of the
anchor financial year begins. It ships as **Wed 1 April 2026 = FY2627 Q1.1**.
Every other sprint is derived:

```
quarter start = anchor + (FY offset × 364 + (quarter − 1) × 91) days
sprint n start = quarter start + (n − 1) × 14 days
sprint n end   = start + 13 days   (sprint 7: + 6 days)
```

So FY2627 Q1.1 opens Wed 1 Apr 2026, FY2627 Q4.7 closes Tue 30 Mar 2027, and
FY2728 Q1.1 opens Wed 31 Mar 2027 — the next day, with no gap.

Change the anchor and every PI moves with it. The tool warns if the anchor is
not a Wednesday, because sprints are defined as Wednesday-to-Tuesday.

## What the capacity number is

For **one person in one sprint**:

```
  working days in the sprint            (Mon–Fri; 10, or 5 in sprint 7)
− days they were not on the team        (their optional from / until dates)
− their location's public holidays
− planned leave                          (half days count 0.5)
                                        ────────────────────
= net days
× their allocation %                     (someone half on this team)
× the team's focus factor %              (ceremonies, support, context switching)
                                        ────────────────────
= capacity, in days
```

Points, where a points-per-day rate is set, are `capacity days × rate`.

Three rules are worth stating explicitly:

- **Nothing is deducted twice.** A leave range covering Good Friday removes the
  other days in that range, not the holiday as well — the holiday was already
  off. Weekends inside a leave range are never counted.
- **Allocation and focus factor apply after the deductions**, not before, so a
  50% person on leave for a week loses half a week, not a full one.
- **Everyone is shown; only some are counted.** Every member of a team appears
  in the breakdown for visibility. Only members whose **role** is ticked as
  counting — developers and QA by default — are summed into what the team
  commits to. Change which roles count in the **Roles** card.

## Public holidays

Holidays are per **location** (UK, UAE and India ship as defaults; add your own),
and are deducted only from people assigned to that location. All locations work
Monday to Friday.

The seeded dates come in two kinds, and the difference matters:

| Kind | Examples | Treated as |
|---|---|---|
| Fixed date, or derived from Easter | UK bank holidays, Republic Day, Gandhi Jayanti, UAE National Day, Good Friday | **Confirmed** |
| Set by moon sighting or announced each year, or varying by state | Eid al-Fitr, Eid al-Adha, Arafat Day, Islamic New Year, Mawlid, Holi, Diwali, Dussehra, Ganesh Chaturthi | **An estimate, flagged to confirm** |

Estimated dates still reduce capacity — leaving them out would overstate it —
but the tool never lets them pass quietly. Any that fall inside the PI you are
looking at raise an alert on the capacity report and are listed by name under
**Settings → Locations and public holidays**, where **Only dates to confirm**
gives you the worklist. Correct each date and tick **confirmed**; it leaves the
list as you go.

Confirm them against your HR calendar before you commit to the numbers. UAE Eid
dates in particular are only fixed a few days out.

**Export holidays** / **Import holidays** move the whole calendar as JSON, so one
person can maintain it and everyone else imports the same file.

## Storage, and sharing one file with the cost tracker

The working copy is autosaved in the browser. **Save JSON** writes a standalone
file and **Load data** reads one back. One file holds every team, all the leave,
the holidays and the settings, so switching PI is a dropdown rather than a
different file.

### One file, two tools

A saved file is an **envelope**. This tool owns exactly one key in it —
`piCapacity` — and copies every other key straight back out when it saves:

```jsonc
{
  "v": 10, "name": "Waqti", "estimate": 2100000,   // ← Project Cost Tracker's half
  "team": [...], "vendors": [...], "actuals": {...},
  "piCapacity": { "settings": {...}, "teams": [...], "leave": [...] }   // ← ours
}
```

The **Project Cost Tracker** writes its state object to a file verbatim and
loads it with `Object.assign(defaults, file)`, so keys it does not recognise are
kept and written back out too. The two therefore share one file with no
coordination and **no changes to the tracker at all**: open the same `.json` in
either, and each edits its own half while carrying the other's along untouched.

Practically:

- Open a cost tracker project file here and the Data card says so. It offers to
  **add the tracker's people as a team**, matching each person's free-text role
  ("Engineering", "Quality") to a role here. Specific titles win over generic
  ones, so a tech lead on an "Engineering" line lands on Tech Lead rather than
  Developer — an import should never quietly add capacity.
- Save, and the file now holds both. The filename becomes `project-<name>.json`
  rather than `pi-capacity-<PI>.json`, because it is no longer only ours.
- Open that file in the tracker: the project is exactly as it was, and the
  tracker's own next save keeps the capacity half intact.

Nothing about this is required. A file with no `piCapacity` opens here as a
blank PI; a file with no tracker half opens there as an empty project.

## Exports

Two CSVs, each the table as it is on screen — same columns, same order, same
filters, same figures to one decimal place:

- **Planned leave** — the rows the grid is showing, with the working days each
  entry actually removes inside this PI.
- **Per-person breakdown** — every person, the seven sprint columns for this PI,
  holidays, leave and capacity, plus the counted total, honouring the
  **Only counting roles** toggle.
