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

| Agent | Task | Schedule | Priority |
|-------|------|----------|----------|
| Lease Intelligence | Weekly deadline scan | Every Monday | Phase 2 |
| Lease Intelligence | Monthly renewal letter drafts | 1st of each month | Phase 2 |
| Rent Roll Intelligence | Monthly portfolio summary | 1st of each month | Phase 2 |
| HOA Management | Dues reminders | 25th of each month | Phase 3 |
| HOA Management | Delinquency flags | 10th of each month | Phase 3 |
| Market Intelligence | Monthly comp pull | 15th of each month | Phase 4 |
| Market Intelligence | Quarterly market summary | Last day of Q | Phase 4 |
| Investor Relations | Quarterly portfolio summary | Last day of Q | Phase 4 |
| Acquisitions | Weekly market scan | Every Friday | Phase 4 |

**Implementation:** Each scheduled task is created via the Cowork `schedule` skill. The task stores the agent prompt and schedule interval. When the schedule fires, it opens a Cowork session, runs the prompt, and posts output to the Docs tab.

**Not yet deployed.** Scheduled tasks will be set up as agents move from "building" to "active" status.

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
| **State persistence** | All state is in files (data/*.json, knowledge-base/, dashboard.html). No database. Git provides version history. |
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
