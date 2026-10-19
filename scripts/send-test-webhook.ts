// Sends a signed test webhook to the local receiver, so you can test without the CMS.
import { createHmac } from "node:crypto";
import { parseArgs } from "node:util";

const secret = process.env.CMS_WEBHOOK_SECRET;
if (!secret) throw new Error("CMS_WEBHOOK_SECRET is not set");

const { values } = parseArgs({
  options: {
    type: { type: "string", default: "item.create" },
    project: {
      type: "string",
      default: process.env.CMS_PROJECT_ID || "test-project",
    },
    id: { type: "string", default: `test-${Date.now()}` },
  },
});

const event = {
  id: values.id,
  timestamp: new Date().toISOString(),
  type: values.type,
  data: {
    item: {
      id: "test-item",
      modelId: "test-model",
      fields: [
        {
          id: "f1",
          key: "title",
          type: "text",
          value: "hello from the test script",
        },
      ],
    },
    model: {
      id: "test-model",
      key: "webhook-test",
      name: "webhook-test",
      projectId: values.project,
    },
    schema: {
      fields: [{ id: "f1", key: "title", name: "title", type: "text" }],
    },
  },
  operator: { user: { id: "test-user" } },
};

const body = JSON.stringify(event);
const t = Math.floor(Date.now() / 1000);
const signature = createHmac("sha256", secret)
  .update(`v1:${t}:`)
  .update(body)
  .digest("hex");

async function main() {
  const res = await fetch(
    `http://localhost:${process.env.PORT ?? 3000}/webhook`,
    {
      method: "POST",
      headers: { "Reearth-Signature": `v1,t=${t},${signature}` },
      // Send bytes rather than a string: fetch then adds no Content-Type, just like the CMS.
      body: Buffer.from(body),
    },
  );
  console.log(`Sent ${values.type} (${values.id}) → ${res.status}`);
}

main().catch((err) => {
  console.error(`Failed to send test webhook: ${err.message}`);
  console.error("Is the receiver running? Start it with: npm run dev");
  process.exit(1);
});
