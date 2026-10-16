import express from "express";
import { verifySignature } from "./verify";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const secret = process.env.CMS_WEBHOOK_SECRET;

if (!secret) {
  console.error(
    "CMS_WEBHOOK_SECRET is not set. Copy .env.example to .env and fill it in.",
  );
  process.exit(1);
}

// Re:Earth CMS sends no Content-Type header, so read every body as raw bytes.
// The signature is calculated over these exact bytes.
app.post("/webhook", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  const result = verifySignature(rawBody, req.get("Reearth-Signature"), secret);
  if (!result.ok) {
    console.warn(`Rejected webhook: ${result.reason}`);
    res.sendStatus(401);
    return;
  }

  console.log("Verified webhook:", rawBody.toString("utf8"));
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`CMS Webhook Receiver listening on http://localhost:${port}`);
});
