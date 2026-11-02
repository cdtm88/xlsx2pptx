// Smoke test for the built tools. Run after `python3 framework/build.py --check`:
//
//   npm i --no-save playwright@1.56.1 && npx playwright install chromium   (once)
//   node tests/smoke.cjs
//
// Every built *.html at the repo root is opened over file:// (how people use them) and
// must: carry the offline Content-Security-Policy, make no network request, log no page
// error, console error or CSP violation, and pass its own main flow (below). The kit's
// pure helpers get unit checks in a Node vm first. Exits non-zero on any failure.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const os = require("os");
const { execFileSync } = require("child_process");

let chromium;
try { ({ chromium } = require("playwright")); }
catch (e) { console.error("playwright is not installed: npm i --no-save playwright@1.56.1"); process.exit(2); }

const ROOT = path.resolve(__dirname, "..");
const FIX = path.join(__dirname, "fixtures");
// The one policy every tool must carry, exactly as the starter has it.
const CSP = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(
  fs.readFileSync(path.join(ROOT, "framework/starter.src.html"), "utf8")) || [])[1];
// The line every tool ends with (framework/DESIGN.md, principle 9).
const SIGNOFF = (/<div class="signoff">([^<]+)<\/div>/.exec(fs.readFileSync(path.join(ROOT, "framework/signoff.html"), "utf8")) || [])[1];
const failures = [];
const ok = (name) => console.log("  ok   " + name);
const fail = (name, why) => { failures.push(name + ": " + why); console.log("  FAIL " + name + ": " + why); };
const check = (name, cond, why) => (cond ? ok(name) : fail(name, why || "assertion failed"));

/* ---------- kit unit checks (no browser) ---------- */
function kitUnits() {
  console.log("report-kit.js");
  const sandbox = { window: {}, console };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "framework/report-kit.js"), "utf8"), sandbox);
  const RK = sandbox.window.RK;
  check("esc escapes both quote styles", RK.esc(`<a href="x" title='y'>&`) === "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;");
  check("csv.safeText guards = + - @ tab CR", ["=1", "+1", "-1", "@a", "\t=1", "\r=1"].every((v) => RK.csv.safeText(v)[0] === "'"));
  check("csv.escape quotes commas and quotes", RK.csv.escape('a,"b"') === '"a,""b"""');
  const d = RK.dict(); d["__proto__"] = 1; d.constructor = 2;
  check("dict holds prototype-named keys as data", Object.keys(d).length === 2 && ({}).constructor === Object);
  const parsed = RK.rules.parse(JSON.stringify({ schemaVersion: 1, future: 1, staff: { s1: { name: "Bob", approvedDemands: ["D1"], extra: true } } }));
  check("rules.parse normalises ids and keeps unknown fields", parsed.names.S1 === "Bob" && parsed.extraTop.future === 1 && parsed.staff.S1.extra === true);
  const out = JSON.parse(RK.rules.serialise({ staff: parsed.staff, names: {}, demands: parsed.demands, extraTop: parsed.extraTop }));
  check("rules.serialise: a cleared name stays cleared, the rest round-trips",
    out.staff.S1.name === "" && out.staff.S1.approvedDemands[0] === "D1" && out.staff.S1.extra === true && out.future === 1);
  const newer = RK.rules.parse(JSON.stringify({ schemaVersion: 99, staff: {} }));
  check("rules.parse loads a newer schema with a warning", !!newer.warning);
  check("localDate uses the local calendar day", RK.localDate(new Date(2024, 0, 15, 0, 30)) === "2024-01-15");
}

