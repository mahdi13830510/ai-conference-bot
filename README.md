# AI Conference Deadlines Bot

A Telegram bot that tracks AI/ML conference paper deadlines, running entirely
on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with
[D1](https://developers.cloudflare.com/d1/) for storage.

Conference data is synced from [ai-deadlines](https://mlciv.com/ai-deadlines/).

## Features

- 📅 **Deadline tracking** — upcoming deadlines with colour-coded urgency
- 🔎 **Search** — full-text search across conference names and topics
- 🏷 **Topic filters** — ML, CV, NLP, RO, SP, DM and more
- 🌍 **Location filters** — by country or by region
- ⭐ **Saved conferences** — bookmark the ones you care about
- 🔔 **Reminders** — get pinged N days before a deadline
- 🎯 **Personal feed** — ranked by your topic and location preferences
- 📨 **Daily digest** — an optional 09:00 UTC summary
- ⚡ **Inline mode** — search conferences from any chat

## Commands

| Command | Description |
| --- | --- |
| `/start` | Open the main menu |
| `/upcoming` | Upcoming conference deadlines |
| `/search <query>` | Search conferences |
| `/topics` | Browse by topic |
| `/locations` | Browse by location |
| `/location <country>` | Conferences in a country |
| `/deadline <days>` | Deadlines in the next N days |
| `/saved` | Your saved conferences |
| `/reminders` | Your active reminders |
| `/myfeed` | Your personalized feed |
| `/settings` | Digest, timezone and preferences |
| `/timezone <zone>` | Set your timezone, e.g. `Europe/Amsterdam` |
| `/help` | Usage help |
| `/admin` | Stats and manual sync (admin only) |

## Architecture

```
src/
  index.ts          Worker entry: fetch (health + webhook) and scheduled (cron)
  config.ts         Page size and region → country mapping
  types.ts          Env, Telegram and database types
  telegram.ts       Telegram Bot API client
  database.ts       D1 queries: users, conferences, saves, reminders, prefs
  conferences.ts    ai-deadlines fetching, timezone handling, normalization
  format.ts         Renders conference rows into Telegram messages
  ui.ts             Inline keyboard builders
  users.ts          User upsert on first contact
  jobs.ts           Cron jobs: sync, reminders, daily digest
  handlers/
    update.ts       Dispatches an update to the right handler
    message.ts      Slash commands
    callback.ts     Inline keyboard callbacks
    inline.ts       Inline mode queries
    admin.ts        Admin commands
  views/
    menu.ts         Start, reminders, settings, help
    list.ts         Paginated conference lists
    conference.ts   Conference detail and reminder flow
```

Requests are acknowledged immediately and processed in `ctx.waitUntil`, so
Telegram always sees a fast `200`.

## Setup

### 1. Install

```bash
npm install
```

### 2. Create the D1 database

```bash
npx wrangler d1 create ai-conference-bot-db
```

Put the returned `database_id` into `wrangler.jsonc`, then apply the schema:

```bash
npx wrangler d1 migrations apply ai-conference-bot-db --remote
```

### 3. Configure secrets

Create a bot with [@BotFather](https://t.me/BotFather), then:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put ADMIN_TELEGRAM_ID
```

For local development, copy `.dev.vars.example` to `.dev.vars` and fill it in.

### 4. Deploy

```bash
npx wrangler deploy
```

### 5. Register the webhook and command list

```bash
export TELEGRAM_BOT_TOKEN=...
export WORKER_URL=https://<your-worker>.workers.dev
node scripts/setup_telegram.mjs
```

Inline mode must be enabled separately via BotFather (`/setinline`).

## Development

```bash
npm run dev        # local worker on :8787
npm test           # vitest against the workers runtime
npm run cf-typegen # regenerate worker-configuration.d.ts after binding changes
```

`GET /health` returns a JSON status payload; `POST /telegram` is the webhook.

## Cron

A single trigger (`0 */6 * * *`) runs the source sync, then due reminders, then
the daily digest. Each job is isolated, so one failure does not block the rest.

## Note on data accuracy

Some deadlines published by the upstream source are *predicted* rather than
confirmed. The bot flags these, but always verify important deadlines on the
official conference website.

## License

[MIT](LICENSE)
