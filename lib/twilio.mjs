// Shared Twilio helpers for the WhatsApp assistant: read the form-encoded body,
// verify the request really came from Twilio, and send an outbound WhatsApp
// message via the REST API (used to notify a user when a reply fails to deliver).
import crypto from "node:crypto";

export function readRaw(req) {
  return new Promise((resolve, reject) => {
    let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d)); req.on("error", reject);
  });
}

export async function readForm(req) {
  return Object.fromEntries(new URLSearchParams(await readRaw(req)));
}

// HMAC-SHA1 over the request URL + sorted params, compared in constant time.
export function validTwilioSignature(authToken, signature, url, params) {
  try {
    const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
    const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
    const a = Buffer.from(expected), b = Buffer.from(String(signature || ""));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) { return false; }
}

export function requestUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return proto + "://" + host + req.url;
}

// Send a WhatsApp message via Twilio's REST API. `from`/`to` are full
// "whatsapp:+1..." addresses. Throws on a non-2xx so the caller can log it.
export async function sendWhatsApp({ accountSid, authToken, from, to, body }) {
  if (!accountSid || !authToken || !from || !to) throw new Error("sendWhatsApp: missing accountSid/authToken/from/to");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`Twilio send ${r.status}: ${t.slice(0, 300)}`); }
  return r.json();
}