/* ---------- per-tool main flows ---------- */
const FLOWS = {
  "delivery-plan.html": async (page, t) => {
    const main = () => page.textContent("#summaryMain");
    const values = () => page.$$eval("#statGrid .stat-card-value", (els) => els.map((e) => e.textContent).join(" "));
    const row = (n, f) => "#task-tbody tr:nth-child(" + n + ") ." + f;
    const settle = () => page.waitForTimeout(250);
    const confirmShown = () => page.isVisible(".modal-overlay:not([hidden]) [data-rk-ok]");
    const settings = async (panel) => { await page.click('.app-nav-item[data-view="settings"]'); await page.click(`.settings-nav-item[data-panel="${panel}"]`); };
    const back = () => page.click('.app-nav-item[data-view="main"]');
    // the PPTX from the header button: its file name and how many slides it holds
    const exportPptx = async () => {
      const dl = page.waitForEvent("download", { timeout: 15000 });
      await page.click("#btn-download");
      const d = await dl, buf = fs.readFileSync(await d.path());
      const slides = new Set((buf.toString("latin1").match(/ppt\/slides\/slide\d+\.xml/g) || [])).size;
      return { name: d.suggestedFilename(), pk: buf.slice(0, 2).toString() === "PK", slides };
    };
    // wait for the load to finish (the file is read and parsed asynchronously): either the
    // replace question shows, or the summary names the new file, or an error shows
    const load = async (fixture) => {
      await page.setInputFiles("#file-input", path.join(FIX, fixture));
      await page.waitForFunction((name) => {
        const ok = document.querySelector(".modal-overlay:not([hidden]) [data-rk-ok]");
        const sub = document.getElementById("summarySub"), err = document.getElementById("error-msg");
        return (ok && ok.offsetParent !== null) || (sub && sub.textContent.endsWith(name)) || (err && !err.hidden && err.textContent);
      }, fixture, { timeout: 10000 }).catch(() => {});
      await settle();
    };

    // start view: a keyboard-reachable drop zone with nothing nested in it, and the template
    t("opens on the drop zone, with Download disabled", await page.isVisible("#drop-zone") && await page.isDisabled("#btn-download"));
    t("the drop zone is a button with no button inside it", (await page.getAttribute("#drop-zone", "role")) === "button" &&
      (await page.getAttribute("#drop-zone", "tabindex")) === "0" && (await page.$$("#drop-zone button, #drop-zone input")).length === 0);
    // stand in for the picker (a real one cannot be driven headless reliably)
    await page.evaluate(() => { const i = document.getElementById("file-input"); window.__picks = 0; i.click = () => { window.__picks++; }; });
    await page.focus("#drop-zone");
    await page.keyboard.press("Enter");
    await page.keyboard.press(" ");
    t("Enter or Space on the drop zone opens the file picker (DP-A1)", (await page.evaluate(() => window.__picks)) === 2);
    await page.evaluate(() => { delete document.getElementById("file-input").click; });
    const tdl = page.waitForEvent("download", { timeout: 5000 });
    await page.click("#btn-template");
    const tpl = await tdl;
    t("the blank template downloads", tpl.suggestedFilename() === "Delivery_Plan_Template.xlsx" && fs.readFileSync(await tpl.path()).slice(0, 2).toString() === "PK");

    // loaded: the answer, the cards, one slide
    await load("delivery-plan.xlsx");
    t("answer line", (await main()) === "3 tasks across 2 workstreams, 1 at risk, Mar to Apr 2026", await main());
    t("the file and title above it", (await page.textContent("#summarySub")) === "Smoke Plan · delivery-plan.xlsx", await page.textContent("#summarySub"));
    t("cards: on the slides, workstreams, at risk, weeks", (await values()) === "3 2 1 6", await values());
    t("at risk card carries a red pill", await page.isVisible("#statGrid .status-pill.pill-red"));
    t("the at risk task shows a red pill in the table", await page.isVisible(row(2, "dp-risk") + " .pill-red") && !(await page.isVisible(row(1, "dp-risk") + " .pill-red")));
    t("one slide previewed", (await page.$$("#slide-stack .dp-slide")).length === 1 && /One slide/.test(await page.textContent("#slide-count-lbl")));
    t("the columns read are named", /Read from: delivery-plan\.xlsx/.test(await page.textContent("#cols-note")) && /Dates from: Start Date \/ End Date/.test(await page.textContent("#cols-note")));
    t("every table field is labelled", await page.$$eval("#taskTable input, #taskTable select", (els) => els.length > 0 && els.every((e) => e.labels.length || e.getAttribute("aria-label"))));

    // edits in the table redraw the answer, cards and preview
    await page.fill(row(1, "f-name"), "Alpha <renamed> & co");
    await page.check(row(3, "f-risk"));
    await page.selectOption(row(2, "f-status"), "Blocked");
    await settle();
    t("an edited name reaches the preview", (await page.textContent("#slide-stack")).includes("Alpha <renamed> & co"));
    t("ticking At Risk counts it", (await main()) === "3 tasks across 2 workstreams, 2 at risk, Mar to Apr 2026", await main());
    t("a status change recolours its pill", await page.$eval(row(2, "f-status"), (e) => e.classList.contains("pill-red")));
    await page.uncheck(row(1, "f-show")); await settle();
    t("an unticked task leaves the slide and is struck through", (await main()).startsWith("2 tasks across 2 workstreams") &&
      await page.$eval("#task-tbody tr:nth-child(1)", (r) => r.classList.contains("row-off")) && (await values()).startsWith("2 2"), await main());
    await page.check(row(1, "f-show"));
    await page.fill(row(3, "f-end"), "2026-05-01"); await settle();
    t("a later end date stretches the timeline", (await main()).endsWith("Mar to May 2026") && (await page.textContent("#week-count-lbl")) === "9 of 9 weeks", await page.textContent("#week-count-lbl"));
    const ex1 = await exportPptx();
    t("exports a one-slide PowerPoint named after the title", ex1.pk && ex1.slides === 1 && ex1.name === "Smoke_Plan.pptx", JSON.stringify(ex1));

    // Settings: title, Today line, bar colour and the version
    await settings("panel-slide");
    t("version shown in Settings", (await page.textContent("#appVersion")) === "v2.0.1", await page.textContent("#appVersion"));
    await page.click('#color-seg [data-mode="single"]');
    t("single colour changes the key", /Scheduled/.test(await page.textContent("#legend")) && (await page.getAttribute('#color-seg [data-mode="single"]', "aria-pressed")) === "true");
    await page.fill("#cfg-title", ""); await settle();
    const ex2 = await exportPptx();
    t("the title can be cleared; the file falls back to Delivery_Plan (DP-09)", ex2.name === "Delivery_Plan.pptx", ex2.name);
    await page.fill("#cfg-title", "Renamed plan"); await settle();
    await back();
    t("the title reaches the answer's first line", (await page.textContent("#summarySub")).startsWith("Renamed plan"));

    // loading over an edited plan asks in the page; Cancel keeps it
    await load("dp-multi-slide.xlsx");
    t("loading over edits asks first, in the page", await confirmShown());
    await page.click(".modal-overlay:not([hidden]) [data-rk-cancel]"); await settle();
    t("and Cancel keeps the plan", (await page.textContent("#summarySub")).startsWith("Renamed plan"));
    await load("dp-multi-slide.xlsx");
    await page.click(".modal-overlay:not([hidden]) [data-rk-ok]"); await settle();
    t("multi-slide answer", (await main()) === "40 tasks across 3 workstreams, 5 at risk, Mar to Jul 2026", await main());
    t("split across two slides", (await page.$$("#slide-stack .dp-slide")).length === 2 && /Split across 2 slides/.test(await page.textContent("#slide-count-lbl")));
    const ex3 = await exportPptx();
    t("exports a two-slide PowerPoint", ex3.pk && ex3.slides === 2 && ex3.name === "Multislide_plan.pptx", JSON.stringify(ex3));

    // other header spellings and a sheet with no dates: unedited, so no question
    await load("dp-header-spellings.xlsx");
    t("Start_Date / End Date - dd/mm/yyyy still parse", !(await confirmShown()) && (await page.inputValue(row(1, "f-start"))) === "2026-03-02" &&
      (await page.inputValue(row(1, "f-end"))) === "2026-03-13" && (await main()).startsWith("2 tasks across 1 workstream,"), await main());
    await load("dp-no-dates.xlsx");
    t("a sheet with no date columns is refused with the headers found, and the plan stays",
      await page.isVisible("#error-msg") && /Headers found:/.test(await page.textContent("#error-msg")) && (await main()).startsWith("2 tasks"));

    // the harness checks phone width on both views once the flow ends, on this plan
    await load("dp-multi-slide.xlsx");
  },
  "uat-email-builder.html": async (page, t) => {
    const preview = () => page.textContent("#preview");
    await page.fill("#f_name", "Smoke UAT");
    await page.click('#statusChips [data-chip-value="amber"]');
    await page.fill("#f_reason", "2 high defects open");
    for (const [id, v] of [["#f_day", "3"], ["#f_days", "10"], ["#f_scope", "40"], ["#f_passed", "18"], ["#f_failed", "2"], ["#f_blocked", "1"], ["#f_high", "2"], ["#f_approvers", "3"]]) await page.fill(id, v);
    const subject = await page.getAttribute("#f_subject", "placeholder");
    t("subject carries the status and the typed figures", subject === "[UAT] Smoke UAT update: AMBER | day 3 of 10 | 50% executed | 2 high defects open", subject);
    const p = await preview();
    t("preview shows the badge, headline and figures", /AMBER/.test(p) && /at risk for sign-off: 2 high defects open\. 20 of 40 tests executed \(50%\)/.test(p) && /Not run or in progress 19/.test(p), p.slice(0, 200));
    t("exit criteria are worked out from the figures", /Exit criteria: 1 of 5 met/.test(p));
    await page.click('[data-add="defects"]');
    await page.fill("#r_defects_0_ref", "D-1"); await page.fill("#r_defects_0_title", "Login fails");
    t("an added defect shows in the email", /D-1\s*Login fails/.test(await preview()));
    t("the chip rows are named groups", (await page.getAttribute("#emTypeChips", "aria-label")) === "Email type" &&
      (await page.getAttribute("#statusChips", "role")) === "group" && (await page.getAttribute("#emSections", "aria-labelledby")) === "emSectionsLabel");
    await page.click('#emTypeChips [data-chip-value="request"]');
    t("sign-off request asks for a fixed reply", /Please reply with one of: Approved/.test(await preview()));
    await page.reload();
    t("the email is kept for next time", (await page.inputValue("#f_scope")) === "40" && /D-1/.test(await preview()));
    await page.click("#btnExample");
    await page.click(".modal-overlay:not([hidden]) [data-rk-ok]");
    t("the example replaces it after asking", /Customer Portal R4\.2 UAT/.test(await preview()) && /CP-212/.test(await preview()));
  },
  "pi-email-builder.html": async (page, t, ctx) => {
    const preview = () => page.textContent("#preview");
    const names = () => page.$$eval("#preview tr[data-rid]", (r) => r.map((x) => x.querySelector("[data-edit=name]").textContent));
    t("opens on the drop zone", await page.isVisible("#dropBig") && await page.isHidden("#mainView"));
    await page.click("#emptySample");
    t("the sample picks the quarter being planned and builds the email", /26 commitments for Q3, 16 delivering this quarter, 4 spill over/.test(await page.textContent("#summaryMain")) &&
      /Booking Portal\s*12 commitments/.test(await preview()), await page.textContent("#summaryMain"));
    t("subject is suggested from the quarter", (await page.inputValue("#f_subject")) === "Quarterly Planning Commitments | FY26/27 Q3");
    t("data checks list what needs fixing", /6 projects have no JIRA ID/.test(await page.textContent("#checks")));
    await ctx.phone("sample loaded");
    t("the project style chips are a named group", (await page.getAttribute("#layoutChips", "role")) === "group" && (await page.getAttribute("#layoutChips", "aria-label")) === "Project style");

    // chips open a dialog; the change is kept for this quarter only
    await page.click('#preview tr[data-rid^="agentaccountmanagement"] [data-f=status]');
    await page.fill("#ed_in", "Blocked"); await page.click("#editForm button[type=submit]");
    t("a status edited in the preview shows in the email", /Agent Account Management[\s\S]{0,200}Blocked/.test(await preview()) && /1 manual change applied to Q3/.test(await page.textContent("#ovInfo")));
    await page.click('#preview tr[data-rid^="agentaccountmanagement"] [data-f=delivery]');
    await page.selectOption("#ed_in", "TBC"); await page.click("#editForm button[type=submit]");
    const cell = await page.$eval('#preview tr[data-rid^="agentaccountmanagement"]', (r) => r.cells[3].textContent.trim());
    t("delivery can be moved to TBC", cell === "TBC", cell);
    await page.click('#preview [data-gname="Booking Portal"][data-gkey=app] >> nth=-1');
    await page.fill("#ed_in", "Booking Site"); await page.click("#editForm button[type=submit]");
    t("a group renamed in the preview", /Booking Site\s*12 commitments/.test(await preview()) && /1 wording edit/.test(await page.textContent("#wordInfo")));

    // order and removal
    const first = (await names())[0], second = (await names())[1];
    await page.hover("#preview tr[data-rid] >> nth=1");
    await page.click('#preview tr[data-rid] >> nth=1 >> [aria-label="Move up"]');
    t("move up swaps a row with the one above", (await names())[0] === second && (await names())[1] === first);
    await page.hover("#preview tr[data-rid] >> nth=0");
    await page.click('#preview tr[data-rid] >> nth=0 >> [aria-label="Remove from this email"]');
    t("a removed project leaves the email and can be restored", /1 removed from Q3/.test(await page.textContent("#hidInfo")) && /25 commitments/.test(await page.textContent("#summaryMain")));
    await page.click("#hidInfo [data-restore-all]");
    t("restore all brings it back", await page.isHidden("#hidInfo") && /26 commitments/.test(await page.textContent("#summaryMain")));

    // a typed subject keeps following the quarter
    await page.fill("#f_subject", "Commitments for Q3 FY26/27"); await page.locator("#f_subject").blur();
    await page.selectOption("#f_filter", "31"); await page.waitForTimeout(50);
    t("a typed subject follows the quarter picked", (await page.inputValue("#f_subject")) === "Commitments for Q2 FY26/27", await page.inputValue("#f_subject"));
    t("changes made for one quarter stay with it", !/manual change/.test(await page.textContent("#ovInfo")) || await page.isHidden("#ovInfo"));
    await page.selectOption("#f_filter", "32");
    await page.$eval("#lqBox", (d) => { d.open = true; });
    await page.fill("#f_lqDone", "11"); await page.fill("#f_lqTotal", "14"); await page.fill("#f_lqSlip", "Partner Rate API");
    await page.waitForTimeout(200);
    t("since last quarter shows the delivery rate", /Q2 in review[\s\S]*11 of 14[\s\S]*\(79%\)[\s\S]*Slipped or dropped \(1\)/.test(await preview()));
    await page.click('#layoutChips [data-chip-value="cards"]');
    await page.waitForTimeout(200);
    t("cards layout", (await page.$$("#preview table[data-rid]")).length > 10);

    await page.reload(); await page.waitForTimeout(300);
    t("the data, edits and words are kept for next time", /Booking Site/.test(await preview()) && /Blocked/.test(await preview()) &&
      (await page.inputValue("#f_lqDone")) === "11" && (await page.$$("#preview table[data-rid]")).length > 10);

    // the copied email has no editing hooks left in it
    await page.evaluate(() => { window.__copied = null; navigator.clipboard.write = async (items) => { window.__copied = await (await items[0].getType("text/html")).text(); }; });
    await page.click("#btnCopyEmail"); await page.waitForTimeout(200);
    const html = await page.evaluate(() => window.__copied || "");
    t("the copied email is clean HTML", html.length > 5000 && !/data-(rid|f|erid|lbl|gname|edit|ov)=|pem-|tabindex/.test(html) && /Booking Site/.test(html));

    // settings saved by the stand-alone builder this replaced carry over
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("piEmail.settings.v2", JSON.stringify({ title: "PI Planning commitments", team: "Old team", groupBy: "priority", subjV2: false, introV2: false, intro: "Hi,\n\nPI Planning outcomes." }));
    });
    await page.reload(); await page.click("#emptySample");
    t("the old builder's settings are migrated", (await page.inputValue("#f_team")) === "Old team" && (await page.inputValue("#f_title")) === "Quarterly Planning Commitments" &&
      /Quarterly Planning outcomes/.test(await preview()) && /Grouped by priority/.test(await preview()));

    await page.click("#btnClear"); await page.click(".modal-overlay:not([hidden]) [data-rk-ok]");
    await page.click("#emptyPaste"); await page.fill("#emptyPasteText", "Name,Status\nOnly,UAT"); await page.click("#emptyPasteGo");
    t("a file without quarters is refused with a reason", /No quarters found in Quarter Planned/.test(await page.textContent("#emptyStatus")) && await page.isVisible("#dropBig"));
  },
  "waqti-exceptions.html": async (page, t, ctx) => {
    const main = () => page.textContent("#summaryMain");
    const load = async () => {
      await page.setInputFiles("#fileInput", path.join(FIX, "waqti-export.xlsx"));
      await page.waitForSelector("#loadedView:not([hidden])", { timeout: 5000 });
    };
    const settings = async (panel) => { await page.click('.app-nav-item[data-view="settings"]'); await page.click(`.settings-nav-item[data-panel="${panel}"]`); };
    const back = () => page.click('.app-nav-item[data-view="main"]');
    const copied = async () => {
      await page.evaluate(() => { window.__c = null; navigator.clipboard.writeText = async (x) => { window.__c = { text: x }; };
        navigator.clipboard.write = async (items) => { window.__c = { html: await (await items[0].getType("text/html")).text(), text: await (await items[0].getType("text/plain")).text() }; }; });
      await page.click("#copyBtn"); await page.waitForTimeout(150);
      return page.evaluate(() => window.__c || { html: "", text: "" });
    };
    t("opens on the drop zone", await page.isVisible("#drop") && await page.isHidden("#loadedView") && await page.isDisabled("#copyBtn"));
    await load();
    t("the answer line counts exceptions, people and rows to check", (await main()) === "2 exceptions for 2 people, 1 row to check", await main());
    t("the cards and tabs carry the counts", /Demand exceptions\s*Correct\s*10\.0\s*hrs of 12\.0 logged/.test(await page.textContent("#statGrid")) &&
      (await page.textContent("#listTabs")) === "Demand exceptions2Needs attention1No time logged0", await page.textContent("#statGrid"));
    t("no people rules is called out", await page.isVisible("#noRulesHint"));
    // scoped to the Needs attention table: the page's own script also contains the words
    await page.click('#listTabs [data-tab="attn"]');
    const attn = await page.textContent("#attnBody");
    t("reads the export and flags the GEN_LINES row", /S2/.test(attn) && /System created \(GEN_LINES\); No application; Not approved for D200/.test(attn), attn.slice(0, 120));
    await page.click('#listTabs [data-tab="ex"]');
    await page.click('#exTable th[data-sort="hours"]');
    t("the exceptions sort from the header", (await page.getAttribute('#exTable th[data-sort="hours"]', "aria-sort")) === "ascending" && /^S2/.test((await page.textContent("#exBody tr")).trim()));

    // a row opens a drawer with the bookings behind it
    await page.click('#exBody tr[data-i="0"] td:nth-child(3)');
    t("a row opens its detail drawer", await page.isVisible("#drawerOverlay") && (await page.textContent("#d_title")) === "S1" && /2026-03-02\s*6\.0/.test(await page.textContent("#d_body")));
    await page.keyboard.press("Escape");
    t("Escape closes it", await page.isHidden("#drawerOverlay"));

    // the drafted email, both flavours
    let c = await copied();
    t("copies the rich email with a plain-text twin", /<table role="presentation"/.test(c.html || "") && /^Timesheet corrections needed: Mar-26\n/.test(c.text) && await page.isVisible(".toast.on"));
    await page.click("#segPlain");
    t("the format switch is a pressed button", (await page.getAttribute("#segPlain", "aria-pressed")) === "true" && await page.isVisible("#plainArea"));
    c = await copied();
    t("copies the plain-text email unchanged", c.html === undefined && c.text === "Timesheet corrections needed: Mar-26\n\nThe following bookings were made against demands the person is not currently approved for.\n\nTotal to correct: 10.0 hours across 2 people.\n\nD100 - Alpha\nStaff  Feature        Hours\n-----  -----------  -------\nS1     Feature one  6.0 hrs\n\nD200 - Beta\nStaff  Feature        Hours\n-----  -----------  -------\nS2     Feature two  4.0 hrs\n\nNEEDS ATTENTION - please review and fix these in Waqti\nStaff  Taxonomy  Reason                                                               Hours\n-----  --------  -----------------------------------------------------------------  -------\nS2     Dev       System created (GEN_LINES); No application; Not approved for D200  2.0 hrs\n\nPlease correct these in Waqti by Tuesday 31st March.", JSON.stringify(c.text));
    await page.click("#segRich");
    await page.uncheck('#exBody tr[data-i="0"] input[data-kind]');
    t("an unticked row leaves the email", !/S1\s+Feature one/.test(await page.textContent("#richPreview")) && /1 of 2 in the email/.test(await page.textContent("#listMeta")));
    await page.check('#exBody tr[data-i="0"] input[data-kind]');

    // Settings > People: an approval ticked in the grid clears that exception
    await settings("panel-approvals");
    t("Settings shows the version", /^v3\.\d+\.\d+$/.test(await page.textContent(".app-version")));
    await page.check('#gridWrap input[data-sid="S1"][data-demand="D100"]');
    await page.fill('#gridWrap input[data-name="S1"]', "Sam One");
    await back();
    t("approving in the grid changes the count", (await main()) === "1 exception for 1 person, 1 row to check", await main());
    // and from the drawer
    await page.click('#exBody tr[data-i="0"] td:nth-child(3)');
    await page.click("#d_body [data-d-approve]");
    t("Approve in the drawer clears the last exception", (await main()) === "No demand exceptions, 1 row to check" && /cleared/.test(await page.textContent(".toast")), await main());
    await page.click('#listTabs [data-tab="attn"]');
    await page.uncheck('#attnBody tr[data-i="0"] input[data-kind]');
    t("with every row unticked there is nothing to copy", await page.isDisabled("#copyBtn") && /Nothing to email/.test(await page.textContent("#richPreview")));
    await page.check('#attnBody tr[data-i="0"] input[data-kind]');

    // email wording
    await settings("panel-email");
    await page.fill("#periodInput", "March 2026");
    await back();
    t("the period typed in Settings heads the email", /Timesheet corrections needed: March 2026/.test(await page.textContent("#richPreview")));

    // rules.json export: same shape and key order as earlier versions
    await settings("panel-file");
    const dl = page.waitForEvent("download", { timeout: 5000 });
    await page.click("#exportBtn");
    const raw = fs.readFileSync(await (await dl).path(), "utf8"), rules = JSON.parse(raw);
    t("exports rules.json with the edits", Object.keys(rules).join() === "schemaVersion,generatedAt,label,ignoredTaxonomies,staff" && rules.ignoredTaxonomies.length === 9 &&
      JSON.stringify(rules.staff.S1) === '{"name":"Sam One","trackLoggedTime":true,"approvedDemands":["D100"]}' && rules.staff.S2.approvedDemands[0] === "D200", raw.slice(0, 300));

    // Raw JSON: invalid text is refused and kept, not overwritten by edits elsewhere (WQ-03)
    await settings("panel-json");
    await page.fill("#jsonArea", "{ not json"); await page.click("#applyJson");
    t("invalid raw JSON is refused in the page", await page.isVisible("#jsonError") && await page.isVisible("#revertJson"));
    await settings("panel-approvals");
    await page.uncheck('#gridWrap input[data-team="S1"]');
    t("and kept while other rules change", (await page.inputValue("#jsonArea")) === "{ not json");
    await settings("panel-json"); await page.click("#revertJson");
    t("discard puts the live rules back", /"trackLoggedTime": false/.test(await page.inputValue("#jsonArea")));

    // Save tool with rules: the copy carries the rules, no messages or loaded data
    await settings("panel-file");
    const bk = page.waitForEvent("download", { timeout: 5000 });
    await page.click("#bakeBtn");
    const baked = fs.readFileSync(await (await bk).path(), "utf8");
    t("the baked copy carries the rules and wording, nothing loaded", /id="embeddedRules">\{[\s\S]*"S1"/.test(baked) && /id="embeddedEmail">\{"intro"/.test(baked) &&
      !/class="toast/.test(baked) && !/Sam One<\/span>|value="Sam One"/.test(baked) && /id="jsonError" role="alert" hidden=""><\/div>/.test(baked));
    const bakedFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "wx-bake-")), "waqti-exceptions.html");
    fs.writeFileSync(bakedFile, baked);
    const p2 = await page.context().newPage(), e2 = [];
    p2.on("pageerror", (e) => e2.push(e.message));
    await p2.goto("file://" + bakedFile); await p2.waitForTimeout(300);
    await p2.setInputFiles("#fileInput", path.join(FIX, "waqti-export.xlsx")); await p2.waitForSelector("#loadedView:not([hidden])");
    t("the baked copy opens clean and uses its rules", e2.length === 0 && await p2.isHidden("#bakedHint") && (await p2.textContent("#summaryMain")) === "No demand exceptions, 1 row to check", (await p2.textContent("#summaryMain")) + e2.join());
    await p2.close();

    // phone width, with the baked rules loaded
    await ctx.phone("rules loaded");

    // an autosave from an earlier version (same key, lower-case id, no ignore list) still loads
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("waqti-exceptions:v1", JSON.stringify({ rules: { label: "old set", staff: { s2: { name: "Sara Two", approvedDemands: ["D200"] } }, generatedAt: null }, source: "import", loadedAt: 1700000000000, email: { intro: "Old intro", closing: "Old closing by {deadline}" } })); });
    await page.reload(); await page.waitForTimeout(300); await load();
    t("rules saved by earlier versions load", (await main()) === "1 exception for 1 person, 1 row to check" && /Sara Two/.test(await page.textContent("#richPreview")) && /Old intro/.test(await page.textContent("#richPreview")), await main());
  },
  "waqti-demand-summary.html": async (page, t) => {
    const load = async () => {
      await page.setInputFiles("#fileInput", path.join(FIX, "waqti-export.xlsx"));
      await page.waitForSelector("#loadedView:not([hidden])", { timeout: 5000 });
    };
    const copied = async () => {
      await page.evaluate(() => { window.__c = null; navigator.clipboard.write = async (items) => { window.__c = { html: await (await items[0].getType("text/html")).text(), text: await (await items[0].getType("text/plain")).text() }; }; });
      await page.click("#copyBtn"); await page.waitForTimeout(150);
      return page.evaluate(() => window.__c || { html: "", text: "" });
    };
    t("opens on the drop zone", await page.isVisible("#drop") && await page.isHidden("#loadedView"));
    await load();
    const list = await page.textContent("#demandList");
    t("lists the export's demands", /D100/.test(list) && /D200/.test(list), list);
    t("asks for a pick before anything is selected", /Tick the demands/.test(await page.textContent("#summaryMain")) && await page.isDisabled("#copyBtn"));

    await page.click("#selectAllBtn");
    t("the answer line totals the selected demands", (await page.textContent("#summaryMain")) === "12.0 hours on 2 demands by 2 people", await page.textContent("#summaryMain"));
    t("the hours card shows the selected hours", /Hours selected\s*12\.0\s*of 12\.0 hrs/.test(await page.textContent("#statGrid")), await page.textContent("#statGrid"));
    const sum = await page.textContent("#summaryBody");
    t("a table per demand with the person, feature and total", /D100\s*Alpha[\s\S]*S1\s*Feature one\s*6\.0\s*Demand total\s*6\.0/.test(sum) && /D200\s*Beta[\s\S]*S2\s*Feature two\s*6\.0/.test(sum), sum.slice(0, 200));
    await page.click('#demandTable th[data-sort="hours"]');
    t("the demand list sorts from its header", (await page.getAttribute('#demandTable th[data-sort="hours"]', "aria-sort")) === "ascending");
    await page.fill("#demandSearch", "beta");
    t("the header search filters the demands", (await page.$$("#demandList tr")).length === 1 && /D200/.test(await page.textContent("#demandList")));
    await page.fill("#demandSearch", "");

    let c = await copied();
    t("copies the tables as HTML and text", /<table role="presentation"/.test(c.html) && c.text === "D100 · Alpha\nName\tFeature\tTotal Hours Booked\nS1\tFeature one\t6.0\nDemand total\t\t6.0\n\nD200 · Beta\nName\tFeature\tTotal Hours Booked\nS2\tFeature two\t6.0\nDemand total\t\t6.0\n", JSON.stringify(c.text));
    t("says it copied", await page.isVisible(".toast.on"));

    // staff names live in Settings; a typed name reaches the summary and the copy
    await page.click('.app-nav-item[data-view="settings"]');
    t("Settings opens on the staff-name editor", await page.isVisible("#staffNamesWrap input.name-input[data-sid=S1]") && /v\d+\.\d+\.\d+/.test(await page.textContent(".app-version")));
    await page.fill("#staffNamesWrap input.name-input[data-sid=S1]", "Sam One");
    await page.click('.app-nav-item[data-view="main"]');
    t("a typed name shows in the summary", /Sam One\s*Feature one/.test(await page.textContent("#summaryBody")));
    c = await copied();
    t("and in the copied text", /\nSam One\tFeature one\t6\.0\n/.test(c.text) && /Sam One/.test(c.html));
    await page.reload(); await load();
    await page.click("#selectAllBtn");
    t("names are kept for next time", /Sam One/.test(await page.textContent("#summaryBody")));

    await page.click('.app-nav-item[data-view="settings"]');
    await page.click('.settings-nav-item[data-tab="rules"]');
    const dl = page.waitForEvent("download", { timeout: 5000 });
    await page.click("#exportRulesBtn");
    const rules = JSON.parse(fs.readFileSync(await (await dl).path(), "utf8"));
    t("exports rules.json with the typed name", rules.schemaVersion === 1 && rules.staff.S1 && rules.staff.S1.name === "Sam One" && /Exported rules\.json/.test(await page.textContent("#exportRulesMsg")));
    await page.click("#clearRulesBtn");
    t("clearing names asks first, in the page", await page.isVisible(".modal-overlay:not([hidden]) [data-rk-ok]"));
    await page.click(".modal-overlay:not([hidden]) [data-rk-ok]");
    t("and then clears them", /No names loaded/.test(await page.textContent("#rulesStatus")));

    // names saved by v1 (same key and shape) still load
    await page.evaluate(() => localStorage.setItem("waqti-demand-summary:v1", JSON.stringify({ names: { s2: "Sara Two" }, demands: {}, staff: {}, extraTop: {}, label: "old" })));
    await page.reload(); await load();
    await page.click("#selectAllBtn");
    t("names saved by the kit 1 version load", /Sara Two\s*Feature two/.test(await page.textContent("#summaryBody")));
  },
  "project-cost-tracker.html": async (page, t) => {
    // first open: nothing set up, so a panel says where to start
    t("a fresh tracker opens on the set-up panel", await page.isVisible("#onboard"));
    await page.click('#onboard button[data-goto-tab="project"]');
    t("which goes to Settings, Project", await page.isVisible("#panel-setup") &&
      (await page.getAttribute('.app-nav-item[data-view="settings"]', "aria-current")) === "page");
    await page.click('.app-nav-item[data-view="report"]');
    await page.click("#onboardDemo");
    t("and offers the demo", await page.isVisible(".modal-overlay:not([hidden]) [data-rk-ok]"));
    await page.click(".modal-overlay:not([hidden]) [data-rk-cancel]");

    // Demo and the CSV export live under Settings, Saving & data
    await page.click('.app-nav-item[data-view="settings"]');
    await page.click('.settings-nav-item[data-tab="data"]');
    await page.click("#demoBtn");
    t("loading the demo asks first, in the page", await page.isVisible(".modal-overlay [data-rk-ok]"));
    await page.click(".modal-overlay [data-rk-ok]");
    await page.waitForTimeout(300);
    const dl = page.waitForEvent("download", { timeout: 5000 });
    await page.click("#expCsv");
    const csv = fs.readFileSync(await (await dl).path(), "utf8");
    t("loads the demo and exports a ledger CSV", csv.split("\n").length > 3);

    // Adding months: the dialog offers zero or carry-on team costs, and months the
    // project had hidden come back with their figures unless cleared.
    const forecast = async () => (/forecast at completion\s*AED\s*([\d,]+)/i.exec(await page.textContent("#kpis")) || [])[1];
    const months = (n) => page.$eval("#duration", (d, n) => { d.value = n; d.dispatchEvent(new Event("change", { bubbles: true })); }, n);
    const open = () => page.$eval("#extModal", (m) => !m.hidden);
    const before = await forecast();
    await months(15);
    t("adding months asks how to cost the team", await open());
    await page.click("#extOk");
    t("months added at zero leave the forecast unchanged", (await forecast()) === before, before + " -> " + (await forecast()));
    await months(12); await months(15);
    await page.click("#extCarry"); await page.click("#extOk");
    const carried = await forecast();
    t("carrying the team on adds its cost", carried !== before, carried);
    await months(12); await months(15);
    t("months that come back with figures say so", await page.$eval("#extHidden", (e) => !e.hidden));
    await page.click("#extClear"); await page.click("#extOk");
    t("clearing them starts the months empty", (await forecast()) === before, before + " -> " + (await forecast()));

    // Delaying the timeline: the plan moves later; actuals, the estimate and a
    // zero-cost forecast stay where they were; the change is logged; undo reverses it.
    await page.$eval("#demoBtn", (b) => b.click());
    await page.click(".modal-overlay:not([hidden]) [data-rk-ok]");
    const actuals = () => page.$$eval("#ledgerBody input", (i) => i.slice(0, 7).map((x) => x.value).join(","));
    const a0 = await actuals();
    await page.$eval("#delaySettingsBtn", (b) => b.click());
    await page.click('#dlChips [data-months="3"]');
    await page.fill("#dlReason", "Vendor environment not ready");
    await page.click("#dlOk");
    t("a zero-cost delay leaves the forecast unchanged", (await forecast()) === before, before + " -> " + (await forecast()));
    t("the delay moves the end and says so", /3 months later than first planned/.test(await page.textContent("#headerSub")));
    t("actuals stay on their months", (await actuals()) === a0);
    t("the delay is logged with its reason", /Delayed 3 months from Aug 26[\s\S]*Vendor environment not ready/.test(await page.textContent("#timelineHistory")));
    await page.click("#undoBtn");
    t("undo takes the delay back", (await page.$eval("#duration", (d) => d.value)) === "12" && !/later than/.test(await page.textContent("#headerSub")));
    t("the set-up panel is gone once there is a project", await page.isHidden("#onboard"));

    // A timesheet whose ProjectName cells are names on Object.prototype imports like
    // any other (it used to stop the whole import, or write onto Object.prototype),
    // and a saved code of "valueOf" (also on Object.prototype, not in the file) asks for the right one.
    await page.click('.app-nav-item[data-view="settings"]'); await page.click('.settings-nav-item[data-tab="project"]');
    await page.fill("#ukCode", "valueOf");
    await page.click('.settings-nav-item[data-tab="import"]');
    await page.setInputFiles("#tsFile", path.join(FIX, "ct-timesheet-proto.xlsx")); await page.waitForTimeout(300);
    const codes = await page.$$eval("#tsCodeList [data-code]", (b) => b.map((x) => x.getAttribute("data-code")).sort().join(","));
    t("a timesheet with constructor and __proto__ projects opens its code list", await page.isVisible("#tsPickCode") &&
      codes === "Smoke Project,__proto__,constructor,toString", codes);
    t("and leaves Object.prototype alone", await page.evaluate(() => { const o = {}; return o.rows === undefined && o.hours === undefined && o.people === undefined; }));
    await page.click('#tsCodeList [data-code="constructor"]'); await page.waitForTimeout(100);
    t("a project called constructor reviews like any other", await page.isVisible("#tsReview") && /Ann Lee/.test(await page.textContent("#tsBody")) && !(await page.isDisabled("#tsAccept")));
    await page.click("#tsClose");
  },
  "pi-planning-capacity.html": async (page, t, ctx) => {
    const main = () => page.textContent("#summaryMain");
    const ok = () => page.click(".modal-overlay:not([hidden]) [data-rk-ok]");
    const settings = async (panel) => { await page.click('.app-nav-item[data-view="settings"]'); await page.click(`.settings-nav-item[data-panel="${panel}"]`); };
    const back = () => page.click('.app-nav-item[data-view="main"]');
    const tab = (name) => page.click(`#mainTabs [data-tab="${name}"]`);
    const download = async (sel) => {
      const dl = page.waitForEvent("download", { timeout: 5000 });
      await page.click(sel);
      const d = await dl;
      return { name: d.suggestedFilename(), text: fs.readFileSync(await d.path(), "utf8") };
    };
    // a known plan in a file shared with a cost tracker project (the "other" key is the tracker's half);
    // its figures were checked against v1.1.1, the last kit 1 version
    const plan = { other: { keep: 1 }, piCapacity: { schemaVersion: 1, settings: { fy: "FY2627", quarter: 2, pointsPerDay: 2, hoursPerDay: 8 },
      teams: [
        { id: "t-a", name: "Alpha", focusFactor: 80, members: [
          { id: "m-ann", name: "Ann Dev", roleId: "dev", locId: "uk", allocation: 100 },
          { id: "m-raj", name: "Raj QA", roleId: "qa", locId: "in", allocation: 50 },
          { id: "m-pat", name: "Pat PO", roleId: "po", locId: "uk", allocation: 100 }] },
        { id: "t-b", name: "Beta", focusFactor: 100, members: [
          { id: "m-lee", name: "Lee Dev", roleId: "dev", locId: "uae", allocation: 100, to: "2026-09-04" }] }],
      leave: [
        { id: "v1", memberId: "m-ann", from: "2026-07-13", to: "2026-07-17", type: "Annual leave" },
        { id: "v2", memberId: "m-lee", from: "2026-08-24", to: "2026-08-26", halfDay: true, type: "Other" }] } };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cap-"));
    const planFile = path.join(dir, "plan.json");
    fs.writeFileSync(planFile, JSON.stringify(plan));

    t("opens on the set-up prompt", await page.isVisible("#startView") && /^No teams yet for FY2627 Q\d$/.test(await main()), await main());
    await page.setInputFiles("#jsonInput", planFile); await page.waitForTimeout(200);
    t("the answer line totals the plan", (await main()) === "Team capacity for FY2627 Q2: 118.8 person-days across 2 teams", await main());
    const cards = (await page.innerText("#statGrid")).replace(/\s+/g, " ");
    t("the cards carry capacity, points, hours, leave, holidays and people",
      /Capacity 118\.8 person-days Points 237\.6 Hours 950/.test(cards) && /Lost to leave 6\.0/.test(cards) && /2 to confirm 3\.0/.test(cards) && /People counted 3 of 4 on the teams/.test(cards), cards);
    const rows = await page.$$eval("#matrixTable tr", (r) => r.map((x) => [...x.cells].map((c) => c.querySelector(".amt-value") ? c.querySelector(".amt-value").textContent : c.textContent.trim())));
    t("capacity per team per sprint", JSON.stringify(rows.slice(1)) === JSON.stringify([
      ["Alpha2 of 3 counted · focus 80%", "10.4", "9.6", "12.0", "12.0", "11.2", "11.6", "6.0", "72.8"],
      ["Beta1 of 1 counted · focus 100%", "10.0", "10.0", "10.0", "8.5", "7.5", "0.0", "0.0", "46.0"],
      ["All teams", "20.4", "19.6", "22.0", "20.5", "18.7", "11.6", "6.0", "118.8"]]), JSON.stringify(rows.slice(1)));
    t("estimated holiday dates are called out", /2 public holiday dates in this PI are a seeded estimate/.test(await page.textContent("#alerts")));

    // a team and a member added through the dialogs
    await settings("panel-teams");
    t("Settings shows the version", /^v2\.\d+\.\d+$/.test(await page.textContent(".app-version")));
    await page.click("#addTeam");
    await page.fill("#t_name", "Gamma"); await page.fill("#t_focus", "80"); await page.click("#t_ok");
    await page.click('[data-add-m]:not([data-add-m="t-a"]):not([data-add-m="t-b"])');
    t("the member dialog opens on the new team", await page.isVisible("#memberOverlay") && (await page.$eval("#m_team", (s) => s.selectedOptions[0].textContent)) === "Gamma");
    await page.fill("#m_name", "Sam Smoke"); await page.selectOption("#m_role", "qa"); await page.selectOption("#m_loc", "uk");
    await page.fill("#m_alloc", "50"); await page.click("#m_ok");
    t("the member is listed under the team", /Sam Smoke/.test(await page.textContent("#teamsWrap")) && await page.isHidden("#memberOverlay"));

    // allocation is edited in the team grid (v2.1.0): it commits on Enter or on leaving the field, Escape puts it
    // back, Tab goes down the allocations, it follows the dialog's rule, and it never opens the person dialog
    const alloc = (id) => page.locator(`#teamsWrap input[data-alloc-m="${id}"]`);
    const piDays = async (id) => Number(await page.textContent(`#teamsWrap tr[data-edit-m="${id}"] td:nth-child(6)`));
    const teamDays = async (id) => Number(/· ([\d.]+) days this PI/.exec(await page.textContent(`.panel:has([data-add-m="${id}"]) .panel-title .hint`))[1]);
    const answer = async () => Number(/: ([\d.]+) person-days/.exec(await main())[1]);
    const stored = (id) => page.evaluate((m) => JSON.parse(localStorage.getItem("pi-capacity:state:v1")).piCapacity.teams
      .flatMap((x) => x.members).find((x) => x.id === m).allocation, id);
    const focused = () => page.evaluate(() => document.activeElement.getAttribute("data-alloc-m"));
    t("each allocation is a field named after its person", (await alloc("m-raj").getAttribute("aria-label")) === "Allocation for Raj QA" &&
      (await alloc("m-raj").inputValue()) === "50" && (await alloc("m-raj").evaluate((e) => e.classList.contains("cell-input"))));
    const ann0 = await piDays("m-ann"), alpha0 = await teamDays("t-a"), all0 = await answer();
    await alloc("m-ann").click();
    t("clicking the allocation edits it in place, without the dialog", await page.isHidden("#memberOverlay") && (await focused()) === "m-ann");
    await page.keyboard.press("Control+A"); await page.keyboard.type("50");
    t("nothing changes while typing", (await piDays("m-ann")) === ann0 && (await stored("m-ann")) === 100);
    await page.keyboard.press("Enter");
    t("Enter commits it: the person's PI days halve, and the team and the Capacity view drop by as much",
      Math.abs((await piDays("m-ann")) - ann0 / 2) < 0.06 && Math.abs((await teamDays("t-a")) - (alpha0 - ann0 / 2)) < 0.11 &&
      Math.abs((await answer()) - (all0 - ann0 / 2)) < 0.11 && (await stored("m-ann")) === 50,
      [ann0, await piDays("m-ann"), alpha0, await teamDays("t-a"), all0, await answer()].join(" "));
    t("and Enter does not open the dialog either", await page.isHidden("#memberOverlay") && (await focused()) === "m-ann");
    await page.keyboard.type("10"); await page.keyboard.press("Escape");
    t("Escape puts the old value back", (await alloc("m-ann").inputValue()) === "50" && (await stored("m-ann")) === 50 && await page.isHidden("#memberOverlay"));
    await page.keyboard.press("Tab");
    t("Tab goes to the next person's allocation", (await focused()) === "m-raj");
    const raj0 = await piDays("m-raj");
    await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.press("Tab");
    t("a blank allocation is 100%, as in the dialog, and Tab commits it on the way", (await alloc("m-raj").inputValue()) === "100" &&
      (await stored("m-raj")) === 100 && Math.abs((await piDays("m-raj")) - raj0 * 2) < 0.11 && (await focused()) === "m-pat", (await piDays("m-raj")) + " " + raj0);
    await page.keyboard.type("-5"); await page.keyboard.press("Enter");
    t("a negative allocation is refused with the dialog's message and the field goes back", (await alloc("m-pat").inputValue()) === "100" &&
      (await stored("m-pat")) === 100 && /percentage of 0 or more/.test(await page.textContent(".toast")));
    await page.keyboard.press("Tab");
    t("Tab carries on into the next team", (await focused()) === "m-lee");
    await alloc("m-ann").fill("100"); await alloc("m-raj").fill("50"); await alloc("m-raj").press("Enter");
    t("put back, the figures are as they were", (await piDays("m-ann")) === ann0 && (await teamDays("t-a")) === alpha0 && (await answer()) === all0);
    await page.click('#teamsWrap tr[data-edit-m="m-ann"] .pic-name');
    t("a click elsewhere on the row still opens the dialog", await page.isVisible("#memberOverlay") && (await page.inputValue("#m_alloc")) === "100");
    await page.keyboard.press("Escape");
    await back();
    t("a new team and member add their capacity", (await main()) === "Team capacity for FY2627 Q2: 144.4 person-days across 3 teams", await main());

    // leave added through the dialog takes capacity off (5 days x 50% x 80%)
    await tab("leave");
    await page.click("#addLeave");
    await page.selectOption("#l_member", { label: "Sam Smoke, Gamma" });
    await page.fill("#l_from", "2026-07-06"); await page.fill("#l_to", "2026-07-10");
    t("the leave dialog previews the working days", (await page.textContent("#l_impact")) === "Takes 5.0 working days off FY2627 Q2.", await page.textContent("#l_impact"));
    await page.click("#l_ok");
    t("leave takes capacity off", (await main()) === "Team capacity for FY2627 Q2: 142.4 person-days across 3 teams", await main());
    t("and is listed on the Leave tab", /Sam Smoke[\s\S]*6 Jul 2026[\s\S]*5\.0/.test(await page.textContent("#leaveBody")));

    // by person: sorting and the drawer
    await tab("people");
    await page.click('#peopleTable th[data-sort="cap"]');
    const caps = await page.$$eval("#peopleBody tr td:last-child .amt-value", (c) => c.map((x) => Number(x.textContent)));
    t("the person table sorts from its header", (await page.getAttribute('#peopleTable th[data-sort="cap"]', "aria-sort")) === "ascending" &&
      caps.length === 5 && caps.every((v, i) => !i || caps[i - 1] <= v), caps.join());
    await page.focus('#peopleBody tr[data-person="m-ann"]'); await page.keyboard.press("Enter");
    t("a person opens a drawer from the keyboard, with where their days went", await page.isVisible("#drawerOverlay") && (await page.textContent("#d_title")) === "Ann Dev" &&
      /Q2\.2\s*10\s*0\s*0\s*3\.0\s*7\.0\s*5\.6/.test(await page.textContent("#d_body")), await page.textContent("#d_body"));
    await page.keyboard.press("Escape");
    t("Escape closes it", await page.isHidden("#drawerOverlay"));
    const csv = await download("#exportPeopleCsv");
    t("exports the person table as CSV", csv.name === "pi-per-person-FY2627Q2.csv" && csv.text.charCodeAt(0) === 0xFEFF && csv.text.split("\n").length === 7 &&
      /\nCounted toward capacity,,,,,,[^\n]*,142\.4,284\.8/.test(csv.text), csv.text.slice(0, 300));
    await page.evaluate(() => { window.__c = null; navigator.clipboard.write = async (items) => { window.__c = await (await items[0].getType("text/plain")).text(); }; });
    await tab("teams"); await page.click("#copyMatrix"); await page.waitForTimeout(100);
    t("copies the team table", /\nGamma\t2\.0\t4\.0\t4\.0\t4\.0\t3\.6\t4\.0\t2\.0\t23\.6\nAll teams\t[^\n]*\t142\.4$/.test(await page.evaluate(() => window.__c || "")), await page.evaluate(() => window.__c));

    // save and load: the file holds both halves, and reads back to the same figures
    const saved = await download("#topSave");
    const doc = JSON.parse(saved.text);
    t("Save JSON keeps the other tool's half and the schema", saved.name === "pi-capacity-FY2627Q2.json" && doc.other.keep === 1 && doc.piCapacity.schemaVersion === 1 &&
      doc.piCapacity.teams.length === 3 && doc.piCapacity.leave.length === 3, saved.text.slice(0, 200));
    await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(200);
    t("a cleared browser opens empty", await page.isVisible("#startView"));
    const savedFile = path.join(dir, saved.name); fs.writeFileSync(savedFile, saved.text);
    await page.setInputFiles("#jsonInput", savedFile); await page.waitForTimeout(200);
    t("the saved file loads back to the same figures", (await main()) === "Team capacity for FY2627 Q2: 142.4 person-days across 3 teams", await main());

    // deleting asks in the page; Cancel keeps it
    await tab("leave");
    await page.click('#leaveBody tr:has-text("Sam Smoke") [data-del-leave]');
    t("delete asks first, in the page", await page.isVisible(".modal-overlay:not([hidden]) [data-rk-ok]"));
    await page.click(".modal-overlay:not([hidden]) [data-rk-cancel]");
    t("Cancel keeps the leave", (await main()) === "Team capacity for FY2627 Q2: 142.4 person-days across 3 teams");
    await page.click('#leaveBody tr:has-text("Sam Smoke") [data-del-leave]'); await ok();
    t("and OK deletes it", (await main()) === "Team capacity for FY2627 Q2: 144.4 person-days across 3 teams", await main());
    // loading over a plan asks before replacing it
    await page.setInputFiles("#jsonInput", planFile); await page.waitForTimeout(200);
    t("loading over a plan asks first", await page.isVisible(".modal-overlay:not([hidden]) [data-rk-ok]"));
    await ok(); await page.waitForTimeout(100);
    t("and replaces it", (await main()) === "Team capacity for FY2627 Q2: 118.8 person-days across 2 teams", await main());
    t("every dialog field has a label", await page.$$eval(".modal input, .modal select", (els) => els.every((e) => e.labels.length || e.getAttribute("aria-label"))));

    // phone width on each of the main tabs: wide grids scroll inside their table
    for (const v of ["teams", "people", "leave"]) { await back(); await tab(v); await ctx.phone(v + " tab"); }
    await back();

    // the demo asks first when it would replace a plan
    await settings("panel-data");
    await page.click("#demoBtn");
    t("loading the demo asks first, in the page", await page.isVisible(".modal-overlay:not([hidden]) [data-rk-ok]"));
    await ok();
    t("the demo opens on its answer", /^Team capacity for FY2627 Q1: [\d.]+ person-days across 3 teams$/.test(await main()) && await page.isVisible("#mainView"), await main());

    // a plan saved in the browser by v1.1.1 (same key and shape), and a flat file from before the envelope
    await page.evaluate((s) => { localStorage.clear(); localStorage.setItem("pi-capacity:state:v1", s); },
      JSON.stringify({ other: { keep: 1 }, piCapacity: Object.assign({ appVersion: "1.1.1", generatedAt: "2026-10-01T09:00:00.000Z" }, plan.piCapacity) }));
    await page.reload(); await page.waitForTimeout(200);
    t("a plan saved by v1.1.1 loads", (await main()) === "Team capacity for FY2627 Q2: 118.8 person-days across 2 teams" && /Saved in this browser/.test(await page.textContent("#saveState")), await main());
    const flat = path.join(dir, "flat.json");
    fs.writeFileSync(flat, JSON.stringify({ settings: { fy: "FY2627", quarter: 1 }, teams: [{ id: "t1", name: "Legacy", focusFactor: "80",
      members: [{ id: "a", name: "Old Dev", roleId: "dev", locId: "uk", allocation: "100" }] }], leave: [{ id: "x", memberId: "a", from: "2026-04-03", to: "2026-04-10" }] }));
    await page.setInputFiles("#jsonInput", flat); await page.waitForTimeout(200); await ok(); await page.waitForTimeout(100);
    t("a file from before the envelope loads", (await main()) === "Team capacity for FY2627 Q1: 45.6 person-days across 1 team", await main());
  },
  "uat-signoff-tracker.html": async (page, t, ctx) => {
    const lines = [];
    page.on("console", (m) => lines.push(m.text()));
    await page.goto(ctx.url + "?selftest=1");
    await page.waitForTimeout(300);
    const summary = lines.find((l) => /^Self tests: /.test(l)) || "";
    const m = /(\d+)\/(\d+) passed/.exec(summary);
    t("built-in self tests pass (" + (m ? m[0] : "none ran") + ")", !!m && m[1] === m[2] && Number(m[2]) > 0,
      lines.filter((l) => /^FAIL/.test(l)).join("; ") || summary);

    // demo: amber, with its reasons, and an email that leads with the status
    await page.click("#btnDemoOnboard");
    await page.waitForTimeout(200);
    t("the demo opens amber with its reasons", /Amber/.test(await page.textContent("#ragPill")) && /critical defect open/.test(await page.textContent("#ragWhy")));
    await page.click('.app-nav-item[data-view="email"]');
    const preview = await page.textContent("#emPreview");
    t("the email leads with the status and has the exit criteria", /AMBER/.test(preview) && /Exit criteria: \d+ of \d+ met/.test(preview));
    t("the suggested subject carries the status", /^\[UAT\] .* update: AMBER/.test(await page.getAttribute("#emSubject", "placeholder")));
    t("the chip rows are named groups", (await page.getAttribute("#emTypeChips", "role")) === "group" &&
      (await page.getAttribute("#emTypeChips", "aria-label")) === "Email type" && (await page.getAttribute("#emAudienceChips", "aria-label")) === "Audience");
    t("the nav marks the current view", (await page.getAttribute('.app-nav-item[data-view="email"]', "aria-current")) === "page" &&
      !(await page.getAttribute('.app-nav-item[data-view="overview"]', "aria-current")));

    // a status changed in the list moves the figures
    await page.click('.app-nav-item[data-view="tests"]');
    const passedTab = async () => Number(await page.textContent('#testTabs [data-tab="Passed"] .seg-tab-count'));
    const before = await passedTab();
    t("each row's status select is named after its test", (await page.getAttribute('#testBody select[data-inline="test"]', "aria-label")) === "Status of UAT-001");
    const notRun = page.locator('#testBody select[data-inline="test"]', { has: page.locator('option:checked', { hasText: /^Not run$/ }) }).first();
    await notRun.selectOption("Passed");
    t("an in-row status change updates the counts", (await passedTab()) === before + 1);

    // paste from Excel: a new test is added, an existing one is updated by ID
    const count = async () => Number(await page.textContent('#testTabs [data-tab="all"] .seg-tab-count'));
    const n0 = await count();
    await page.click('#view-tests [data-import="tests"]');
    await page.fill("#importPaste", "Test Case ID\tScenario\tModule\tResult\nUAT-001\tRegister a new customer account\tAccounts and login\tFail\nNEW-1\tPasted test\tImports\tPass");
    await page.waitForSelector("#importOk:not([disabled])", { timeout: 2000 });
    await page.click("#importOk");
    await page.waitForTimeout(200);
    const row1 = await page.$eval("#testBody", (b) => [...b.rows].find((r) => /UAT-001/.test(r.textContent)).querySelector("select").value);
    t("a pasted import adds new rows and updates by ID", (await count()) === n0 + 1 && row1 === "Failed", (await count()) + " " + row1);

    // copying never throws: either it reaches the clipboard or the manual box appears
    await page.click("#btnCopyEmail");
    await page.waitForTimeout(300);
    t("copy email reaches the clipboard or offers the text", (await page.isVisible(".toast.on")) || (await page.isVisible("#headerCopyFallback textarea")));
  },
  "vendor-spend-tracker.html": async (page, t, ctx) => {
    const lines = [];
    page.on("console", (m) => lines.push(m.text()));
    await page.goto(ctx.url + "?selftest=1");
    await page.waitForTimeout(300);
    const summary = lines.find((l) => /^Self tests: /.test(l)) || "";
    const m = /(\d+)\/(\d+) passed/.exec(summary);
    t("built-in self tests pass (" + (m ? m[0] : "none ran") + ")", !!m && m[1] === m[2] && Number(m[2]) > 0,
      lines.filter((l) => /^FAIL/.test(l)).join("; ") || summary);

    // a fresh install: the empty list names the real first step, and New goes there
    await page.goto(ctx.url); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(200);
    t("the empty list starts with a budget", /Start with a budget, then a vendor, in Settings/.test(await page.textContent("#emptyState")));
    await page.click("#btnNewItem");
    t("New line item with no budget opens Settings on Budgets, and says why", await page.isVisible("#panel-budgets") &&
      /Create a budget first/.test(await page.textContent(".toast")));
    await page.click('.app-nav-item[data-view="items"]');
    await page.click('#emptyState [data-goto-panel]');
    t("the empty list's link goes to Budgets too", await page.isVisible("#panel-budgets") &&
      (await page.getAttribute('.app-nav-item[data-view="settings"]', "aria-current")) === "page");

    // a workspace with data
    await page.evaluate(() => localStorage.setItem("vendorSpendTracker.v1", JSON.stringify({
      budgets: [{ id: "b1", name: "Marketing", total: 500000, adjustments: [] }, { id: "b2", name: "Spare", total: 1000, adjustments: [] }],
      vendors: [{ id: "v1", name: "Acme Ltd", systemName: "", defaultCurrency: "USD", defaultBudgetId: "b1" }, { id: "v2", name: "Unused", systemName: "", defaultCurrency: "AED", defaultBudgetId: "" }],
      items: [{ id: "i1", vendorId: "v1", budgetId: "b1", description: "Retainer", stage: "PO issued", currency: "USD", currentAmount: 1000, invoicedAmount: 0, dateEntered: "2026-04-02", dateUpdated: "2026-04-10", notes: [] }],
      settings: { rates: { AED: 1, USD: 3.673, GBP: 4.5, EUR: 4.1 } } })));
    await page.reload(); await page.waitForTimeout(200);
    const row = await page.$eval('#itemsBody tr[data-detail-item="i1"]', (r) => ({ role: r.getAttribute("role"), tab: r.getAttribute("tabindex"), date: r.cells[5].className }));
    t("a row is a focusable row, not a button holding buttons", row.role === null && row.tab === "0", JSON.stringify(row));
    t("the Updated date is mono", row.date === "mono");
    await page.focus('#itemsBody tr[data-detail-item="i1"]'); await page.keyboard.press("Enter");
    t("Enter on a row opens its drawer", await page.isVisible("#detailModalOverlay"));
    await page.click("#btnDetailDelete");
    t("deleting a line item asks in the page, as a danger", await page.isVisible(".modal-overlay:not([hidden]) [data-rk-ok].danger-fill"));
    await page.click(".modal-overlay:not([hidden]) [data-rk-cancel]");
    t("Cancel keeps it", (await page.$$("#itemsBody tr")).length === 1);
    await page.keyboard.press("Escape");

    // the invoiced-over-amount question is asked in the page, and Save anyway saves
    await page.click('#itemsBody tr[data-detail-item="i1"] td:nth-child(2)'); await page.click("#btnDetailEdit");
    await page.fill("#f_invoicedAmount", "5000");
    await page.click("#itemForm button[type=submit]");
    t("more invoiced than the amount asks first", /greater than Current Amount/.test(await page.textContent(".modal-overlay:not([hidden]) .modal-lead")));
    await page.click(".modal-overlay:not([hidden]) [data-rk-ok]"); await page.waitForTimeout(100);
    t("and Save anyway saves", await page.isHidden("#itemModalOverlay") &&
      (await page.evaluate(() => JSON.parse(localStorage.getItem("vendorSpendTracker.v1")).items[0].invoicedAmount)) === 5000);
    await page.click('#itemsBody tr[data-detail-item="i1"] td:nth-child(2)'); await page.click("#btnDetailEdit");
    await page.click('#f_stageChips [data-chip-value="Initial invoice received"]'); await page.fill("#f_invoicedAmount", "");
    await page.click("#itemForm button[type=submit]");
    t("a missing invoiced amount is explained in the form", await page.isVisible("#f_formError") && /must be greater than 0/.test(await page.textContent("#f_formError")));
    await page.click("#btnCancelItem");
    if (await page.isVisible(".modal-overlay:not([hidden]) [data-rk-ok]")) await page.click(".modal-overlay:not([hidden]) [data-rk-ok]");

    // Settings: rates, and deletes that ask in the page
    await page.click('.app-nav-item[data-view="settings"]');
    await page.fill("#rate_USD", "0"); await page.click("#btnSaveRates");
    t("a bad rate is explained beside the rates", await page.isVisible("#ratesError"));
    await page.fill("#rate_USD", "3.7"); await page.click("#btnSaveRates");
    t("saved rates say so in a toast", await page.isHidden("#ratesError") && /Rates saved/.test(await page.textContent(".toast")));
    await page.click('[data-settings-panel="panel-vendors"]');
    await page.click('[data-del-vendor="v2"]');
    await page.click(".modal-overlay:not([hidden]) [data-rk-ok]");
    t("an unused vendor is deleted after asking", !(await page.$('[data-del-vendor="v2"]')));
    await page.click('[data-settings-panel="panel-budgets"]');
    t("budget figures are mono", (await page.$eval("#settingsBudgetList .settings-table-row:not(.header) .col-num", (e) => getComputedStyle(e).fontFamily)).includes("monospace"));
    const unnamed = await page.$$eval("input:not([type=hidden]):not([hidden]), select, textarea", (els) =>
      els.filter((e) => !(e.labels && e.labels.length) && !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby")).map((e) => e.id).join(", "));
    t("every field has a name", unnamed === "", unnamed);

    // another tab's save: a dismissable note, not the red banner
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("vendorSpendTracker.v1")); s.saveToken = "other"; s.rev = 99;
      window.dispatchEvent(new StorageEvent("storage", { key: "vendorSpendTracker.v1", newValue: JSON.stringify(s) }));
    });
    t("a change in another tab is a note in the watch colour", await page.isVisible("#otherTabNote.warn") && await page.isHidden("#corruptDataBanner"));
    await page.click("#otherTabDismiss");
    t("and it can be dismissed", await page.isHidden("#otherTabNote"));
  },
};

