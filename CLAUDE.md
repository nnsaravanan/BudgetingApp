# CLAUDE.md — Budgeting App Build Spec

This file is the source of truth for building this project. Read it fully before writing code. It is written for an AI coding agent (Claude Code) working incrementally with a human reviewer.

---

## 1. What we're building

A personal, multi-user budgeting web app. It replaces a spreadsheet: track accounts, categorize transactions, set monthly budgets, and see budget-vs-actual reports. Users can bulk-import transactions by uploading a CSV export (e.g. from their bank or card).

**Dual purpose:** (1) a real tool the owner will use, and (2) a portfolio project that must demonstrate clean architecture, sound security, and cost-awareness. Optimize for *clarity and defensible decisions*, not cleverness.

**Design bar:** this is a portfolio/demo app, not a high-scale product. Prefer the simplest correct approach. When you make a non-obvious decision, leave a short note in `DECISIONS.md` explaining why (these notes are interview material).

---

## 2. Tech stack (do not substitute without asking)

- **Frontend:** React (Vite), TypeScript, plain CSS or a light utility framework. No heavyweight state libs for v1 — React state/hooks are enough.
- **Backend:** Node.js (TypeScript) on AWS Lambda.
- **API:** API Gateway HTTP API with a Cognito JWT authorizer.
- **Auth:** Amazon Cognito User Pool. Do NOT hand-roll auth or password storage.
- **Database:** Aurora Serverless v2, PostgreSQL-compatible. Access via the `pg` library + a thin data layer. No heavy ORM required; parameterized SQL is preferred for learning.
- **IaC:** AWS SAM (YAML). Every resource is defined in template.yaml — nothing created by hand in the console.
- **CSV ingestion:** authenticated in-app upload → S3 → S3 event → Ingest Lambda (event-driven).
- **Secrets:** AWS Secrets Manager for DB credentials.
- **Monitoring:** CloudWatch logs + a billing alarm.

---

## 3. Architecture

Two flows:

