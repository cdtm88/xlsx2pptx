# Backlog

Prioritised findings from the second repo sweep, run on 9 Oct 2026 against
`claude/admiring-johnson-dl3cgm` at `87a4545` (the branch of PR #24, after the
security baseline and the 21 Tier 1 and Tier 2 fixes). Every bug here was
reproduced, mostly headless in Chromium against the built files; anything that
was not is marked *unverified*.

## How to use this file

- **Pick from the top.** Bands are in priority order, and items inside a band are
  sorted by score, then effort. P0 is empty: every regression from PR #24 was
  fixed before it merged.
- **Score** is likelihood × damage, each 1 to 5. Likelihood is how often it bites
  in normal use, damage is how bad it is when it does. 25 is the worst.
- **Effort**: S is under an hour, M is about half a day, L is more.
- **Where** gives line numbers as of `87a4545`; they drift, so search for the
  named function if a line no longer matches.
- **IDs are stable.** Reference them in commits and PRs (for example
  "Fixes DP-R1"), and delete the row when the fix merges.

Tool codes:

| Code | Tool | Source |
|---|---|---|
| DP | Delivery plan | `reports/delivery-plan.src.html` |
| CT | Project cost tracker | `reports/project-cost-tracker.src.html` |
| PI | PI planning capacity | `reports/pi-planning-capacity.src.html` |
| WQ | Waqti exceptions | `reports/waqti-exceptions.src.html` |
| DS | Waqti demand summary | `reports/waqti-demand-summary.src.html` |
| VS | Vendor spend tracker | `reports/vendor-spend-tracker.src.html` |
| KIT | Report Kit | `framework/report-kit.js`, `framework/*.css` |
| BLD | Build | `framework/build.py` |
| CI | Tests and CI | `tests/smoke.cjs`, `.github/workflows/check.yml` |

---

## P0: done

All 20 regressions the rescan found in PR #24 (DP-R1 to DP-R6, CT-R1 to CT-R5,
WQ-R1 to WQ-R3, VS-R1 to VS-R3, PI-R1, CI-R1, DOC-R1) were fixed on the same
branch before it merged. `tests/smoke.cjs` now carries delivery-plan regression
checks for the header and window rules, built on the real legacy template.

---

## P1: data loss, wrong output and accessibility blockers (score 8 and above)

