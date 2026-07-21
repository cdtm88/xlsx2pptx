# Build brief: demand-exceptions

> **Revision 1.1 (reviewed 2026-07-21).** This is the reviewed build brief. It keeps
> the original intent and structure and resolves the ambiguities found when the spec
> was checked against the real sample export and the fixture. Every changed decision is
> marked **[v1.1]** inline, and the full rationale plus the verification run lives in
> `REVIEW.md`. Deterministic expected outputs for both test workbooks are in
> `fixtures/EXPECTED.md`. Where this brief and the original disagree, this brief wins.

A single HTML file. Drop in a timesheet export, apply a per-person approved-demand allowlist, get a copy-paste email listing every booking made against a demand the person is not approved for.

**Deliverable: one file, `demand-exceptions.html`.** No build step, no bundler, no module files, no npm. Everything lives inside that one file: styles in a `<style>` block, SheetJS pasted inline, all logic in `<script>` blocks. It is opened directly from disk and it works.

---

## Hard rules

Read these before writing anything. They are not preferences.

1. **Fully offline.** No CDN references, no Google Fonts, no external anything. No `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`, or dynamic `import()` in the file. It must work opened over `file://` with the network adapter physically disabled.
2. **Unmatched staff are never defaulted.** A staff ID in the export but absent from the rules file is quarantined and surfaced, not assumed approved and not assumed unapproved. See Step 3.
3. **The rules file is the source of truth, not localStorage.** localStorage is an autosave convenience only.
4. **Escape everything.** Every value from the spreadsheet or the rules file is HTML-escaped before it touches the DOM or the rich email body.
5. **No em dashes in any string the tool authors.** **[v1.1]** This rule governs the boilerplate, labels, and layout the tool writes. It does not govern pass-through spreadsheet or rules-file text, which the tool cannot control: a demand description containing an em dash is printed verbatim (after escaping). Do not attempt to rewrite user data to satisfy this rule.

### Getting SheetJS inline

Fetch `xlsx.full.min.js` once, during the build session only, and paste its contents into a `<script>` block in the file. After that the file never touches the network again. Do not leave a `<script src="...">` pointing at a CDN, and do not leave a comment explaining where to download it from later. Inline it now. (`delivery-plan.html` in this repo already vendors SheetJS inline the same way; reuse that block.)

---

## Structure inside the one file

Keep the logic functions in their own `<script>` block, above the block that wires up the DOM. They should be pure: take data in, return data out, touch no DOM elements. This is the only structural discipline being asked for, and it is what makes the tool debuggable from the browser console when something looks wrong.

```
demand-exceptions.html
├── <style>                  all CSS, light theme locked
├── <script> vendor          SheetJS, pasted inline
├── <script> logic           pure functions, no DOM
│     parseExport(arrayBuffer, mapping)  -> { bookings, excluded, dataQuality, headers, sheetName, period }
│     applyRules(bookings, rules)        -> { exceptions, unmatchedStaff, stats }
│     buildEmail(result, options)        -> { text, html }
│     serialiseRules(state)              -> rules.json string
│     parseRules(jsonString)             -> rules object, throws on bad schemaVersion
└── <script> UI              event wiring, rendering, clipboard
```

Expose the logic functions on `window` so they can be poked at from the console. With no test suite, the console is the debugging surface, and a function you cannot call by hand is a function you cannot diagnose.

Lock the UI to light theme: `<meta name="color-scheme" content="light only">`, `color-scheme: light only` in CSS, explicit background and text colours on tables and cells rather than inherited defaults.

---

## Step 1: shell

- The full page skeleton with regions stubbed: drop zone, column mapper, rules editor, preview, email output.
- Version string visible on screen. Bump it on every change, since with no tests the version is how you know which copy someone is running when they report a problem.
- SheetJS inlined and confirmed loaded.

**Check by hand:** open over `file://` with wifi off. Page renders, version shows, `typeof XLSX` is `"object"` in the console.

---

## Step 2: parsing

Parse a dropped `.xlsx` into normalised booking records.

**Sheet selection [v1.1].** Parse the first worksheet in the workbook. The real export is a single sheet named `Export`, but real workbooks can carry a cover or parameters sheet, so show the parsed sheet name on screen (`parseExport` returns `sheetName`) and let the user see which sheet was read. A visible sheet name beats a silent wrong-sheet parse.

