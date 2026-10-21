// Shapes confirmed from real Re:Earth CMS webhook deliveries.

export type Operator = {
  user?: { id: string };
  integration?: { id: string };
  machine?: Record<string, never>;
};

export type ItemField = {
  id: string;
  key: string;
  type: string;
  value: unknown;
};

export type FieldChange = {
  id: string; // field id only; look up the key in schema.fields
  type: string;
  previousValue: unknown[];
  currentValue: unknown[];
};

export type ItemEventData = {
  item: { id: string; modelId: string; fields: ItemField[] };
  model: { id: string; key: string; name: string; projectId: string };
  schema: { fields: { id: string; key: string; name: string; type: string }[] };
  changes?: FieldChange[]; // only on item.update
};

export type AssetEventData = {
  id: string;
  projectId: string;
  url: string;
  previewType?: string;
  totalSize?: number;
};

export type WebhookEvent = {
  id: string;
  timestamp: string;
  type: string;
  data: unknown;
  operator: Operator;
};
