/**
 * One-shot migration Lambda. Invoke it once after `sam deploy`:
 *   aws lambda invoke --function-name <stack>-migrate /dev/stdout
 *
 * All statements use IF NOT EXISTS so re-running is safe.
 */
import * as db from './client';

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub  TEXT UNIQUE NOT NULL,
  email        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('checking','savings','credit','cash')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('income','expense')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL,
  description  TEXT,
  txn_date     DATE NOT NULL,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','csv')),
  external_ref TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_ref)
);

CREATE TABLE IF NOT EXISTS budgets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  period       TEXT NOT NULL,
  amount_cents BIGINT NOT NULL,
  UNIQUE (user_id, category_id, period)
);

CREATE INDEX IF NOT EXISTS idx_txn_user_date     ON transactions (user_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_txn_user_cat_date ON transactions (user_id, category_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_budget_user_period ON budgets (user_id, period);

CREATE TABLE IF NOT EXISTS schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  category_id  UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL,
  description  TEXT NOT NULL,
  frequency    TEXT NOT NULL CHECK (frequency IN ('weekly','monthly','yearly')),
  next_due     DATE NOT NULL,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules (user_id);
CREATE INDEX IF NOT EXISTS idx_schedules_due  ON schedules (next_due) WHERE active = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='transactions' AND column_name='status'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN status TEXT NOT NULL DEFAULT 'manual'
        CHECK (status IN ('manual','expected','confirmed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='transactions' AND column_name='schedule_id'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL;
  END IF;

  -- Expand source check to include 'scheduled'
  BEGIN
    ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
    ALTER TABLE transactions ADD CONSTRAINT transactions_source_check
      CHECK (source IN ('manual','csv','scheduled'));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END
$$;

CREATE INDEX IF NOT EXISTS idx_txn_user_status ON transactions (user_id, status);
`;

export const handler = async (): Promise<{ statusCode: number; body: string }> => {
  console.log('Running schema migration...');
  await db.query(SCHEMA_SQL);
  console.log('Migration complete.');
  return { statusCode: 200, body: JSON.stringify({ message: 'Migration complete' }) };
};
