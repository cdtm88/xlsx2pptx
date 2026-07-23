/* ============================================================
   Report Kit — shared runtime for the browser report tools
   kit-version: 1.0.0
   Exposes window.RK. Depends on window.XLSX (SheetJS) only for the
   xlsx.* helpers; everything else is standalone. Inlined into each
   report by framework/build.py so reports stay single-file/offline.

   Compatibility policy (see framework/README.md):
   - Staff IDs are matched case-insensitively (normalised to UPPERCASE).
   - rules.parse retains unknown top-level and per-staff fields and
     round-trips them through rules.serialise (forward compatibility).
   - A newer schemaVersion loads with a warning instead of being
     rejected (forward compatibility); v1 always loads (backward).
   ============================================================ */
window.RK = (function () {
  "use strict";
  var KIT_VERSION = "1.0.0";

  /* ---------- dom / format helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function show(el) { if (el) el.classList.remove("hidden"); }
  function hide(el) { if (el) el.classList.add("hidden"); }
  function round1(n) { return Math.round((n + Number.EPSILON) * 10) / 10; }
  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function fmtHrs(n) { return (Math.round(n * 10) / 10).toFixed(1); }
  function nowIso() { try { return new Date().toISOString(); } catch (e) { return ""; } }

  /* ---------- file download ---------- */
  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || "application/octet-stream" });
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- namespaced localStorage ---------- */
  function store(key) {
    return {
      get: function () { try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } },
      set: function (obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { } }
    };
  }

  /* ---------- clipboard (rich HTML + plain-text fallback) ---------- */
  var clipboard = {
    // write({html, text}) -> Promise resolving to "html" | "text", rejecting if blocked
    write: function (payload) {
      var html = payload.html || "", text = payload.text || "";
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        var item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" })
        });
        return navigator.clipboard.write([item]).then(function () { return "html"; });
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return "text"; });
      }
      return Promise.reject(new Error("no-clipboard"));
    },
    // render a manual copy textarea into a container element
    fallbackInto: function (el, text, label) {
      el.innerHTML = '<div class="copy-fallback"><p class="sub" style="margin-bottom:.3rem;">' +
        esc(label || "Copy blocked by the browser. Select all and copy from here:") +
        '</p><textarea readonly aria-label="Content to copy"></textarea></div>';
      var a = el.querySelector("textarea"); a.value = text; a.focus(); a.select();
    },
    clearFallback: function (el) { if (el) el.innerHTML = ""; }
  };

  /* ---------- upload wiring (drag/drop + browse + replace) ---------- */
  // opts: { drop, fileInput, browseBtn, replaceBtn, onFile(arrayBuffer, filename), onError(msg) }
  // The report controls the drop/loaded-bar visibility after a successful parse.
  function upload(opts) {
    var drop = opts.drop, input = opts.fileInput;
    function read(file) {
      var reader = new FileReader();
      reader.onload = function () { opts.onFile(reader.result, file.name); };
      reader.onerror = function () { if (opts.onError) opts.onError("Could not read the file. Previously loaded data is unchanged."); };
      reader.readAsArrayBuffer(file);
    }
    if (drop) {
      drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("dragover"); });
      drop.addEventListener("dragleave", function () { drop.classList.remove("dragover"); });
      drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("dragover"); var f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) read(f); });
      drop.addEventListener("click", function () { input.click(); });
      drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    }
    if (opts.browseBtn) opts.browseBtn.addEventListener("click", function (e) { e.stopPropagation(); input.click(); });
    if (opts.replaceBtn) opts.replaceBtn.addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function (ev) { var f = ev.target.files && ev.target.files[0]; if (f) read(f); ev.target.value = ""; });
    return { read: read };
  }

  /* ---------- xlsx plumbing ---------- */
  var xlsx = {
    read: function (arrayBuffer) { return XLSX.read(arrayBuffer, { type: "array" }); },
    // "Code - Description" -> [code, desc], split on the first " - "
    splitCodeDesc: function (v) {
      v = (v === null || v === undefined) ? "" : String(v);
      var i = v.indexOf(" - ");
      if (i < 0) return [v.trim(), ""];
      return [v.slice(0, i).trim(), v.slice(i + 3).trim()];
    },
    // Wrap the first (or named) worksheet with header + cell accessors.
    sheet: function (wb, name) {
      if (!wb.SheetNames.length) throw new Error("The workbook contains no sheets.");
      var sheetName = name || wb.SheetNames[0];
      var ws = wb.Sheets[sheetName];
      if (!ws || !ws["!ref"]) throw new Error('The worksheet "' + sheetName + '" is empty.');
      var range = XLSX.utils.decode_range(ws["!ref"]);
      function cell(r, c) { return ws[XLSX.utils.encode_cell({ r: r, c: c })]; }
      function txt(r, c) { if (c === null || c === undefined) return ""; var cl = cell(r, c); if (!cl) return ""; return String(cl.w !== undefined && cl.w !== null ? cl.w : cl.v); }
      function rawv(r, c) { if (c === null || c === undefined) return null; var cl = cell(r, c); return cl ? cl.v : null; }
      var headers = [];
      for (var c = range.s.c; c <= range.e.c; c++) headers.push({ index: c, name: txt(range.s.r, c).trim() });
      return {
        sheetName: sheetName, ws: ws, range: range, headers: headers, txt: txt, rawv: rawv,
        findByName: function (nm) { for (var i = 0; i < headers.length; i++) if (headers[i].name === nm) return headers[i].index; return null; },
        findByAliases: function (aliases) { for (var i = 0; i < headers.length; i++) if (aliases.indexOf(headers[i].name.toLowerCase()) !== -1) return headers[i].index; return null; }
      };
    },
    // Resolve column indices for fieldSpecs against a sheet + optional explicit mapping.
    // fieldSpecs: [{ field, canonical, required, aliases:[lowercase...] }]
    // -> { resolved:{field:index}, missing:[{field,label}] }
    resolve: function (sheet, fieldSpecs, mapping) {
      mapping = mapping || {};
      var resolved = {}, missing = [];
      fieldSpecs.forEach(function (f) {
        var idx = (mapping[f.field] !== undefined && mapping[f.field] !== null) ? mapping[f.field] : sheet.findByName(f.canonical);
        if ((idx === null || idx === undefined) && f.aliases && f.aliases.length) idx = sheet.findByAliases(f.aliases);
        if (idx !== null && idx !== undefined) resolved[f.field] = idx;
        else if (f.required) missing.push({ field: f.field, label: f.canonical });
      });
      return { resolved: resolved, missing: missing };
    },
    // Render a "map the columns" fallback UI into a container.
    // container: el for the selects; fieldSpecs as above; onConfirm(mapping).
    renderMapper: function (opts) {
      var headers = opts.headers, fieldSpecs = opts.fieldSpecs;
      var rows = fieldSpecs.map(function (f) {
        var guess = null;
        for (var i = 0; i < headers.length; i++) if (headers[i].name === f.canonical) { guess = headers[i].index; break; }
        var optsHtml = '<option value="">(not mapped)</option>' + headers.map(function (h) {
          return '<option value="' + h.index + '"' + (guess === h.index ? " selected" : "") + ">" + esc(h.name || ("(column " + (h.index + 1) + ")")) + " [col " + (h.index + 1) + "]</option>";
        }).join("");
        var label = f.label || (f.canonical + (f.required ? "" : " (optional)"));
        return '<div style="margin:.5rem 0;"><label class="field" style="margin:0 0 .2rem;">' + esc(label) + '</label><select data-field="' + f.field + '">' + optsHtml + "</select></div>";
      }).join("");
      opts.fieldsEl.innerHTML = rows;
      var errEl = opts.errorEl;
      if (errEl) hide(errEl);
      opts.confirmBtn.onclick = function () {
        var selects = opts.fieldsEl.querySelectorAll("select"), mapping = {}, missing = [];
        Array.prototype.forEach.call(selects, function (s) {
          var field = s.getAttribute("data-field"), v = s.value, spec = null;
          for (var i = 0; i < fieldSpecs.length; i++) if (fieldSpecs[i].field === field) { spec = fieldSpecs[i]; break; }
          if (v === "") { if (spec && spec.required) missing.push(field); return; }
          mapping[field] = parseInt(v, 10);
        });
        if (missing.length) { if (errEl) { errEl.textContent = "Still unmapped: " + missing.join(", ") + "."; show(errEl); } return; }
        opts.onConfirm(mapping);
      };
    }
  };

  /* ---------- rules JSON module (versioned, case-insensitive, forward-compatible) ---------- */
  var SCHEMA_VERSION = 1;
  function lineCol(str, pos) {
    if (pos === null || pos === undefined || isNaN(pos)) return null;
    var upto = str.slice(0, pos);
    return { line: upto.split("\n").length, col: pos - upto.lastIndexOf("\n") };
  }
  function normId(id) { return String(id === null || id === undefined ? "" : id).trim().toUpperCase(); }
  var KNOWN_TOP = { schemaVersion: 1, generatedAt: 1, label: 1, staff: 1 };
  var KNOWN_STAFF = { name: 1, approvedDemands: 1 };

  var rules = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    normId: normId,
    // parse(jsonString) -> { schemaVersion, generatedAt, label, staff, names, demands, extraTop, warning }
    // staff keyed by normId, each { name, approvedDemands, ...retained unknown fields }.
    parse: function (jsonString) {
      var data;
      try { data = JSON.parse(jsonString); }
      catch (e) {
        var m = /position (\d+)/.exec(e.message);
        var lc = m ? lineCol(jsonString, parseInt(m[1], 10)) : null;
        throw new Error("Rules JSON did not parse: " + e.message + (lc ? " (line " + lc.line + ", column " + lc.col + ")" : "") + "\nCurrent rules left unchanged.");
      }
      if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("Rules must be a JSON object. Current rules left unchanged.");
      var warning = null, sv = data.schemaVersion;
      if (typeof sv !== "number") throw new Error("Rules are missing a numeric schemaVersion. Current rules left unchanged.");
      if (sv > SCHEMA_VERSION) warning = "This file uses schemaVersion " + sv + ", newer than this tool (v" + SCHEMA_VERSION + "). It was loaded, but fields this version doesn't understand are kept untouched.";
      if (typeof data.staff !== "object" || data.staff === null || Array.isArray(data.staff)) throw new Error('"staff" must be an object. Current rules left unchanged.');
      var problems = [], staff = {}, names = {}, demands = {};
      Object.keys(data.staff).forEach(function (id) {
        var e = data.staff[id];
        if (typeof e !== "object" || e === null || Array.isArray(e)) { problems.push(id + ": entry must be an object."); return; }
        if (e.name !== undefined && typeof e.name !== "string") problems.push(id + ': "name" must be a string.');
        if (e.approvedDemands !== undefined) {
          if (!Array.isArray(e.approvedDemands)) problems.push(id + ': "approvedDemands" must be an array.');
          else if (!e.approvedDemands.every(function (x) { return typeof x === "string"; })) problems.push(id + ': "approvedDemands" must contain only strings.');
        }
        var key = normId(id);
        var merged = {};
        Object.keys(e).forEach(function (k) { merged[k] = e[k]; }); // retain unknown fields (forward compat)
        merged.name = typeof e.name === "string" ? e.name : "";
        merged.approvedDemands = Array.isArray(e.approvedDemands) ? e.approvedDemands.filter(function (x) { return typeof x === "string"; }) : [];
        staff[key] = merged;
        if (merged.name.trim() !== "") names[key] = merged.name.trim();
        demands[key] = merged.approvedDemands;
      });
      if (problems.length) throw new Error("Rules validation failed:\n- " + problems.join("\n- ") + "\nCurrent rules left unchanged.");
      var extraTop = {};
      Object.keys(data).forEach(function (k) { if (!KNOWN_TOP[k]) extraTop[k] = data[k]; }); // retain unknown top-level (forward compat)
      return {
        schemaVersion: sv, generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : null,
        label: typeof data.label === "string" ? data.label : "",
        staff: staff, names: names, demands: demands, extraTop: extraTop, warning: warning
      };
    },
    // serialise(opts) -> JSON string in the shared schema.
    // opts: { names:{id:name}, demands:{id:[...]}, staff:{id:{...}}, label, generatedAt, extraTop }
    serialise: function (opts) {
      opts = opts || {};
      var names = opts.names || {}, demands = opts.demands || {}, staffIn = opts.staff || {};
      var ids = {};
      Object.keys(names).forEach(function (id) { ids[normId(id)] = 1; });
      Object.keys(demands).forEach(function (id) { ids[normId(id)] = 1; });
      Object.keys(staffIn).forEach(function (id) { ids[normId(id)] = 1; });
      var staffOut = {};
      Object.keys(ids).sort().forEach(function (id) {
        var base = staffIn[id] || {};
        var out = {};
        Object.keys(base).forEach(function (k) { if (!KNOWN_STAFF[k]) out[k] = base[k]; }); // keep retained unknown fields
        var name = (names[id] !== undefined) ? names[id] : (typeof base.name === "string" ? base.name : "");
        var dem = (demands[id] !== undefined) ? demands[id] : (Array.isArray(base.approvedDemands) ? base.approvedDemands : []);
        name = typeof name === "string" ? name : "";
        dem = Array.isArray(dem) ? dem.filter(function (x) { return typeof x === "string"; }).slice().sort() : [];
        if (name === "" && dem.length === 0 && !Object.keys(out).length) return;
        out.name = name; out.approvedDemands = dem;
        staffOut[id] = out;
      });
      var envelope = { schemaVersion: SCHEMA_VERSION, generatedAt: opts.generatedAt || nowIso(), label: opts.label || "" };
      var extraTop = opts.extraTop || {};
      Object.keys(extraTop).forEach(function (k) { if (!KNOWN_TOP[k]) envelope[k] = extraTop[k]; });
      envelope.staff = staffOut;
      return JSON.stringify(envelope, null, 2);
    }
  };

  /* ---------- staff-name editor component ----------
     Renders a filterable Staff ID -> Name table into a container.
     opts: {
       wrap, hint, search, onlyMissing,   // elements
       getStaff: () => ({ ID: exportName }),   // ids normId'd by the caller
       nameMap,                                // mutable {ID: name}, written in place
       onChange: () => {}                      // after any edit (persist + re-render summary)
     }
     Returns { render() }.  onlyMissing.checked is honoured as-is (set it in markup for the default). */
  function NameEditor(opts) {
    var wrap = opts.wrap, hint = opts.hint;
    function render() {
      var map = opts.getStaff() || {}, ids = Object.keys(map).sort();
      if (!ids.length) { wrap.innerHTML = ""; if (hint) hint.textContent = "Load an export to edit names for its staff."; return; }
      var missingCount = ids.filter(function (id) { return !(opts.nameMap[id] || map[id]); }).length;
      if (hint) hint.innerHTML = ids.length + " staff in this export &middot; <strong>" + missingCount + "</strong> with no name (falling back to the Staff ID)." +
        (missingCount ? " Tick &ldquo;Only missing names&rdquo; to focus on them." : "");
      var onlyMissing = opts.onlyMissing && opts.onlyMissing.checked;
      var f = (opts.search && opts.search.value ? opts.search.value : "").trim().toLowerCase();
      var shown = ids.filter(function (id) {
        var override = opts.nameMap[id] || "", exp = map[id] || "", missing = !(override || exp);
        if (onlyMissing && !missing) return false;
        if (f && (id + " " + override + " " + exp).toLowerCase().indexOf(f) === -1) return false;
        return true;
      });
      if (!shown.length) { wrap.innerHTML = '<div class="empty">' + (onlyMissing ? "No staff are missing a name." : "No staff match your filter.") + "</div>"; return; }
      wrap.innerHTML = '<table class="data"><thead><tr><th>Staff ID</th><th>Name</th></tr></thead><tbody>' +
        shown.map(function (id) {
          var override = opts.nameMap[id] || "", exp = map[id] || "", missing = !(override || exp);
          var sub = exp ? '<span class="sid">export: ' + esc(exp) + "</span>" : "";
          var ph = exp ? esc(exp) : "Add a name";
          return '<tr' + (missing ? ' class="missing-row"' : "") + '><td class="staff-id">' + esc(id) + sub + "</td>" +
            '<td><input type="text" class="name-input" data-sid="' + esc(id) + '" data-exp="' + esc(exp) + '" value="' + esc(override) + '" placeholder="' + ph + '" aria-label="Name for ' + esc(id) + '"></td></tr>';
        }).join("") + "</tbody></table>";
      wrap.querySelectorAll("input.name-input").forEach(function (inp) {
        inp.addEventListener("input", function () {
          var sid = inp.getAttribute("data-sid"), exp = inp.getAttribute("data-exp") || "", v = inp.value.trim();
          if (v) opts.nameMap[sid] = v; else delete opts.nameMap[sid];
          opts.onChange();
          var tr = inp.closest("tr"); if (tr) tr.classList.toggle("missing-row", !(v || exp)); // keep focus: no full re-render
        });
      });
    }
    if (opts.search) opts.search.addEventListener("input", render);
    if (opts.onlyMissing) opts.onlyMissing.addEventListener("change", render);
    return { render: render };
  }

  return {
    version: KIT_VERSION,
    $: $, esc: esc, show: show, hide: hide,
    round1: round1, round2: round2, fmtHrs: fmtHrs, nowIso: nowIso,
    download: download, store: store, clipboard: clipboard,
    upload: upload, xlsx: xlsx, rules: rules, NameEditor: NameEditor
  };
})();
