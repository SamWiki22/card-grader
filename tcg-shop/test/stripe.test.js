import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyStripeSignature } from "../lib/stripe.js";

const secret = "whsec_test";
const body = JSON.stringify({ type: "checkout.session.completed" });
const sign = (t, b = body, s = secret) => `t=${t},v1=${crypto.createHmac("sha256", s).update(`${t}.${b}`).digest("hex")}`;
const now = () => Math.floor(Date.now() / 1000);

test("accepts a valid signature", () => assert.equal(verifyStripeSignature(body, sign(now()), secret), true));
test("rejects tampered body", () => assert.equal(verifyStripeSignature(body + " ", sign(now()), secret), false));
test("rejects wrong secret", () => assert.equal(verifyStripeSignature(body, sign(now(), body, "other"), secret), false));
test("rejects stale timestamp", () => assert.equal(verifyStripeSignature(body, sign(now() - 3600), secret), false));
test("rejects missing header/secret", () => {
  assert.equal(verifyStripeSignature(body, undefined, secret), false);
  assert.equal(verifyStripeSignature(body, sign(now()), undefined), false);
});
