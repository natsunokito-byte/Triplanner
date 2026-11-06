import test from "node:test";
import assert from "node:assert/strict";
import { checkCode, generateCode, hashCode, normalizeEmail, signSession, verifySession, SESSION_TTL_MS } from "../src/lib/viewer-session";

const S = "x".repeat(40);

test("codes are 6 digits, zero-padded", () => {
  for (let i = 0; i < 200; i++) assert.match(generateCode(), /^\d{6}$/);
});

test("code check: right code passes; wrong code, wrong email, wrong trip, wrong secret fail", () => {
  const h = hashCode(S, "trip1", "Ann@Example.com", "123456");
  assert.ok(checkCode(S, "trip1", "ann@example.com", "123456", h), "email is case-insensitive");
  assert.ok(checkCode(S, "trip1", "ann@example.com", " 123456 ", h), "whitespace trimmed");
  assert.ok(!checkCode(S, "trip1", "ann@example.com", "123457", h));
  assert.ok(!checkCode(S, "trip1", "bob@example.com", "123456", h));
  assert.ok(!checkCode(S, "trip2", "ann@example.com", "123456", h));
  assert.ok(!checkCode("y".repeat(40), "trip1", "ann@example.com", "123456", h));
  assert.ok(!checkCode(S, "trip1", "ann@example.com", "123456", "zz"), "garbage hash doesn't throw");
});

test("hash does not contain the code", () => {
  assert.ok(!hashCode(S, "t", "a@b.c", "654321").includes("654321"));
});

test("session: round trip, expiry, tamper, wrong trip, wrong secret", () => {
  const now = 1_800_000_000_000;
  const c = signSession(S, "trip1", " Ann@Example.com ", now);
  const p = verifySession(S, c, "trip1", now + 1000);
  assert.equal(p?.e, "ann@example.com");
  assert.equal(verifySession(S, c, "trip1", now + SESSION_TTL_MS + 1), null, "expired");
  assert.equal(verifySession(S, c, "trip2", now + 1000), null, "other trip");
  assert.equal(verifySession("y".repeat(40), c, "trip1", now + 1000), null, "other secret");
  const [body, sig] = c.split(".");
  const forged = Buffer.from(JSON.stringify({ t: "trip1", e: "evil@x.com", x: now + 1e12 })).toString("base64url");
  assert.equal(verifySession(S, `${forged}.${sig}`, "trip1", now + 1000), null, "payload swapped");
  assert.equal(verifySession(S, `${body}.AAAA`, "trip1", now + 1000), null, "bad sig");
  assert.equal(verifySession(S, "garbage", "trip1", now), null);
  assert.equal(verifySession(S, undefined, "trip1", now), null);
});

test("normalizeEmail", () => assert.equal(normalizeEmail("  A@B.Co "), "a@b.co"));
