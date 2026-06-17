# Crosby Development — Agent Charter

**Version:** 1.0
**Issued:** April 1, 2026
**Owner:** Ryan Crosby, Crosby Development Company, L.L.C.

---

## 1. Mission

Deploy a suite of purpose-built AI agents to automate the operational and marketing workflows of Crosby Development's full residential and commercial portfolio — reducing time and cost while maintaining brand integrity, market responsiveness, and data accuracy.

The agents are not a replacement for human judgment. They are a force multiplier: every output is reviewed and approved before it reaches tenants, prospects, or the public.

---

## 2. Operating Principles

These principles govern all agent behavior and take precedence over any individual instruction:

1. **Markdown-first, always.** Every agent output is produced as a Markdown file before conversion to any other format (PDF, DOCX, email, etc.). The dashboard is the primary review surface.
2. **Dashboard-primary.** All work lives and is reviewed through the dashboard. External tools (Gmail, LoopNet, Google Drive) are invoked only after a human has approved the output.
3. **Human-in-the-loop, no exceptions.** No agent sends, publishes, or transmits anything without explicit human approval. The approval button in the dashboard is the gate.
4. **Data before drafting.** Agents must read current data (LEASE_TERMS, RENT_ROLL, HOA roster) before generating any output. No hallucinated figures.
5. **Log every interaction.** After every task, the agent adds an entry to the memory log for that property and task type.
6. **Minimal external tool usage.** External integrations (Gmail, Google Calendar, LoopNet) are called only when the work is complete and approved.
7. **Preserve institutional knowledge.** All decisions, feedback, and lessons learned are logged in the memory system so context persists across sessions.

---

## 3. Agent Roster

### Phase 2 — Operations Core

#### Agent 1: Lease Intelligence Agent
**Status:** Building (Active — April 2026)

| Field | Value |
|-------|-------|
| Purpose | Monitor all commercial lease expirations, notice deadlines, and auto-renewal windows across the portfolio |
| Inputs | LEASE_TERMS data, rent roll XLS files |
| Outputs | Lease review summaries (MD), renewal offer letters (MD → DOCX), vacancy alerts |
| Triggers | Weekly scan (Monday), monthly letter generation (1st), on-demand |
| Approval required | Yes — all letters reviewed before sending |
| External tools | Gmail (after approval only) |
| Priority tenants | Sec National (vacating Jun 30, 2026), Bayou CPR + Nirvana (notice deadline Jul 4, 2026) |

#### Agent 2: Vacancy Marketing Agent
**Status:** Planned (triggers after Sec National vacates June 30, 2026)

| Field | Value |
|-------|-------|
| Purpose | Generate listing copy and leasing briefs for available commercial and residential units |
| Inputs | Property specs, vacancy flags from LEASE_TERMS/rent rolls, market comps |
| Outputs | LoopNet/CoStar listing copy (MD), one-page leasing brief (MD → PDF/DOCX) |
| Triggers | On vacancy confirmation, on unit turnover |
| Approval required | Yes |
| External tools | LoopNet API, CoStar (after approval) |

#### Agent 3: Rent Roll Intelligence Agent
**Status:** Planned

| Field | Value |
|-------|-------|
| Purpose | Monitor all rent rolls for changes, anomalies, delinquencies, and rate variances |
| Inputs | All XLS/XLSX/WDB rent roll files |
| Outputs | Monthly portfolio summary (MD), anomaly alerts, delinquency flags |
| Triggers | Monthly (1st), on data update |
| Approval required | No for internal reports; yes before any tenant communication |

---

### Phase 3 — HOA & Residential

#### Agent 4: HOA Management Agent
**Status:** Planned (Q3 2026)

| Field | Value |
|-------|-------|
| Purpose | Manage HOA community operations — dues, violations, maintenance, board communications |
| Scope | Lakeside Village first, then DeLimon Place + The Sanctuary |
| Inputs | HOA controller CSV, lot roster, dues schedule |
| Outputs | Dues notices (MD), violation letters (MD), board meeting agendas (MD) |
| Approval required | Yes — all outgoing communications |

