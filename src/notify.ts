import type {
  AssetEventData,
  ItemEventData,
  Operator,
  WebhookEvent,
} from "./types";

/**
 * Called once for every verified, non-duplicate event that passed the filters.
 *
 * This is the extension point: replace or extend the console output below to
 * send the event somewhere else (Slack, email, a database...). It may be async.
 */
export async function notify(event: WebhookEvent): Promise<void> {
  console.log(formatEvent(event));
}

export function formatEvent(event: WebhookEvent): string {
  const lines = [`[${event.type}] ${formatTime(event.timestamp)}`];

  if (event.type.startsWith("item.")) {
    lines.push(...describeItem(event.type, event.data as ItemEventData));
  } else if (event.type.startsWith("asset.")) {
    lines.push(...describeAsset(event.data as AssetEventData));
  }

  lines.push(`  by:      ${describeOperator(event.operator)}`);
  lines.push(`  event:   ${event.id}`);
  // When it reached us; differs from the event time for retried deliveries.
  lines.push(`  received: ${formatTime(new Date().toISOString())}`);
  return lines.join("\n");
}

function describeItem(type: string, data: ItemEventData): string[] {
  const lines = [`  model:   ${data.model.key}`, `  item:    ${data.item.id}`];

  if (type === "item.update" && data.changes?.length) {
    // Changes only carry the field id, so look up the field key in the schema.
    const keyById = new Map(data.schema.fields.map((f) => [f.id, f.key]));
    for (const change of data.changes) {
      const key = keyById.get(change.id) ?? change.id;
      lines.push(
        `  changed: ${key}: ${formatValue(change.previousValue)} → ${formatValue(change.currentValue)}`,
      );
    }
  } else if (type === "item.create" || type === "item.publish") {
    for (const field of data.item.fields) {
      lines.push(`  field:   ${field.key} = ${formatValue(field.value)}`);
    }
  }

  return lines;
}

function describeAsset(data: AssetEventData): string[] {
  // The payload has no file-name field; the name is the last part of the URL.
  const fileName = data.url
    ? decodeURIComponent(data.url.split("/").pop() ?? "")
    : "";
  const lines = [
    `  asset:   ${data.id}`,
    `  file:    ${fileName || "(unknown)"}`,
  ];
  if (data.totalSize !== undefined) {
    lines.push(`  size:    ${(data.totalSize / 1024).toFixed(1)} KB`);
  }
  return lines;
}

function describeOperator(operator: Operator | undefined): string {
  if (operator?.user) return `user ${operator.user.id}`;
  if (operator?.integration) return `integration ${operator.integration.id}`;
  if (operator?.machine) return "system";
  return "unknown";
}

// "2026-10-14T10:02:06.524526923Z" -> "2026-10-14 10:02:06 UTC"
function formatTime(timestamp: string): string {
  return `${timestamp.slice(0, 19).replace("T", " ")} UTC`;
}

// Change values arrive as lists; show a single value without the brackets.
function formatValue(value: unknown): string {
  const v = Array.isArray(value) && value.length === 1 ? value[0] : value;
  return JSON.stringify(v);
}