| ID | Problem | Where | Score | Effort | Fix |
|---|---|---|---|---|---|
| PI-01 | **Saving from the capacity tool can undo cost tracker edits made since the file was loaded.** Each tool keeps a private autosaved copy of the other's half, so Save JSON writes yesterday's tracker figures; the two tools also save under different file names (`<slug>.json` vs `project-<slug>.json`), so "one file" is really two or three that drift. | PI 1253-1264, 1312-1331, 1784-1790 | 3×4 = 12 | M | Short term: store a hash or `savedAt` of the other half and warn on Save when the file is newer; use one filename for both tools. Long term: ARCH-2. |
| CT-01 | **Reconnect after one failed read at startup writes the wrong project into the file.** If `getFile()` fails once (network drive or OneDrive not ready), the page shows the shared browser copy (possibly another project) under "Not connected to f.json" with `lastModified=0`, and Reconnect writes it over f.json because the stale check skips 0. | CT 3193-3194, 3256, 2699-2713, 2430 | 2×5 = 10 | S | When the file cannot be read, load that file's own crash copy or unbind; never show the generic browser copy under a bound file; refuse to write while `lastModified` is unknown. |
| VS-01 | **Large workspaces lose their safety copy while the screen says it was kept.** Past about half the browser's storage quota the second write fails: Replace says "previous data was saved to the backup key" when no key exists, and the "preserved as a backup key" banner on a corrupt load is equally false. | VS 2585-2591, 2626, 818-824, 828-852 | 2×5 = 10 | S | Check each backup write; on failure stop the Replace or offer a JSON download first, and fix the wording. Keep more than one backup slot (see VS-05). |
| DP-A1 | **A plan cannot be loaded with the keyboard.** The drop zone is a div with no tabindex or key handler, the input is `display:none` and "browse" is a span, so Tab only reaches "Download blank template". | DP 58, 205-213, 1605-1614 | 2×5 = 10 | S | Make "browse" a `<label for=file-input>` or button, hide the input visually rather than with `display:none`, and give the drop zone `role=button`, tabindex and Enter/Space. |
| PI-02 | **Leave summary and capacity disagree when entries overlap.** Capacity takes the max per day, the summary sums entries: two half-days on one date cost 0.5 but show 1.0; overlapping ranges show 10.0 days against 6.5 used. | PI 676-682, 1086-1101 | 3×3 = 9 | S | Add half-days on the same day capped at 1, and have the summary use the same per-person per-day union as the engine; optionally flag overlaps. |
| PI-03 | **Tracker import counts people as Developers because of their names, and each click adds another copy of the team.** `guessRole(p.role, p.name)` makes "Dev Shah" (Consultant) a counted Developer; clicking "Add those people as a team" twice doubles capacity. | PI 1417, 1409-1430 | 3×3 = 9 | S | Match on role text only; disable or ask once a team from this project exists (store tracker ids on members). |
| CT-A1 | **Keyboard users cannot reach Apply in the timesheet review.** The dialog never takes focus; Apply is 54 Tab presses away through the page behind it, with no focus trap. | CT 2008-2010, markup 584 | 3×3 = 9 | S | Use `RK.modal` (focus in, trap, return focus on close). |
| KIT-A1 | **Dialogs do not read out their message, and focus starts on the risky button.** `RK.modal` sets only `aria-labelledby`, and `RK.confirm` focuses OK even for "Save mine anyway". | KIT report-kit.js 362-372, 423-444 | 3×3 = 9 | S | Set `aria-describedby` to `.modal-lead`; focus Cancel when `danger` is set. |
| PI-A1 | **The editing grids are unusable with a screen reader.** Role, location, person and type selects, allocation and dates have no names; 32 of 53 × buttons have no name; the toast has no live region. | PI 989-996, 1063-1077, 1115, 1150, 1186, 1546-1552 | 3×3 = 9 | M | aria-labels that include the row's person and column ("Allocation for Tom Whitfield", "Delete leave for ..."); `role="status" aria-live="polite"` on the toast. |
| DP-01 | **A control character in a task name produces a malformed PowerPoint file.** A vertical tab (Shift+Enter pasted from Word, stored as `_x000B_`) reaches the slide XML raw; the XML is not well-formed. How PowerPoint reacts is *unverified*. | DP 569, 951, 965, 1012 | 2×4 = 8 | S | In `parseExcel`, strip `[\x00-\x08\x0B\x0C\x0E-\x1F]` from every string or map them to a space. |
| DP-02 | **US-format and impossible text dates are silently moved.** `new Date(y,m,d)` rolls over: "03/13/2026" becomes 3 Jan 2027, "31/02/2026" becomes 3 Mar 2026, and the timeline stretches to 109 weeks. | DP 397-405 | 2×4 = 8 | S | Reject a date unless month and day round-trip; if one field is above 12 read it as month-first, or report the cell. |
| DP-03 | **Clearing "Start:" in the template empties the slide.** (Since DP-R6 the note says the plan "runs past five years"; before, it called every task a mistyped year. Both are wrong.) Excel recalculates the week headers to 1899/1900; Date headers skip `plausibleDate`, outweigh the tasks, and the slide is empty. | DP 525-526, 609-616 | 2×4 = 8 | S | Apply `plausibleDate` to Date headers too; optionally weight sheet weeks below task dates. |
| PI-04 | **The Teams card and leave labels go stale after editing a name, allocation or focus factor** (including the new fill-100-on-blur path). | PI 1651-1664, 1233-1239, 1042-1044 | 4×2 = 8 | S | Have `refreshDerived` patch the team sums, PI-days cells and leave `<option>` text, or re-render on `change`. |
| KIT-01 | **Escape throws away a half-filled form that a backdrop click protects.** | KIT report-kit.js 388 | 4×2 = 8 | S | When the form is dirty, Escape asks through `RK.confirm` (or is ignored), the same rule as the backdrop. |
| WQ-A1 | **The column mapper and error messages are unusable with a screen reader** (both Waqti tools). Mapper selects are unnamed, error boxes have no `role="alert"`, every row checkbox has the same label, Browse sits inside the role=button drop zone, the Rich/Plain toggle has no `aria-pressed`. | WQ 811, 112, 120, 232, 1036, 1061, 1085, 106-111, 148-150; KIT report-kit.js 160; DS 54, 65-73 | 2×4 = 8 | S | Link labels to selects with for/id, `role="alert"` on errors, staff and demand in each row label, move Browse out of the drop zone. |

