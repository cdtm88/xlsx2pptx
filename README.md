# Browser tools for delivery reporting

A small collection of **single-file, fully offline** web tools for delivery work —
most turn an Excel export into something shareable. Each tool is one
self-contained `.html` file: open it directly from disk in any modern browser.
Libraries (SheetJS, and PptxGenJS where needed) are vendored inline, so there is
no server, no build step, and no network requests — your data never leaves the
machine.

## Tools

| File | Turns | Into |
|---|---|---|
| [`delivery-plan.html`](delivery-plan.html) | an Excel delivery plan | a PowerPoint Gantt-chart slide (`.pptx`) |
| [`waqti-exceptions.html`](waqti-exceptions.html) | a Waqti timesheet export + an approved-demand allowlist | a copy-paste correction email |
| [`waqti-demand-summary.html`](waqti-demand-summary.html) | a Waqti timesheet export | an on-screen per-demand summary of hours by person and feature |
| [`project-cost-tracker.html`](project-cost-tracker.html) | a team and their day rates, any vendor contracts, and a UK timesheet export | a live cost position, burn-up and monthly ledger against the estimate |

Common to all: a single HTML file, inline-vendored libraries, works over `file://`
with the network off, and brand-consistent styling.

---

## `delivery-plan.html`

Drag in an Excel delivery plan (or start from the built-in blank template),
adjust the title, the week range and which tasks are shown, then download a
PowerPoint Gantt-chart slide. Bars are coloured by status or a single colour,
grouped into category swimlanes, with a proportional "Today" marker and
PowerPoint-safe margins.

The plan is keyed on **real dates**: each task gets a Start Date and an End
Date, and the slide's timeline is months across the top with week-commencing
(w/c) dates beneath — so a task that starts mid-week starts mid-column rather
than being rounded to a sprint boundary. Weeks always commence **Monday**: set
the plan's Start to a Wednesday and the timeline still runs Monday to Monday,
opening from the Monday of that week. Plans written against the older
sprint-based template still open: each `Q#.#` label is resolved to the dates
that sprint covered and drawn on the same week timeline.

Every field in the Tasks table is **editable in the page** — name, category,
status, start and end dates, and the milestone flag — so a late change goes
straight in without editing the spreadsheet and re-uploading. Moving a date
past the end of the timeline extends it rather than dropping the task.

**Copy image** on the slide preview puts the plan and its key on the clipboard
as a PNG — without the title, so it drops under whatever heading the slide or
email already has. Where the browser blocks clipboard writes (some `file://`
setups), the image downloads instead.

## `waqti-exceptions.html`

Drop a Waqti timesheet export, apply a per-person approved-demand allowlist
(`rules.json`, built or imported in **Settings**), and get a copy-paste email.
Rows are sorted into a few tables — bookings against a demand the person isn't
approved for, rows that need attention in Waqti, and staff with no time logged —
following the classification rules in `Exception_Rules.md`. Untick any row to
leave it out, then copy the email as rich HTML or plain text.

## `waqti-demand-summary.html`

Drop the same Waqti export and read it on-screen: pick one or more demands and
see who booked how many hours to which feature under each. Copy the selected
tables to the clipboard (rich HTML plus plain text) for pasting into an email or
doc. Staff names can be mapped from the same `rules.json` or typed by hand.

## `project-cost-tracker.html`

Track a project's cost position without a spreadsheet. Set the estimate, the
currency, the months and the working pattern, then list the team — name, role,
day rate, currency, hours per day — and the days each person works per month.
Add any **vendors** the same way: scope, currency, an optional contract or PO
value, and the spend planned per month. Together that is the plan. Enter actual
spend in the monthly ledger (or book timesheet hours per person and vendor
invoices per month, and let the tool cost them), and the remainder is forecast
at the worse of the plan and the observed burn rate.

Vendors are entirely optional. A project with none behaves exactly as if the
feature were not there — nothing added to the plan, nothing flagged — and a
vendor left on time and materials (no contract value) is never flagged either.
Set a contract value and the tool warns when that vendor is forecast past it,
and raises it to an issue once the invoices themselves go over.

You get six headline figures (estimate, spent, remaining, average burn, forecast
at completion, headroom or overrun), a budget-consumption meter, plain-English
alerts — forecast overrun, thin headroom, burn ahead of plan, runway shorter than
the delivery, vendor past contract — and a burn-up chart that marks the month the
ceiling is breached. The burn-up keeps one story in colour — spent so far, and
where that lands — with the plan, the baseline and the estimate ceiling reading
as progressively quieter reference lines behind it. The zone above the ceiling is
tinted only once the forecast enters it, so the warning means something.
The Position panel and the burn-up each copy to the clipboard as a PNG for
pasting into a slide or an email.

