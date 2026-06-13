// Twilio message-status callback for the WhatsApp assistant.
//
// Every <Message> we send carries statusCallback=<this endpoint>, so Twilio
// POSTs a delivery-status update here (queued -> sent -> delivered, or failed/
// undelivered). Without this, a reply that Twilio drops (too long, recipient
// issue, etc.) fails SILENTLY — the user just never hears back. Here we:
//   1. log every terminal failure to Firestore (deliveryLog) for the operator, and
//   2. text the user a short plain-English notice so they know to retry.
//
// No new env vars: the callback is Twilio-signed (verified with TWILIO_AUTH_TOKEN)
// and carries AccountSid, which we use for the REST send. The notice itself is
// sent WITHOUT a statusCallback, so it can't trigger a feedback loop.
import { readForm, validTwilioSignature, requestUrl, sendWhatsApp } from "../lib/twilio.mjs";
import { logDelivery } from "../lib/portfolio.mjs";

export const config = { maxDuration: 15 };

const FAIL_NOTICE =
  "⚠️ My last reply didn't make it through to WhatsApp. It may have been too long. " +
  "Please ask for one thing at a time (a single tenant, building, or document) and I'll resend it. " +
  "If this keeps happening, let the office know.";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }
  let params;
  try { params = await readForm(req); }
  catch (e) { res.status(400).send("Bad Request"); return; }

  // Verify the callback genuinely came from Twilio.
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    if (!validTwilioSignature(authToken, req.headers["x-twilio-signature"], requestUrl(req), params)) {
      res.status(403).send("Invalid signature"); return;
    }
  }

  const status = (params.MessageStatus || params.SmsStatus || "").toLowerCase();
  const sid = params.MessageSid || params.SmsSid || null;
  const to = params.To || null;       // the user (recipient of our reply)
  const from = params.From || null;    // our WhatsApp sender number
  const errorCode = params.ErrorCode || null;

  // Log EVERY delivery state (queued/sent/delivered/read/failed/undelivered) so a
  // message that never reaches "delivered" is diagnosable.
  await logDelivery({ sid, to, from, status, errorCode, reason: params.ErrorMessage || null });

  // Notify the user only on a terminal failure.
  if (status === "failed" || status === "undelivered") {
    try {
      const accountSid = params.AccountSid; // from the verified callback — no env needed
      if (accountSid && authToken && from && to) {
        // Send to the user (To) from our number (From) — no statusCallback => no loop.
        await sendWhatsApp({ accountSid, authToken, from, to, body: FAIL_NOTICE });
      } else {
        console.error("whatsapp-status: cannot notify (missing accountSid/from/to)");
      }
    } catch (e) {
      console.error("whatsapp-status notify failed:", e && e.message);
    }
  }

  res.status(204).end();
}