**Request flow:** Browser → CloudFront (serves React from S3, terminates HTTPS, keeps the S3 bucket private via Origin Access Control) → user logs in via Cognito (gets JWT) → API calls hit API Gateway with the JWT → Cognito authorizer validates it (using Cognito's cached public key) and rejects bad tokens before any code runs → App Lambda runs → queries Aurora (in a private subnet) → returns JSON.

**CSV ingestion flow (event-driven, multi-user-safe):**
1. A logged-in user chooses a CSV to import.
2. The frontend asks the App Lambda for a **pre-signed S3 upload URL**. The App Lambda derives the user's ID from the JWT claims and generates a URL scoped to a key like `uploads/{userId}/{uuid}.csv`. **The client never chooses the userId — the server sets it from the token.**
3. The browser uploads the CSV directly to S3 using that pre-signed URL.
4. The S3 upload fires an **S3 event** that triggers the Ingest Lambda.
5. The Ingest Lambda reads the CSV from S3, determines the owning userId from the server-set key prefix, parses rows, dedups, and writes new transactions to Aurora **scoped to that user**.

**Critical rule:** the authenticated user's ID comes from the validated JWT claims (Cognito `sub`), passed via the authorizer context (request flow) or baked into the server-generated S3 key at pre-sign time (ingestion flow). NEVER take userId from the request body, query string, or a client-chosen S3 key.

---

## 4. Cost constraints (these are requirements, not suggestions)

This app must run at near-zero cost at portfolio traffic. Enforce in `template.yaml`:

- **Aurora:** minimum capacity **0 ACU** with auto-pause enabled. The DB must pause when idle. This is the single most important cost decision — idle compute drops to ~$0.
- **No RDS Proxy** for v1 (bills continuously; unnecessary at demo concurrency). Connect Lambda directly to Aurora. Note this tradeoff in DECISIONS.md.
- **No NAT Gateway.** For Lambda-in-VPC to reach Secrets Manager / CloudWatch, use **VPC interface endpoints**. For S3 access from the VPC, use an **S3 gateway endpoint** (these are free — prefer over an interface endpoint for S3).
- **Only open a DB connection when there is real work** so quiet periods let Aurora stay paused.
- **Billing alarm** at $10 must be part of the stack or setup instructions.
- Provide a `sam delete` teardown path so the owner can zero the bill between work sessions.

---

## 5. Data model (PostgreSQL)

All money stored as **integer minor units (cents)** in `BIGINT` — never floats. Every table carries `user_id` and every query filters on it.

```sql
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub  TEXT UNIQUE NOT NULL,
  email        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,               -- checking | savings | credit | cash
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,               -- income | expense
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL,             -- negative = expense, positive = income
  description  TEXT,
  txn_date     DATE NOT NULL,
  source       TEXT NOT NULL DEFAULT 'manual', -- manual | csv
  external_ref TEXT,                        -- dedup key for imported rows
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_ref)            -- prevents duplicate CSV imports
);

CREATE TABLE budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  period       TEXT NOT NULL,               -- 'YYYY-MM'
  amount_cents BIGINT NOT NULL,
  UNIQUE (user_id, category_id, period)
);

CREATE INDEX idx_txn_user_date      ON transactions (user_id, txn_date);
CREATE INDEX idx_txn_user_cat_date  ON transactions (user_id, category_id, txn_date);
CREATE INDEX idx_budget_user_period ON budgets (user_id, period);
```

Budget-vs-actual is computed on read with `SUM`/`GROUP BY` over `transactions` — do NOT precompute aggregates for v1 (correctness by construction; simpler).

---

## 6. Security checklist (non-negotiable — verify each before shipping v1)

- [ ] userId derived from validated JWT claims only; never from client input.
- [ ] Every DB query filters by `user_id`. No endpoint can return another user's data (authorization, enforced in Lambda — distinct from the authorizer's authentication).
- [ ] All SQL parameterized (`$1, $2`). No string concatenation of user input.
- [ ] DB credentials in Secrets Manager, never in code, env files, or the repo.
- [ ] Aurora in a private subnet with no public accessibility.
- [ ] Input validation on every write endpoint (types, ranges, required fields).
- [ ] CSV upload: pre-signed URL is scoped to the user's own key prefix (`uploads/{userId}/...`), with the userId set **server-side** from the JWT — a user cannot upload into another user's prefix.
- [ ] S3 upload bucket is private (no public access). Enforce content-type and a max file size on the pre-signed URL.
- [ ] CSV parsing is defensive: validate/whitelist expected columns, validate parsed amounts/dates, reject malformed rows without failing the whole import.
- [ ] Import is idempotent: re-uploading an overlapping CSV must not create duplicate transactions (enforced by `UNIQUE (user_id, external_ref)`).
- [ ] HTTPS everywhere (CloudFront + API Gateway default).

---

## 7. CSV ingestion design