**UK timesheet import.** Drop the raw `.xlsx` export from the UK timesheet
system and the tracker reads it, costs nothing yet, and shows you exactly what
it proposes to change — one row per person and month, with the hours it has
recorded now beside the hours in the file. Tick the rows you want, edit any
figure by hand, then accept, or decline and nothing happens at all. The project
is identified by its **UK timesheet code** (the export's `ProjectName`); on the
first import you pick it from a list of every code in the file and it is
remembered from then on.

The export is a rolling window — UK timesheets run mid-month to mid-month — so
the import is careful about what a *fall* in hours means. Where the file covers a
month end to end it is the better number and wins, up or down: late and careless
timesheets get corrected, and the correction is what you want. Where the file
only *part* covers a month, at the ragged start and end of its window, a fall is
more likely the window moving than a correction, so those rows are tagged, tinted
and left unticked for you to decide.

Silence is never read as zero. A month absent from the file keeps its hours, and
so does a person whose line has disappeared from a month the project *was*
booked in — that one is reported, naming who and when, but never applied. People
in the file who aren't on the team yet are added with a zero day rate and
flagged, both in the review and as an alert, so they cost nothing until you give
them a rate. The whole import is a single undo step.

**Cost drivers** ranks every person and vendor by what they contribute to the
plan, so an overrun points at a line rather than just a number. **Set a baseline**
once the plan is approved and the tracker keeps score against it: a drift alert,
a baseline column in the ledger and the CSV, a baseline line on the burn-up, and
a per-line delta showing exactly what moved — including lines that have since
been removed. **Undo** covers the destructive things (bulk fills, deletes,
imports, clearing) rather than every keystroke.

Every card collapses, and each grid sits in a fixed-height scroller with its
header and totals row pinned, so a long team or a 60-month project never pushes
the rest of the page out of view. The page opens as a report — position,
burn-up, team and ledger — with set-up, the timesheet import, vendors and cost
drivers a click away.

Day rates and vendor costs can be in AED, GBP, USD or EUR and are converted at
rates you set; everything is reported in one base currency.

**Saving.** In **Chrome**, **New project file…** picks where the project
lives — keep it in the project's own docs folder — and from then on every change
is written straight into that file with no save step. **Open project file…** and
the recent-files list switch between projects, one file each. The header always
says which file it is writing to and when it last did. A file changed by
something else stops the autosave and asks which side wins, rather than
overwriting. Browsers that cannot use the file picker — including Edge where an
administrator policy blocks it — fall back to autosaving in the browser, which
holds one project at a time and says so. **Save JSON** still downloads a standalone copy to hand over or keep
as a version, **Load data** reads one back (files from every earlier version of
the tracker still load), and **Export ledger CSV** gives you the monthly table.
No file to open — start with **Load demo project** for a look around.

See [`docs/uk-timesheet-import.md`](docs/uk-timesheet-import.md) for the columns
the import reads, how people are matched, and the rolling-window rules.

See [`docs/storage-design.md`](docs/storage-design.md) for why it works this way:
every `file://` page shares one origin, so browser storage cannot hold more than
one project without the copies overwriting each other.

---

## Building (for contributors)

The shipped `.html` files are **built**, not hand-edited. They're assembled from
a shared **Report Kit** (design system + rules-JSON module + vendored libraries)
so every tool looks and reads the same, while each shipped file stays a single
offline page.

- Shared code lives in [`framework/`](framework/README.md).
- Each report's source lives in `reports/<name>.src.html` and pulls the shared
  code in with `@include` directives.
- Build with `python3 framework/build.py` (or `--check` to verify the committed
  `.html` files are up to date). Edit the source or the kit, rebuild, commit both.

End users never build anything — they just open the `.html`. See
[`framework/README.md`](framework/README.md) for the authoring guide and the
rules-JSON compatibility/versioning policy.

## Files

- `delivery-plan.html` — delivery-plan to PPTX tool
- `waqti-exceptions.html` — timesheet exceptions to email tool
- `waqti-demand-summary.html` — timesheet demand summary (view online)
- `project-cost-tracker.html` — project cost position, burn-up and monthly ledger
- `framework/` — the shared Report Kit + the inliner (`build.py`)
- `reports/` — the `*.src.html` sources the tools are built from
- `assets/` — logo variants, favicon, and the blank delivery-plan Excel template
