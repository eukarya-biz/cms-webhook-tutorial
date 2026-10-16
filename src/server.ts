import express from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

// Re:Earth CMS sends no Content-Type header, so read every body as raw bytes.
// We need the exact bytes later to verify the signature.
app.post("/webhook", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
  const rawBody: Buffer = req.body;
  console.log("Received webhook:", rawBody.toString("utf8"));
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`CMS Webhook Receiver listening on http://localhost:${port}`);
});
