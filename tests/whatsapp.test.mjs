// WhatsApp + Twilio plumbing tests: message chunking, URL repair, feedback
// detection, error mapping, and Twilio signature verification.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText, harvestUrls, repairUrls, detectFeedback, explainError, xmlEscape } from "../api/whatsapp.js";
import { validTwilioSignature, requestUrl, readForm } from "../lib/twilio.mjs";
import crypto from "node:crypto";
import { Readable } from "node:stream";

const LIMIT = 1500;
const TOKEN_URL = "https://firebasestorage.googleapis.com/v0/b/crosby-agents.firebasestorage.app/o/leases%2FX.pdf?alt=media&token=abc-123";

test("chunkText keeps a short message as a single chunk", () => {
  assert.deepEqual(chunkText("hello world"), ["hello world"]);
});

test("chunkText splits long text into chunks under the limit", () => {
  const lines = Array.from({ length: 400 }, (_, i) => "line number " + i + " of the message body");
  const chunks = chunkText(lines.join("\n"));
  assert.ok(chunks.length > 1, "splits");
  for (const c of chunks) assert.ok(c.length <= LIMIT, `chunk ≤ ${LIMIT} (got ${c.length})`);
});

test("chunkText never splits a URL across chunks", () => {
  const body = Array.from({ length: 12 }, () => "Here is a document:\n" + TOKEN_URL).join("\n");
  const chunks = chunkText(body);
  // every chunk that contains the token fragment contains the WHOLE url
  for (const c of chunks) {
    if (c.includes("token=")) assert.ok(c.includes(TOKEN_URL), "whole URL stays intact in its chunk");
  }
});

test("chunkText hard-splits a single over-long line as a fallback", () => {
  const huge = "x".repeat(LIMIT * 2 + 50);
  const chunks = chunkText(huge);
  for (const c of chunks) assert.ok(c.length <= LIMIT);
  assert.equal(chunks.join(""), huge, "no data lost");
});

test("harvestUrls extracts tokenized Firebase URLs", () => {
  const map = {};
  harvestUrls(`see ${TOKEN_URL} now`, map);
  assert.equal(map[TOKEN_URL.split("?")[0]], TOKEN_URL);
});

test("repairUrls restores a dropped ?alt=media&token on a bare base path", () => {
  const map = {}; harvestUrls(TOKEN_URL, map);
  const base = TOKEN_URL.split("?")[0];
  const out = repairUrls(`Here is the lease: ${base}`, map);
  assert.ok(out.includes(TOKEN_URL), "token restored");
});

test("repairUrls strips markdown [label](url) and bare (url) wrappers", () => {
  const map = {}; harvestUrls(TOKEN_URL, map);
  assert.equal(repairUrls(`[the lease](${TOKEN_URL})`, map), TOKEN_URL);
  assert.equal(repairUrls(`(${TOKEN_URL})`, map), TOKEN_URL);
});

test("repairUrls leaves an already-correct URL untouched", () => {
  const map = {}; harvestUrls(TOKEN_URL, map);
  assert.equal(repairUrls(TOKEN_URL, map), TOKEN_URL);
});

test("detectFeedback recognizes thumbs and yes/no words but not ambiguous text", () => {
  assert.equal(detectFeedback("👍").rating, "positive");
  assert.equal(detectFeedback("👎").rating, "negative");
  assert.equal(detectFeedback("yes").rating, "positive");
  assert.equal(detectFeedback("no").rating, "negative");
  assert.equal(detectFeedback("no, what does Wells Fargo pay?"), null, "a real question is not feedback");
  assert.equal(detectFeedback("what's vacating?"), null);
});

test("explainError maps technical failures to plain-English categories", () => {
  assert.match(explainError(new Error("429 rate limit exceeded")), /usage limit/i);
  assert.match(explainError(new Error("fetch failed ETIMEDOUT")), /timed out|too long/i);
  assert.match(explainError(new Error("firebase permission denied")), /property records/i);
  assert.match(explainError(new Error("tool_use_failed")), /rewording|trouble/i);
  assert.ok(explainError(new Error("weird")).length > 0, "fallback message");
});

test("xmlEscape escapes XML metacharacters", () => {
  assert.equal(xmlEscape(`a & b < c > d "e"`), "a &amp; b &lt; c &gt; d &quot;e&quot;");
});

// ── Twilio signature ──────────────────────────────────────────────────────────
test("validTwilioSignature accepts a correct signature and rejects tampering", () => {
  const token = "test_auth_token";
  const url = "https://example.com/api/whatsapp";
  const params = { Body: "hi", From: "whatsapp:+15551234567" };
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const sig = crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  assert.equal(validTwilioSignature(token, sig, url, params), true, "correct signature passes");
  assert.equal(validTwilioSignature(token, sig, url, { ...params, Body: "tampered" }), false, "tampered body fails");
  assert.equal(validTwilioSignature(token, "wrong", url, params), false, "wrong signature fails");
  assert.equal(validTwilioSignature(token, null, url, params), false, "missing signature fails");
});

test("requestUrl reconstructs the forwarded URL", () => {
  const req = { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "crosby.example" }, url: "/api/whatsapp" };
  assert.equal(requestUrl(req), "https://crosby.example/api/whatsapp");
});

test("readForm parses a urlencoded body into an object", async () => {
  const req = Readable.from(["Body=hello+world&From=whatsapp%3A%2B15551234567"]);
  const form = await readForm(req);
  assert.equal(form.Body, "hello world");
  assert.equal(form.From, "whatsapp:+15551234567");
});