// Native alert, confirm and prompt are banned in every tool (they block the page and
// cannot be styled or tested): each one is recorded, dismissed and fails the run.
// The browser's own "leave this page?" (beforeunload, asked while a file write is
// pending) is not one of them: it is accepted so a reload goes ahead.
function watchDialogs(page) {
  const seen = [];
  page.on("dialog", (d) => {
    if (d.type() === "beforeunload") { d.accept().catch(() => {}); return; }
    seen.push(d.type() + " \"" + d.message().slice(0, 60) + "\""); d.dismiss().catch(() => {});
  });
  return seen;
}

// Phone width: the widest page, at 390px, across every view in the header and every
// Settings tab, so that nothing makes the whole page scroll sideways (a wide table
// scrolls inside its own container). Each view must show the sign-off footer too.
// Leaves the page on its first view, at its old size.
async function phoneOverflow(page) {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  for (let i = 0; i < 3 && await page.$(".modal-overlay:not([hidden])"); i++) { await page.keyboard.press("Escape"); await page.waitForTimeout(50); }
  const over = [];
  const measure = async (label) => {
    await page.waitForTimeout(80);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > 390) over.push(label + " " + w + "px");
  };
  const views = await page.$$eval(".app-nav-item[data-view]", (bs) => bs.filter((b) => b.offsetParent).map((b) => b.getAttribute("data-view")));
  if (!views.length) await measure("page");
  for (const v of views) {
    await page.click(`.app-nav-item[data-view="${v}"]`);
    await measure(v);
    // the sign-off footer shows on every view (DESIGN.md principle 9)
    if (!(await page.isVisible("footer .signoff"))) over.push(v + " has no footer");
    const tabs = page.locator(".settings-nav-item:visible");
    const n = await tabs.count();
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click();
      await measure(v + " > " + (await tabs.nth(i).textContent()).trim());
    }
  }
  if (views.length) await page.click(`.app-nav-item[data-view="${views[0]}"]`);
  await page.setViewportSize(size || { width: 1280, height: 720 });
  return over;
}

