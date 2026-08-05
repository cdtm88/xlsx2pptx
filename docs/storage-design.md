# Storing a project cost tracker: what is wrong and what to do about it

Status: **proposal, not built.** Written for a decision, not for merging.

The tracker autosaves to `localStorage` and offers Save JSON / Load data as the
way to keep a copy. In practice that is friction, and worse, it silently loses
work. This is what I measured, what is actually causing it, and the design I
recommend.

---

## 1. What is actually wrong

I ran these against the built `project-cost-tracker.html` in Chromium, opened
over `file://`, which is how it is used.

| Question | Measured result |
|---|---|
| What origin does a `file://` page get? | `file://` — **the same for every file on the machine** |
| Two copies of the tracker in different folders — same storage? | **Yes.** `siteA/tracker.html` and `siteB/tracker.html` read and write the same `localStorage` |
| Two projects open at once? | **They destroy each other.** Tab B saved "PROJECT TWO", tab A's next keystroke wrote "PROJECT ONE" over it. No warning, no recovery |
| Is that storage durable? | No. `navigator.storage.persisted()` → `false`, and `persist()` is refused on `file://`. It is best-effort, evictable |
| How big is a project? | Demo **1.8 KB**. Worst realistic case — 30 people × 60 months, 10 vendors, a baseline — **50 KB** |
| Quota available | ~1 GB |

### The root cause

**Every `file://` document shares one origin, so every copy of the tracker shares
one `localStorage`.** The tracker keeps its whole state under a single key. So:

- You can only ever have **one** project. Opening the tracker to look at project
  B and then going back to project A means A is gone unless you exported it.
- Two tabs open is not a convenience, it is a data-loss bug — last writer wins,
  and the loser is whichever tab you typed in first.
- Copying the HTML into each project folder — the natural instinct, and the way
  the other tools in this repo are used — does **not** give you one tracker per
  project. All the copies fight over the same slot.

That is why Save JSON / Load data feels like friction: it is not a backup, it is
**the only way to have more than one project**, and it has to be done manually,
correctly, every single time you switch. Miss it once and the work is gone.

Secondary problems, all real but smaller:

- The download goes to `~/Downloads` under a slugged name, disconnected from
  wherever the user actually keeps the project. Reloading means hunting for it.
- Nothing tells you which file the current state came from, or whether the file
  on disk is behind what is on screen.
- Autosave overwrites in place. There is no history: a bad bulk fill plus a
  reload beats the in-memory undo stack, which does not survive the tab closing.
- Clearing browsing data wipes everything, with no warning that it would.

---

## 2. What "good" looks like

1. **Never lose work.** No silent overwrite, ever. Any loss must require an
   explicit, confirmed destructive action.
2. **More than one project**, without manual file juggling.
3. **Low friction.** No save step in the normal loop. Opening the tool should
   land you back where you were.
4. **The user owns a real file.** Something they can back up, email, drop in
   SharePoint, and hand to whoever takes the project over.
5. **Still one offline HTML file.** No server, no build, no account.

---

## 3. Options

| Option | Fixes multi-project | Durable | Friction | Works in |
|---|---|---|---|---|
| **A.** Keep `localStorage`, key by project id | Yes | No — evictable, still one origin | Low | All |
| **B.** IndexedDB project library | Yes | Better quota, still evictable | Low | All |
| **C.** File System Access API — bind to a real file | Yes | **Yes, it is a real file** | Lowest after first grant | Chrome/Edge/Opera only |
| **D.** Serve the tools over HTTPS instead of `file://` | Yes | Yes, per-tool origin + `persist()` | Low | All, but needs hosting |
| **E.** Status quo + nagging to export | No | No | High | All |

