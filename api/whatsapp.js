// WhatsApp (Twilio) webhook for the Crosby property assistant. Read-only Q&A.
// Inbound text -> verify sender -> the model answers by CALLING TOOLS that look
// up / compute exact figures from the live data (never doing math itself) ->
// reply (TwiML) + a "was this helpful?" prompt. Follow-up 👍/👎 is recorded.
//
// Model: open-source Llama 3.3 70B via Groq (primary, supports tool calling),
// with OpenAI gpt-4o-mini as an automatic fallback. Both OpenAI-compatible.
//
// Required env vars (Vercel project settings):
//   GROQ_API_KEY, OPENAI_API_KEY (fallback), ALLOWED_NUMBERS,
//   TWILIO_AUTH_TOKEN, FIREBASE_SERVICE_ACCOUNT,  GROQ_MODEL/OPENAI_MODEL (optional)
import crypto from "node:crypto";
import { logInteraction, setFeedback, getSession, setSession } from "../lib/portfolio.mjs";
import { buildContext, directoryText, runTool, TOOL_DEFS } from "../lib/assistant-tools.mjs";

export const config = { maxDuration: 30 };

const SYSTEM = `You are the Crosby Development property assistant, answering questions over WhatsApp for a property-management team that is not very technical.

You have TOOLS that look up exact, live data. You MUST call a tool for any question about rents, totals, what a tenant pays, lease dates or terms, lease documents/links, expirations or renewals, occupancy, vacancies, or insurance. NEVER calculate, sum, or recall figures from memory — always call the relevant tool and answer from its result. If a tool returns no match, say so plainly and suggest what you can answer.

Style:
- Concise and plain — this is a text message. No markdown headers or tables. A single fact = 1-2 sentences; a list = short bullets.
- Money as $ with commas; dates as written.
- When sharing a lease document, give the html link if present, otherwise the pdf link.
- Sanctuary Office Park leases are full-service gross (no CAM); mention only if relevant.
- For expirations: the expiring_leases tool already sorts soonest-first and flags vacating / auto-renew / fixed-term — present them that way, vacating tenants first, and note that auto-renew leases roll over unless the tenant gives notice.
- If a tool result includes a caveat (e.g. "annual = monthly x 12, not adjusting for move-outs"), pass that caveat along briefly.`;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }
  let params;
  try { params = Object.fromEntries(new URLSearchParams(await readRaw(req))); }
  catch (e) { res.status(400).send("Bad Request"); return; }

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

  const from = (params.From || "").trim();
  const fromNum = from.replace(/^whatsapp:/, "").trim();
  const body = (params.Body || "").trim();
  const started = Date.now();
  const base = { from, fromNumber: fromNum, question: body };

  // 2. Allowlist — only approved numbers may query (tenant/financial data)
  const allow = (process.env.ALLOWED_NUMBERS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length && !allow.includes(fromNum) && !allow.includes(from)) {
    const msg = "Sorry — this number isn't authorized to use the Crosby property assistant. Please contact your administrator.";
    await logInteraction(Object.assign({}, base, { status: "blocked", answer: msg, model: null }));
    return reply(res, msg);
  }

  // 3. Is this a 👍/👎 about the previous answer?
  const session = await getSession(fromNum);
  if (session && session.lastLogId) {
    const fb = detectFeedback(body);
    if (fb) {
      await setFeedback(session.lastLogId, fb);
      await setSession(fromNum, { lastLogId: null });
      return reply(res, fb.rating === "positive"
        ? "👍 Glad that helped!"
        : "Thanks for the feedback — I've flagged this so we can keep improving the assistant.");
    }
  }

  // 4. Greeting / help
  if (!body || /^(hi|hello|hey|help|start|menu|\?)$/i.test(body)) {
    const help = "Hi! I'm the Crosby property assistant. Ask me things like:\n• Whats vacating at Sanctuary this year?\n• What does Wells Fargo pay?\n• Annual rent for Building 2?\n• Send me the Pazos lease link\n• Which COIs are expired?\n• Any space available in Building 4?";
    await logInteraction(Object.assign({}, base, { status: "help", answer: help, model: null }));
    return reply(res, help);
  }

  // 5. Answer (model calls tools)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const ctx = await buildContext();
    const out = await answerWithTools(body, today, ctx);
    const logId = await logInteraction(Object.assign({}, base, { status: "answered", answer: out.text, model: out.provider, ms: Date.now() - started }));
    await setSession(fromNum, { lastLogId: logId, question: body });
    return reply(res, out.text, "Was this helpful? Reply 👍 or 👎 — or tell me what was off.");
  } catch (e) {
    console.error("whatsapp handler error:", e && (e.stack || e.message));
    const msg = explainError(e);
    await logInteraction(Object.assign({}, base, { status: "error", answer: msg, model: null, error: String((e && e.message) || "unknown").slice(0, 300), ms: Date.now() - started }));
    return reply(res, msg);
  }
}