async function openTool(browser, file, flow) {
  const url = "file://" + file;
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], external = [];
  const native = watchDialogs(page);
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("request", (r) => { if (!/^(file|data|blob|about):/.test(r.url())) external.push(r.url()); });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => console.error("CSP violation: " + e.violatedDirective + " " + e.blockedURI));
  });
  await page.goto(url);
  await page.waitForTimeout(300);
  const name = path.basename(file);
  // exactly the starter's policy, and straight after the charset so it governs every script
  const head = await page.evaluate(() => [...document.head.children].slice(0, 2).map((e) => e.outerHTML));
  const csp = await page.$eval('meta[http-equiv="Content-Security-Policy"]', (m) => m.content).catch(() => "");
  const signoff = await page.$eval("footer .signoff", (e) => e.textContent.trim()).catch(() => "");
  check(name + ": footer carries the sign-off line", !!SIGNOFF && signoff === SIGNOFF, signoff || "no footer .signoff (include framework/signoff.html)");
  check(name + ": offline CSP present, unchanged and first", !!CSP && csp === CSP && /^<meta charset/i.test(head[0] || "") &&
    /Content-Security-Policy/.test(head[1] || ""), "policy differs from the starter's or is not first: " + (csp || "none"));
  // a flow can check phone width at a point of its own as well (ctx.phone)
  const phone = async (label) => {
    const over = await phoneOverflow(page);
    check(name + ": no sideways scroll at 390px, footer on every view" + (label ? " (" + label + ")" : ""), over.length === 0, over.join(", "));
  };
  if (flow) {
    try { await flow(page, (n, c, w) => check(name + ": " + n, c, w), { url, phone }); }
    catch (e) { fail(name + ": main flow", e.message.split("\n")[0]); }
  }
  // every tool with views marks the one showing for screen readers (DESIGN.md principle 2)
  const marks = await page.$$eval(".app-nav-item[data-view]", (bs) => bs.map((b) => b.classList.contains("active") === (b.getAttribute("aria-current") === "page")));
  check(name + ": the nav marks the current view with aria-current", marks.every(Boolean), JSON.stringify(marks));
  try { await phone("every view, after the flow"); }
  catch (e) { fail(name + ": no sideways scroll at 390px", e.message.split("\n")[0]); }
  check(name + ": no native alert, confirm or prompt", native.length === 0, native.join(" | "));
  check(name + ": no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  check(name + ": no network requests", external.length === 0, external.slice(0, 3).join(" "));
  await ctx.close();
}


