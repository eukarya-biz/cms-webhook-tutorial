import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { verifySignature } from "./verify";

const secret = "test-secret";
const body = Buffer.from('{"id":"evt-1","type":"item.create"}');
const now = 1_800_000_000; // fixed "current time" so the tests don't depend on the clock

// Signs a body the same way Re:Earth CMS does.
function sign(payload: Buffer, t: number, key = secret): string {
  const hex = createHmac("sha256", key)
    .update(`v1:${t}:`)
    .update(payload)
    .digest("hex");
  return `v1,t=${t},${hex}`;
}

test("accepts a correctly signed request", () => {
  assert.deepEqual(verifySignature(body, sign(body, now), secret, now), {
    ok: true,
  });
});

test("rejects a request without a signature header", () => {
  assert.deepEqual(verifySignature(body, undefined, secret, now), {
    ok: false,
    reason: "missing Reearth-Signature header",
  });
});

test("rejects a body that was changed after signing", () => {
  const tampered = Buffer.from('{"id":"evt-1","type":"item.delete"}');
  assert.deepEqual(verifySignature(tampered, sign(body, now), secret, now), {
    ok: false,
    reason: "signature mismatch",
  });
});

test("rejects a signature made with a different secret", () => {
  const header = sign(body, now, "wrong-secret");
  assert.deepEqual(verifySignature(body, header, secret, now), {
    ok: false,
    reason: "signature mismatch",
  });
});

test("accepts a timestamp exactly 5 minutes old", () => {
  const t = now - 300;
  assert.deepEqual(verifySignature(body, sign(body, t), secret, now), {
    ok: true,
  });
});

test("rejects a timestamp more than 5 minutes old or in the future", () => {
  for (const t of [now - 301, now + 301]) {
    assert.deepEqual(verifySignature(body, sign(body, t), secret, now), {
      ok: false,
      reason: "timestamp too old or in the future",
    });
  }
});

test("rejects malformed headers", () => {
  const valid = sign(body, now);
  for (const header of [
    "garbage",
    valid.replace("v1,", "v2,"),
    `v1,${now},abc`,
    `v1,t=${now}`,
  ]) {
    assert.deepEqual(verifySignature(body, header, secret, now), {
      ok: false,
      reason: "malformed Reearth-Signature header",
    });
  }
  assert.deepEqual(verifySignature(body, "v1,t=abc,deadbeef", secret, now), {
    ok: false,
    reason: "malformed timestamp",
  });
});

test("rejects a signature of the wrong length without throwing", () => {
  assert.deepEqual(verifySignature(body, `v1,t=${now},abc`, secret, now), {
    ok: false,
    reason: "signature mismatch",
  });
});
