# Document Submissions API

REST API for the document submissions: idempotent create, optimistic status changes, escaped search, SSE, and background scan jobs. Postgres is the truth. No ORM.

## Reviewers: Docker

```bash
docker compose up --build
```

API on `http://localhost:3000`. Compose does **not** publish 5432 or 6379.

## Local (nvm)

```bash
nvm use 24
npm ci
npm run migrate
npm test
npm run dev
```

Uses `.env` against shared Postgres (`localhost:5432`) and Redis (`localhost:6379`).

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
6. Jobs + `SKIP LOCKED` + 202 + progress + lease in the DB.
7. Redis + `ETag` on GET by id only.

Persistence is `pg` in `infrastructure/persistence` plus named methods on module repos. No ORM. Swapping the database means new adapters, not new use cases.

Assumptions: status machine as specified; reads are open; `X-Role` / `X-User-Id` are identity; 409 not 412; malformed id → 404.

## Search copy (stretch)

OpenSearch is a copy of Postgres, not the truth. Same TX writes an outbox row — not a dual-write from the API.

This repo adds `npm run drain-outbox`: it marks unpublished rows published. Real publish happens there.

Usually I will do one of:

1. Preferred: outbox → BullMQ + Redis in this repo → Bull worker upserts OpenSearch (fail / retry / status UI).
2. This job writes OpenSearch direct.
3. Outbox → Kafka or Rabbit if the org already runs them.

I did not add OpenSearch, Kafka, or Rabbit, to not introduce new dependencies.

## Caching (stretch)

I cache `GET /submissions/:id` in Redis, then ETag. Redis hit: If-None-Match matches version → 304; else 200 from Redis. Miss: Postgres, set Redis, same 304/200. PATCH deletes that key after commit. Redis down → Postgres.

I do not cache `GET /search`. I assume data changes often, so a search cache would keep expiring. If later measurement shows a lower update rate, cache can be introduced there (key = q + category + page; category prefix can be dropped on write).

I do not cache SSE. If a cached payload can differ by role, the key includes role.

## Schedule for production setup

This repo adds `npm run expire-keys`, `npm run reclaim-jobs`, and `npm run drain-outbox`. I did not add a scheduler, to not introduce new dependencies (BullMQ). Usually I will do one of:

1. Preferred: BullMQ + Redis in this repo — repeatable job, fail / retry / status UI (Bull Board).
2. OS cron / systemd timer / k8s CronJob calling the script (clock + logs). Example: reclaim every minute.
