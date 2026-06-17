# Agent Triggering Architecture

**Version:** 1.0
**Issued:** April 2, 2026

---

## How Agents Run

There is no standalone server or cron daemon. Agents run **within Cowork sessions** — they are Claude prompts with structured data access, not background microservices. This has important implications for how triggering works.

---

## Three Trigger Mechanisms

### 1. Manual Trigger (Chat)

The most common trigger today. The operator types a natural language command in the Cowork chat:

```
"Run Lease Intelligence Agent for Building #1"
"Generate vacancy listing for Suite 302, Building #1, available July 1"
"Draft a violation notice for Lot 12, Lakeside Village"
```

The agent reads its AGENT_PROMPT.md, loads the required data files, executes its workflow, and posts output to the Docs tab.

**Available now.** This is the primary execution mode during Phase 1 and early Phase 2.

### 2. Scheduled Tasks (Cowork Scheduler)

Cowork supports scheduled tasks that run at defined intervals. These replace traditional cron jobs. Each schedule entry defines: what agent to run, what prompt to execute, and how often.

| Task ID | Agent | Task | Cron | Status |
|---------|-------|------|------|--------|
| `lease-intelligence-weekly` | Lease Intelligence | Weekly deadline scan | `0 8 * * 1` (Mon 8am) | ✅ LIVE |
| `lease-intelligence-monthly-renewals` | Lease Intelligence | Monthly renewal letters | `0 8 1 * *` (1st, 8am) | ✅ LIVE |
| `market-intelligence-monthly` | Market Intelligence | Monthly market snapshot | `0 8 15 * *` (15th, 8am) | ✅ LIVE |
| — | Rent Roll Intelligence | Monthly portfolio summary | `0 7 1 * *` (1st, 7am) | Pending agent build |
| — | HOA Management | Dues reminders | `0 8 25 * *` (25th, 8am) | Pending agent build |
| — | HOA Management | Delinquency flags | `0 8 10 * *` (10th, 8am) | Pending agent build |
| — | Market Intelligence | Quarterly market report | End of Q | Pending (manual for now) |
| — | Investor Relations | Quarterly portfolio summary | End of Q | Pending agent build |
| — | Acquisitions | Weekly market scan | Fridays | Pending agent build |

**Implementation:** Each scheduled task is created via the Cowork scheduler. The task stores a complete agent prompt. When the schedule fires, Cowork opens a new session, executes the prompt (reading data files, doing web research as needed), and writes output to the knowledge-base. The operator is notified on completion.

**Task files are stored at:** `C:\Users\thoma\OneDrive\Documents\Claude\Scheduled\[task-id]\SKILL.md`

**First run recommendation:** Run each new task manually once ("Run now") to pre-approve any tool permissions it needs. This prevents future automatic runs from pausing on permission prompts.

**How the operator interacts:**
1. Scheduled tasks run automatically — no action needed
2. Operator receives a notification when each task completes
3. Output files appear in the knowledge-base and (eventually) in the dashboard Docs tab
4. Operator reviews, approves, or requests revision on outputs
5. Approved outputs feed into downstream agents (e.g., market comps → vacancy asking rates)

### 3. Event-Driven (Agent Chains)

Some agents trigger other agents based on their output. This is the most sophisticated mechanism and creates an agent pipeline.

**Current event chains:**

```
Clerical Data Agent
  └─ writes data/*.json
      └─ [any agent that reads data/ may detect changes]

Lease Intelligence Agent
  └─ detects status:"vacating"
      └─ generates Vacancy Alert (Docs tab)
          └─ on human approval → triggers Vacancy Marketing Agent

Lease Intelligence Agent
  └─ detects anomaly in lease data
      └─ suggests Clerical Data Agent re-import

Market Intelligence Agent
  └─ publishes rate benchmarking
      └─ Lease Intelligence Agent reads comps for renewal rate proposals
```

**How event-driven triggers work today:** The triggering agent's output includes a clear recommendation (e.g., "Vacancy confirmed — trigger Vacancy Marketing Agent for Suite 302"). The human reviews this recommendation in the Docs tab. On approval, the human (or a scheduled follow-up) runs the downstream agent. This is a **human-mediated** event chain, not fully automated.

**Future state:** As confidence grows, some chains may become automated (the upstream agent directly invokes the downstream agent without waiting for approval). This will be gated by the AGENT_CHARTER.md approval workflow.

---

## Execution Environment

| Detail | Current State |
|--------|--------------|
| **Runtime** | Cowork session (Claude desktop app) |
| **Models** | Sonnet 4 (operational agents) / Opus 4 (creative + analytical agents) |
| **Data access** | Local filesystem via `data/` directory (JSON files) |
| **External access** | Web search (for Market Intelligence, Acquisitions). Gmail (for email drafts, with approval). No other external APIs. |
| **State persistence** | All state is in files (data/*.json, knowledge-base/, dashboard.html). `data/dashboard-state.json` is the live state file — agents update it after each run per `DASHBOARD_UPDATE_PROTOCOL.md`. No database. Git provides version history. |
| **Concurrency** | One agent runs at a time within a session. Multiple sessions could run in parallel if needed. |
| **Cost model** | Per-token usage. Sonnet for high-frequency ops. Opus for low-frequency, high-value writing. |

---

## Model Assignment Summary

| Model | Agents | Rationale |
|-------|--------|-----------|
| **claude-sonnet-4-6** | Clerical Data, Lease Intelligence, Rent Roll Intelligence, HOA Management, Residential Leasing | Structured data processing, template-based output, high-frequency scheduled tasks. Cost-efficient. |
| **claude-opus-4-6** | Vacancy Marketing, Market Intelligence, Investor Relations, Acquisitions | Creative writing, research synthesis, strategic analysis, executive-level prose. Lower frequency, higher value per run. |

---

## What This Is Not

This is not a Kubernetes cluster, a Docker Compose stack, or a Lambda function farm. There are no background processes, no message queues, no webhooks. The agents are:

- **Prompts** — structured instructions that tell Claude what to read, what to produce, and where to store it
- **Executed in sessions** — either manually, on a schedule, or as a follow-up to another agent's output
- **Human-gated** — every output passes through the Docs tab approval workflow before any external action

The simplicity is deliberate. This is a one-person operation. The architecture should match the operator's workflow, not the other way around.

---

## Scaling Path

If the portfolio grows to the point where manual triggering becomes a bottleneck:

1. **Phase 1 (now):** Manual triggers via chat. Human runs agents as needed.
2. **Phase 2 (near-term):** Cowork scheduled tasks for recurring workflows (weekly scans, monthly reports).
3. **Phase 3 (future):** Automated agent chains where upstream agents invoke downstream agents without human mediation for low-risk workflows (e.g., data import → anomaly check).
4. **Phase 4 (if needed):** Custom orchestrator script (Node.js or Python) that calls the Claude API directly on a schedule, reads/writes to the same `data/` and `knowledge-base/` file structure, and posts results to a web dashboard. This would decouple execution from the Cowork desktop app.

We are at Phase 1. The file structure and agent prompt design are already compatible with Phase 4, so no architectural rework will be needed.
