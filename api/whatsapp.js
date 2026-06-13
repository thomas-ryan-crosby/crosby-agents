// WhatsApp (Twilio) webhook for the Crosby property assistant.
// Inbound text -> verify sender -> load live portfolio snapshot -> ask Claude ->
// reply with a plain-language answer (TwiML). Read-only Q&A.
//
// Required env vars (set in Vercel project settings):
//   ANTHROPIC_API_KEY      - Claude API key
//   ALLOWED_NUMBERS        - comma-separated E.164 numbers allowed to use it,
//                            e.g. "+19855551234,+19855555678"
//   TWILIO_AUTH_TOKEN      - (recommended) to verify requests really come from Twilio
//   FIREBASE_SERVICE_ACCOUNT - service-account JSON (string) for Firestore read access
//   ASSISTANT_MODEL        - (optional) Claude model id; default claude-sonnet-4-6
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
    const answer = await askClaude(snapshot, body, today);
    return reply(res, answer);
  } catch (e) {
    console.error("whatsapp handler error:", e && e.message);
    return reply(res, "Sorry, I hit a problem answering that. Please try again in a moment.");
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

async function askClaude(snapshot, question, today) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const model = process.env.ASSISTANT_MODEL || "claude-sonnet-4-6";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: 700, system: SYSTEM + "\n\nToday's date: " + today + ".",
      messages: [{ role: "user", content: snapshot + "\n\n----\nQUESTION: " + question }],
    }),
  });
  if (!r.ok) { const t = await r.text(); throw new Error("Anthropic " + r.status + ": " + t.slice(0, 300)); }
  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return text || "I couldn't find an answer to that. Try rephrasing, or ask about rents, occupancy, lease dates, vacancies, or COIs.";
}