**On (C):** I verified the File System Access API is genuinely available from
`file://` — `isSecureContext` is `true`, `showSaveFilePicker` and
`showOpenFilePicker` are functions, and `FileSystemHandle.prototype.queryPermission`
and `FileSystemFileHandle.prototype.createWritable` are real. I also verified
IndexedDB round-trips structured values, which is what lets a file handle be
remembered between sessions. But it is
[Chrome, Edge and Opera only — Firefox and Safari implement only the invisible
Origin Private File System and have no local-disk picker](https://developer.chrome.com/docs/capabilities/browser-fs-access),
so it can only ever be an enhancement, not the whole answer.

**On (D):** this is the honest root-cause fix — a per-tool origin, storage the
browser will make persistent, and no shared-`file://` problem at all. It is also
the biggest change to how these tools are delivered, and it breaks "works with
the network off, opened from disk". Worth a separate conversation; not assumed
here.

---

## 4. Recommended design

**B + C: an IndexedDB project library that every browser gets, plus optional
binding to a real file on disk where the browser allows it.**

### 4.1 Project library (all browsers)

Replace the single `localStorage` key with an IndexedDB database:

```
projects   key: id (uuid)   { id, name, updatedAt, data }
snapshots  key: [id, ts]    { id, ts, label, data }     — rolling history
session    key: "tab"       { openProjectId }
```

- The header gains a project switcher: the open project's name, a dropdown of
  the others, **New**, **Duplicate**, **Delete**.
- Opening the tracker restores whatever was open last.
- Two tabs on two different projects is now normal and safe, because each tab
  writes to its own record.
- Two tabs on the *same* project is detected over `BroadcastChannel`. The second
  tab goes read-only with a "this project is open in another tab" banner rather
  than racing it.

At 50 KB worst case against ~1 GB of quota, size is a non-issue.

### 4.2 Version history (all browsers)

Every autosave writes the project record and appends to `snapshots`, keeping the
last ~30 per project plus a daily one for the last 14 days. "Restore a version"
lists them by time with the total estimate and forecast, so you can recognise
the one you want. This makes the undo stack survive closing the tab, and turns
"I pasted the wrong thing an hour ago" from fatal into a click.

Worst case cost: 30 × 50 KB = 1.5 MB per project. Fine.

### 4.3 Bind to a file (Chrome, Edge, Opera)

- **Save to file…** once → `showSaveFilePicker` → the handle is stored in
  IndexedDB against the project.
- After that, every autosave writes the project **into that file**, debounced,
  with no dialog. The file on disk is always current.
- Reopening the tracker: the handle is still in IndexedDB. Permission does not
  survive a browser restart, so the header shows **"Reconnect to
  falcon-platform.json"** — one click, one native prompt, then silent autosave
  resumes.
- **Open project file…** → `showOpenFilePicker` → adds an existing file to the
  library and binds it.

The header's save indicator becomes the honest one:

| State | Shows |
|---|---|
| Bound and written | `Saved to falcon-platform.json · 14:32` |
| Bound, permission lapsed | `Reconnect to falcon-platform.json` (button) |
| Not bound | `In this browser only · Save to a file` (button) |
| Bound, file changed underneath us | `File changed on disk — compare` |

### 4.4 Safety rules

- **Write, then verify.** Write to the handle, read back the byte length, and
  only then update "last saved". Never truncate before a successful write.
- **Stale-file detection.** Record the file's `lastModified` after each write. If
  it differs before the next write, something else edited it — stop autosaving
  and ask, rather than clobbering.
- **The browser copy is a cache, not the truth.** When a project is bound to a
  file, the file wins on load, and any difference is surfaced rather than
  resolved silently.
- **Deletes are confirmed and recoverable** — deleted projects go to a
  `deleted` flag for 30 days before they are really gone.
- `navigator.storage.persist()` is requested on first run. It is refused on
  `file://` today, but it is free to ask and it works if these are ever served
  over HTTPS.

### 4.5 What stays

Save JSON / Load data stay exactly as they are. They are the portable escape
hatch — handing a project to someone else, or getting it onto a machine where
the file picker does not exist. They stop being the *only* mechanism, which is
the actual problem.

---

## 5. Rollout

1. **Migration.** On first run, if the old `localStorage` key holds a project,
   import it into the library as "Recovered project" and leave the old key in
   place, untouched, for one release. Nobody loses anything to the upgrade.
2. **Phase 1 — the library.** IndexedDB, project switcher, snapshots,
   cross-tab guard. This alone fixes the data loss and works in every browser.
3. **Phase 2 — file binding.** Feature-detected. Chrome and Edge get it; other
   browsers keep phase 1 behaviour and see no dead buttons.
4. **Phase 3 — history UI.** Restore-a-version list, once the snapshot store
   has proved itself.

Phase 1 is the one that matters. Phase 2 is what makes it feel effortless.

---

## 6. Risks and open questions

- **Chrome-only for the good bit.** If the browser is not negotiable and it is
  not Chrome or Edge, phase 2 never lands and we live with phase 1 plus manual
  export. Worth confirming which browser is actually in use before building
  phase 2.
- **IndexedDB is still evictable on `file://`.** Phase 1 makes loss *much* less
  likely; only phase 2 or HTTPS hosting makes the data genuinely durable. The UI
  must not overclaim: "in this browser only" needs to read as a warning.
- **The shared `file://` origin does not go away.** Two *different* tools in this
  repo could still collide if they ever chose the same database name. Namespacing
  is easy, but it needs a convention in the Report Kit.
- **A file the user renames or moves** breaks the handle. Detectable, and the fix
  is a re-pick, but it needs to fail clearly rather than silently stop saving.
- **Is one file per project right?** The alternative is one library file holding
  everything. One file per project matches how people actually file work and
  hand it over, so I would start there.

---

## 7. Open decisions for you

1. Which browsers must this work in? That decides whether phase 2 is worth it.
2. Would hosting these tools somewhere internal (option D) ever be on the table?
   It is the clean fix, and it changes the recommendation.
3. One file per project, or one library file?
4. Is version history worth phase 3, or is "never lose the current project"
   enough?