---

## P2: correctness, safer defaults and hygiene (score 5 to 7)

| ID | Problem | Where | Score | Effort | Fix |
|---|---|---|---|---|---|
| PI-05 | **Load data replaces your holidays, anchor and roles without asking when the plan has no teams.** `planIsEmpty` checks only teams and leave, so a customised calendar is overwritten silently. | PI 1298, 1815 | 2×3 = 6 | S | Count the plan as empty only if settings, holidays, locations and roles are also default; otherwise ask, and say the calendar is replaced. |
| PI-06 | **"Load demo" wipes locations, holidays, anchor and roles, and does not ask when there are no teams.** | PI 1845-1849 | 2×3 = 6 | S | Keep settings, locations, holidays and roles as Clear does, or always confirm naming what is reset. |
| WQ-02 | **Screen hours, email line hours and the email total disagree.** Screen uses `toFixed`, email uses `fmtHrs`; lines of 1.15/0.25/0.25/0.25 total "1.9" while the email lines add to 2.1. | WQ 1037, 1062 vs 274, 513, 527, 577, 487 | 3×2 = 6 | S | Use `fmtHrs` everywhere and total the rounded values (or label the total as unrounded). |
| WQ-03 | **Invalid raw JSON is overwritten by grid edits, and clicking in and out marks the rules as edited.** | WQ 963, 965-974 | 2×3 = 6 | S | Keep a dirty flag while the text is invalid and skip `repaintJson`; apply on blur only when the text changed. |
| WQ-04 | **Waqti exceptions rejects or strips rules files that the demand summary and the kit accept** (`schemaVersion` 2 refused, entries without `name` or `approvedDemands` rejected, unknown fields dropped on export). | WQ 635-660, 612-627 | 2×3 = 6 | M | Switch to `RK.rules.parse`/`serialise`, extended with `ignoredTaxonomies` and `trackLoggedTime` (part of ARCH-5). |
| WQ-05 | **A period typed for one month is reused for the next month's file** (the earlier fix covers untouched periods only). | WQ 1156, 1199 | 2×3 = 6 | S | Reset `periodUserSet` when the parsed period label changes, or show a "period differs from file" note. |
| WQ-06 | **A newer autosave always beats a newly received baked copy, even when only the email wording was edited.** | WQ 1316, 722 | 3×2 = 6 | M | Fixed together with WQ-R1 (compare "edited since baked"). |
| DS-01 | **The copied plain-text summary can run as formulas in a spreadsheet** (feature "=1+2", name `=HYPERLINK(...)`). Excel's paste choice (HTML vs text) is *unverified*. | DS 415 | 2×3 = 6 | S | Run text cells through `RK.csv.safeText`. |
| CT-04 | **Choosing a code in the import dialog saves it even if you Decline**, and the change cannot be undone. | CT 3125-3134 | 3×2 = 6 | S | Keep the picked code in `ts.code`; set `S.ukCode` in `tsApply` after its snapshot. |
| CT-05 | **An estimate of 0 shows "Forecast overrun" and a ceiling breach.** | CT 1088, 1099, 1017, 1161-1164 | 3×2 = 6 | S | Treat 0 as "no estimate": skip variance, breach and runway, and prompt for one. |
| DP-04 | **Lower-case statuses and "At Risk" get no colour, and the table shows them as Not Started.** | DP 320-326, 646-648, 1289-1293 | 3×2 = 6 | S | Match statuses case-insensitively onto the canonical names; treat Status "At Risk" as the flag with the default fill in the key. |
| DP-05 | **A task that ends before it starts is reported as "no valid start/end date".** | DP 705, 1532 | 3×2 = 6 | S | Own note and tag: "ends before it starts". |
| DP-06 | **Only the first sheet is read**, so a workbook with a "Read me" tab first fails with "Header row not found". | DP 473 | 2×3 = 6 | S | Use the first sheet with a Task header, or offer a sheet picker; name the sheet in errors. |
| KIT-02 | **Rules file: `s1` and `S1` silently overwrite each other** on parse and serialise. | KIT report-kit.js 213-222, 240-243 | 2×3 = 6 | S | Collect case collisions into `problems` (parse) or `warning` (serialise). |
| CI-01 | **The GitHub Action uses actions built for the deprecated Node 20** and has no `permissions:` block. | CI check.yml 13, 15, 22 | 5×1 = 5 | S | Bump to checkout@v5, setup-node@v5, setup-python@v6; add `permissions: contents: read`; cache Playwright. |

