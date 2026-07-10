# CLAUDE.md — Budgeting App Build Spec

This file is the source of truth for building this project. Read it fully before writing code. It is written for an AI coding agent (Claude Code) working incrementally with a human reviewer.

---

## 1. What we're building

A personal, multi-user budgeting web app. It replaces a spreadsheet: track accounts, categorize transactions, set monthly budgets, and see budget-vs-actual reports. It also ingests transactions automatically from forwarded bank-alert emails.

**Dual purpose:** (1) a real tool the owner will use, and (2) a portfolio project that must demonstrate clean architecture, sound security, and cost-awareness. Optimize for *clarity and defensible decisions*, not cleverness.

**Design bar:** this is a portfolio/demo app, not a high-scale product. Prefer the simplest correct approach. When you make a non-obvious decision, leave a short note in `DECISIONS.md` explaining why (these notes are interview material).

---

## 2. Tech stack (do not substitute without asking)

- **Frontend:** React (Vite), TypeScript, plain CSS or a light utility framework. No heavyweight state libs for v1 — React state/hooks are enough.
- **Backend:** Node.js (TypeScript) on AWS Lambda.
- **API:** API Gateway HTTP API with a Cognito JWT authorizer.
- **Auth:** Amazon Cognito User Pool. Do NOT hand-roll auth or password storage.
- **Database:** Aurora Serverless v2, PostgreSQL-compatible. Access via the `pg` library + a query builder or thin data layer. No heavy ORM required; parameterized SQL is fine and preferred for learning.
- **IaC:** AWS SAM (YAML). Every resource is defined in template.yaml — nothing created by hand in the console.
- **Email ingestion:** SES inbound receiving → Lambda (event-driven).
- **Secrets:** AWS Secrets Manager for DB credentials.
- **Monitoring:** CloudWatch logs + a billing alarm.

---

## 3. Architecture

See `budgeting-app-architecture.mermaid`. Two flows:

**Request flow:** Browser → CloudFront (serves React from S3) → user logs in via Cognito (gets JWT) → API calls hit API Gateway with the JWT → Cognito authorizer validates it → App Lambda runs → queries Aurora (in a private subnet) → returns JSON.

**Ingestion flow (event-driven, NOT polling):** Bank alert emails are forwarded to an SES-managed address → SES receives, verifies SPF/DKIM → triggers Ingest Lambda → Lambda parses the email, checks for duplicates, and writes a transaction only if it's new.

**Critical rule:** the authenticated user's ID comes from the validated JWT claims (Cognito `sub`), passed via the authorizer context. NEVER take userId from the request body, query string, or headers the client controls.

---

## 4. Cost constraints (these are requirements, not suggestions)

This app must run at near-zero cost at portfolio traffic. Enforce in `template.yaml`:

- **Aurora:** set minimum capacity to **0 ACU** with auto-pause enabled. The DB must be able to pause when idle.
- **No RDS Proxy** for v1 (it bills continuously; unnecessary at demo concurrency). Connect Lambda directly to Aurora. Note this tradeoff in DECISIONS.md.
- **No NAT Gateway.** If Lambda in the VPC needs to reach Secrets Manager / CloudWatch, use **VPC interface endpoints**, not NAT.
- **Only open a DB connection when there is real work.** The ingest path must check the email/dedup *before* touching Aurora, so quiet periods let the DB stay paused.
- **Billing alarm** at $10 must be part of the stack or setup instructions.
- Provide a `sam delete` teardown path so the owner can zero the bill between work sessions.

---

## 5. Data model (PostgreSQL)

All money stored as **integer minor units (cents)** in `BIGINT` — never floats. All tables carry `user_id` and every query filters on it.

```sql
-- users: local profile mapped to a Cognito identity
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
  source       TEXT NOT NULL DEFAULT 'manual', -- manual | email
  external_ref TEXT,                        -- dedup key for ingested txns
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_ref)            -- prevents duplicate email imports
);

CREATE TABLE budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  period       TEXT NOT NULL,               -- 'YYYY-MM'
  amount_cents BIGINT NOT NULL,
  UNIQUE (user_id, category_id, period)
);

CREATE INDEX idx_txn_user_date     ON transactions (user_id, txn_date);
CREATE INDEX idx_txn_user_cat_date ON transactions (user_id, category_id, txn_date);
CREATE INDEX idx_budget_user_period ON budgets (user_id, period);
```

Budget-vs-actual is computed on read with `SUM`/`GROUP BY` over `transactions` — do NOT precompute aggregates for v1 (correctness by construction; simpler).

---

