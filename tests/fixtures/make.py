"""Regenerate the spreadsheet fixtures used by tests/smoke.cjs.
Needs openpyxl (pip install openpyxl). Run from anywhere: python3 tests/fixtures/make.py"""
import datetime as dt
import os
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
D = dt.datetime


def save(wb, name):
    wb.save(os.path.join(HERE, name))


# A three-task delivery plan in the current template layout.
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Plan"
ws.append(["Smoke Plan", None, None, None, None, None, None, None, "Start:", D(2026, 3, 4), "Now:", D(2026, 3, 18)])
ws.append([])
ws.append(["Task", "Category", "Status", "Start Date", "End Date", "Milestone", "At Risk", "Notes"])
for row in [["Alpha", "Build", "Done", D(2026, 3, 2), D(2026, 3, 13), False, False, None],
            ["Beta", "Build", "In Progress", D(2026, 3, 16), D(2026, 3, 27), False, True, None],
            ["Gamma", "Test", "Not Started", D(2026, 4, 1), D(2026, 4, 10), False, False, None]]:
    ws.append(row)
for r in ws.iter_rows(min_row=4):
    for c in r:
        if isinstance(c.value, dt.datetime):
            c.number_format = "dd/mm/yyyy"
save(wb, "delivery-plan.xlsx")

# A small Waqti timesheet export.
ART = "DN4 - dnata Travel Services"
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Export"
ws.append(["Staff ID", "Work Day", "Month", "Demand", "Feature", "Booked Hours", "Recharge Cost",
           "Application", "Taxonomy", "Staff ART", "Created By"])
for row in [["S1", "2026-03-02", "Mar-26", "D100 - Alpha", "F1 - Feature one", 6, 0, "App", "Dev", ART, "S1"],
            ["S2", "2026-03-03", "Mar-26", "D200 - Beta", "F2 - Feature two", 4, 0, "App", "Dev", ART, "S2"],
            ["S2", "2026-03-04", "Mar-26", "D200 - Beta", "F2 - Feature two", 2, 0, "", "Dev", ART, "GEN_LINES"]]:
    ws.append(row)
save(wb, "waqti-export.xlsx")


# ---- Delivery plan regression fixtures (dp-*) ----
def dp_plan(name, hdr, rows, title="DP Plan", start=D(2026, 3, 4)):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Plan"
    ws.append([title, None, None, None, None, None, None, None, "Start:", start, "Now:", D(2026, 3, 18)])
    ws.append([])
    ws.append(hdr)
    for row in rows:
        ws.append(row)
    for r in ws.iter_rows():
        for c in r:
            if isinstance(c.value, dt.datetime):
                c.number_format = "dd/mm/yyyy"
    save(wb, name)


# Baseline and Forecast dates (Forecast is plotted), loosely named flag, lane and
# notes columns, and Vendor/Calendar columns that must not be read as dates.
dp_plan("dp-headers.xlsx",
        ["Task", "Category / Workstream", "Status", "Baseline Start", "Baseline End", "Forecast Start",
         "Forecast End", "Key Milestone", "Risk Flag", "Notes / Comments", "Vendor", "Calendar"],
        [["Alpha", "Build", "Done", D(2026, 1, 5), D(2026, 1, 16), D(2026, 3, 2), D(2026, 3, 13), "N", "N", "", "Acme", "x"],
         ["Beta", "Build", "In Progress", D(2026, 1, 19), D(2026, 1, 30), D(2026, 3, 16), D(2026, 3, 27), "N", "Y", "", "Acme", "x"],
         ["Gamma", "Test", "Not Started", D(2026, 2, 2), D(2026, 2, 13), D(2026, 4, 1), D(2026, 4, 10), "Y", "N", "", "Acme", "x"]])
# Hand-typed spellings of Start and End.
dp_plan("dp-header-spellings.xlsx", ["Task", "Category", "Status", "Start_Date", "End Date - dd/mm/yyyy"],
        [["Alpha", "Build", "Done", D(2026, 3, 2), D(2026, 3, 13)],
         ["Beta", "Build", "In Progress", D(2026, 3, 16), D(2026, 3, 27)]])
# No Start/End columns at all: the error lists the headers it found.
dp_plan("dp-no-dates.xlsx", ["Task", "Owner", "Vendor", "Calendar", "Weekend"], [["Alpha", "Bob", "Acme", "x", "y"]])
# A genuine six-year roadmap (2026-2031): past five years, not a typo.
dp_plan("dp-roadmap-6y.xlsx", ["Task", "Category", "Status", "Start Date", "End Date"],
        [["%d Q%d release" % (y, q + 1), "Roadmap", "Not Started", D(y, 1 + 3 * q, 1), D(y, 3 + 3 * q, 28)]
         for y in range(2026, 2032) for q in range(4)], title="Roadmap", start=D(2026, 1, 1))


# The real legacy sprint template (git 7a02d97, "Start Sprint"/"End Sprint" and
# Q#.# week headers), filled at XML level so Excel's cached values (the Q1.x
# headers, the Start date in J1, Now: Q2.2) survive: openpyxl would drop them.
def dp_legacy_sprint(name="dp-legacy-sprint.xlsx"):
    import io, re, subprocess, zipfile
    try:
        blob = subprocess.run(["git", "show", "7a02d97:assets/delivery-plan-template.xlsx"], cwd=HERE,
                              check=True, capture_output=True).stdout
    except (OSError, subprocess.CalledProcessError):
        print("skipped", name, "(needs the git history for 7a02d97)")
        return
    zin = zipfile.ZipFile(io.BytesIO(blob))
    parts = [(i, zin.read(i.filename)) for i in zin.infolist()]
    tasks = [("Discovery", "Plan", "Done", "Q1.1", "Q1.2", False),
             ("Build", "Deliver", "In Progress", "Q1.3", "Q1.6", False),
             ("Test", "Deliver", "Not Started", "Q2.1", "Q2.2", False),
             ("Go live", "Deliver", "Not Started", "Q2.3", "Q2.3", True)]
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zo:
        for info, data in parts:
            if info.filename == "xl/worksheets/sheet1.xml":
                x = data.decode("utf-8")
                for n, task in enumerate(tasks):
                    r = 4 + n
                    for col, val in zip("ABCDE", task[:5]):
                        x, k = re.subn(r'<c r="%s%d" s="(\d+)"/>' % (col, r),
                                       lambda m: '<c r="%s%d" s="%s" t="inlineStr"><is><t>%s</t></is></c>'
                                       % (col, r, m.group(1), val), x, count=1)
                        assert k == 1, (col, r)
                    if task[5]:
                        x, k = re.subn(r'(<c r="F%d" s="\d+" t="b"><v>)0(</v>)' % r, r"\g<1>1\g<2>", x, count=1)
                        assert k == 1
                data = x.encode("utf-8")
            zo.writestr(info, data)
    with open(os.path.join(HERE, name), "wb") as f:
        f.write(out.getvalue())


dp_legacy_sprint()
print("fixtures written to", HERE)