#### Agent 5: Residential Leasing Agent
**Status:** Planned (Q3 2026)

| Field | Value |
|-------|-------|
| Purpose | Drive apartment leasing across multi-family portfolio |
| Scope | Metairie Plaza, Metairie Lake, Mandeville Lake, Lakeside Village rentals |
| Inputs | Rent roll data, unit mix, vacancy flags |
| Outputs | Apartment listings (MD), inquiry response templates (MD), renewal outreach letters (MD) |
| Approval required | Yes |

---

### Phase 4 — Business Development

#### Agent 6: Market Intelligence Agent
| Field | Value |
|-------|-------|
| Purpose | Track Northshore and metro office/residential market conditions |
| Outputs | Quarterly market reports (MD), comp set analysis, rate benchmarking |
| Triggers | Monthly data pull, quarterly full report |

#### Agent 7: Investor Relations Agent
| Field | Value |
|-------|-------|
| Purpose | Produce portfolio performance reports and Gulf South parcel updates for stakeholders |
| Outputs | Quarterly performance summary (MD), deal memos, parcel update briefs |
| Triggers | Quarterly, on deal close |

#### Agent 8: Acquisitions Agent
| Field | Value |
|-------|-------|
| Purpose | Monitor MLS and CoStar for acquisition targets fitting the Crosby portfolio strategy |
| Outputs | Property opportunity briefs (MD), LOI drafts (MD → DOCX) |
| Triggers | Weekly scan, on-demand |

---

## 4. Approval Workflow

```
Agent generates output (Markdown file)
        ↓
Output appears in Dashboard → Documents tab (status: Pending Review)
        ↓
Ryan reviews content in dashboard
        ↓
    ┌──────────────────────────────┐
    │  Approve │ Revise │ Reject   │
    └──────────────────────────────┘
        ↓ (Approved)
Output converted to final format (DOCX, PDF, email draft)
        ↓
External tool invoked (Gmail send, LoopNet post, etc.)
```

---

## 5. Memory & Learning System

Each agent maintains a structured memory in the knowledge base:

```
knowledge-base/
  outputs/
    [agent-slug]/
      [property]-[task]-[YYYY-MM].md    ← Individual interaction logs
      SUMMARY.md                         ← Rolling summary of key learnings
  properties/
    [property-slug].md                   ← Accumulated property knowledge
  formative/
    AGENT_CHARTER.md                     ← This document
    LEASING_PLAYBOOK.md
    OPERATIONS_PLAYBOOK.md
    BRAND_VOICE.md
```

Every interaction log includes: timestamp, agent, property, task, inputs used, output summary, decisions made, feedback received, and lessons learned.

---

## 6. External Tool Policy

| Tool | Permitted Use | Restriction |
|------|--------------|-------------|
| Gmail | Send approved letters/emails | Approval required; no auto-send |
| Google Drive | Store approved documents | No auto-share; user controls permissions |
| Google Calendar | Schedule follow-up reminders | Approval required |
| LoopNet / CoStar | Post approved vacancy listings | Approval required |
| MLS | Read-only market data | No posting without approval |
| Phone/Fax | Never automated | Always manual |

---

## 7. Data Sources

| Property | Primary Data Source | Format |
|----------|-------------------|--------|
| Sanctuary Office Park (Bldg #1) | rentinfo#1.xls + 9 lease PDFs | XLS + PDF |
| Sanctuary Office Park (Bldg #2–5) | rentinfo#2–5.xls | XLS |
| Metairie Plaza | Rent roll | WDB |
| Metairie Lake | Rent roll | WDB |
| Mandeville Lake | Pending | — |
| Lakeside Village | Controller CSV | CSV |
| Gulf South Commerce Park | Site plan | PDF |
| DeLimon Place | Pending | — |
| The Sanctuary | Pending | — |

---

*This charter is the authoritative guide for all agent behavior. Update it before changing any agent's scope, triggers, or external tool permissions.*
