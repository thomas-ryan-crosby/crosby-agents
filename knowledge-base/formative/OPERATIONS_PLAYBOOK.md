# Crosby Development — Operations Playbook

**Version:** 1.0
**Issued:** April 1, 2026
**Audience:** Ryan Crosby and anyone operating the Crosby Development agent dashboard

---

## 1. The Dashboard is Home Base

All work flows through the dashboard at:
```
knowledge-base/../dashboard.html
```

**Do not use agents directly in chat for tasks the dashboard is designed to handle.** The dashboard is the control surface. Chat is for asking questions, requesting new agent builds, and one-off analysis.

### Dashboard Tabs

| Tab | Purpose |
|-----|---------|
| Portfolio | Top-level stats across all 8 properties |
| Properties | Drill-down into individual property data, tenant rosters, lease timelines |
| Documents | All agent outputs, formative docs, and playbooks — review and approve here |
| Agents | Status of all 8 agents, phase roadmap |
| Schedule | Upcoming automated tasks |
| Approvals | Quick-action queue for pending reviews |
| Metrics | Agent performance and output stats |
| Strategy | Implementation plan, technology stack, property profiles |

---

## 2. Daily Workflow

### Morning Check (5 minutes)
1. Open dashboard → **Portfolio** tab
2. Check for any red/orange urgency badges in the lease timeline
3. Open **Documents** tab → filter by "Pending Review"
4. Review any new agent outputs

### Weekly Tasks (Monday)
1. Dashboard → **Documents** — review Lease Intelligence weekly scan results
2. Check for any notice deadlines entering the 90-day window
3. Approve or revise any renewal letters ready to send

### Monthly Tasks (1st of Month)
1. Review monthly portfolio summary from Rent Roll Intelligence Agent
2. Review any auto-renewal letters drafted by Lease Intelligence Agent
3. Update rent roll data files if new XLS files are available

---

## 3. Triggering Agent Tasks

Agents can be triggered:
- **Automatically** via the Schedule (once deployed)
- **On-demand** by asking in chat: *"Run the Lease Intelligence Agent for Building #1"*

When asking Claude to run an agent task:
1. Specify the agent and scope: *"Lease Intelligence Agent, Building #1"*
2. Specify the output type: *"generate a renewal letter for Bayou CPR"*
3. Review the result in Documents tab
4. Approve or request revisions

---

## 4. Reviewing Agent Outputs

All agent outputs appear in the **Documents** tab with status **Pending Review**.

### Review Checklist
Before approving any tenant communication:
- [ ] Tenant name and suite number are correct
- [ ] Rent figures match current rent roll
- [ ] Dates are accurate (lease term, notice deadline, proposed new term)
- [ ] Escalation math is correct (3% per year)
- [ ] Fair Housing language included (for residential)
- [ ] Tone is professional and consistent with Crosby brand
- [ ] No confidential or incorrect information

### Approval Actions
| Action | When to Use |
|--------|------------|
| ✅ Approve | Output is ready to send/use as-is |
| ✏️ Revise | Minor edits needed — edit the MD, then approve |
| 🔄 Regenerate | Output needs significant changes — provide feedback |
| ❌ Reject | Output is not usable — discard |

---

## 5. Data Update Procedures

### Adding New Rent Roll Data
When new monthly XLS files are available:
1. Save files to the OFFICE RENTS folder (already mounted)
2. Ask: *"Update Building #1 data from rentinfo#1.xls"*
3. Review the updated tenant table in Properties → Sanctuary Office Park

### Adding Lease Documents
1. Save PDF to the Leases_Claude folder (already mounted)
2. Ask: *"Add [tenant] lease document [filename.pdf] to Building #1"*
3. Dashboard will update with direct-open link in the tenant table

### Adding HOA Data Updates
1. Export updated CSV from HOA management system
2. Ask: *"Update Lakeside Village data from [filename.csv]"*
3. Review the updated roster in Properties → Lakeside Village

---

## 6. Document Management

All formative documents live in:
```
knowledge-base/formative/
  AGENT_CHARTER.md
  LEASING_PLAYBOOK.md
  OPERATIONS_PLAYBOOK.md
  BRAND_VOICE.md
```

All agent outputs live in:
```
knowledge-base/outputs/
  lease-intelligence/
  vacancy-marketing/
  rent-roll-intelligence/
  hoa-management/
  residential-leasing/
  market-intelligence/
  investor-relations/
  acquisitions/
```

**Naming convention for outputs:**
```
[property-abbreviation]-[task-type]-[YYYY-MM].md
Example: bldg1-lease-review-2026-04.md
Example: bayoucpr-renewal-letter-2026-04.md
```

---

## 7. GitHub Workflow

The entire knowledge base and dashboard are version-controlled in the Crosby Development GitHub repository.

### Commit Triggers
Commit after any of the following:
- New formative document added or updated
- Agent output approved (or rejected with notes)
- Dashboard updated with new data or features
- New agent built or modified

### Commit Message Convention
```
[type] brief description

Types: data, agent, dashboard, docs, fix
Examples:
  data: add Building #1 April 2026 lease terms
  agent: build Lease Intelligence Agent v1
  dashboard: add Documents viewer tab
  docs: update Leasing Playbook with MTM guidance
```

### What NOT to commit
- Raw rent roll files (may contain PII — keep in OneDrive)
- CSV files with owner/tenant PII (HOA controller files)
- Any file containing Social Security numbers, financial account numbers

---

## 8. Escalation & Decision Points

Some situations require human judgment and cannot be delegated to agents:

| Situation | Who Decides | Agent Role |
|-----------|------------|-----------|
| Tenant requests rent reduction | Ryan Crosby | Provide market comp analysis |
| Non-renewal of key tenant | Ryan Crosby | Draft vacancy notice, alert on timeline |
| New commercial lease | Ryan Crosby + broker | Draft proposal and LOI for review |
| HOA rule violation enforcement | HOA Board + Ryan | Draft violation notice |
| Acquisition offer | Ryan Crosby | Research property, draft opportunity brief |
| Legal/eviction matters | Attorney | No agent involvement |

---

*Update this playbook when workflows change. The goal is that anyone reading it can operate the system without asking how.*