/* ---------- delivery plan regressions (BACKLOG DP-R1 to DP-R6) ---------- */
// The header and window rules broke once on real files that the happy-path flow above
// never loads: the old sprint template, everyday header spellings, baseline vs forecast
// columns, long roadmaps and a user-chosen week window.
async function deliveryRegressions(browser) {
  console.log("delivery-plan.html: regressions");
  const url = "file://" + path.join(ROOT, "delivery-plan.html");
  const t = (n, c, w) => check("delivery-plan regression: " + n, c, w);
  const val = (p, sel) => p.$eval(sel, (e) => e.value).catch(() => "");
  const txt = (p, sel) => p.$eval(sel, (e) => e.textContent).catch(() => "");
  const selText = (p, sel) => p.$eval(sel, (e) => e.selectedOptions[0].text).catch(() => "");
  const checked = (p, sel) => p.$eval(sel, (e) => e.checked).catch(() => false);
  const visible = (p, sel) => p.isVisible(sel).catch(() => false);
  async function load(fixture, fn) {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const p = await ctx.newPage(), errors = [];
    const native = watchDialogs(p);
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(url);
    await p.setInputFiles("#file-input", path.join(FIX, fixture));
    await p.waitForTimeout(400);
    try { await fn(p); } catch (e) { t(fixture + ": flow", false, e.message.split("\n")[0]); }
    t(fixture + ": no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
    t(fixture + ": no native dialogs", native.length === 0, native.join(" | "));
    await ctx.close();
  }
  const row = (n, f) => "#task-tbody tr:nth-child(" + n + ") ." + f;

  await load("dp-legacy-sprint.xlsx", async (p) => {
    t("legacy sprint template opens", !(await visible(p, "#error-msg")), await txt(p, "#error-msg"));
    t("legacy: first task 1 Apr to 28 Apr", (await val(p, row(1, "f-start"))) === "2026-04-01" && (await val(p, row(1, "f-end"))) === "2026-04-28");
    t("legacy: milestone read", await checked(p, row(4, "f-ms")));
    t("legacy: columns line names the sprint columns", /Dates from: Start Sprint \/ End Sprint/.test(await txt(p, "#cols-note")));
    const dl = p.waitForEvent("download", { timeout: 15000 });
    dl.catch(() => {}); // a missing download is one failed check, not a crashed run
    try {
      await p.click("#btn-download", { timeout: 3000 });
      t("legacy: downloads a PowerPoint", fs.readFileSync(await (await dl).path()).slice(0, 2).toString() === "PK");
    } catch (e) { t("legacy: downloads a PowerPoint", false, e.message.split("\n")[0]); }
  });
  await load("dp-headers.xlsx", async (p) => {
    t("forecast plotted over baseline", (await val(p, row(1, "f-start"))) === "2026-03-02" && (await val(p, row(1, "f-end"))) === "2026-03-13");
    const cn = await txt(p, "#cols-note");
    t("columns line names forecast and the unused baseline",
      /Dates from: Forecast Start \/ Forecast End/.test(cn) && /Not used: Baseline Start, Baseline End/.test(cn), cn);
    t("lane from Category / Workstream", (await val(p, row(1, "f-section"))) === "Build");
    t("Risk Flag read", await checked(p, row(2, "f-risk")));
    t("Key Milestone read", await checked(p, row(3, "f-ms")));
  });
  await load("dp-header-spellings.xlsx", async (p) => {
    t("Start_Date / End Date - dd/mm/yyyy read", (await val(p, row(1, "f-start"))) === "2026-03-02" && (await val(p, row(1, "f-end"))) === "2026-03-13");
  });
  await load("dp-no-dates.xlsx", async (p) => {
    const em = await txt(p, "#error-msg");
    t("no date columns: the error lists the headers found", (await visible(p, "#error-msg")) && /Headers found:/.test(em) && /“Vendor”/.test(em), em);
  });
  await load("dp-roadmap-6y.xlsx", async (p) => {
    const hn = await txt(p, "#hidden-note");
    t("six-year roadmap: says it runs past five years, not a typo", /runs past five years/.test(hn) && !/mistyped/.test(hn), hn.slice(0, 120));
    t("six-year roadmap: 5 tasks tagged", (await p.$$("#task-tbody .tag-outside")).length === 5);
    t("six-year roadmap: 260-week axis", (await txt(p, "#week-count-lbl")) === "248 of 260 weeks", await txt(p, "#week-count-lbl"));
  });
  await load("delivery-plan.xlsx", async (p) => {
    await p.selectOption("#wk-from", "2");
    await p.fill(row(3, "f-end"), "2026-04-03");
    await p.waitForTimeout(150);
    t("a chosen week window is clamped, not reset", (await selText(p, "#wk-from")) === "16 Mar 2026" && (await selText(p, "#wk-to")) === "30 Mar 2026" &&
      (await txt(p, "#week-count-lbl")) === "3 of 5 weeks", (await selText(p, "#wk-from")) + " to " + (await selText(p, "#wk-to")));
  });
  await load("delivery-plan.xlsx", async (p) => {
    await p.fill(row(3, "f-end"), "2026-04-24");
    await p.waitForTimeout(150);
    t("the automatic window follows an edit", (await selText(p, "#wk-to")) === "20 Apr 2026" && (await txt(p, "#week-count-lbl")) === "8 of 8 weeks");
  });
}


/* ---------- UAT tracker: project files (BACKLOG-style regressions) ---------- */
// The real file picker cannot be driven headless, and the browser's private file
// system is refused on file://, so these run against a File System Access double:
// files live in localStorage (so they outlast a reload), and handles read back
// from IndexedDB get their methods again, as real handles would.
function fakeFs() {
  const PFX = "__fakefs:";
  const read = (n) => { const r = localStorage.getItem(PFX + n); return r ? JSON.parse(r) : null; };
  const write = (n, text) => localStorage.setItem(PFX + n, JSON.stringify({ text, lastModified: Date.now() }));
  class FakeHandle {
    constructor(n) { this.__fakeFile = n; this.kind = "file"; this.name = n; }
    async getFile() {
      if (localStorage.getItem(PFX + "fail")) { localStorage.removeItem(PFX + "fail"); throw new DOMException("not ready", "NotReadableError"); }
      const r = read(this.__fakeFile) || { text: "", lastModified: 0 }; return new File([r.text], this.name, { lastModified: r.lastModified });
    }
    async createWritable() { const n = this.__fakeFile; let buf = ""; return { write: async (t) => { buf += t; }, close: async () => write(n, buf) }; }
    async queryPermission() { return localStorage.getItem(PFX + "perm") || "granted"; }
    async requestPermission() { localStorage.setItem(PFX + "perm", "granted"); return "granted"; }
    async isSameEntry(o) { return !!o && o.__fakeFile === this.__fakeFile; }
  }
  window.__fakefs = { next: null, read, write };
  window.showSaveFilePicker = async (o) => {
    const n = window.__fakefs.next || (o && o.suggestedName) || "file.json"; window.__fakefs.next = null;
    if (!read(n)) write(n, ""); return new FakeHandle(n);
  };
  window.showOpenFilePicker = async () => {
    const n = window.__fakefs.next; window.__fakefs.next = null;
    if (!n) throw new DOMException("cancelled", "AbortError"); return [new FakeHandle(n)];
  };
  const desc = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "result");
  const hydrate = (v, d) => {
    if (!v || typeof v !== "object" || d > 3) return;
    if (v.__fakeFile && !(v instanceof FakeHandle)) Object.setPrototypeOf(v, FakeHandle.prototype);
    for (const k in v) hydrate(v[k], d + 1);
  };
  Object.defineProperty(IDBRequest.prototype, "result", { get() { const r = desc.get.call(this); hydrate(r, 0); return r; } });
}

