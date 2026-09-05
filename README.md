# AI Conference Deadlines Bot

A Telegram bot that tracks AI/ML conference paper deadlines, running entirely
on [Cloudflare Workers](https://developers.cloudflare.com/workers/) with
[D1](https://developers.cloudflare.com/d1/) for storage.

It merges deadlines from [ai-deadlines](https://mlciv.com/ai-deadlines/) and
[WikiCFP](http://www.wikicfp.com/cfp/), enriches them with
[CORE](https://portal.core.edu.au/conf-ranks/) rankings and historical
acceptance rates, and delivers the result as a bot, an inline search provider
and a Telegram Mini App.

## Features

### Finding conferences

- **Typo-tolerant search** — SQLite FTS5 with a Levenshtein fallback, so
  `nuerips` still finds NeurIPS
- **Filters** — topic, country, region, CORE rank (A\*/A/B/C, "and above"),
  format (in person / virtual / hybrid), and deadline window
- **Sorting** — by deadline, conference date, name or rank
- **Similar conferences** — shared topics, nearest deadlines first
- **Inline mode** — `@yourbot neurips` in any chat, personalized to the asker

### Staying on top of deadlines

- **Reminders** — any offset, plus an escalating 30 → 7 → 3 → 1 sequence
- **Reminder kinds** — paper deadline, abstract deadline, or conference start
  for travel planning
- **Automatic reminders** for everything you save
- **Deadline-change alerts** — the sync diffs each row and tells watchers when
  a deadline moves or is extended
- **New-conference alerts** matched against your topics
- **Saved searches** that notify you when a new listing matches
- **Quiet hours** — notifications are held, never dropped
- **Daily or weekly digest** at an hour you choose
- **Mute** a conference without unsaving it

### Context for each venue

- **CORE rank** with the ranked venue's full name
- **Historical acceptance rates** with accepted/submitted counts
- **Past editions**, accumulated from previous syncs
- **Travel pointers** — official government visa portal and local currency for
  the host country
- Links to the website, the CFP, proceedings and Papers with Code

### Calendar

- **Google Calendar** deep link on every conference
- **`.ics` export** for one conference, your saved set, or a whole filtered
  list, delivered as a file

### Interface

- **Mini App** — a full browser with search, filter chips and detail sheets,
  themed to the user's Telegram colours
- Persistent bottom keyboard, force-reply prompts instead of command syntax,
  toast confirmations, and a Back button that returns where you came from
- HTML formatting, controlled link previews, and long messages split on
  paragraph boundaries

## Commands

| Command | Description |
| --- | --- |
| `/start` | Main menu |
| `/upcoming` | Every open deadline |
| `/myfeed` | Ranked by your preferences |
| `/timeline` | What is due when, with clash detection |
| `/search <query>` | Typo-tolerant search |
| `/topics` · `/locations` | Browse by category |
| `/rank A*` | Filter by CORE ranking |
| `/format virtual` | In person, virtual or hybrid |
| `/location <country>` | Conferences in a country |
| `/deadline <days>` | Closing within N days |
| `/nextweek` · `/thismonth` | Shortcuts |
| `/saved` | Your bookmarks |
| `/reminders` | View and delete reminders |
| `/watch <query>` | Alert me when a new listing matches |
| `/watches` | Manage saved searches |
| `/export` | Saved conferences as `.ics` |
| `/settings` | Digest, quiet hours, sorting, alerts |
| `/timezone <zone>` | Set your timezone |
| `/help` | Usage |
| `/admin` | Stats, sync, sources (admin only) |

Plain text is treated as a search, so users never have to remember syntax.

## Architecture

```
src/
  index.ts          Worker entry: webhook, Mini App routes, cron
  config.ts         Tunables: page size, offsets, labels, limits
  types.ts          Env, Telegram, and database types
  telegram.ts       Bot API client: rate limiting, retries, HTML, errors
  database.ts       All D1 queries
  conferences.ts    Timezone normalization and row mapping
  enrich.ts         Format detection, geography parsing, CORE lookup
  calendar.ts       Google Calendar links and RFC 5545 .ics output
  format.ts         Renders rows into Telegram messages
  ui.ts             Inline keyboard builders
  quiet.ts          Timezone-aware quiet hours and digest scheduling
  users.ts          User upsert on first contact
  jobs.ts           Cron jobs: sync, alerts, reminders, digests, sweeps
  sources/          Pluggable conference sources
    index.ts          Registry, merge and de-duplication
    ai-deadlines.ts   Primary curated feed
    wikicfp.ts        Secondary coverage via RSS + event pages
  handlers/
    update.ts       Dispatch, deduplication, blocked-user handling
    message.ts      Commands, force-reply input, plain-text search
    callback.ts     Inline keyboard routing
    inline.ts       Inline queries
    admin.ts        Admin commands
  views/
    menu.ts         Start, reminders, saved searches, timeline, help
    list.ts         Paginated lists across every filter mode
    conference.ts   Detail view and the reminder flow
    settings.ts     Settings screens
    export.ts       Calendar file delivery
  miniapp/
    page.ts         The Mini App shell
    api.ts          Mini App JSON API
    auth.ts         initData signature verification
    url.ts          Mini App URL resolution
data/
  core-ranks.json        CORE rankings, bundled at build time
  acceptance-rates.json  Source for the acceptance-rate migration
```

Requests are acknowledged immediately and processed in `ctx.waitUntil`, so
Telegram always sees a fast `200`.

### Reliability

- **Webhook authentication** via `secret_token`, checked in constant time
- **Update deduplication** — Telegram redelivers on a slow webhook; a claim
  table makes handling idempotent
- **Rate limiting** — a global window plus a per-chat interval, with `429`
  `retry_after` obeyed and `5xx` retried
- **Blocked users** are detected from `403` responses and `my_chat_member`, and
  excluded from background jobs
- **Callback tokens** — payloads over Telegram's 64-byte `callback_data` limit
  are stored in D1 and referenced by a short token

## Data sources and accuracy

| Data | Source | Refresh |
| --- | --- | --- |
| Deadlines | ai-deadlines, WikiCFP | every 6 hours |
| Rankings | CORE (CORE2023) | `node scripts/fetch_core_ranks.mjs` |
| Acceptance rates | [Conference-Acceptance-Rate](https://github.com/lixin4ever/Conference-Acceptance-Rate) | `node scripts/fetch_acceptance_rates.mjs` |
| Visa portals | Official government sites | curated in `migrations/0003` |

Two deliberate limits:

- Some upstream deadlines are **predicted** rather than confirmed. The bot
  labels these and tells users to verify on the official site.
- The bot **never states visa requirements**, because they depend on the
  traveller's nationality. It links to the official portal and says so.

WikiCFP is off by default: its RSS carries no submission deadline, so each
event costs an extra page fetch. Enable it per sync with
`/admin sync ai-deadlines,wikicfp`.

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
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any random string
```

Set `PUBLIC_URL` in `wrangler.jsonc` `vars` to your worker's public origin to
enable the Mini App.

For local development, copy `.dev.vars.example` to `.dev.vars`.

### 4. Deploy

```bash
npx wrangler deploy
```

### 5. Register commands, profile and webhook

```bash
export TELEGRAM_BOT_TOKEN=...
export WORKER_URL=https://<your-worker>.workers.dev
export TELEGRAM_WEBHOOK_SECRET=...
export ADMIN_TELEGRAM_ID=...
node scripts/setup_telegram.mjs
```

Then, in BotFather: `/setinline` to enable inline mode, and `/newapp` to
register `$WORKER_URL/app` as a Mini App.

## Development

```bash
npm run dev        # local worker on :8787
npm test           # vitest against the workers runtime
npm run typecheck  # tsc --noEmit
npm run cf-typegen # regenerate worker-configuration.d.ts
```

Trigger the cron locally with
`curl "http://localhost:8787/__scheduled?cron=0+*/6+*+*+*"`.

`GET /health` returns a status payload, `POST /telegram` is the webhook, and
`/app` serves the Mini App.

## Cron

Two schedules share one handler:

- **hourly** — automatic reminders, reminder delivery, digests, so that
  per-user digest hours and quiet hours are honoured
- **every 6 hours** — additionally syncs the sources, emits deadline-change and
  new-conference alerts, and sweeps expired rows

Each job is isolated: one failure never blocks the rest.

## License

[MIT](LICENSE)
