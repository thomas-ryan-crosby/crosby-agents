# WhatsApp Property Assistant — Setup

A WhatsApp chat assistant that lets your property-management team ask questions
about the portfolio in plain English — no login, no dashboard. They text a
number, the assistant reads the **live data** (the same Firestore the dashboard
uses) and answers with Claude.

Example questions it handles:
- "What's vacating at Sanctuary this year?"
- "What does Wells Fargo pay?"
- "Occupancy at Mandeville Lake Apartments?"
- "Which COIs are expired?"
- "When does Galloway's lease end?"
- "Any space available in Building 4?"

It is **read-only** — it answers questions, it never changes data.

## How it works

```
WhatsApp message → Twilio → /api/whatsapp (Vercel function)
   → verify sender (allowlist + Twilio signature)
   → read live portfolio from Firestore (firebase-admin)
   → build a snapshot + ask Claude
   → reply to the WhatsApp thread
```

Files:
- `api/whatsapp.js` — the webhook
- `lib/portfolio.mjs` — loads Firestore + builds the data snapshot (reuses `crosby-viewmodel.js`)

## What you need (one-time)

1. **Anthropic (Claude) API key** — https://console.anthropic.com → API Keys.
2. **Twilio account** — https://www.twilio.com (free trial works for testing).
3. **Firebase service account** — Firebase console → Project settings →
   Service accounts → *Generate new private key*. Downloads a JSON file. This
   lets the function read Firestore. (Keep it secret.)

## Vercel environment variables

In the Vercel project → Settings → Environment Variables, add:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Claude API key |
| `FIREBASE_SERVICE_ACCOUNT` | the **entire** service-account JSON, pasted as one value |
| `ALLOWED_NUMBERS` | comma-separated phone numbers allowed to use it, E.164 format, e.g. `+19855551234,+19855555678` |
| `TWILIO_AUTH_TOKEN` | from the Twilio console (Account → API keys & tokens) — used to verify requests |
| `ASSISTANT_MODEL` | *(optional)* Claude model id; defaults to `claude-sonnet-4-6` |

Redeploy after adding them.

## Connect Twilio WhatsApp (fastest: sandbox, for testing)

1. Twilio console → **Messaging → Try it out → Send a WhatsApp message**.
2. From your phone, send the join code (e.g. `join <two-words>`) to the Twilio
   sandbox number to opt in. (Each tester does this once.)
3. In the sandbox settings, set **"When a message comes in"** to:
   `https://<your-vercel-domain>/api/whatsapp`  (HTTP **POST**)
4. Text the sandbox number a question — you should get an answer back.

## Going to production (no join code for users)

The sandbox requires each user to send a join code and expires periodically.
For day-to-day use, register a **WhatsApp sender**:
1. Twilio console → **Messaging → Senders → WhatsApp senders** → request a
   sender (needs a Twilio number and a short Meta/WhatsApp Business approval —
   usually a day or two).
2. Point that sender's inbound webhook to the same
   `https://<your-vercel-domain>/api/whatsapp` URL.
3. Add each manager's number to `ALLOWED_NUMBERS`.

(Plain SMS is also possible later with the same backend — point a Twilio phone
number's inbound webhook at the same URL; ask and I'll wire an `/api/sms` twin.)

## Security & privacy notes

- **Allowlist:** only numbers in `ALLOWED_NUMBERS` get answers; everyone else is
  politely refused. Keep this list tight — it exposes rents and tenant info.
- **Twilio signature:** with `TWILIO_AUTH_TOKEN` set, the function rejects any
  request not signed by Twilio, so the endpoint can't be spoofed.
- **Data location:** the function reads PII from the **auth-gated Firestore** at
  request time. No `data/*.json` is shipped to Vercel (see `.vercelignore`).
- **Processors:** message text and the answer pass through Twilio (WhatsApp) and
  Anthropic, your data processors. WhatsApp messages are encrypted in transit.
- The assistant is read-only and is instructed to answer only from the data and
  to say so when something isn't on file.

## Local test (optional, for a developer)

`lib/portfolio.mjs` can be exercised with the gcloud ADC credentials used for
seeding (`GOOGLE_APPLICATION_CREDENTIALS` + `GOOGLE_CLOUD_PROJECT=crosby-agents`)
by calling `loadEntities()` / `buildSnapshot()`. The full webhook needs the
Twilio + Anthropic keys above.
