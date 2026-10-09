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
    t("reads the export and flags the GEN_LINES row", /GEN_LINES|system created/i.test(await page.textContent("body")));
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
  const csp = await page.$eval('meta[http-equiv="Content-Security-Policy"]', (m) => m.content).catch(() => "");
  check(name + ": offline CSP present", /default-src 'none'/.test(csp) && /connect-src 'none'/.test(csp), "missing or loosened CSP: " + (csp || "none"));
  if (flow) {
    try { await flow(page, (n, c, w) => check(name + ": " + n, c, w), { url }); }
    catch (e) { fail(name + ": main flow", e.message.split("\n")[0]); }
  }
  check(name + ": no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  check(name + ": no network requests", external.length === 0, external.slice(0, 3).join(" "));
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