// Turn a technical failure into a plain-English message the user can act on.
function explainError(err) {
  const m = String((err && err.message) || err || "").toLowerCase();
  if (/\b413\b|too large|tokens per minute|\btpm\b|\b429\b|quota|rate.?limit|over.*limit/.test(m))
    return "I couldn't answer that just now because the assistant briefly hit its usage limit (it's on a free AI plan with a per-minute cap). Please wait a minute and try again. If it keeps happening, the office can raise the limit.";
  if (/abort|timed?.?out|etimedout|network|fetch failed|enotfound|socket|econn/.test(m))
    return "That took too long to look up and timed out. Please try again — and if it's a big question, asking for one property or building at a time usually works.";
  if (/firebase|firestore|credential|permission|service account|default credentials|unauthenticated/.test(m))
    return "I couldn't reach the property records just now, so I wasn't able to look that up. Please try again in a moment.";
  if (/no model provider|api key|\b401\b|invalid.*key|unauthorized/.test(m))
    return "The assistant isn't fully set up to answer right now (an AI service isn't connected). Please let the administrator know.";
  if (/tool_use_failed/i.test(m))
    return "I had trouble looking that up just now. Please try asking it a slightly different way — naming the tenant, building, or property usually helps.";
  return "Something went wrong on my end while answering that. Please try again, or reword the question. If it keeps failing, let the office know.";
}

// ── feedback detection ───────────────────────────────────────────────────────
// Only short, unambiguous replies count as feedback (so a new question that
// happens to start with "no…" is not mistaken for a thumbs-down).
function detectFeedback(body) {
  const raw = (body || "").trim();
  if (!raw) return null;
  if (/^[\u{1F44D}\u{1F44C}✅]/u.test(raw)) return { rating: "positive", comment: raw.replace(/^[^\w]+/u, "").trim() || null };
  if (/^[\u{1F44E}❌]/u.test(raw)) return { rating: "negative", comment: raw.replace(/^[^\w]+/u, "").trim() || null };
  const w = raw.toLowerCase().replace(/[^a-z ]/g, "").trim();
  const POS = ["y", "yes", "yeah", "yep", "yup", "good", "great", "perfect", "helpful", "very helpful", "nice", "thanks", "thank you", "correct", "right", "that helped", "awesome", "ok", "okay"];
  const NEG = ["n", "no", "nope", "wrong", "incorrect", "not helpful", "unhelpful", "bad", "not really", "nah", "no good"];
  if (POS.includes(w)) return { rating: "positive", comment: null };
  if (NEG.includes(w)) return { rating: "negative", comment: null };
  return null;
}

