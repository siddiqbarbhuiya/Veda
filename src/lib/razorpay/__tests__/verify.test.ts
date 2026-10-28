import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyWebhookSignature } from "../verify";

describe("verifyWebhookSignature", () => {
  it("valid signature returns true", () => {
    const body = '{"entity":"event"}';
    const secret = "test_webhook_secret";
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it("invalid signature returns false", () => {
    expect(verifyWebhookSignature("body", "wrong", "secret")).toBe(false);
  });

  it("signature of a different body returns false", () => {
    const sig = crypto.createHmac("sha256", "s").update("a").digest("hex");
    expect(verifyWebhookSignature("b", sig, "s")).toBe(false);
  });
});
