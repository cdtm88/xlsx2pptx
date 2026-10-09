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
    await page.click("#demoBtn");
    await page.waitForTimeout(300);
    const dl = page.waitForEvent("download", { timeout: 5000 });
    await page.click("#expCsv");
    const csv = fs.readFileSync(await (await dl).path(), "utf8");
    t("loads the demo and exports a ledger CSV", csv.split("\n").length > 3);
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