// ── model + tool loop ────────────────────────────────────────────────────────
async function answerWithTools(question, today, ctx) {
  const system = SYSTEM + "\n\n" + directoryText(ctx) + "\n\nToday's date: " + today + ".";
  const providers = [
    { name: "groq", key: process.env.GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions", model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile" },
    { name: "openai", key: process.env.OPENAI_API_KEY, url: "https://api.openai.com/v1/chat/completions", model: process.env.OPENAI_MODEL || "gpt-4o-mini" },
  ].filter((p) => p.key);
  if (!providers.length) throw new Error("No model provider configured (set GROQ_API_KEY and/or OPENAI_API_KEY)");
  let lastErr;
  for (const p of providers) {
    try { return { text: await runToolLoop(p, system, question, ctx), provider: p.name }; }
    catch (e) { lastErr = e; console.error(p.name + " failed" + (providers.length > 1 ? ", trying fallback" : "") + ":", e && e.message); }
  }
  throw lastErr;
}

async function runToolLoop(p, system, question, ctx) {
  const messages = [{ role: "system", content: system }, { role: "user", content: question }];
  const urlMap = {}; // base path -> full tokenized URL, harvested from tool results
  for (let i = 0; i < 5; i++) {
    const msg = await callChat(p, messages);
    messages.push(msg);
    const calls = msg.tool_calls || [];
    if (calls.length) {
      for (const tc of calls) {
        let args = {};
        try { args = JSON.parse((tc.function && tc.function.arguments) || "{}"); } catch (e) {}
        const result = runTool(tc.function && tc.function.name, args, ctx);
        const content = JSON.stringify(result).slice(0, 8000);
        harvestUrls(content, urlMap);
        messages.push({ role: "tool", tool_call_id: tc.id, content });
      }
      continue;
    }
    const text = repairUrls((msg.content || "").trim(), urlMap);
    if (text) return text;
    return "I couldn't find an answer to that. Try asking about a tenant, a building's rent, occupancy, expirations, vacancies, or insurance.";
  }
  return "That needed several lookups and I didn't finish — please try a more specific question.";
}

// Firebase Storage links only work WITH their ?alt=media&token=... — but models
// often drop the long query string when retyping a URL. Harvest the exact URLs
// from tool results and put the token back on any the model truncated.
function harvestUrls(s, map) {
  const re = /https?:\/\/[^\s"'<>]+\?alt=media&token=[A-Za-z0-9-]+/g;
  let m; while ((m = re.exec(s))) { const full = m[0]; map[full.split("?")[0]] = full; }
}
function repairUrls(text, map) {
  let out = text;
  for (const base of Object.keys(map)) {
    const re = new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?!\\?)", "g");
    out = out.replace(re, map[base]);
  }
  return out;
}

// Groq sometimes returns 400 "tool_use_failed" when the model generates a tool
// call that fails its validation — usually transient. Retry a few times with
// more sampling variability to shake out a valid call.
async function callChat(p, messages) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await oneChatCall(p, messages, attempt === 0 ? 0.1 : 0.6); }
    catch (e) {
      lastErr = e;
      if (attempt < 2 && /tool_use_failed/i.test(String(e && e.message))) continue;
      throw e;
    }
  }
  throw lastErr;
}

async function oneChatCall(p, messages, temperature) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 18000);
  try {
    const r = await fetch(p.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + p.key },
      body: JSON.stringify({ model: p.model, temperature, max_tokens: 800, tools: TOOL_DEFS, tool_choice: "auto", messages }),
      signal: ctrl.signal,
    });
    if (!r.ok) { const t = await r.text(); throw new Error(p.model + " " + r.status + ": " + t.slice(0, 220)); }
    const data = await r.json();
    return (((data.choices || [])[0] || {}).message) || { role: "assistant", content: "" };
  } finally { clearTimeout(timer); }
}

// ── plumbing ─────────────────────────────────────────────────────────────────
function readRaw(req) {
  return new Promise((resolve, reject) => {
    let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); req.on("error", reject);
  });
}

function reply(res, text, followup) {
  let inner = "<Message>" + xmlEscape(text) + "</Message>";
  if (followup) inner += "<Message>" + xmlEscape(followup) + "</Message>";
  res.setHeader("Content-Type", "text/xml");
  res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response>' + inner + "</Response>");
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