---

## P3: low impact and polish (score 4 and below)

| ID | Problem | Where | Score | Effort | Fix |
|---|---|---|---|---|---|
| WQ-01 | **A demand code such as `__proto__` or `constructor` crashes both Waqti tools; exceptions then copies the previous file's email.** The demand summary also pollutes `Object.prototype.hours`. | WQ 493, 750; DS 199-206, 223-231 | 1×4 = 4 | S | `Object.create(null)` for every map keyed by file data (a local helper in WQ until ARCH-5), and clear `state.lastEmail` before rebuilding. |
| VS-02 | **Editing an item another tab deleted silently drops the edit** (budgets and vendors the same). | VS 1661, 1716, 1856 | 2×2 = 4 | S | When `idx === -1`, offer to re-create it or show a message and keep the dialog open. |
| PI-07 | **Load and start-up errors are hidden inside the collapsed Data card**; only a 2.2 s toast shows. | PI 292-298, 1831-1833, 1929-1931 | 2×2 = 4 | S | Show load and boot errors in an always-visible banner, or expand the card. |
| PI-08 | **An "on team until" date earlier than "from" is not flagged.** | PI 748-805, 672 | 2×2 = 4 | S | Add an issue alert and mark the row. |
| WQ-07 | **Unticking a Needs-attention row is forgotten after a rules change** (the key includes the reason text). | WQ 697, 391 | 2×2 = 4 | S | Key exclusions on staff + taxonomy + base reasons, without the "Not approved for X" part. |
| DS-02 | **The demand list counts people and features from rows with blank hours, and the data-quality note promises row numbers it does not show.** | DS 198-207, 377-383 | 2×2 = 4 | S | Skip `hours === null` in `demandIndex`; list the row numbers. |
| CT-06 | **A new joiner booking under two staff numbers is added as two people**, each with a zero rate. | CT 2076 | 2×2 = 4 | S | Group unmatched entries by normalised name too. |
| CT-10 | **Opening another file waits for the previous file's write to finish, with no time limit.** Correct ordering (CT-R2), but a write that never completes, e.g. to a network share that dropped, would block opening any other file until the page is reloaded. The status shows "Finishing the save to a.json...". | CT `adopt` / `newProjectFile` (save queue) | 1×4 = 4 | S | Give the wait a timeout (say 15 s), then offer "Open anyway" with a warning that the last edits may not have reached the old file. |
| DP-07 | **Finish times such as 17:00 add a day** (`utcDay` rounds to the nearest midnight). | DP 377-380 | 2×2 = 4 | S | Floor the UTC day for cells with a time part. |
| DP-08 | **Typing is slow on large plans (100-200 ms per keystroke at 1,000 tasks) and loading renders twice.** | DP 1414-1415, 1462-1481, 1327, 1366, 1572 | 2×2 = 4 | M | Debounce `updateUI` on input; drop the extra render during load. |
| DP-A2 | **Title, Now and the week pickers have no labels for screen readers.** | DP 229-231, 237-240 | 2×2 = 4 | S | for/id pairs, `aria-label` for From and To. |
| CT-A2 | **Planned/Actual and Planned/Invoiced toggles lack `aria-pressed`.** | CT 1386-1387, 1446-1447 | 4×1 = 4 | S | Set `aria-pressed` with the class. |
| CT-07 | **Some timesheet codes or team names crash the import with no message** (`__proto__`, `constructor`, `toString` in ProjectName; a member named "constructor"). | CT 1963, 1974, 2157-2160 | 1×3 = 3 | S | `RK.dict()` for `byCode`, `seenWho`, `outside`, `seen`. |
| PI-09 | **Duplicate member ids in a file merge two people** (renaming one renames the other; leave is taken off both). | PI 1359-1372, 627-631 | 1×3 = 3 | S | De-duplicate ids in `migrate`, keeping leave links on the first. |
| BLD-01 | **`build.py` can still overwrite any file inside the repo** via `@out` (even `.git/hooks/` or `build.py`); `@out` is matched anywhere in the text; two sources can target one output; `-check` with one dash crashes. | BLD 43-49, 74-77, 84-86 | 1×3 = 3 | S | Require `@out` to be a top-level `*.html` (not `*.src.html`), reject duplicate outputs and any argument starting with `-`. |
| PI-10 | **The "anchor is not a Wednesday" alert gives the wrong direction and size of shift.** | PI 752-755 | 1×2 = 2 | S | Use `dow - 3` and say "N day(s) earlier/later". |
| PI-11 | **"Copy table" pastes formula-like team names unguarded** (the CSV is guarded). | PI 1506-1530 | 1×2 = 2 | S | `RK.csv.safeText` on clipboard text and HTML cells. |
| CT-08 | **Ledger actuals are not capped**, so 1e308 shows ∞ and is saved. | CT 2981, 759-765 | 1×2 = 2 | S | Clamp to `MAX_MONEY` on input and in `migrate`. |
| DP-09 | **The title cannot be cleared.** | DP 1464 | 2×1 = 2 | S | `currentData.title = input.value`; fall back only at export. |
| DP-10 | **Copy image fails on very tall plans** (about 2,000 tasks in Chromium; Firefox and Safari likely sooner, *unverified*). | DP 1078-1080, 1223-1226 | 1×2 = 2 | M | Lower the pixels per inch to keep height under about 32k px, or fall back to paged downloads. |
| DP-11 | **Excel error cells are read as numbers** (#N/A becomes "42", #VALUE! becomes 14 Jan 1900). | DP 476-480 | 1×2 = 2 | S | Return null in `cv()` when `cell.t === 'e'`. |
| WQ-08 | **A baked copy carries a stale Raw JSON error or "Saved a copy..." message.** | WQ 1282, 1309 | 2×1 = 2 | S | Add `jsonError` and `bakeMsg` to the cleared list or hide them at init. |
| WQ-09 | **The column mapper keeps the previous file's status pills and has no Cancel** (both tools). | WQ 799-815; DS 294-303 | 2×1 = 2 | S | Clear `parseStatus` in `renderMapper`; add Cancel that restores the previous parse. |
| KIT-03 | **`RK.download` revokes the blob URL after 1 s.** Fine in Chromium up to 400 MB; Safari and Firefox *unverified*. | KIT `download` | 1×2 = 2 | S | Revoke after about 60 s or on `visibilitychange`. |
| KIT-04 | **Kit 2 dialogs on a kit 1 page render unstyled**; documented, but there is no runtime guard. | KIT report-kit.js, `framework/README.md` 16 | 1×2 = 2 | S | Warn in the console when `.modal-overlay` has no styles. |
| CT-09 | **The ledger CSV `cell()` has no formula guard.** Not reachable today (numbers and month labels only). | CT 3039-3042 | 1×1 = 1 | S | Use `RK.csv.safeText` before adding any text column. |
| PI-12 | **Ids like `toString` show as "function toString() { [native code] }"** in Roles and Locations; leave pointing at such ids is never reported as orphaned. | PI 780, 793, 1105-1106, 1155, 1176-1177, 1691, 818 | 1×1 = 1 | S | `RK.dict()` for the remaining `{}` maps. |

---

## Architecture and refactors, in order of leverage

These remove whole classes of the bugs above. Each one names the backlog items it
would close or make easy.

| ID | Refactor | Closes | Effort |
|---|---|---|---|
| ARCH-1 | **A persistence module for the cost tracker.** A single serialised write queue that captures `{file handle, id, text}` when a save starts; explicit states instead of the loose `dirty`/`writing`/`stale`/`writeFailed`/`claimed` flags mutated across awaits; switching file flushes first. Test it with OPFS handles and slow or failing writes. | CT-01, CT-10 (CT-R2, CT-02 and CT-03 were fixed with a write queue in PR #24; this finishes the job) | L |
| ARCH-2 | **One model for the file shared by the cost tracker and PI capacity.** Each tool should own only its half: keep only your own key in the browser copy, re-read the file before a combined save, and use one filename. Put the envelope (own key + foreign keys, safe copying) in the kit. | PI-01 | L |
| ARCH-3 | **A regression suite, `tests/regress.cjs`.** Two-tab and OPFS scenarios, header variants and the real legacy template, time zones, quota failures, prototype keys and the rules round trip, plus a `python -m unittest` for `build.py`. Move the delivery plan's pure parsing functions (`parseDate`, header matching, `buildWeeks`, window logic) somewhere Node can test them. Most P0 items would have been caught. | future regressions (delivery-plan header and window checks are already in `tests/smoke.cjs`) | M |
| ARCH-4 | **A kit storage module, `RK.persist`.** Versioned envelope, a per-save token for cross-tab detection, a rolling N-slot backup with quota-checked writes, and per-entity versions for sync. Replaces the raw `localStorage` code in PI, CT, VS and WQ. | VS-01, VS-05 | L |
| ARCH-5 | **Port waqti-exceptions and the delivery plan onto `report-kit.js`.** Exceptions keeps its own copies of esc (twice), rounding, sheet parsing, the mapper, upload, download, clipboard and the rules parser, so every kit fix has to be redone by hand; the delivery plan uses no kit at all. Also move the hard-coded ART name ("DN4 - dnata Travel Services") into `rules.json`. | WQ-04, WQ-01, WQ-A1, DP-A1 | L |
| ARCH-6 | **A kit feedback module.** Toast, save-state pill, `RK.confirm` with `aria-describedby` and safe default focus, and dirty-aware Escape, replacing about 20 native `alert`/`confirm` calls and three hand-rolled toasts. | KIT-A1, KIT-01, VS-05, PI-07 | M |
| ARCH-7 | **One drawing primitive list for the delivery plan's three renderers.** Preview, PPTX and image each draw the slide separately and have drifted (Today label size, month dividers, band label fit, two-line task names). Emit rect/line/text primitives from `computeLayout` and write three thin back-ends. | future DP drift | L |
| ARCH-8 | **A render model for PI capacity.** Edits update the DOM in place through `refreshDerived`, so every new derived view must be hand-wired or it goes stale. Re-render from state on change, or register derived views. | PI-04 and future drift | M |
| VS-05 | **Vendor tracker: route the 15 `alert` and 5 native `confirm` calls through the kit, and keep the last N timestamped backups instead of one `.backup` slot.** | VS-01 follow-up | M |
| BLD-02 | **Stamp versions into built files.** Have `build.py` inject `<meta name="build" content="tool vX, kit Y, <commit>">`; the delivery plan shows no version at all. | | S |

---

## Confirmed fixed by PR #24 (for reference)

The rescan re-tested these and they hold. Delete this section once nobody needs the history.

- **Security:** CSP present, identical and first in all 13 copies, with no violations across a click-through of every tool; SheetJS 0.20.3; no XSS from any spreadsheet or JSON field in any tool; the PI capacity alert XSS is gone.
- **Delivery plan:** dates identical in six time zones for typed, serial, text, template and legacy files; Vendor/Dependencies no longer replace End Date; a 2016 typo no longer drags the axis; half-typed years are ignored; the file input resets.
- **Cost tracker:** per-person timesheet totals; `piCapacity` kept through Demo, Clear and Load data; stale files never overwritten by typing; Retry after a failed write; reloading never locks a tab out of its own file.
- **PI capacity:** blank percentage means 100%; all-or-nothing Load with working Cancel; combined save holds both halves; `migrate` keeps valid older data; date maths identical to `main` across eight quarters and five time zones.
- **Waqti:** untouched period refreshes on Replace file; the mapper clears the previous email; the full bake round trip works under the CSP; the demand summary rules export round-trips.
- **Vendor tracker and kit:** duplicate ids made unique; prototype-safe merge and currencies; `RK.dict`, `store.set`, the modal focus fixes, the sortable guard and the CSV guard work; `build.py` confines paths outside the repo.
