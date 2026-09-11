# Document Submissions API

REST API for the document submissions: idempotent create, optimistic status changes, escaped search, SSE, and background scan jobs. Postgres is the truth. No ORM.

## Setup

Docker (`.env.example` is already `db` / `redis`):

```bash
cp .env.example .env.docker
docker compose up --build
```

API on `http://localhost:3000` (open `/` in a browser). Compose does not publish 5432 or 6379.

Host (nvm) — point `DATABASE_URL` and `REDIS_URL` at your Postgres and Redis (`localhost` if they are already running):

```bash
cp .env.example .env
npm install
npm test
npm run dev
```

Second terminal: `npm run worker`. Migrate runs on API start (`MIGRATE_ON_START=true`).

## Curl

Health:

```bash
curl -sf http://127.0.0.1:3000/health
```

Create (same key twice is one row):

```bash
curl -s -D - -X POST http://127.0.0.1:3000/submissions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-1' \
  -d '{"title":"Permit","category":"legal","body":"hello"}'
```

Get + 304:

```bash
curl -s -D - http://127.0.0.1:3000/submissions/<id>
curl -s -D - http://127.0.0.1:3000/submissions/<id> -H 'If-None-Match: "1"'
```

Status (staff). Stale `If-Match` is 409:

```bash
curl -s -D - -X PATCH http://127.0.0.1:3000/submissions/<id>/status \
  -H 'Content-Type: application/json' \
  -H 'X-Role: staff' -H 'X-User-Id: alice' \
  -H 'If-Match: "1"' \
  -d '{"status":"approved"}'

curl -s -D - -X PATCH http://127.0.0.1:3000/submissions/<id>/status \
  -H 'Content-Type: application/json' \
  -H 'X-Role: staff' -H 'X-User-Id: alice' \
  -H 'If-Match: "1"' \
  -d '{"status":"rejected"}'
```

Search:

```bash
curl -s 'http://127.0.0.1:3000/search?q=hello&page=1'
```

SSE (second terminal, then PATCH):

```bash
curl -N -H 'X-Role: staff' -H 'X-User-Id: alice' http://127.0.0.1:3000/events
```

Scan:

```bash
curl -s -D - -X POST http://127.0.0.1:3000/submissions/<id>/scan \
  -H 'X-Role: staff' -H 'X-User-Id: alice'
```

## Decisions

1. **Idempotency-Key** + blocking `INSERT` + stored replay. Same hash → 201 replay. Different body → 409.
2. **FOR UPDATE** + `version` + `If-Match`. Stale is 409, not 412.
3. One pooled connection for status + audit + `pg_notify`.
4. Oldest-first pages (`created_at, id`) + escaped `ILIKE` + `pg_trgm`.
5. SSE + `Last-Event-ID` replay from **audit** + `LISTEN`.
6. Scan writes outbox in the same TX. `drain-outbox` publishes to BullMQ (`jobId` = `outbox-<id>`). The API job id is still the outbox id. Progress lives on the submission.
7. Redis + `ETag` on GET by id only.

Persistence is `pg` in `infrastructure/persistence` plus named methods on module repos. No ORM. Swapping the database means new adapters, not new use cases.

Assumptions: status machine as specified; reads are open; `X-Role` / `X-User-Id` are identity; 409 not 412; malformed id → 404.

## Search copy (stretch)

OpenSearch is a copy of Postgres, not the truth. Same TX writes an outbox row — not a dual-write from the API.

`npm run drain-outbox` (and the worker repeat every minute) pushes each unpublished row to BullMQ, then sets `published_at`. Redis down: the row stays unpublished. The worker job `submission.upsert` is the OpenSearch write; the index adapter is not wired yet (noop). I did not add OpenSearch, Kafka, or Rabbit.

## Caching (stretch)

I cache `GET /submissions/:id` in Redis, then ETag. Redis hit: If-None-Match matches version → 304; else 200 from Redis. Miss: Postgres, set Redis, same 304/200. PATCH deletes that key after commit. Redis down → Postgres.

I do not cache `GET /search`. I assume data changes often, so a search cache would keep expiring. If later measurement shows a lower update rate, cache can be introduced there (key = q + category + page; category prefix can be dropped on write).

I do not cache SSE. If a cached payload can differ by role, the key includes role.

## Schedule for production setup

The worker registers Bull repeatables: `drain-outbox` every minute, `expire-keys` every 12 hours (`DRAIN_OUTBOX_EVERY_MS`, `EXPIRE_KEYS_EVERY_MS`). Board is `http://localhost:3000/admin/queues` (HTTP Basic from `BULLBOARD_USER` / `BULLBOARD_PASSWORD`). `npm run expire-keys` and `npm run drain-outbox` remain one-shot CLIs.
