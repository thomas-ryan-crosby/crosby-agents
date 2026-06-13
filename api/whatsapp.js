// WhatsApp (Twilio) webhook for the Crosby property assistant.
// Inbound text -> verify sender -> load live portfolio snapshot -> ask Claude ->
// reply with a plain-language answer (TwiML). Read-only Q&A.
//
// Model: open-source Llama 3.3 70B via Groq (primary), with OpenAI gpt-4o-mini
// as an automatic fallback if Groq errors/times out. Both are OpenAI-compatible.
//
// Required env vars (set in Vercel project settings):
//   GROQ_API_KEY           - primary model (Groq, free tier)
//   OPENAI_API_KEY         - fallback model (used only if Groq fails)
//   ALLOWED_NUMBERS        - comma-separated E.164 numbers allowed to use it,
//                            e.g. "+19855551234,+19855555678"
//   TWILIO_AUTH_TOKEN      - (recommended) to verify requests really come from Twilio
//   FIREBASE_SERVICE_ACCOUNT - service-account JSON (string) for Firestore read access
//   GROQ_MODEL / OPENAI_MODEL - (optional) override model ids
import crypto from "node:crypto";
import { buildSnapshot } from "../lib/portfolio.mjs";

export const config = { maxDuration: 30 };

const SYSTEM = `You are the Crosby Development property assistant, answering questions over WhatsApp for a property-management team that is not very technical. You are given a current snapshot of the portfolio (properties, buildings, units, active leases, occupancy, vacant space, tenants on notice, and certificates of insurance).

Rules:
- Answer ONLY from the snapshot. Never invent figures, names, dates, or terms. If the snapshot does not contain the answer, say you don't have that on file and suggest what you can answer.
- Be concise and plain — this is a text message. Prefer 1-4 short sentences or a short bullet list. No markdown headers, no tables.
- Money as $ with commas; dates as written. When asked "how long" or "when", compute relative to today's date given below.
- Sanctuary Office Park leases are full-service gross (landlord pays utilities, taxes, janitorial; no CAM). Mention this only if relevant.
- If a question is ambiguous (e.g. a tenant name appears at multiple suites), give the best match and note the others briefly.`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }
  let params;
  try {
    const raw = await readRaw(req);
    params = Object.fromEntries(new URLSearchParams(raw));
  } catch (e) { res.status(400).send("Bad Request"); return; }

  // 1. Verify the request is genuinely from Twilio (if configured)
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const url = proto + "://" + host + req.url;
    if (!validTwilioSignature(authToken, req.headers["x-twilio-signature"], url, params)) {
      res.status(403).send("Invalid signature"); return;
    }
  }

  const from = (params.From || "").trim();          // e.g. "whatsapp:+19855551234"
  const fromNum = from.replace(/^whatsapp:/, "").trim();
  const body = (params.Body || "").trim();

  // 2. Allowlist — only approved numbers may query (this is tenant/financial data)
  const allow = (process.env.ALLOWED_NUMBERS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length && !allow.includes(fromNum) && !allow.includes(from)) {
    return reply(res, "Sorry — this number isn't authorized to use the Crosby property assistant. Please contact your administrator.");
  }

  // 3. Greeting / help
  if (!body || /^(hi|hello|hey|help|start|menu|\?)$/i.test(body)) {
    return reply(res, "Hi! I'm the Crosby property assistant. Ask me things like:\n• Whats vacating at Sanctuary this year?\n• What does Wells Fargo pay?\n• Occupancy at Mandeville Lake Apartments?\n• Which COIs are expired?\n• When does Galloway's lease end?\n• Any space available in Building 4?");
  }

  // 4. Answer
  try {
    const today = new Date().toISOString().slice(0, 10);
    const snapshot = await buildSnapshot(today);
    const answer = await askAssistant(snapshot, body, today);
    return reply(res, answer);
  } catch (e) {
    console.error("whatsapp handler error:", e && (e.stack || e.message));
    // TEMPORARY diagnostic — surfaces the failure reason in the reply so setup
    // issues can be spotted by text. Revert to a generic message once working.
    const reason = (e && e.message ? String(e.message) : "unknown").slice(0, 200);
    return reply(res, "Setup diagnostic — something failed:\n" + reason);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function readRaw(req) {
  return new Promise((resolve, reject) => {
    let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); req.on("error", reject);
  });
}

function reply(res, text) {
  const xml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' + xmlEscape(text) + "</Message></Response>";
  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(xml);
}

function xmlEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function validTwilioSignature(authToken, signature, url, params) {
  try {
    const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
    const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
    const a = Buffer.from(expected), b = Buffer.from(String(signature || ""));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

// Primary = Groq (open-source Llama 3.3 70B). Fallback = OpenAI gpt-4o-mini,
// used only if Groq is missing/errors/times out — so the bot never goes dark.
async function askAssistant(snapshot, question, today) {
  const system = SYSTEM + "\n\nToday's date: " + today + ".";
  const user = snapshot + "\n\n----\nQUESTION: " + question;
  const providers = [
    { name: "groq", key: process.env.GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions", model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" },
    { name: "openai", key: process.env.OPENAI_API_KEY, url: "https://api.openai.com/v1/chat/completions", model: process.env.OPENAI_MODEL || "gpt-4o-mini" },
  ].filter((p) => p.key);
  if (!providers.length) throw new Error("No model provider configured (set GROQ_API_KEY and/or OPENAI_API_KEY)");
  let lastErr;
  for (const p of providers) {
    try { return await callChat(p, system, user); }
    catch (e) { lastErr = e; console.error(p.name + " failed" + (providers.length > 1 ? ", trying fallback" : "") + ":", e && e.message); }
  }
  throw lastErr;
}

// One call to an OpenAI-compatible chat-completions endpoint (Groq or OpenAI).
async function callChat(p, system, user) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(p.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + p.key },
      body: JSON.stringify({
        model: p.model, temperature: 0.2, max_tokens: 700,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) { const t = await r.text(); throw new Error(p.model + " " + r.status + ": " + t.slice(0, 200)); }
    const data = await r.json();
    const text = ((((data.choices || [])[0] || {}).message || {}).content || "").trim();
    if (!text) throw new Error(p.model + ": empty response");
    return text;
  } finally { clearTimeout(timer); }
}