async function uatFileRegressions(browser) {
  console.log("uat-signoff-tracker.html: project files");
  const url = "file://" + path.join(ROOT, "uat-signoff-tracker.html");
  const t = (n, c, w) => check("uat files: " + n, c, w);
  const ctx = await browser.newContext();
  await ctx.addInitScript(fakeFs);
  const errors = [], native = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    native.push(watchDialogs(p));
    await p.goto(url); await p.waitForTimeout(400);
    return p;
  };
  const file = (p, n) => p.evaluate((n) => { const r = window.__fakefs.read(n); return r && r.text ? JSON.parse(r.text) : null; }, n);
  const status = (p) => p.textContent("#saveText");
  const settle = (p) => p.waitForTimeout(900);
  const nextFile = (p, n) => p.evaluate((n) => { window.__fakefs.next = n; }, n);
  const setName = async (p, name) => {
    await p.click('.app-nav-item[data-view="settings"]'); await p.click('.settings-nav-item[data-tab="cycle"]');
    await p.fill('[data-cy="name"]', name); await p.press('[data-cy="name"]', "Tab");
  };
  try {
    const a = await open();
    t("starts in this browser only, offering a file", /In this browser only/.test(await status(a)) && /Save to a project file/.test(await a.textContent("#saveAction")));
    await a.click("#btnDemoOnboard"); await a.waitForTimeout(200);
    await nextFile(a, "alpha.json"); await a.click("#saveAction"); await settle(a);
    let f = await file(a, "alpha.json");
    t("save to a file writes the project", !!f && f.cycles.some((c) => c.name === "Customer Portal R4.2 UAT"));
    t("the bar names the file", /Saved to alpha\.json/.test(await status(a)), await status(a));

    await setName(a, "Alpha cycle"); await settle(a);
    f = await file(a, "alpha.json");
    t("an edit is written into the file", f.cycles.some((c) => c.name === "Alpha cycle"));
    t("the browser copy is left alone", await a.evaluate(() => !/Alpha cycle/.test(localStorage.getItem("uatSignoffTracker.v1") || "")));

    await a.reload(); await a.waitForTimeout(600);
    t("a reload reopens the file", /Saved to alpha\.json/.test(await status(a)) && /Alpha cycle/.test(await a.textContent("#cycleSelect")));

    const b = await open(); await b.waitForTimeout(300);
    t("a second tab does not take a file in use", /alpha\.json is open in another tab/.test(await status(b)), await status(b));
    t("and does not show its project", !/Alpha cycle/.test(await b.textContent("#cycleSelect")));
    await b.close();

    // something else changes the file: autosave stops, nothing is overwritten
    await a.waitForTimeout(1100);
    await a.evaluate(() => { const r = JSON.parse(window.__fakefs.read("alpha.json").text); r.cycles[0].name = "Changed elsewhere"; window.__fakefs.write("alpha.json", JSON.stringify(r)); });
    await setName(a, "Mine"); await settle(a);
    f = await file(a, "alpha.json");
    t("a file changed on disk is not overwritten", f.cycles[0].name === "Changed elsewhere" && /changed on disk/.test(await status(a)), await status(a));
    t("the bar offers the choice", (await a.textContent("#saveAction")) === "Choose which to keep");
    await a.click("#saveAction");
    await a.click('[data-file-act="usefile"]'); await settle(a);
    t("load the file takes the disk version", /Changed elsewhere/.test(await a.textContent("#cycleSelect")) && /Saved to alpha\.json/.test(await status(a)));

    // a new project gets its own file and leaves the first alone
    await nextFile(a, "beta.json");
    await a.click('[data-file-act="new"]'); await settle(a);
    await setName(a, "Beta cycle"); await settle(a);
    const fa = await file(a, "alpha.json"), fb = await file(a, "beta.json");
    t("new project file starts empty in its own file", fb && fb.cycles.length === 1 && fb.cycles[0].name === "Beta cycle" && fb.cycles[0].tests.length === 0);
    t("the first project's file is untouched", fa.cycles[0].name === "Changed elsewhere" && !fa.cycles.some((c) => c.name === "Beta cycle"));

    // permission lapses (a browser restart): edits wait for Reconnect
    await a.evaluate(() => localStorage.setItem("__fakefs:perm", "prompt"));
    await a.reload(); await a.waitForTimeout(600);
    t("after a restart it asks to reconnect", /Not connected to beta\.json/.test(await status(a)) && (await a.textContent("#saveAction")) === "Reconnect", await status(a));
    await setName(a, "Beta offline"); await settle(a);
    t("nothing is written until reconnected", (await file(a, "beta.json")).cycles[0].name === "Beta cycle");
    await a.click("#saveAction"); await settle(a);
    t("reconnect writes the waiting edits", (await file(a, "beta.json")).cycles[0].name === "Beta offline" && /Saved to beta\.json/.test(await status(a)));

    // recents switch between projects; close returns to the browser copy
    await a.click('.app-nav-item[data-view="settings"]'); await a.click('.settings-nav-item[data-tab="data"]');
    await a.waitForTimeout(200);
    const recent = await a.$$eval("#recentFiles [data-recent]", (bs) => bs.map((x) => x.textContent));
    t("recent files lists both projects", recent.some((x) => /alpha\.json/.test(x)) && recent.some((x) => /beta\.json/.test(x)), recent.join(", "));
    await a.click('#recentFiles [data-recent]:not([disabled])'); await settle(a);
    t("a recent file opens its project", /Saved to alpha\.json/.test(await status(a)) && /Changed elsewhere/.test(await a.textContent("#cycleSelect")));
    await a.click('[data-file-act="close"]'); await settle(a);
    t("close goes back to the browser copy", /In this browser only/.test(await status(a)) && /Customer Portal R4\.2 UAT/.test(await a.textContent("#cycleSelect")));

    // edits that never reached the file come back after a reload, and Keep mine writes them
    await a.click('#recentFiles [data-recent]'); await settle(a);
    await a.waitForTimeout(1100);
    await a.evaluate(() => { const r = JSON.parse(window.__fakefs.read("alpha.json").text); r.cycles[0].name = "Disk again"; window.__fakefs.write("alpha.json", JSON.stringify(r)); });
    await setName(a, "Mine again"); await settle(a);
    await a.reload(); await a.waitForTimeout(600);
    t("unsent edits are offered back after a reload", /Unsaved edits for alpha\.json/.test(await status(a)) && /Mine again/.test(await a.textContent("#cycleSelect")), await status(a));
    await a.click("#saveAction"); await a.click('[data-file-act="keepmine"]');
    await a.click(".modal-overlay:not([hidden]) [data-rk-ok]"); await settle(a);
    t("keep mine overwrites the file", (await file(a, "alpha.json")).cycles[0].name === "Mine again" && /Saved to alpha\.json/.test(await status(a)));

    // a picker refused by policy is remembered and the file buttons withdrawn
    await a.click('[data-file-act="close"]'); await settle(a);
    await a.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException("blocked", "NotAllowedError"); }; });
    await a.click("#saveAction"); await a.waitForTimeout(300);
    t("a blocked picker is explained and its buttons withdrawn", (await a.isVisible("#fsBlocked")) && !(await a.isVisible("#fileActions")) && (await a.isHidden("#saveAction")));
    await a.click('[data-file-act="unblock"]'); await a.waitForTimeout(200);
    t("try again brings file saving back", (await a.isVisible("#fileActions")) && /Save to a project file/.test(await a.textContent("#saveAction")));
  } catch (e) { t("flow", false, e.message.split("\n")[0]); }
  t("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  t("no native dialogs", native.flat().length === 0, native.flat().join(" | "));
  await ctx.close();
}


