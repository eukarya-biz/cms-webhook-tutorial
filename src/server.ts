import express from "express";
import { notify } from "./notify";
import type { WebhookEvent } from "./types";
import { verifySignature } from "./verify";

const app = express();
const port = Number(process.env.PORT) || 3000;
const secret = process.env.CMS_WEBHOOK_SECRET;
const projectFilter = process.env.CMS_PROJECT_ID || undefined;

if (!secret) {
  console.error(
    "CMS_WEBHOOK_SECRET is not set. Copy .env.example to .env and fill it in.",
  );
  process.exit(1);
}

const HANDLED_TYPES = new Set([
  "item.create",
  "item.update",
  "item.publish",
  "item.unpublish",
  "item.delete",
  "asset.create",
  "asset.delete",
]);

// Remember recent event IDs so a retried delivery isn't handled twice.
const seenEventIds = new Set<string>();
const MAX_SEEN = 1000;

// Re:Earth CMS sends no Content-Type header, so read every body as raw bytes.
// The signature is calculated over these exact bytes.
// type: () => true reads the body even when there's no Content-Type header.
// (type: "*/*" would skip it, because it only matches requests that have one.)
app.post(
  "/webhook",
  express.raw({ type: () => true, limit: "1mb" }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    const result = verifySignature(
      rawBody,
      req.get("Reearth-Signature"),
      secret,
    );
    if (!result.ok) {
      console.warn(`Rejected webhook: ${result.reason}`);
      res.sendStatus(401);
      return;
    }

    let event: WebhookEvent;
    try {
      event = JSON.parse(rawBody.toString("utf8"));
    } catch {
      console.warn("Rejected webhook: body is not valid JSON");
      res.sendStatus(400);
      return;
    }
    if (typeof event?.id !== "string" || typeof event?.type !== "string") {
      console.warn("Rejected webhook: body is missing id or type");
      res.sendStatus(400);
      return;
    }

    // Reply before doing any work: the CMS waits at most 30 seconds,
    // and any status above 300 counts as a failed delivery.
    res.sendStatus(200);
    handleEvent(event);
  },
);

function handleEvent(event: WebhookEvent) {
  if (seenEventIds.has(event.id)) {
    console.log(`Skipped duplicate delivery: ${event.id}`);
    return;
  }
  seenEventIds.add(event.id);
  if (seenEventIds.size > MAX_SEEN) {
    seenEventIds.delete(seenEventIds.values().next().value!);
  }

  const projectId = getProjectId(event);
  if (projectFilter && projectId !== projectFilter) {
    console.log(`Ignored ${event.type} from another project (${projectId})`);
    return;
  }

  if (!HANDLED_TYPES.has(event.type)) {
    console.log(`Unhandled event type: ${event.type}`);
    return;
  }
  // Errors in notify() must not crash the receiver.
  notify(event).catch((err) => {
    console.error(`notify() failed for ${event.id}:`, err);
  });
}

// Item events carry the project in data.model; asset events carry it in data itself.
function getProjectId(event: WebhookEvent): string | undefined {
  const data = event.data as
    | { model?: { projectId?: string }; projectId?: string }
    | undefined;
  return data?.model?.projectId ?? data?.projectId;
}

// Errors from express.raw() (body too large, bad encoding, aborted request) end up here.
// Reply with a plain status code: Express's default error page includes a stack
// trace with local file paths, which anyone with the tunnel URL could see.
app.use(
  (
    err: { status?: number; message?: string },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.warn(`Rejected webhook: ${err.message ?? "invalid request"}`);
    res.sendStatus(err.status ?? 400);
  },
);

app.listen(port, () => {
  console.log(`CMS Webhook Receiver listening on http://localhost:${port}`);
});