## 6. Security checklist (non-negotiable — verify each before shipping v1)

- [ ] userId derived from validated JWT claims only; never from client input.
- [ ] Every DB query filters by `user_id`. No endpoint can return another user's data.
- [ ] All SQL parameterized (`$1, $2`). No string concatenation of user input.
- [ ] DB credentials in Secrets Manager, never in code, env files, or the repo.
- [ ] Aurora in a private subnet with no public accessibility.
- [ ] Input validation on every write endpoint (types, ranges, required fields).
- [ ] SES ingestion verifies SPF/DKIM pass AND sender matches an allowlist before trusting an email. Reject/park anything else.
- [ ] HTTPS everywhere (CloudFront + API Gateway default).
- [ ] Ingestion is idempotent: same email processed twice must not create two transactions (enforced by `UNIQUE (user_id, external_ref)`).

---

## 7. Email ingestion design

- Prefer **event-driven**: SES inbound rule → Ingest Lambda. Do not build a polling timer if SES receiving is available.
- Derive `external_ref` from the email's Message-ID (or a stable hash of sender + date + amount) so re-delivery is safe.
- Parsing bank HTML is fragile: isolate parsing in its own module with unit tests over saved sample emails. Validate the parsed amount/date before writing.
- If (and only if) the source inbox can't push to SES, fall back to EventBridge Scheduler → Lambda every 10 min, and still check dedup before opening a DB connection (cost rule §4).
- This whole feature is **stretch/v2** — do not block v1 on it.

---

## 8. Build order

**v1 (build and deploy this first — target: deployed + explainable):**
1. SAM skeleton: VPC, private subnets, Aurora (min 0 ACU), Secrets Manager, VPC endpoints.
2. Cognito user pool + hosted UI or minimal auth screens.
3. App Lambda + API Gateway with Cognito authorizer; one protected `GET /me` to prove the auth path end-to-end.
4. Accounts CRUD.
5. Categories CRUD.
6. Transactions CRUD (manual entry).
7. Monthly summary endpoint (SUM/GROUP BY by category for a given month).
8. React frontend for all of the above; deploy to S3 + CloudFront.
9. CloudWatch logging + billing alarm. Write DECISIONS.md.

**v2 (stretch, after v1 is deployed — pick ONE to go deep first):**
- Email ingestion (SES → Lambda) as designed in §7.
- Budget-vs-actual dashboard with charts.
- Recurring transactions.
- CSV import of the owner's existing spreadsheet.

Do not start v2 until v1 is deployed and demoable.

---

## 9. Conventions

- **Language:** TypeScript everywhere. Strict mode on.
- **Structure:** monorepo-ish — `/frontend`, `/backend` (Lambda handlers + shared data layer), `/infra` (template.yaml). Keep the data-access layer separate from handlers.
- **Handlers stay thin:** validate input → call a service/data function → shape response. Business logic lives in services, not in the handler.
- **Errors:** never leak stack traces or SQL to the client. Return structured `{ error: { code, message } }`. Log full detail to CloudWatch.
- **Tests:** unit-test the data layer, the summary aggregation, and the email parser at minimum. Prefer a few meaningful tests over broad shallow coverage.
- **No secrets in the repo.** `.env.example` documents needed vars; real values come from Secrets Manager / local untracked env.
- **Commits:** small, focused, with clear messages. One feature slice per PR-sized chunk.

---

## 10. How to work in this repo (agent instructions)

- Work **incrementally**, one numbered build-order item at a time. Stop after each for review rather than building everything at once.
- Before implementing an item, briefly state your plan and any assumptions.
- Do **not** over-engineer: no premature abstractions, no libraries beyond what §2 lists without asking.
- If a requirement here conflicts with something you'd normally default to, follow this file and flag the conflict.
- When you make a design decision worth remembering, append a short entry to `DECISIONS.md` (what, and why).
- Respect the cost constraints in §4 as hard requirements — they affect `template.yaml` specifically.
- Ask before: adding a dependency, changing the data model, or introducing RDS Proxy / NAT / an ORM.

---

## 11. Definition of done for v1

- A deployed URL where a user can sign up, log in, add accounts/categories/transactions, and see a monthly summary.
- Every item in the §6 security checklist verified.
- Aurora confirmed pausing when idle; billing alarm active.
- DECISIONS.md written.
- README with local dev + `sam deploy` / `sam delete` instructions.

## 12. Out of scope for v1 (explicitly)

Real bank API integration (Plaid etc.), multi-currency, mobile app, sharing/collaboration, RDS Proxy, admin roles. Note these as "future work" — do not build them.
