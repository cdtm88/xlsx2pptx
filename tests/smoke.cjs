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
    await page.setInputFiles("#file-input", path.join(FIX, "delivery-plan.xlsx"));
    await page.waitForSelector("#slide-stack .slide, #slide-stack > *", { timeout: 5000 });
    const dl = page.waitForEvent("download", { timeout: 15000 });
    await page.click("#btn-download");
    const file = await (await dl).path();
    t("downloads a PowerPoint", fs.statSync(file).size > 10000 && fs.readFileSync(file).slice(0, 2).toString() === "PK");
  },
  "waqti-exceptions.html": async (page, t) => {
    await page.setInputFiles("#fileInput", path.join(FIX, "waqti-export.xlsx"));
    await page.waitForFunction(() => /waqti-export/.test(document.getElementById("fileNameSub").textContent), null, { timeout: 5000 });
    // scoped to the Needs attention table: the page's own script also contains the words
    const attn = await page.textContent("#attnWrap");
    t("reads the export and flags the GEN_LINES row", /S2/.test(attn) && /GEN_LINES|system created/i.test(attn), attn.slice(0, 120));
  },
  "waqti-demand-summary.html": async (page, t) => {
    await page.setInputFiles("#fileInput", path.join(FIX, "waqti-export.xlsx"));
    await page.waitForSelector("#demandCard:not(.hidden)", { timeout: 5000 });
    t("lists the export's demands", /D100/.test(await page.textContent("#demandCard")) && /D200/.test(await page.textContent("#demandCard")));
  },
  "project-cost-tracker.html": async (page, t) => {
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
  },
  "pi-planning-capacity.html": async (page, t) => {
    // "Load demo" lives in Settings and the export in a collapsible card: press them directly
    await page.$eval("#demoBtn", (b) => b.click());
    await page.waitForTimeout(300);
    const dl = page.waitForEvent("download", { timeout: 5000 });
    await page.$eval("#exportPeopleCsv", (b) => b.click());
    const csv = fs.readFileSync(await (await dl).path(), "utf8");
    t("loads the demo and exports the people CSV", csv.split("\n").length > 3);
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

    // a status changed in the list moves the figures
    await page.click('.app-nav-item[data-view="tests"]');
    const passedTab = async () => Number(await page.textContent('#testTabs [data-tab="Passed"] .seg-tab-count'));
    const before = await passedTab();
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
  },
};

async function openTool(browser, file, flow) {
  const url = "file://" + file;
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on("dialog", (d) => d.accept());
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
  check(name + ": offline CSP present, unchanged and first", !!CSP && csp === CSP && /^<meta charset/i.test(head[0] || "") &&
    /Content-Security-Policy/.test(head[1] || ""), "policy differs from the starter's or is not first: " + (csp || "none"));
  if (flow) {
    try { await flow(page, (n, c, w) => check(name + ": " + n, c, w), { url }); }
    catch (e) { fail(name + ": main flow", e.message.split("\n")[0]); }
  }
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
  const visible = (p, sel) => p.$eval(sel, (e) => !e.classList.contains("hidden")).catch(() => false);
  async function load(fixture, fn) {
    const ctx = await browser.newContext({ acceptDownloads: true });
    const p = await ctx.newPage(), errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(url);
    await p.setInputFiles("#file-input", path.join(FIX, fixture));
    await p.waitForTimeout(400);
    try { await fn(p); } catch (e) { t(fixture + ": flow", false, e.message.split("\n")[0]); }
    t(fixture + ": no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
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
    async getFile() { const r = read(this.__fakeFile) || { text: "", lastModified: 0 }; return new File([r.text], this.name, { lastModified: r.lastModified }); }
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
  const errors = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
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
