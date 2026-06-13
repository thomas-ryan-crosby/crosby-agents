# WhatsApp Property Assistant — Setup

A WhatsApp chat assistant that lets your property-management team ask questions
about the portfolio in plain English — no login, no dashboard. They text a
number, the assistant reads the **live data** (the same Firestore the dashboard
uses) and answers with an LLM (Llama via Groq, with an OpenAI fallback).

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
   → build a snapshot + ask the model (Groq Llama, OpenAI fallback)
   → reply to the WhatsApp thread
```

Files:
- `api/whatsapp.js` — the webhook
- `lib/portfolio.mjs` — loads Firestore + builds the data snapshot (reuses `crosby-viewmodel.js`)

## The model: Llama (Groq) with an OpenAI fallback

The assistant answers using **Llama 3.3 70B via Groq** (open-source model, free
tier) as the primary. If Groq ever errors or times out, it **automatically falls
back to OpenAI `gpt-4o-mini`** so the bot never goes dark. The fallback only
fires on failure, so OpenAI cost stays near zero.

## What you need (one-time)

1. **Groq API key** — https://console.groq.com → API Keys (free).
2. **OpenAI API key** (fallback) — https://platform.openai.com → API Keys. This
   is the developer platform (separate from your ChatGPT subscription) and is
   pay-as-you-go, but it's only used when Groq fails, so it's pennies at most.
3. **Twilio account** — https://www.twilio.com (free trial works for testing).
4. **Firebase service account** — Firebase console → Project settings →
   Service accounts → *Generate new private key*. Downloads a JSON file. This
   lets the function read Firestore. (Keep it secret.)

## Vercel environment variables

In the Vercel project → Settings → Environment Variables, add:

| Name | Value |
|---|---|
| `GROQ_API_KEY` | your Groq API key (primary model) |
| `OPENAI_API_KEY` | your OpenAI API key (fallback; optional but recommended) |
| `FIREBASE_SERVICE_ACCOUNT` | the **entire** service-account JSON, pasted as one value |
| `ALLOWED_NUMBERS` | comma-separated phone numbers allowed to use it, E.164 format, e.g. `+19855551234,+19855555678` |
| `TWILIO_AUTH_TOKEN` | from the Twilio console (Account → API keys & tokens) — used to verify requests |
| `GROQ_MODEL` / `OPENAI_MODEL` | *(optional)* override the model ids (defaults: `llama-3.3-70b-versatile`, `gpt-4o-mini`) |

Redeploy after adding them. (You can set just `GROQ_API_KEY` to start; add
`OPENAI_API_KEY` whenever you want the safety net.)

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
  Groq and/or OpenAI, your data processors (none of them train on API data). WhatsApp messages are encrypted in transit.
- The assistant is read-only and is instructed to answer only from the data and
  to say so when something isn't on file.

## Local test (optional, for a developer)

`lib/portfolio.mjs` can be exercised with the gcloud ADC credentials used for
seeding (`GOOGLE_APPLICATION_CREDENTIALS` + `GOOGLE_CLOUD_PROJECT=crosby-agents`)
by calling `loadEntities()` / `buildSnapshot()`. The full webhook needs the
Twilio + Groq/OpenAI keys above.