**Required columns [v1.1].** Six columns, auto-detected by header match: `Staff ID`, `Work Day`, `Month`, `Demand`, `Feature`, `Booked Hours`.

- `Recharge Cost` is **not** required to map. **[v1.1]** The original brief required it, but it is deliberately omitted from every output (see Step 5) and is only needed by the deferred XLSX export. Requiring the user to map a column the tool never reads is friction with no payoff. If present it may be captured for the deferred export; if absent, parsing proceeds. Do not block on it.
- **Header matching is case-sensitive but whitespace-trimmed.** **[v1.1]** Trim leading and trailing whitespace from headers before matching. Excel exports routinely carry a trailing space (`"Demand "`), and an untrimmed exact match forces the manual mapper on every load for no real reason. Do not otherwise normalise case or punctuation; the upstream tool renames columns wholesale, and the mapper handles that.
- Where any required column is not found, show a dropdown mapper listing every header in the sheet. Block progress until all six are mapped. Do not hardcode to the sample export's headers; the upstream reporting tool will rename things.
- **Duplicate headers.** **[v1.1]** If the same header appears more than once, disambiguate the mapper entries by column position (for example `Demand (col F)` / `Demand (col S)`) so the user can pick the intended one rather than guessing.
- **Drop rows with an empty Staff ID cell.** The sample export has a trailing row containing the applied filter criteria; that text lands in the `id` column, and the `Staff ID` cell is null. Key the drop off the **mapped Staff ID column**, not off column 1. Show the count excluded so this is visible, not silent.
- Split `Demand` and `Feature` on the **first** occurrence of `" - "` into code and description. A value with no separator yields the whole string as the code and an empty description. This matters: real feature values contain more than one `" - "`, for example `DEMOART-1101 - [Sample] Booking Platform - BAU Enhancements Q2 FY26/27`, which must split into code `DEMOART-1101` and description `[Sample] Booking Platform - BAU Enhancements Q2 FY26/27`, printed verbatim.
- `Booked Hours` values that are non-numeric or negative are excluded from totals and listed in a data-quality panel with their **spreadsheet row number** (the row number as seen when the file is opened in Excel, header being row 1). **[v1.1]** Row numbers are spreadsheet rows, not booking indices, because the point of the panel is to send someone back to the exact cell to fix.
- **Period [v1.1].** Derive the reporting period from the `Month` column and return it as `period`. When every row shares one `Month` value (the normal case, for example `Jul-26`), that value is the period label. When the export spans more than one month, list all distinct months in order (for example `Jul-26, Aug-26`) and show a visible notice that the export is multi-month; the email period line then names the range. Never silently pick one.
- An unreadable file shows a named error and leaves previously loaded data intact.

**Check by hand:** drop `fixtures/staff-details-sample.xlsx`. It reports **61 bookings, 1 row excluded**, sheet `Export`, period `Jul-26`, and an empty data-quality panel. Spot-check one row in the console: demand code split from description, hours numeric. Then drop `fixtures/staff-details-edge.xlsx` and confirm **61 bookings, 1 excluded, 2 data-quality rows (spreadsheet rows 8 and 11)**.

---

## Step 3: rules editor and persistence

This is the part that decides whether the tool is trustworthy. Give it the time.

