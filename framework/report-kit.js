/* ============================================================
   Report Kit — shared runtime for the browser report tools
   kit-version: 1.4.0
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
  var KIT_VERSION = "1.4.0";

  /* ---------- dom / format helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  // Both the .hidden class (kit 1 CSS) and the hidden attribute (kit 2 CSS), so either
  // stylesheet honours it.
  function show(el) { if (el) { el.classList.remove("hidden"); el.hidden = false; } }
  function hide(el) { if (el) { el.classList.add("hidden"); el.hidden = true; } }
  // A lookup table with no prototype: keys from files ("__proto__", "constructor",
  // "toString") are plain keys, never inherited members. Use it for any map keyed by
  // data a user or a file supplied.
  function dict() { return Object.create(null); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
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
      // returns false when the browser refused (quota, blocked storage), so callers can say so
      set: function (obj) { try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch (e) { return false; } }
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
  var KNOWN_TOP = dict(); ["schemaVersion", "generatedAt", "label", "staff"].forEach(function (k) { KNOWN_TOP[k] = 1; });
  var KNOWN_STAFF = dict(); ["name", "approvedDemands"].forEach(function (k) { KNOWN_STAFF[k] = 1; });

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
    // When names (or demands) is passed it is the whole truth: an id missing from it has no
    // name (no demands), so a name the user cleared stays cleared rather than coming back
    // from staff. Keys are matched case-insensitively.
    serialise: function (opts) {
      opts = opts || {};
      function norm(m) { var o = dict(); Object.keys(m || {}).forEach(function (id) { o[normId(id)] = m[id]; }); return o; }
      var names = norm(opts.names), demands = norm(opts.demands), staffIn = norm(opts.staff);
      var ids = dict();
      [names, demands, staffIn].forEach(function (m) { Object.keys(m).forEach(function (id) { ids[id] = 1; }); });
      var staffOut = {};
      Object.keys(ids).sort().forEach(function (id) {
        var base = (staffIn[id] && typeof staffIn[id] === "object") ? staffIn[id] : {};
        var out = {};
        Object.keys(base).forEach(function (k) { if (!KNOWN_STAFF[k]) out[k] = base[k]; }); // keep retained unknown fields
        var name = opts.names ? (has(names, id) ? names[id] : "") : (typeof base.name === "string" ? base.name : "");
        var dem = opts.demands ? (has(demands, id) ? demands[id] : []) : (Array.isArray(base.approvedDemands) ? base.approvedDemands : []);
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


  /* ============================================================
     Kit 2 runtime (added in 1.1.0). Pairs with report-kit-2.css;
     the markup each helper expects is in framework/DESIGN.md.
     Nothing above this line depends on it.
     ============================================================ */

  /* ---------- ids, dates, numbers ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  // YYYY-MM-DD from the Date's LOCAL calendar fields (toISOString would give the UTC day)
  function localDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function today() { return localDate(new Date()); }
  function fmtNum2(n) { return (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtWhole(n) { return Math.round(Number(n) || 0).toLocaleString(); }
  // "AED 1,234.50"; whole=true drops the pence for headline figures
  function fmtMoney(n, ccy, whole) { return (ccy ? ccy + " " : "") + (whole ? fmtWhole(n) : fmtNum2(n)); }

  /* ---------- CSV ---------- */
  var csv = {
    // Excel needs a UTF-8 BOM to show non-ASCII characters (arrows, accents) correctly
    BOM: "﻿",
    escape: function (v) {
      var s = v === null || v === undefined ? "" : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    },
    // stops a text cell starting with = + - @ being run as a formula; never use on numbers
    safeText: function (v) {
      var s = v === null || v === undefined ? "" : String(v);
      return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    },
    // rows: array of arrays (first row = headers), already safeText'd where needed
    fromRows: function (rows) { return rows.map(function (r) { return r.map(csv.escape).join(","); }).join("\r\n"); }
  };

  /* ---------- modal / drawer ----------
     modal(overlay, { onClose }) for a .modal-overlay holding a .modal (or .modal.drawer).
     Adds role=dialog + aria-modal, moves focus into the dialog on open, Escape to close,
     a Tab focus trap, focus back to the opener on close, and a dirty-form guard: a click
     on the backdrop (including a text-selection drag that ends there) closes the dialog
     only when nothing has been typed into it. onClose runs once per close.
     Returns { open(opener?), close(), markClean(), isOpen() }. */
  var FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (el) { return !el.disabled && el.offsetParent !== null; });
  }
  function modal(overlay, opts) {
    opts = opts || {};
    var box = overlay.querySelector(".modal");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    if (!box.hasAttribute("tabindex")) box.setAttribute("tabindex", "-1");
    var title = box.querySelector("h2");
    if (title && !box.hasAttribute("aria-labelledby")) {
      if (!title.id) title.id = "rk-dlg-" + uid();
      box.setAttribute("aria-labelledby", title.id);
    }
    var dirty = false, opener = null, downOnBackdrop = false;
    box.addEventListener("input", function () { dirty = true; });
    box.addEventListener("change", function () { dirty = true; });
    overlay.addEventListener("mousedown", function (e) {
      downOnBackdrop = e.target === overlay;
      // a press on the backdrop must not move focus to <body>, or Escape and the Tab
      // trap (both listen on the overlay) stop working
      if (downOnBackdrop) e.preventDefault();
    });
    overlay.addEventListener("mouseup", function (e) {
      if (downOnBackdrop && e.target === overlay && !dirty) close();
      downOnBackdrop = false;
    });
    overlay.addEventListener("keydown", function (e) {
      if (overlay.hidden || (e.key !== "Escape" && e.key !== "Tab")) return;
      if (e.key === "Escape") { e.stopPropagation(); close(); return; }
      var f = focusables(box);
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    function close() {
      if (overlay.hidden) return;
      overlay.hidden = true;
      dirty = false;
      if (opts.onClose) opts.onClose();
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
      opener = null;
    }
    return {
      open: function (from) {
        if (!overlay.hidden) return; // already open: keep the original opener for focus return
        opener = from || document.activeElement;
        dirty = false;
        overlay.hidden = false;
        // keyboard handling lives on the overlay, so focus must be inside it; callers
        // that want a specific field focused can still .focus() it after open()
        if (!box.contains(document.activeElement)) box.focus();
      },
      close: close,
      markClean: function () { dirty = false; },
      isOpen: function () { return !overlay.hidden; }
    };
  }

  /* ---------- toast ----------
     toast(message, ms?) shows a short status line (.toast, kit 2) and fades it
     after ms (default 2600). One element, made on first use; a new message
     replaces the one showing. Announced politely to screen readers. */
  var toastEl = null, toastTimer = null;
  function toast(message, ms) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("on"); }, ms || 2600);
  }

  /* ---------- confirm dialog (in-page replacement for window.confirm) ----------
     confirm(message, onConfirm, { okLabel, title, danger }). Builds its own markup on
     first use. onConfirm runs only if the primary button is pressed. */
  var confirmUi = null;
  function confirmDialog(message, onConfirm, o) {
    o = o || {};
    if (!confirmUi) {
      var ov = document.createElement("div");
      ov.className = "modal-overlay"; ov.hidden = true;
      ov.innerHTML = '<div class="modal modal-compact"><h2></h2><p class="modal-lead"></p>' +
        '<div class="modal-actions"><button type="button" data-rk-cancel>Cancel</button><button type="button" class="primary" data-rk-ok>Continue</button></div></div>';
      document.body.appendChild(ov);
      var pending = null;
      var ctl = modal(ov, { onClose: function () { pending = null; } });
      ov.querySelector("[data-rk-cancel]").addEventListener("click", function () { ctl.close(); });
      ov.querySelector("[data-rk-ok]").addEventListener("click", function () { var fn = pending; pending = null; ctl.close(); if (fn) fn(); });
      confirmUi = { ov: ov, ctl: ctl, set: function (fn) { pending = fn; } };
    }
    var ok = confirmUi.ov.querySelector("[data-rk-ok]");
    confirmUi.ov.querySelector("h2").textContent = o.title || "Are you sure?";
    confirmUi.ov.querySelector(".modal-lead").textContent = message;
    ok.textContent = o.okLabel || "Continue";
    ok.className = "primary" + (o.danger ? " danger-fill" : "");
    confirmUi.set(onConfirm);
    confirmUi.ctl.open();
    ok.focus();
  }

  /* ---------- choice chips that drive a hidden <select> ----------
     One .chip button per <option>. Clicking sets the select and fires "change", so
     listeners on the select keep working. Returns refresh(); call it after setting
     the select's value in code. */
  function chipsFromSelect(select, row, labelFor) {
    var chips = [];
    Array.prototype.forEach.call(select.options, function (opt) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "chip";
      b.setAttribute("data-chip-value", opt.value);
      b.textContent = labelFor ? labelFor(opt.value, opt.textContent) : opt.textContent;
      b.addEventListener("click", function () {
        if (select.value === opt.value) return;
        select.value = opt.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      row.appendChild(b);
      chips.push({ value: opt.value, el: b });
    });
    function refresh() {
      chips.forEach(function (c) {
        var on = c.value === select.value;
        c.el.classList.toggle("active", on);
        c.el.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    select.addEventListener("change", refresh);
    refresh();
    return refresh;
  }

  /* ---------- sortable table headers ----------
     sortable(table, state, onSort): every th[data-sort] toggles state.key / state.dir
     (1 asc, -1 desc), keeps aria-sort and a .sort-arrow span in step, then onSort().
     Returns update() to redraw the arrows after changing state in code. */
  function sortable(table, state, onSort) {
    if (table.__rkSortable) return table.__rkSortable; // bound already: a second set of listeners would flip twice
    var ths = table.querySelectorAll("th[data-sort]");
    function update() {
      Array.prototype.forEach.call(ths, function (th) {
        var on = th.getAttribute("data-sort") === state.key, arrow = th.querySelector(".sort-arrow");
        th.setAttribute("aria-sort", on ? (state.dir === 1 ? "ascending" : "descending") : "none");
        if (arrow) arrow.textContent = on ? (state.dir === 1 ? " ▲" : " ▼") : "";
      });
    }
    function activate(th) {
      var key = th.getAttribute("data-sort");
      if (state.key === key) state.dir *= -1; else { state.key = key; state.dir = 1; }
      update(); onSort();
    }
    Array.prototype.forEach.call(ths, function (th) {
      if (!th.hasAttribute("tabindex")) th.setAttribute("tabindex", "0");
      if (!th.querySelector(".sort-arrow")) th.insertAdjacentHTML("beforeend", '<span class="sort-arrow"></span>');
      th.addEventListener("click", function () { activate(th); });
      th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(th); } });
    });
    update();
    table.__rkSortable = update;
    return update;
  }

  /* ---------- step segments (.step-segs) ----------
     stepSegs(total, index): segments filled up to index; all green once the last
     step is reached. */
  function stepSegs(total, index) {
    var html = "", done = index === total - 1;
    for (var i = 0; i < total; i++) html += '<span class="step-seg' + (done ? " done" : (i <= index ? " filled" : "")) + '"></span>';
    return html;
  }

  /* ---------- "/" focuses the search box ----------
     Only when nothing else is taking keystrokes (a field focused or a dialog open)
     and isActive() (optional) says the view with the search box is showing. */
  function searchShortcut(input, isActive) {
    window.addEventListener("keydown", function (e) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (document.activeElement && document.activeElement.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if (isActive && !isActive()) return;
      if (document.querySelector(".modal-overlay:not([hidden])")) return;
      e.preventDefault();
      input.focus();
    });
  }

  /* ---------- project files: the file is the document (1.4.0) ----------
     fileDoc(opts) binds the page to one file on disk through the File System
     Access API (Chrome; Edge unless blocked by policy) and writes every change
     into it. Every file:// page shares one localStorage, so browser storage can
     only ever hold one project; a file per project has no such limit and lives
     wherever the project does. The full reasoning is in docs/storage-design.md;
     this is that design, taken out of the project cost tracker so other tools
     can share it.

     opts:
       app          names the IndexedDB database, the lock and the channel; also
                    the prefix of the keys it keeps in localStorage and sessionStorage
       label        what a file is called in the picker ("UAT tracker project")
       serialise()  the text to write: the state on screen, now
       load(text, how)  parse, validate and show text read from a file. Throw
                    to refuse it, before anything on screen has changed.
                    how.reload is true when it is the bound file read again
                    (an undoable step for a page that keeps undo)
       onBind(fromId, toId, kept)  the bound file changed. kept: what is on
                    screen moved to the new file with it (save as), so history
                    taken in the old one still applies; otherwise drop it
       tabKey       sessionStorage key for this tab's file (default app + ":tab-file")
       onChange(info)  redraw the save status (info() below)
       onMessage(text) a short note for the user (a toast)
       delay        ms between the last edit and the write (default 500)

     Returns { available, info, status, touch, flush, create, open, openRecent,
     recents, forgetRecents, reconnect, retry, useFile, keepMine, close, unblock, boot }.

     Guarantees, all carried over from the cost tracker:
       - one tab per file: a Web Lock named after the file (BroadcastChannel
         where locks are missing), so a second tab never adopts a file in use
       - one write at a time, in order; a queued write overtaken by a newer one
         is skipped; each write keeps the file record it was made for, so
         switching file mid-write cannot put one project into another's file
       - write, then read back the size; a short write is not a save
       - a file changed by something else is never overwritten: autosave stops
         and useFile() / keepMine() decide
       - a crash copy of every save in IndexedDB, so a lapsed permission or a
         closed tab costs nothing; a newer copy than the file is offered back
       - only NotAllowedError / SecurityError counts as a lost permission; any
         other failed write keeps the file and offers retry()
       - a browser that refuses the picker (an admin policy) is remembered and
         the file buttons are withdrawn until unblock() */
  function fileDoc(opts) {
    var APP = opts.app, DELAY = opts.delay || 500;
    var FS_OK = typeof window.showSaveFilePicker === "function" && typeof window.showOpenFilePicker === "function";
    var BLOCK_KEY = APP + ":fs-blocked", TAB_KEY = opts.tabKey || APP + ":tab-file";
    var TYPES = [{ description: opts.label || "Project file", accept: { "application/json": [".json"] } }];
    var isEdge = /\bEdg\//.test(navigator.userAgent);
    function blank() { return { id: null, handle: null, name: "", permission: "none", lastModified: 0, savedAt: 0, stale: false, loaded: false, lastJob: null }; }
    var doc = blank(), stale = false, staleWhy = "", writeFailed = false, blockedBy = "";
    var timer = null, dirty = false, editSeq = 0, pending = 0, chain = Promise.resolve(), SKIPPED = {};
    function changed() { if (opts.onChange) opts.onChange(info()); }
    function say(text) { if (opts.onMessage) opts.onMessage(text); }
    function newId() { return uid() + uid(); }

    /* IndexedDB: handles (the files picked, so they reopen in one click),
       scratch (the last state saved for each file), session (the last file used) */
    function idb() {
      return new Promise(function (res, rej) {
        var req = indexedDB.open(APP, 1);
        req.onupgradeneeded = function () {
          ["handles", "scratch", "session"].forEach(function (s) { if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s); });
        };
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { rej(req.error); };
      });
    }
    function idbDo(store, mode, fn) {
      return idb().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction(store, mode), r = fn(tx.objectStore(store));
          tx.oncomplete = function () { res(r && r.result !== undefined ? r.result : null); };
          tx.onerror = function () { rej(tx.error); };
        });
      }).catch(function () { return null; });
    }
    function idbGet(s, k) { return idbDo(s, "readonly", function (o) { return o.get(k); }); }
    function idbPut(s, k, v) { return idbDo(s, "readwrite", function (o) { return o.put(v, k); }); }
    function idbDel(s, k) { return idbDo(s, "readwrite", function (o) { return o.delete(k); }); }
    function idbAll(s) { return idbDo(s, "readonly", function (o) { return o.getAll(); }).then(function (r) { return r || []; }); }

    /* one file, one editor */
    var chan = window.BroadcastChannel ? new BroadcastChannel(APP) : null;
    var claimed = null, held = dict();
    if (chan) chan.addEventListener("message", function (e) {
      var m = e.data || {};
      if (m.type === "who-has" && claimed && m.id === claimed) chan.postMessage({ type: "have", id: claimed });
    });
    var LOCKS = !!(navigator.locks && typeof navigator.locks.request === "function");
    function claim(id) {
      if (has(held, id)) { claimed = id; return Promise.resolve(true); }
      if (!LOCKS) return claimByMessage(id);
      return new Promise(function (res) {
        navigator.locks.request(APP + ":" + id, { ifAvailable: true }, function (lock) {
          if (!lock) { res(false); return; }
          claimed = id; res(true);
          return new Promise(function (done) { held[id] = done; });   // held until release(id)
        }).catch(function () { claimByMessage(id).then(res); });
      });
    }
    function claimByMessage(id) {
      if (!chan) { claimed = id; return Promise.resolve(true); }
      return new Promise(function (res) {
        var taken = false;
        var onMsg = function (e) { if (e.data && e.data.type === "have" && e.data.id === id) taken = true; };
        chan.addEventListener("message", onMsg);
        chan.postMessage({ type: "who-has", id: id });
        setTimeout(function () { chan.removeEventListener("message", onMsg); if (!taken) claimed = id; res(!taken); }, 180);
      });
    }
    function release(id) {
      Object.keys(held).forEach(function (k) { if (id === undefined || k === id) { var done = held[k]; delete held[k]; done(); } });
      if (id === undefined || claimed === id) claimed = null;
    }
    function releaseOthers(id) { Object.keys(held).forEach(function (k) { if (k !== id) release(k); }); }
    // a held lock goes with the document; dropping it here would let a page
    // restored from the back/forward cache write unclaimed
    window.addEventListener("pagehide", function () { if (!LOCKS) release(); });

    /* state for the page */
    function blockedName() { try { return localStorage.getItem(BLOCK_KEY) || ""; } catch (e) { return ""; } }
    function info() {
      return { available: FS_OK && !blockedName(), supported: FS_OK, blocked: blockedName(), isEdge: isEdge,
        id: doc.id, bound: !!doc.handle, connected: !!doc.handle && doc.permission === "granted", name: doc.name, savedAt: doc.savedAt,
        stale: stale, staleWhy: staleWhy, writeFailed: writeFailed, blockedBy: blockedBy, busy: pending > 0 || !!timer, dirty: dirty };
    }
    function hhmm(t) { var d = new Date(t); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
    // one line for a header: { text, tone: "live" | "warn", action: "retry" | "reconnect" | "" }
    function status() {
      var i = info();
      if (i.connected && i.writeFailed && !i.stale) return { text: "Could not write " + i.name + ", edits kept in this browser", tone: "warn", action: "retry" };
      if (i.connected && i.stale) return { text: i.staleWhy ? "Unsaved edits for " + i.name : i.name + " changed on disk", tone: "warn", action: "" };
      if (i.connected) return { text: (i.busy ? "Saving to " : "Saved to ") + i.name + (!i.busy && i.savedAt ? " · " + hhmm(i.savedAt) : ""), tone: "live", action: "" };
      if (i.bound) return { text: "Not connected to " + i.name, tone: "warn", action: "reconnect" };
      if (i.blockedBy) return { text: i.blockedBy + " is open in another tab", tone: "warn", action: "" };
      return i.available ? { text: "In this browser only", tone: "warn", action: "" } : { text: "Saved in this browser", tone: "live", action: "" };
    }

    /* writes: one queue, in order */
    function staleOf(d) { return d === doc ? stale : !!d.stale; }
    function enqueue(job) {
      pending++;
      job.doc.lastJob = job;
      var p = chain.then(function () { return runWrite(job); }).catch(function (e) { job.error = e; return settle(job, false); });
      var drained = function () { pending--; if (job.doc === doc) changed(); };
      chain = p.then(drained, drained);
      job.done = p.then(function (r) { return r === SKIPPED ? job.doc.lastJob.done : r; });
      return job.done;
    }
    function runWrite(job) {
      var d = job.doc, h = job.handle, text = job.text;
      if (!job.force && d.lastJob !== job) return Promise.resolve(SKIPPED);
      if (!h || d.permission !== "granted") return Promise.resolve(settle(job, false));
      // once stale, only keepMine() writes; stale when the save was made counts too
      if ((job.stale || staleOf(d)) && !job.force) return Promise.resolve(settle(job, false));
      return h.getFile().then(function (f) {
        if (!job.force && d.lastModified && f.lastModified > d.lastModified + 1000) {
          if (d === doc) stale = true; else d.stale = true;
          return false;
        }
        return h.createWritable().then(function (w) {
          return w.write(text).then(function () { return w.close(); });
        }).then(function () { return h.getFile(); }).then(function (after) {
          if (after.size < new Blob([text]).size) throw new Error("short write");
          d.lastModified = after.lastModified;
          d.savedAt = Date.now();
          d.stale = false;
          if (d === doc) { stale = false; staleWhy = ""; writeFailed = false; }
          return true;
        });
      }).catch(function (e) { job.error = e; return false; })
        .then(function (ok) { return settle(job, ok); });
    }
    function settle(job, ok) {
      var d = job.doc, cur = d === doc;
      if (ok) {
        if (d.lastJob === job) { job.payload.fileModified = d.lastModified; idbPut("scratch", job.id, job.payload); }
        if (cur && job.seq === editSeq) dirty = false;
      } else if (!staleOf(d) && d.handle && d.permission === "granted") {
        var n = job.error && job.error.name;
        if (n === "NotAllowedError" || n === "SecurityError") d.permission = "prompt";
        else if (cur) writeFailed = true;
        if (!cur) say("Could not write " + d.name + ", its last edits are kept in this browser");
      } else if (!cur && staleOf(d) && d.lastJob === job) {
        say(d.name + " changed on disk, so its last edits were kept in this browser, not written");
      }
      if (cur) changed();
      return ok;
    }
    function saveNow(force) {
      clearTimeout(timer); timer = null;
      dirty = true;
      var seq = ++editSeq, text = opts.serialise();
      var payload = { id: doc.id, text: text, savedAt: Date.now(), name: doc.name, fileModified: doc.lastModified };
      idbPut("scratch", doc.id, payload);   // first: it is what survives a failed write
      return enqueue({ doc: doc, handle: doc.handle, id: doc.id, text: text, payload: payload, seq: seq, force: !!force, stale: stale });
    }
    // an edit happened: write it soon. False when no file is bound, or when the
    // bound file's content was never shown here (it could not be read at start):
    // what is on screen is then the browser copy, so the page keeps the edit there,
    // and neither the file nor its crash copy is touched.
    function touch() {
      if (!doc.handle || !doc.loaded) return false;
      dirty = true; editSeq++;
      clearTimeout(timer); timer = setTimeout(saveNow, DELAY);
      changed();
      return true;
    }
    // edits waiting on the delay are written to the file they were made in, and
    // every queued write finishes
    function flush() { if (timer) saveNow(); return chain; }
    window.addEventListener("beforeunload", function (e) {
      if (dirty || pending) { e.preventDefault(); e.returnValue = ""; }
    });

    /* binding a file */
    function bind(handle, id, kept) {
      var from = doc.id;
      if (id !== from) { doc.stale = stale; doc = blank(); }
      doc.handle = handle; doc.name = handle.name; doc.id = id; doc.permission = "granted"; doc.lastModified = 0; doc.loaded = true;
      stale = false; staleWhy = ""; writeFailed = false;
      chain.then(function () { releaseOthers(doc.id); });
      if (id !== from && opts.onBind) opts.onBind(from, id, !!kept);
    }
    // crash copies are text; the cost tracker's own build kept the parsed object
    function scratchText(sc) {
      if (!sc) return null;
      if (typeof sc.text === "string") return sc.text;
      return sc.data && typeof sc.data === "object" ? JSON.stringify(sc.data, null, 2) : null;
    }
    function sameText(a, b) {
      if (a === b) return true;
      try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)); } catch (e) { return false; }
    }
    function remember() {
      if (!doc.id || !doc.handle) return Promise.resolve();
      try { sessionStorage.setItem(TAB_KEY, doc.id); } catch (e) { /* per tab is a nicety */ }
      return idbPut("handles", doc.id, { id: doc.id, name: doc.name, handle: doc.handle, lastOpened: Date.now() })
        .then(function () { return idbPut("session", "last", { id: doc.id }); });
    }
    // the same file must keep one id, or the one-editor claim would not hold
    function idForHandle(h) {
      return idbAll("handles").then(function (rows) {
        var i = 0;
        function step() {
          if (i >= rows.length) return null;
          var row = rows[i++];
          if (!row.handle || typeof row.handle.isSameEntry !== "function") return step();
          return row.handle.isSameEntry(h).then(function (same) { return same ? row.id : step(); }).catch(step);
        }
        return step();
      });
    }
    function readFile(h) { return h.getFile().then(function (f) { return f.text().then(function (t) { return { f: f, t: t }; }); }); }
    // load first (it throws before anything changes), then bind
    function loadFrom(h, id, r, reload) {
      if (timer) { if (id !== doc.id) saveNow(); else { clearTimeout(timer); timer = null; } }
      opts.load(r.t, { reload: !!reload, name: h.name });
      bind(h, id, false);
      doc.lastModified = r.f.lastModified; doc.savedAt = r.f.lastModified;
      dirty = false;
      idbPut("scratch", doc.id, { id: doc.id, text: r.t, savedAt: r.f.lastModified, name: doc.name, fileModified: r.f.lastModified });
      return remember();
    }
    function fileError(what, e) {
      if (e && e.name === "AbortError") return false;
      var name = (e && e.name) || "Error";
      if (name === "SecurityError" || name === "NotAllowedError") {
        try { localStorage.setItem(BLOCK_KEY, name); } catch (x) { /* still withdrawn for this visit */ }
        say("This browser refused access to the file system");
        changed();
      } else say(what + " (" + name + (e && e.message ? ": " + String(e.message).slice(0, 100) : "") + ")");
      try { console.warn("[" + APP + "] " + what, e); } catch (x) { /* no console */ }
      return false;
    }
    function askPermission(h) {
      return h.requestPermission ? h.requestPermission({ mode: "readwrite" }).catch(function () { return "denied"; }) : Promise.resolve("granted");
    }
    function checkPermission(h) {
      return h.queryPermission ? h.queryPermission({ mode: "readwrite" }).catch(function () { return "denied"; }) : Promise.resolve("granted");
    }
    var ABORT = { name: "AbortError" };

    // A new file. prepare() runs once the file is chosen and free, and may put a
    // different project on screen (a new, empty one); what is on screen after it
    // is what is written. Without prepare it is "save as".
    function create(suggestedName, prepare) {
      return window.showSaveFilePicker({ suggestedName: suggestedName, types: TYPES }).then(function (h) {
        return flush().then(function () { return idForHandle(h); }).then(function (known) {
          var id = known || newId();
          return claim(id).then(function (free) {
            if (!free) { say(h.name + " is open in another tab"); throw ABORT; }
            blockedBy = "";
            if (timer) saveNow();   // typed while the picker was open: the old file's
            if (prepare) prepare();
            bind(h, id, !prepare);
            return saveNow();
          });
        });
      }).then(function () { return remember(); }).then(function () {
        changed(); say("Saving to " + doc.name); return true;
      }).catch(function (e) { return fileError("Could not create that file", e); });
    }
    function adopt(h, id) {
      return flush().then(function () { return claim(id); }).then(function (free) {
        if (!free) { blockedBy = h.name; changed(); say(h.name + " is open in another tab"); return false; }
        blockedBy = "";
        var again = id === doc.id;
        return readFile(h).then(function (r) { return loadFrom(h, id, r, again); }).then(function () {
          changed(); say("Opened " + doc.name); return true;
        }).catch(function (e) {   // a failed open must not hold its claim, nor drop the open file's
          if (id !== doc.id) { release(id); claimed = doc.id; }
          throw e;
        });
      });
    }
    function open() {
      return window.showOpenFilePicker({ types: TYPES, multiple: false, mode: "readwrite" }).then(function (list) {
        var h = list[0];
        return checkPermission(h).then(function (p) { return p === "granted" ? p : askPermission(h); }).then(function (p) {
          if (p !== "granted") { say("Permission refused, the file was not opened"); return false; }
          return idForHandle(h).then(function (id) { return adopt(h, id || newId()); });
        });
      }).catch(function (e) { return fileError("That file could not be opened", e); });
    }
    function recents() {
      if (!FS_OK) return Promise.resolve([]);
      return idbAll("handles").then(function (rows) {
        return rows.filter(function (r) { return r && r.id; }).sort(function (a, b) { return (b.lastOpened || 0) - (a.lastOpened || 0); })
          .slice(0, 8).map(function (r) { return { id: r.id, name: r.name, lastOpened: r.lastOpened, open: r.id === doc.id }; });
      });
    }
    function forgetRecents() {
      return idbAll("handles").then(function (rows) {
        return Promise.all(rows.filter(function (r) { return r.id !== doc.id; }).map(function (r) { return idbDel("handles", r.id); }));
      });
    }
    // call straight from a click: the permission prompt needs the gesture
    function openRecent(id) {
      return idbGet("handles", id).then(function (row) {
        if (!row || !row.handle) { say("That file is no longer remembered"); return idbDel("handles", id).then(function () { return false; }); }
        return askPermission(row.handle).then(function (p) {
          if (p !== "granted") { say("Permission refused, the file was not opened"); return false; }
          return adopt(row.handle, row.id);
        });
      }).catch(function (e) { return fileError("Could not reopen that file", e); });
    }
    // permission does not survive a browser restart, so reconnecting is a click
    function reconnect() {
      if (!doc.handle) return Promise.resolve(false);
      return askPermission(doc.handle).then(function (p) {
        doc.permission = p;
        if (p !== "granted") { say("Still not connected"); changed(); return false; }
        writeFailed = false;
        // nothing of this file was ever shown here (no crash copy): read it, never write over it
        if (!doc.loaded) {
          if (opts.onBind) opts.onBind(doc.id, doc.id, false);   // history taken here was not this file's
          return readFile(doc.handle).then(function (r) { return loadFrom(doc.handle, doc.id, r, false); })
            .then(function () { changed(); say("Reconnected to " + doc.name); return true; });
        }
        // doc.lastModified is the file as this page last wrote or read it, so a
        // file changed meanwhile goes stale rather than being overwritten
        return saveNow().then(function (ok) {
          say(ok ? "Reconnected to " + doc.name : stale ? doc.name + " changed on disk, choose which version to keep" : "Could not write " + doc.name);
          return ok;
        });
      }).catch(function (e) { return fileError("Could not reconnect", e); });
    }
    function retry() { writeFailed = false; return doc.handle ? saveNow() : Promise.resolve(false); }
    // stale: take the file as it is now, dropping what is on screen
    function useFile() {
      if (!doc.handle) return Promise.resolve(false);
      clearTimeout(timer); timer = null;
      var d = doc;
      return readFile(d.handle).then(function (r) {
        if (d !== doc) return false;
        stale = false; staleWhy = "";
        return loadFrom(d.handle, d.id, r, true).then(function () { changed(); say("Loaded " + doc.name + " from disk"); return true; });
      }).catch(function (e) { say("Could not read " + d.name); changed(); return false; });
    }
    // stale: write what is on screen over the file
    function keepMine() {
      if (!doc.handle) return Promise.resolve(false);
      var d = doc;
      return saveNow(true).then(function (ok) {
        if (d !== doc) return ok;
        if (!ok) stale = true;
        changed(); say(ok ? "Overwrote " + d.name : "Could not write " + d.name);
        return ok;
      });
    }
    // stop editing the file (its pending edits are written first); the page then
    // shows whatever it keeps in browser storage
    function close() {
      return flush().then(function () {
        var id = doc.id;
        doc = blank(); stale = false; staleWhy = ""; writeFailed = false; dirty = false; blockedBy = "";
        if (id) release(id);
        try { sessionStorage.removeItem(TAB_KEY); } catch (e) { /* per tab is a nicety */ }
        return idbDel("session", "last");
      }).then(changed);
    }
    function unblock() { try { localStorage.removeItem(BLOCK_KEY); } catch (e) { /* nothing kept */ } changed(); }

    // Reopen this tab's file (or the last one used). onError(text) reports a
    // file that could not be shown; it is let go, not overwritten.
    function boot(onError) {
      if (!FS_OK || blockedName()) { changed(); return Promise.resolve(); }
      var tabId = null;
      try { tabId = sessionStorage.getItem(TAB_KEY); } catch (e) { tabId = null; }
      return Promise.resolve(tabId ? { id: tabId } : idbGet("session", "last")).then(function (sess) {
        if (!sess || !sess.id) return;
        return idbGet("handles", sess.id).then(function (row) {
          if (!row || !row.handle || typeof row.handle.getFile !== "function") return;
          return claim(row.id).then(function (free) {
            if (!free) { blockedBy = row.name; return; }
            doc.id = row.id; doc.handle = row.handle; doc.name = row.name;
            return restore(row, onError);
          });
        });
      }).catch(function (e) { try { console.warn("[" + APP + "] boot", e); } catch (x) { /* no console */ } })
        .then(changed);
    }
    function letGo(row, why, onError) {
      doc = blank(); release(row.id);
      if (onError) onError(row.name + " could not be shown (" + why + "), so it was not opened and has not been changed.");
    }
    function restore(row, onError) {
      return checkPermission(row.handle).then(function (p) {
        doc.permission = p;
        if (p === "granted") {
          return readFile(row.handle).then(function (r) {
            try { opts.load(r.t, { reload: false, name: row.name }); } catch (e) { letGo(row, e && e.message || String(e), onError); return; }
            doc.loaded = true; doc.lastModified = r.f.lastModified; doc.savedAt = r.f.lastModified;
            // the file wins, unless this browser holds newer edits that never reached it
            return idbGet("scratch", row.id).then(function (sc) {
              var st = scratchText(sc);
              if (st === null || !(sc.savedAt > r.f.lastModified) || sameText(st, r.t)) return;
              try { opts.load(st, { reload: false, name: row.name }); } catch (e) { return; }
              stale = true; dirty = true;
              staleWhy = "This browser holds edits to " + doc.name + " from " + hhmm(sc.savedAt) +
                " that never reached the file. They are what is shown here; the file has not been changed.";
            });
          }, function () { doc.permission = "prompt"; });
        }
        // no permission until a click: show the newest copy we have of this file
        return idbGet("scratch", row.id).then(function (sc) {
          var st = scratchText(sc);
          if (st === null) return;
          if (sc.fileModified > 0) doc.lastModified = sc.fileModified;
          try { opts.load(st, { reload: false, name: row.name }); doc.loaded = true; }
          catch (e) { if (onError) onError("The copy of " + row.name + " kept in this browser could not be shown."); }
        });
      });
    }

    return { available: function () { return info().available; }, info: info, status: status, touch: touch, flush: flush,
      create: create, open: open, openRecent: openRecent, recents: recents, forgetRecents: forgetRecents,
      reconnect: reconnect, retry: retry, useFile: useFile, keepMine: keepMine, close: close, unblock: unblock, boot: boot };
  }

  return {
    version: KIT_VERSION,
    $: $, esc: esc, show: show, hide: hide,
    round1: round1, round2: round2, fmtHrs: fmtHrs, nowIso: nowIso,
    download: download, store: store, clipboard: clipboard,
    upload: upload, xlsx: xlsx, rules: rules, NameEditor: NameEditor,
    dict: dict, has: has,
    // kit 2 (1.1.0)
    uid: uid, localDate: localDate, today: today,
    fmtNum2: fmtNum2, fmtWhole: fmtWhole, fmtMoney: fmtMoney, csv: csv,
    modal: modal, confirm: confirmDialog, chipsFromSelect: chipsFromSelect,
    sortable: sortable, stepSegs: stepSegs, searchShortcut: searchShortcut,
    // 1.3.0
    toast: toast,
    // 1.4.0
    fileDoc: fileDoc
  };
})();
