# Templates Directory
## Crosby Development — Claude Agent System

This directory contains starter templates and structural guides for each major document type the agents produce. Templates here define the expected structure, so agents produce consistent outputs without reinventing the layout each time.

---

## Directory Structure

```
/templates/
├── brochures/
│   ├── residential-2page-brochure.md    ← Standard 2-page residential brochure outline
│   └── commercial-spec-sheet.md         ← 2-page commercial spec sheet outline
├── flyers/
│   ├── promotional-flyer.md             ← 1-page move-in special / seasonal promo
│   └── unit-one-pager.md                ← Single floor plan feature sheet
├── email/
│   ├── prospect-inquiry-response.md     ← First response to online/phone inquiry
│   ├── drip-sequence-5email.md          ← 5-email prospect nurture sequence
│   ├── renewal-campaign-3email.md       ← 3-email lease renewal campaign
│   └── resident-newsletter.md           ← Monthly resident newsletter
├── social/
│   ├── 30day-content-calendar.md        ← Monthly calendar structure
│   └── paid-ad-copy.md                  ← Meta/Google ad copy structure
└── presentations/
    ├── residential-overview-deck.md     ← Property overview for tours/events
    └── commercial-pitch-deck.md         ← Commercial tenant pitch deck outline
```

---

## How Agents Use Templates

1. Before starting a document task, the relevant agent reads the appropriate template file from this directory
2. The template defines the expected sections, content types, and order
3. The agent fills in the template with property-specific content from the knowledge base and memory system
4. The finished document is saved to `/outputs/[property-slug]/`

Templates are structural guides — not copy-paste content. Agents adapt them to each property.

---

## Updating Templates

If the team identifies a consistently better structure after reviewing agent outputs:
1. Open the relevant template file
2. Update the structure to reflect the preferred approach
3. Note the change at the top of the file with a date
4. The agents will use the updated structure on their next run