### Rules file shape

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-21T09:00:00Z",
  "label": "ART1 Sample Delivery Services FY26/27",
  "staff": {
    "S100404": {
      "name": "Steve D",
      "approvedDemands": ["PVE9001001", "PVE9001003"]
    },
    "S100101": {
      "name": "Alice T",
      "approvedDemands": ["PVE9001001", "PVE9001002", "PVE9001003"]
    }
  }
}
```

Flat and hand-editable so it diffs cleanly in a pull request. `schemaVersion` ships from day one because time-bounded approvals are a known future need and a version field costs nothing now. `label` is shown in the UI as the active rules-set name **[v1.1]**, and `generatedAt` is shown as the "loaded" timestamp, so the source-of-truth banner (below) has something to name.

### Editor

- Grid of every staff ID found in the loaded export against every demand code found, checkbox per cell, plus a free-text display name per staff ID.
- **Export rules** downloads `rules.json`. **Import rules** loads one. Round trip must restore an identical grid.
- **Download template** produces an empty `rules.json` with the correct shape and one worked example entry.
- Autosave to localStorage on every change, within one second. Reloading the page restores the last state without re-importing.
- Where localStorage and an imported file disagree, **the imported file wins**, and the UI states which source is active and when it was loaded.
- An unrecognised `schemaVersion` is refused with a named error; current rules are left untouched.

### Raw JSON editing

The grid can only show staff and demand codes that appear in the **currently loaded export**. That is a real limitation: a new joiner who has not booked time yet, a demand nobody has touched this month, or a typo in a code you want to correct are all invisible to the grid. So the JSON must be editable as text too.

- A textarea alongside the grid holds the live `rules.json`, pretty-printed.
- **Grid to JSON:** any checkbox or name change repaints the textarea immediately.
- **JSON to grid:** on blur, or on an explicit Apply button, parse and validate. Valid, so repaint the grid and adopt it. Invalid, so show the parse error with the line number, leave the current rules untouched, and leave the user's text in the textarea so they can fix it rather than losing their edit.
- Validation checks: parses as JSON, `schemaVersion` is recognised, `staff` is an object, every entry has a string `name` and an array `approvedDemands` of strings. Reject with a named error listing what failed, not a generic "invalid JSON".
- Staff or demand codes present in the JSON but absent from the loaded export are kept, not stripped. Editing rules for someone who is not in this month's export is a legitimate thing to do, and silently deleting them would be data loss.
- The grid shows these extras in a separate section marked as not present in the current export, so they are visible rather than sitting only in the textarea.

This also covers pasting a rules file a colleague sent you, without saving it to disk first.

### Unmatched staff

A staff ID present in the export but absent from `staff` is **unmatched**. It is:

- counted separately,
- listed by ID in a warning panel,
- excluded from the exception list entirely.

It is not treated as approved and not treated as unapproved. Default to approved and you hide real exceptions. Default to unapproved and the first email you send is mostly noise and nobody trusts the tool again. The tool must be visibly incomplete rather than quietly wrong.

Note the distinction: a person **missing from** `staff` is unmatched. A person present with an **empty** `approvedDemands` array is approved for nothing, and every one of their bookings is a genuine exception.

A banner shows staff-covered and staff-unmatched counts at all times while an export is loaded.

**Check by hand:** export rules, clear browser storage, reload, import the file, confirm the grid is identical. Then delete one person from the JSON, re-import, and confirm they appear in the warning panel and in zero exception lines. Then add a staff ID to the textarea that is not in the loaded export, apply it, and confirm it survives, appears in the not-in-export section, and is still there after an export and re-import. Finally paste deliberately broken JSON, apply, and confirm the error names the problem and the existing rules are unchanged.

**Check with the edge fixture [v1.1]:** load `fixtures/staff-details-edge.xlsx` with `fixtures/rules.fixture.json`. The banner must read **4 staff covered, 1 unmatched**, the warning panel must list **S100505**, and S100505 must appear in **zero** exception lines even though both of its bookings are against `PVE9001002`, a demand it is not listed as approved for. This is the load-bearing test of hard rule 2: an unmatched person is never flagged, no matter what they booked.

---

## Step 4: exception engine

- A booking is an exception **if and only if** its staff ID appears in the rules file **and** its demand code is absent from that staff ID's approved list.
- Match on the **demand code alone**, never the full `CODE - Description` string. Renaming a demand must not create false exceptions.
- Aggregate to one line per staff ID + demand code + feature code, carrying summed booked hours, a booking-line count, and the earliest and latest work day. **[v1.1]** The earliest and latest work day are shown on the aggregated line in the preview table (as a date range), so this carried data is actually surfaced rather than computed and dropped.
- When rows sharing a feature code carry different feature descriptions (a mid-month rename), the aggregated line shows the description from the **latest** work day. **[v1.1]** Pick one deterministically so the output is stable.
- Summed exception hours must equal the sum of `Booked Hours` across the individually flagged source rows, within 0.01.
- Preview shows: total hours parsed, total exception hours, exception hours as a percentage of total (**one decimal place [v1.1]**), staff affected.
- Zero exceptions produces an explicit all-clear state and **disables the copy buttons** rather than emitting an empty email.

**Ordering [v1.1].** Both examples in the original brief sorted differently; pin it. Sort person sections by **descending total exception hours**, ties broken by staff ID ascending. Within a person, sort lines by **demand code ascending, then feature code ascending**. The preview table and both email flavours use this same order, so what the user checks is what the recipient reads.

**Check by hand.** Load `fixtures/staff-details-sample.xlsx` with `fixtures/rules.fixture.json`. The tool must report exactly:

```
4 exception lines, 6.0 exception hours, 2 staff affected

