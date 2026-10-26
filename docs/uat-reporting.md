# Reporting UAT to sign-off: what the tracker reports and why

The research behind [`uat-signoff-tracker.html`](../uat-signoff-tracker.html):
what a UAT lead needs to track, what stakeholders need to read, and how the
email update is built from that.

## What stakeholders need from a UAT update

Approvers and sponsors read an update to answer three questions, in this order:

1. **Are we going to sign off on time?** A status and one sentence saying why.
2. **What stands in the way?** The defects and risks that could stop go-live,
   with an owner and a date for each.
3. **What do you need from me?** Decisions and help, named to a person.

Everything else is supporting detail. So the email leads with the bottom line
(the status badge and a one-sentence headline), puts asks in their own section
rather than buried in risks, and keeps the detail tables below the fold. Status
reporting guides agree on this ordering: a TL;DR first, then status, key
updates, risks and the decisions needed, short enough to read in a couple of
minutes, sent on a steady weekly-or-better cadence, with bad news stated early
and plainly.

## The figures that matter, and the ones that mislead

| Figure | Why it is there | Trap it avoids |
|---|---|---|
| Executed / in scope | Progress, the first thing asked | "Executed" counts Passed and Failed only. Blocked and in-progress tests are not done |
| Executed against plan | Says whether progress is fast enough, not just how far it has got | 60% executed is fine on day 5 of 10 and alarming on day 9 |
| Passed / in scope | What the exit criteria are measured on | A high pass rate on few tests run hides how much is left |
| Pass rate of tests run | An early quality signal before execution finishes | Shown separately so the two pass figures are never confused |
| Open defects by severity | What blocks go-live | A raw defect count treats a typo like a payments outage |
| Ready to retest | Fixes delivered and waiting on testers | Without it, "open" overstates the developers' backlog |
| Known issues accepted | Deferred defects with their workaround | Silently dropping deferred defects from the count hides risk the business has taken on |
| Approvals | Who has signed, who has not, conditions | "Signed off" with unrecorded conditions comes back later |
| Change since last update | What moved, for readers who saw the last one | Readers otherwise diff two emails by eye |

Severity is defined in business terms (stops go-live / key process impaired /
workaround acceptable / cosmetic), not QA jargon, because the people deciding
on go-live are business owners.

## Exit criteria: make sign-off readiness objective

Sign-off should not be a judgement made fresh at the end. The common shape of
UAT exit criteria, agreed with approvers before testing starts:

- every in-scope test executed (100% is the usual bar);
- a pass threshold across scope (95% is a common example);
- every critical or showstopper scenario passed;
- no open critical defects and no open high defects, or each one explicitly
  waived by the business owner;
- non-test conditions such as training done or a runbook rehearsed.

The thresholds published in templates and practitioner forums vary and are
examples rather than a standard, so all of them are editable, can be switched
off, and custom criteria can be added and ticked off. Every open defect at the
end should land in one of three outcomes: fixed before go-live, shipped as a
known issue with a documented workaround, or deferred to a later release. The
tracker's Deferred status plus its **Workaround or decision** field records the
second and third.

## Status (RAG) that means the same thing every week

A colour that is picked by feel drifts. The tracker computes it from stated
rules and shows the reasons beside it:

- **Green**: on plan with nothing blocking.
- **Amber**: a concern with a clear recovery: behind plan, critical or high
  defects open above the criteria, many tests blocked, a weak pass rate.
- **Red**: sign-off will be missed without intervention: an approver has
  rejected, the date has passed, far behind plan, or critical defects open
  days before sign-off.

The lead can override it with a reason (they know things the numbers do not),
and the tracker keeps showing what the rules would say. The status always goes
out as a word as well as a colour, so it survives colour blindness, grey-scale
printing and dark-mode mail clients.

## Two emails, two audiences

- **Progress update**, for the steady cadence. *Leadership summary* keeps it to
  the headline, key figures, change since last time, highlights, exit
  criteria, critical and high defects, risks, asks, approvals and next steps.
  *Full detail*, for the project team, adds progress by area, every open
  defect and the known issues accepted.
- **Sign-off request**, sent once the criteria are met (or met with
  exceptions): the evidence (figures, criteria, defects, known issues) and a
  clear ask: reply by a date with Approved, Approved with conditions (stating
  them), or Rejected (with the reason). Asking for a fixed form of reply makes
  the sign-off record unambiguous.

## Making it paste cleanly into Outlook

Outlook's Word-based renderer ignores most CSS, so the copied email uses only
inline styles, tables for layout, Arial, and `bgcolor` as well as `background`
on coloured cells (the status badge and the progress bar are table cells, not
images or CSS bars). A plain-text version goes on the clipboard alongside, with
aligned columns, for clients and channels that drop formatting. The subject
line carries the status and the headline numbers so the update can be read
from the inbox list alone.

## Sources

- [User Acceptance Testing (UAT): A Practical Guide for Product Teams](https://www.koji.so/docs/user-acceptance-testing-guide): exit gates (100% critical, 95% major), business-owner waivers, a recorded go/no-go
- [Go / No Go criteria, Ministry of Testing](https://club.ministryoftesting.com/t/go-no-go-criteria/51551): zero blockers and criticals with a cap on majors, and the case for discussing risk rather than only counting
- [What UAT is, and what it is not](https://www.resumelens.org/blog/qa-manual/uat-playbook): severity in business terms; fix, ship with known issue, or defer
- [UAT test plan template](https://blog.uizap.com/uat-test-plan-template/) and [UAT checklist](https://app.manifest.ly/public/checklists/0b824d9bc6ad9678363a5a3360e94c8f?modal=true): pass thresholds, no open P0/P1, named signatories
- [UAT dashboard KPIs](https://fanruan.com/en/blog/uat-dashboard): planned against completed, pass rate, blocked, defects by severity and age, sign-off progress
- [Crafting a UAT report](https://blog.magicpod.com/crafting-a-comprehensive-user-acceptance-test-uat-report): defect records with severity, steps and resolution status
- [Gas governance UAT defect analysis](https://www.gasgovernance.co.uk/sites/default/files/ggf/UAT%20Defects%20Analysis%20230915.pdf): a real report where the share of defects ready to retest changes the reading
- [Writing executive status updates, Jacob Kaplan-Moss](https://jacobian.org/2021/mar/5/exec-status-update/): short, a handful of points, read in minutes
- [Status report survival guide](https://projectmanagementcompass.substack.com/p/status-report-survival-guide): most important information and asks first; RAG by dimension