/* ---------- cost tracker: project files on RK.fileDoc ---------- */
async function costFileRegressions(browser) {
  console.log("project-cost-tracker.html: project files");
  const url = "file://" + path.join(ROOT, "project-cost-tracker.html");
  const t = (n, c, w) => check("cost files: " + n, c, w);
  const ctx = await browser.newContext();
  await ctx.addInitScript(fakeFs);
  const errors = [];
  const p = await ctx.newPage();
  const native = watchDialogs(p);
  p.on("pageerror", (e) => errors.push(e.message));
  const file = (n) => p.evaluate((n) => { const r = window.__fakefs.read(n); return r && r.text ? JSON.parse(r.text) : null; }, n);
  const status = () => p.textContent("#saveState");
  const settle = () => p.waitForTimeout(900);
  const dataTab = async () => { await p.click('.app-nav-item[data-view="settings"]'); await p.click('.settings-nav-item[data-tab="data"]'); };
  try {
    await p.goto(url); await p.waitForTimeout(400);
    t("starts in this browser only", /In this browser only/.test(await status()), await status());
    await dataTab();
    await p.click("#demoBtn"); await p.click(".modal-overlay:not([hidden]) [data-rk-ok]"); await p.waitForTimeout(200);
    const demoName = await p.$eval("#pname", (e) => e.value);
    await p.evaluate(() => { window.__fakefs.next = "costs-a.json"; });
    await p.click("#newProject"); await settle();
    t("new project file saves the project on screen", (await file("costs-a.json")).name === demoName && /Saved to costs-a\.json/.test(await status()), await status());

    await p.click('.settings-nav-item[data-tab="project"]');
    await p.fill("#pname", "Costs A"); await settle();
    t("an edit is written into the file", (await file("costs-a.json")).name === "Costs A");
    await p.click("#undoBtn"); await settle();
    t("undo still works after save as, into the same file", (await p.$eval("#pname", (e) => e.value)) === demoName && (await file("costs-a.json")).name === demoName);
    t("history from before the save as moved with it", await p.isVisible("#undoBtn"));

    // another project's file: its own content, and no undo into it
    await p.evaluate(() => { const r = JSON.parse(window.__fakefs.read("costs-a.json").text); r.name = "Costs B"; window.__fakefs.write("costs-b.json", JSON.stringify(r)); window.__fakefs.next = "costs-b.json"; });
    await dataTab();
    await p.click("#openProject"); await settle();
    t("open project file shows that file", (await p.$eval("#pname", (e) => e.value)) === "Costs B" && /Saved to costs-b\.json/.test(await status()));
    t("undo history is emptied on a switch", await p.isHidden("#undoBtn"));
    t("the first file is untouched", (await file("costs-a.json")).name === demoName);

    // an install from before RK.fileDoc: same database, crash copy stored as an object
    await p.evaluate(() => new Promise((res, rej) => {
      const q = indexedDB.open("project-cost-tracker", 1);
      q.onsuccess = () => {
        const tx = q.result.transaction(["handles", "scratch", "session"], "readwrite");
        const data = JSON.parse(window.__fakefs.read("costs-a.json").text);
        window.__fakefs.write("legacy.json", JSON.stringify(Object.assign({}, data, { name: "Legacy on disk" })));
        tx.objectStore("handles").put({ id: "legacyid", name: "legacy.json", handle: { __fakeFile: "legacy.json", kind: "file", name: "legacy.json" }, lastOpened: Date.now() }, "legacyid");
        tx.objectStore("scratch").put({ id: "legacyid", data: Object.assign({}, data, { name: "Legacy unsaved" }), savedAt: Date.now() + 60000, name: "legacy.json", fileModified: 1 }, "legacyid");
        tx.objectStore("session").put({ id: "legacyid" }, "last");
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      };
      q.onerror = () => rej(q.error);
    }));
    await p.evaluate(() => sessionStorage.setItem("project-cost-tracker:tab", "legacyid"));
    await p.reload(); await p.waitForTimeout(700);
    t("an older build's file and crash copy still open", /Unsaved edits for legacy\.json/.test(await status()) && (await p.$eval("#pname", (e) => e.value)) === "Legacy unsaved", await status());
    t("and the choice is shown", await p.isVisible("#staleRow"));
    await p.click("#useDisk"); await settle();
    t("load the file takes the disk version", (await p.$eval("#pname", (e) => e.value)) === "Legacy on disk" && /Saved to legacy\.json/.test(await status()));

    // CT-01: the file cannot be read at start (a network drive not ready). The
    // browser copy shows, edits stay in it, and Reconnect reads the file rather
    // than writing the browser copy over it.
    await p.evaluate(() => localStorage.setItem("__fakefs:fail", "1"));
    await p.reload(); await p.waitForTimeout(700);
    t("an unreadable file at start shows as not connected", /Not connected to legacy\.json/.test(await status()) && (await p.$eval("#pname", (e) => e.value)) !== "Legacy on disk", await status());
    await p.click('.app-nav-item[data-view="settings"]'); await p.click('.settings-nav-item[data-tab="project"]');
    await p.fill("#pname", "Browser edit"); await settle();
    t("edits then stay out of the file", (await file("legacy.json")).name === "Legacy on disk");
    await p.click("#reconnectBtn"); await settle();
    t("reconnect reads the file instead of overwriting it", (await p.$eval("#pname", (e) => e.value)) === "Legacy on disk" &&
      (await file("legacy.json")).name === "Legacy on disk" && /Saved to legacy\.json/.test(await status()), await status());
  } catch (e) { t("flow", false, e.message.split("\n")[0]); }
  t("no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  t("no native dialogs", native.length === 0, native.join(" | "));
  await ctx.close();
}

(async () => {
  kitUnits();
  const browser = await chromium.launch();
  const tools = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")).sort();
  for (const t of tools) {
    console.log(t);
    await openTool(browser, path.join(ROOT, t), FLOWS[t]);
  }
  check("every tool has a main flow in this test", tools.every((t) => FLOWS[t]), tools.filter((t) => !FLOWS[t]).join(", "));
  await deliveryRegressions(browser);
  await uatFileRegressions(browser);
  await costFileRegressions(browser);
  // the starter is never shipped, but new tools are copied from it: it must build and run clean
  console.log("framework/starter.src.html");
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rk-starter-")), "starter.html");
  fs.writeFileSync(tmp, execFileSync("python3", ["-c",
    "import sys; sys.path.insert(0, 'framework'); import build; sys.stdout.write(build.expand(build.read('framework/starter.src.html')))"],
    { cwd: ROOT, env: Object.assign({}, process.env, { PYTHONDONTWRITEBYTECODE: "1" }) }));
  await openTool(browser, tmp, async (page, t) => {
    await page.click("#btnNew"); await page.fill("#n_name", "Smoke"); await page.fill("#n_amount", "10");
    await page.click("#newForm button[type=submit]");
    t("adds a row through the dialog", (await page.$$("#itemsBody tr")).length === 3);
  });
  await browser.close();
  console.log(failures.length ? "\n" + failures.length + " failure(s)" : "\nall passed");
  process.exit(failures.length ? 1 : 0);
})();
