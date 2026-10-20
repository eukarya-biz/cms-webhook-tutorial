# CMS Webhook Receiver

A small local TypeScript server that receives [Re:Earth CMS](https://docs.reearth.io/en/developer/cms/overview/) webhooks, verifies their signatures, and prints a readable summary of each event to the console. It's the companion code for the CMS Webhook tutorial: console output is just the starting point, and `src/notify.ts` is where you plug in your own notification (Slack, email, …).

```
[item.update] 2026-10-19 06:01:32 UTC
  model:   webhook-test
  item:    01abc…
  changed: title: "draft" → "final"
  by:      user 01xyz…
  event:   01def…
  received: 2026-10-19 06:01:34 UTC
```

## Security note

This project is built for learning CMS webhooks and is not hardened for
production use. Requests are only accepted with a valid `Reearth-Signature`,
but there is no other authentication, rate limiting, or persistent storage, and
the Cloudflare quick tunnel used for local testing is meant for development
only. Never commit your `.env` file (it holds the webhook secret), and don't
deploy this as-is.

## How it works

```
Re:Earth CMS ──POST + Reearth-Signature──► cloudflared tunnel ──► localhost:3000/webhook
```

For each request, the server:

1. Reads the body as raw bytes (the CMS sends no `Content-Type` header)
2. Verifies the `Reearth-Signature` header (HMAC-SHA256 of `v1:<timestamp>:<body>` with your secret) and rejects requests whose timestamp is more than 5 minutes off — `401` if either check fails
3. Replies `200` straight away (the CMS waits at most 30 seconds)
4. Skips duplicate deliveries, events from other projects (if `CMS_PROJECT_ID` is set), and event types it doesn't handle
5. Calls `notify(event)`, which prints the summary

| File                           | Purpose                                       |
| ------------------------------ | --------------------------------------------- |
| `src/server.ts`                | Express server and `POST /webhook`            |
| `src/verify.ts`                | Signature verification                        |
| `src/verify.test.ts`           | Tests for signature verification              |
| `src/notify.ts`                | Event summary — **the extension point**       |
| `src/types.ts`                 | Payload types, based on real CMS deliveries   |
| `scripts/send-test-webhook.ts` | Sends a signed test event to the local server |

## Prerequisites

- Node.js 22 (tested version; 20.6 or later is required for `--env-file`). If you use nvm, `nvm use` picks the version from `.nvmrc`.
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/) — free, no Cloudflare account needed
- A Re:Earth CMS Integration connected to your workspace — see [Creating an Integration](https://docs.reearth.io/en/developer/cms/getting-started/integration-setup/). Any role works: webhooks are sent regardless of the Integration's role.

## Setup

```bash
npm install
cp .env.example .env
```

Set `CMS_WEBHOOK_SECRET` in `.env` to a long random string. You'll enter the same value as the webhook's Secret in the CMS. For example:

```bash
openssl rand -hex 32
```

## Run and test locally

Start the receiver:

```bash
npm run dev
```

In a second terminal, send a signed test event (no CMS needed):

```bash
npm run send-test
```

The server prints an `[item.create]` summary. Options: `--type <event type>`, `--project <project id>`, `--id <event id>` (send the same `--id` twice to see duplicate handling).

`npm run typecheck` checks the TypeScript without running anything.

`npm test` runs the signature-verification tests (no CMS or `.env` needed).

## Connect to Re:Earth CMS

1. With `npm run dev` running, start a tunnel in another terminal:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

   Copy the `https://….trycloudflare.com` address it prints. It changes every time cloudflared restarts.

2. In the CMS, open **My Integrations** → your Integration → **Webhook** tab → **+ New Webhook**, and fill in:
   - **Name:** any name
   - **URL:** the tunnel address followed by `/webhook`
   - **Secret:** the same value as `CMS_WEBHOOK_SECRET`
   - **Events:** the Item and Asset events you want
3. Save, make sure the webhook is switched **ON**, then create or edit an item in the CMS. The summary appears in the `npm run dev` terminal.

When you stop the tunnel, switch the webhook off. Otherwise every change becomes a failed delivery that the CMS keeps retrying.

## Environment variables

| Variable             | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `PORT`               | Server port (default `3000`)                                              |
| `CMS_WEBHOOK_SECRET` | The webhook's Secret, used to verify signatures (required)                |
| `CMS_PROJECT_ID`     | Optional. Only handle events from this project; leave empty to accept all |

## Things to know about CMS webhooks

Found while building this; not all of it is in the CMS docs yet.

- **A webhook receives events from every project in the workspace** its Integration is connected to. Use `CMS_PROJECT_ID` to filter.
- **Deleting items or assets in the CMS UI sends no webhook.** `item.delete` is only sent when a whole model is deleted; `asset.delete` only for deletes made through the Integration API.
- **Failed deliveries are re-sent**, possibly much later and after newer events, so the receiver skips duplicates and doesn't rely on order.
- **Every save is a separate event**: editing an item twice sends two `item.update` events.
