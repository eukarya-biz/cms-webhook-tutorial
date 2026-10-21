import { createHmac, timingSafeEqual } from "node:crypto";

// Reject requests whose timestamp is more than 5 minutes from now (replay protection).
const TOLERANCE_SECONDS = 5 * 60;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * Verifies the Reearth-Signature header sent by Re:Earth CMS.
 * Header format:  v1,t=<unix seconds>,<hex HMAC-SHA256>
 * Signed message: "v1:<t>:" followed by the raw request body
 */
export function verifySignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): VerifyResult {
  if (!header) return { ok: false, reason: "missing Reearth-Signature header" };

  const [version, timestampPart, signature] = header.split(",");
  if (version !== "v1" || !timestampPart?.startsWith("t=") || !signature) {
    return { ok: false, reason: "malformed Reearth-Signature header" };
  }

  const timestamp = timestampPart.slice("t=".length);
  const t = Number(timestamp);
  if (!Number.isInteger(t)) return { ok: false, reason: "malformed timestamp" };
  if (Math.abs(now - t) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp too old or in the future" };
  }

  const expected = createHmac("sha256", secret)
    .update(`v1:${timestamp}:`)
    .update(rawBody)
    .digest("hex");

  // timingSafeEqual throws if the lengths differ, so check that first.
  const received = Buffer.from(signature);
  const computed = Buffer.from(expected);
  if (
    received.length !== computed.length ||
    !timingSafeEqual(received, computed)
  ) {
    return { ok: false, reason: "signature mismatch" };
  }

  return { ok: true };
}