S100202  PVE9001002  DEMOART-1102   1.0
S100202  PVE9001002  DEMOART-1104   0.5
S100404  PVE9001002  DEMOART-1101   2.5
S100404  PVE9001002  DEMOART-1103   2.0
```

(The four lines above are grouped and sorted by demand+feature within each staff ID. In the email, the person ordering is Steve D 4.5 hrs before Priya R 1.5 hrs, per the descending-hours rule.)

These numbers are verified against the source data (see `fixtures/EXPECTED.md`, which was produced by an independent parse of the workbook). Total parsed hours are **94.0**, so exception hours are **6.4%** of total. If the tool produces anything else, the engine is wrong. This is the single most valuable manual check in the build; run it after every change to parsing or matching.

**Edge check [v1.1].** Load `fixtures/staff-details-edge.xlsx` with the same rules. The four exception lines and 6.0 hours are **unchanged** (the unmatched staff and the bad-hours rows must not touch the engine), but total parsed hours drop to **92.5** (the two bad-hours rows are excluded) and the percentage becomes **6.5%**. If the four lines change here, the engine is leaking unmatched or invalid rows into the result.

---

## Step 5: email output

One email covering the whole team, with a section per affected person. Two flavours, two copy buttons.

Each exception line names the demand code, the feature code and name, and the booked hours. Recharge cost is deliberately omitted; the message to an individual is about correcting their timesheet, not about money.

The body opens with a one-line statement of the period covered (from Step 2's `period`) and the total exception hours, and closes with a named action and a stated deadline. Both are editable in the UI before copying.

**Charset for names [v1.1].** Display names come from the hand-edited rules file and can contain characters outside Windows-1252 (for example an accented or non-Latin name). The rich HTML flavour prints them as-is (UTF-8, escaped). The plain-text flavour is constrained to Windows-1252 (below): before emitting plain text, transliterate any out-of-range character to its nearest ASCII equivalent where one exists, and replace anything with no mapping with `?`, then show a one-line notice that a name was simplified for the plain-text copy. Never emit a byte outside Windows-1252 in the plain flavour, and never fail silently.

### Plain text

Space-padded alignment only. No markdown, no HTML tags, no characters outside Windows-1252. Note that real feature descriptions are long (`[Sample] Booking Platform - BAU Enhancements Q2 FY26/27`), so compute column widths from the actual data rather than the illustrative widths below.

```
Timesheet corrections needed: Jul-26

The following bookings were made against demands the person is not
currently approved for. Please correct these in the timesheet system
by Friday 31 July.

Total to correct: 6.0 hours across 2 people.

STEVE D (S100404)
  PVE9001002   DEMOART-1101  Booking Platform - BAU Enhancements     2.5 hrs
  PVE9001002   DEMOART-1103  Legacy Platform - Migration Readiness   2.0 hrs

PRIYA R (S100202)
  PVE9001002   DEMOART-1102  Customer Portal - API Integration       1.0 hrs
  PVE9001002   DEMOART-1104  Reporting Service - Data Quality        0.5 hrs
```

The feature names above are shortened for the illustration. The tool prints the real, verbatim description after the first `" - "` split; whoever owns the boilerplate (see below) decides separately whether the upstream export should be tidied.

### Rich HTML

Inline styles on every element. No stylesheet, no CSS classes, no custom properties. Explicit `background` and `color` on every cell. Outlook drops stylesheets and forces theme inversion, so anything relying on inherited defaults renders as dark-on-dark or vanishes.

### Copy

- Each button places the correct flavour on the clipboard and confirms on screen within one second.
- The rich copy writes **both** `text/html` and `text/plain` so a plain-text client still receives readable content.
- **Fallback:** where the Clipboard API is unavailable, show the body in a selectable textarea with a select-all button, and **state the failure**. Do not fail silently.

The fallback is not optional. The async Clipboard API needs a secure context. Chrome and Edge treat `file://` as secure; Firefox and Safari are stricter, and rich HTML writes are the first thing to break. Offline-first and one-click-copy genuinely pull against each other here.