- **Trigger:** authenticated in-app upload → S3 → S3 event → Ingest Lambda. This is event-driven (the file landing is the event) and reuses the app's existing authentication, so no second identity mechanism is needed.
- **Identity:** the owning userId comes from the server-set S3 key prefix (generated at pre-sign time from the JWT). The Ingest Lambda trusts the prefix because the server, not the client, chose it.
- **Dedup:** derive `external_ref` from a stable hash of the row's identifying fields (e.g. `date + amount + description`, since CSV rows often lack a unique transaction ID). The `UNIQUE (user_id, external_ref)` constraint makes re-imports safe.
- **Parsing:** isolate CSV parsing in its own module with unit tests over saved sample files. Different sources have different column layouts — start with one known format (the owner's actual export), validate columns explicitly, and map fields onto the `transactions` table. Validate amounts/dates before writing.
- **Column mapping:** before coding, inspect a real sample export and document its actual columns; build the parser to that, and keep mapping configurable enough to add a second format later.
- **This whole feature is v2/stretch** — do not block v1 on it.

---

## 8. Build order

**v1 (build and deploy this first — target: deployed + explainable):**
1. SAM skeleton: VPC, private subnets, Aurora (min 0 ACU), Secrets Manager, VPC interface endpoints (Secrets Manager, CloudWatch), S3 gateway endpoint.
2. Cognito user pool + hosted UI or minimal auth screens.
3. App Lambda + API Gateway with Cognito authorizer; one protected `GET /me` to prove the auth path end-to-end.
4. Accounts CRUD.
5. Categories CRUD.
6. Transactions CRUD (manual entry).
7. Monthly summary endpoint (SUM/GROUP BY by category for a given month).
8. React frontend for all of the above; deploy to S3 + CloudFront.
9. CloudWatch logging + billing alarm. Write DECISIONS.md.

**v2 (stretch, after v1 is deployed — pick ONE to go deep first):**
- **CSV upload ingestion** (pre-signed URL → S3 → Ingest Lambda → parse + dedup) as designed in §7. This is the primary stretch feature and the intended path for bulk-importing real transactions.
- Budget-vs-actual dashboard with charts.
- Recurring transactions.
- (Automated bank data) Plaid or Teller integration — real automated transaction feeds; heavier setup and a third-party dependency.
- LLM implementation along with AI controlled budgets

Do not start v2 until v1 is deployed and demoable.

---

## 9. Conventions

- **Language:** TypeScript everywhere. Strict mode on.
- **Structure:** `/frontend`, `/backend` (Lambda handlers + shared data layer), `/infra` (template.yaml). Keep the data-access layer separate from handlers.
- **Handlers stay thin:** validate input → call a service/data function → shape response. Business logic lives in services, not handlers.
- **Errors:** never leak stack traces or SQL to the client. Return `{ error: { code, message } }`. Log full detail to CloudWatch.
- **Tests:** unit-test the data layer, the summary aggregation, and the CSV parser at minimum. Prefer a few meaningful tests over broad shallow coverage.
- **No secrets in the repo.** `.env.example` documents needed vars; real values come from Secrets Manager / local untracked env.
- **Commits:** small, focused, clear messages. One feature slice per PR-sized chunk.

---

## 10. How to work in this repo (agent instructions)

- Work **incrementally**, one numbered build-order item at a time. Stop after each for review rather than building everything at once.
- Before implementing an item, briefly state your plan and any assumptions.
- Do **not** over-engineer: no premature abstractions, no libraries beyond what §2 lists without asking.
- If a requirement here conflicts with something you'd normally default to, follow this file and flag the conflict.
- When you make a design decision worth remembering, append a short entry to `DECISIONS.md`.
- Respect the cost constraints in §4 as hard requirements — they affect `template.yaml` specifically.
- Ask before: adding a dependency, changing the data model, or introducing RDS Proxy / NAT / an ORM.

---

## 11. Definition of done for v1

- A deployed URL where a user can sign up, log in, add accounts/categories/transactions, and see a monthly summary.
- Every item in the §6 security checklist that applies to v1 verified.
- Aurora confirmed pausing when idle; billing alarm active.
- DECISIONS.md written.
- README with local dev + `sam deploy` / `sam delete` instructions.

## 12. Out of scope

- **Reading users' email inboxes (Gmail API / IMAP) for transaction data.** Deliberately excluded: reading email is a Google "restricted scope" requiring an annual paid third-party CASA security assessment for any production/multi-user app that stores the data on a server — impractical at this scale. (Viable only as a personal/test-user-only demo, never as a product feature.) Use CSV upload or Plaid/Teller instead.
- **SES inbound email ingestion / bank-alert forwarding.** Excluded: it needs an owned domain + MX records, and it doesn't scale cleanly to multiple users (no per-user identity without manufacturing per-user addresses). CSV upload reuses the app's existing auth and is the correct multi-user approach.
- Real bank API integration (Plaid/Teller) is future work, not v1.
- Multi-currency, mobile app, sharing/collaboration, RDS Proxy, admin roles — note as future work; do not build.