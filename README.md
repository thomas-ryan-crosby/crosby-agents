# Crosby Development — Claude Agent System
## Knowledge Base, Agents & Memory System README

**Version:** 1.1
**Setup Date:** April 2026
**Maintained by:** Crosby Development + Claude Agents

---

## System Overview

This directory is the operational brain of the Crosby Development Claude Agent System. It contains:

1. **Agents** — Prompt and instruction files that define each agent's behavior
2. **Knowledge Base** — Static reference data agents read before every task
3. **Memory System** — Dynamic logs agents write after every task
4. **Templates** — Document structure guides for consistent output layouts
5. **Outputs** — All agent-generated marketing materials (organized by property)

---

## Directory Structure

```
/crosby-agents/
│
├── agents/
│   ├── listing-copy-agent.md        ← Phase 1 | Taglines, listing descriptions, web copy
│   ├── brochure-builder-agent.md    ← Phase 2 | PDF brochures, DOCX flyers, PPTX decks
│   ├── email-campaign-agent.md      ← Phase 2 | Drip sequences, renewals, newsletters
│   ├── social-media-agent.md        ← Phase 2 | Content calendars, posts, ad copy
│   ├── market-analysis-agent.md     ← Phase 3 | Market reports, comp analysis, pricing
│   └── commercial-pitch-agent.md   ← Phase 3 | Proposals, pitch decks, LOIs
│
├── knowledge-base/
│   ├── BRAND_GUIDELINES.md          ← Brand voice, colors, typography, Fair Housing
│   ├── compliance/
│   │   └── FAIR_HOUSING_COMPLIANCE.md ← Required disclaimers, prohibited language
│   ├── assets/
│   │   ├── logos/                   ← Vector + raster logo files (upload here)
│   │   ├── photos/[property-slug]/  ← Photography per property (upload here)
│   │   └── floor-plans/[property-slug]/ ← Floor plan files (upload here)
│   └── properties/
│       ├── _TEMPLATE_property-data.md
│       ├── mandeville-lake-apartments.md
│       ├── sanctuary-office-park.md
│       ├── lakeside-village-townhomes.md
│       ├── gulf-south-commerce-park.md
│       ├── delimon-place.md
│       ├── metairie-lake-apartments.md
│       ├── metairie-plaza.md
│       └── the-sanctuary.md
│
├── templates/
│   ├── README.md                    ← Template usage guide
│   ├── brochures/                   ← Residential + commercial brochure outlines
│   ├── flyers/                      ← Promotional flyer + unit one-pager outlines
│   ├── email/                       ← Email sequence structures
│   ├── social/                      ← Content calendar + ad copy structures
│   └── presentations/               ← Deck outlines for residential + commercial
│
├── memory/
│   ├── _TEMPLATE_SUMMARY.md         ← Agent summary template
│   ├── _TEMPLATE_interaction-log.md ← Interaction log template
│   ├── global/
│   │   ├── BRAND_LEARNINGS.md       ← Cross-property insights (agent-managed)
│   │   └── FEEDBACK_PATTERNS.md     ← Revision patterns & approval rates (agent-managed)
│   └── [property-slug]/
│       ├── PROPERTY_CONTEXT.md      ← Accumulated property-specific knowledge
│       └── [agent-name]/
│           ├── SUMMARY.md           ← Rolling summary of learnings (agent-managed)
│           └── YYYY-MM-DD_[task].md ← Individual interaction logs (agent-managed)
│
└── outputs/
    ├── mandeville-lake-apartments/
    ├── sanctuary-office-park/
    ├── lakeside-village-townhomes/
    ├── gulf-south-commerce-park/
    ├── delimon-place/
    ├── metairie-lake-apartments/
    ├── metairie-plaza/
    └── the-sanctuary/
```

---

## Setup Checklist — Complete Before First Agent Run

### Phase 1 — Foundation ✅ Structure built, data needed

**Knowledge Base (fill in before deploying agents)**
- [ ] Fill in `BRAND_GUIDELINES.md` — exact hex colors, fonts, approved taglines
- [ ] Upload Crosby Development logo files to `/knowledge-base/assets/logos/`
- [ ] Fill in pilot property data files (see Phase 1 properties below)
- [ ] Upload photography to `/knowledge-base/assets/photos/[slug]/`
- [ ] Upload floor plan files to `/knowledge-base/assets/floor-plans/[slug]/`

**Phase 1 Pilot Properties (Priority — complete these first)**
- [ ] `mandeville-lake-apartments.md` — fill in unit mix, pricing, amenities, positioning
- [ ] `sanctuary-office-park.md` — fill in suite availability, asking rents, specs

**Phase 1 Agent Deployment**
- [ ] Deploy Listing Copy Agent for Mandeville Lake Apartments
- [ ] Deploy Listing Copy Agent for Sanctuary Office Park
- [ ] Establish review/approval workflow with leasing team

### Phase 2 — Expansion (Weeks 5–8)
- [ ] Complete all remaining property data files
- [ ] Deploy Brochure Builder Agent
- [ ] Deploy Email Campaign Agent
- [ ] Deploy Social Media Agent
- [ ] Roll out Listing Copy Agent to all 8 properties

### Phase 3 — Full Deployment (Weeks 9–12)
- [ ] Deploy Market Analysis Agent
- [ ] Deploy Commercial Pitch Agent
- [ ] Activate scheduled tasks (weekly social, monthly market reports)
- [ ] Train property managers on agent interaction
- [ ] Set up performance metrics dashboard

---

## How Agents Use This System

### Before Every Task
1. Load `BRAND_GUIDELINES.md`
2. Load the relevant `properties/[property].md`
3. Load `memory/[property]/PROPERTY_CONTEXT.md`
4. Load `memory/[property]/[agent]/SUMMARY.md`
5. Load `memory/global/BRAND_LEARNINGS.md`
6. Load `memory/global/FEEDBACK_PATTERNS.md`

### After Every Task
1. Write interaction log to `memory/[property]/[agent]/YYYY-MM-DD_[task].md`
2. Update `memory/[property]/[agent]/SUMMARY.md` with new learnings
3. If cross-property insight found, update `memory/global/BRAND_LEARNINGS.md`
4. If feedback pattern identified, update `memory/global/FEEDBACK_PATTERNS.md`
5. Save output file to `outputs/[property]/`

---

## Agent Quick Reference

| Agent | Slug | Primary Outputs |
|---|---|---|
| Listing Copy Agent | `listing-copy-agent` | Listing text, taglines, web copy |
| Brochure Builder Agent | `brochure-builder-agent` | PDF brochures, DOCX flyers, PPTX decks |
| Market Analysis Agent | `market-analysis-agent` | Market reports, comp analysis |
| Email Campaign Agent | `email-campaign-agent` | Email templates, drip sequences |
| Social Media Agent | `social-media-agent` | Posts, ad copy, content calendars |
| Commercial Pitch Agent | `commercial-pitch-agent` | Proposals, pitch decks, LOIs |

---

## Contact

**Crosby Development Company, L.L.C.**
#1 Sanctuary Blvd., Mandeville, LA 70471
985-674-7500 | info@crosbydevelopment.com