**Check by hand:** copy the rich version, paste into a real Outlook compose window, and look at it on both light and dark theme. This cannot be checked any other way. Then copy the plain version into Notepad and confirm no tags leaked through.

---

## Step 6: hardening

Manual passes, each done once before the tool goes to anyone else.

- **Offline.** Disable the network adapter, hard-reload, run the full flow. Output identical to an online run. Then open the browser network panel and confirm zero requests across a complete run.
- **Escaping.** Open the sample export in Excel, change one feature name to `<script>alert(1)</script>`, save, and load it. It must render as visible inert text in the preview and in both email flavours. No alert box.
- **Volume.** Duplicate the sample rows in Excel to roughly 20,000, load it, confirm the preview appears in a few seconds and the browser does not lock up. Note that the editor grid is staff-by-demand; with many distinct demand codes the grid can grow large, so the raw-JSON textarea remains the escape hatch and the grid may need to cap or virtualise rows. **[v1.1]**
- **Size.** The file should land well under 3 MB. SheetJS is the bulk of it.
- **Accessibility.** Tab through the whole flow with no mouse. The drop zone needs a working browse-for-file button, since drag and drop is not keyboard-operable.
- **Self-check the offline rule.** Search the finished file for `http://`, `https://`, `fetch(`, `XMLHttpRequest`, `sendBeacon`, and `import(`. Anything found that is not in a comment or a string literal is a bug. Do this by hand each time before shipping a new copy.

---

## Testing

There is no test suite. Every check above is manual, run by a person before shipping a copy.

That is a real cost, and it lands later rather than now: the Step 4 numbers and the escaping check in particular need re-running after any change to parsing or matching, and it is easy to forget. Keep the version string on screen accurate so you can always tell which copy someone is running.

The `parseExport` / `applyRules` / `buildEmail` functions being on `window` is what makes debugging possible without tests. Use the console.

**Two fixtures ship with this brief [v1.1]**, because the numbers are only trustworthy if they are checked against real files:

- `fixtures/staff-details-sample.xlsx` + `fixtures/rules.fixture.json` — the happy path (61 bookings, 4 clean exception lines, no unmatched staff, no bad hours).
- `fixtures/staff-details-edge.xlsx` + `fixtures/rules.fixture.json` — the same happy-path exceptions **plus** one unmatched staff ID (`S100505`) and two invalid `Booked Hours` cells, which exercise the two safety behaviours (quarantine and data-quality) that the happy-path file cannot reach.

Exact expected outputs for both are in `fixtures/EXPECTED.md`. Re-run both after any parsing or matching change.

---

## Known limitations to state in the UI

**No time-bounded approvals in v1.** Someone who legitimately moved onto a demand mid-month generates false exceptions for the earlier period, and someone who left a demand generates none for bookings after they left. `schemaVersion` is the escape hatch when this gets built. Until then the UI must say so, so nobody trusts the output beyond what it supports.

---

## Deferred

- PPTX and XLSX export. Revisit once the email flow is in use; reuse the PptxGenJS layer from `xlsx2pptx` (`delivery-plan.html` in this repo) rather than rewriting it. The XLSX export is where `Recharge Cost` is consumed, which is why it stays captured but optional in Step 2.
- Per-person individual emails. Small UI toggle later.
- Sending email directly. The tool produces text; the mail client sends it.
- Time-bounded approvals.
- Any server, database, login, or shared state beyond the rules file.

---

## Two things that are not code problems

**Someone has to own the rules file.** The build is a weekend. Keeping the allowlist current as people move between demands is forever. With no owner, the tool reports zero exceptions within two months and looks like it is working perfectly.

**The email tone matters more than any requirement above it.** It is a generated list of someone's mistakes going to their whole team. Whoever will actually send it should write the boilerplate in Step 5, not whoever builds the tool.
