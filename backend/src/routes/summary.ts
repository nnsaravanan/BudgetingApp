import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import * as db from '../db/client';
import { jsonResponse, errorResponse } from '../utils/response';

function getCognitoSub(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  return event.requestContext.authorizer.jwt.claims['sub'] as string;
}

async function resolveUserId(cognitoSub: string): Promise<string | null> {
  const r = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE cognito_sub = $1',
    [cognitoSub]
  );
  return r.rows[0]?.id ?? null;
}

interface CategorySummaryRow {
  category_id: string;
  category_name: string;
  category_kind: string;
  actual_cents: string;
  budget_cents: string | null;
}

interface TotalsRow {
  total_income_cents: string;
  total_expense_cents: string;
}

export async function handleGetSummary(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const month = event.queryStringParameters?.month;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'month query parameter is required in YYYY-MM format');
  }

  // Per-category actuals (SUM of transactions) joined with budget for the month.
  // Uses LEFT JOINs so categories with zero activity still appear (with actual=0).
  const categoryResult = await db.query<CategorySummaryRow>(`
    SELECT
      c.id          AS category_id,
      c.name        AS category_name,
      c.kind        AS category_kind,
      COALESCE(SUM(t.amount_cents), 0) AS actual_cents,
      b.amount_cents AS budget_cents
    FROM categories c
    LEFT JOIN transactions t
      ON  t.category_id = c.id
      AND t.user_id     = $1
      AND t.txn_date >= ($2 || '-01')::date
      AND t.txn_date <  (($2 || '-01')::date + INTERVAL '1 month')
    LEFT JOIN budgets b
      ON  b.category_id = c.id
      AND b.user_id     = $1
      AND b.period      = $2
    WHERE c.user_id = $1
    GROUP BY c.id, c.name, c.kind, b.amount_cents
    ORDER BY c.kind, c.name
  `, [userId, month]);

  // Uncategorized transactions (category_id IS NULL) — not tied to any budget row.
  const uncategorizedResult = await db.query<{ total_cents: string }>(`
    SELECT COALESCE(SUM(amount_cents), 0) AS total_cents
    FROM transactions
    WHERE user_id     = $1
      AND category_id IS NULL
      AND txn_date >= ($2 || '-01')::date
      AND txn_date <  (($2 || '-01')::date + INTERVAL '1 month')
  `, [userId, month]);

  // Overall income / expense totals computed directly from transactions (most accurate).
  const totalsResult = await db.query<TotalsRow>(`
    SELECT
      COALESCE(SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END), 0) AS total_income_cents,
      COALESCE(SUM(CASE WHEN amount_cents < 0 THEN amount_cents ELSE 0 END), 0) AS total_expense_cents
    FROM transactions
    WHERE user_id  = $1
      AND txn_date >= ($2 || '-01')::date
      AND txn_date <  (($2 || '-01')::date + INTERVAL '1 month')
  `, [userId, month]);

  const byCategory = categoryResult.rows.map(r => ({
    category_id:   r.category_id,
    category_name: r.category_name,
    category_kind: r.category_kind,
    actual_cents:  parseInt(r.actual_cents, 10),
    budget_cents:  r.budget_cents !== null ? parseInt(r.budget_cents, 10) : null,
  }));

  // Append uncategorized bucket only when it has activity.
  const uncategorizedCents = parseInt(uncategorizedResult.rows[0].total_cents, 10);
  if (uncategorizedCents !== 0) {
    byCategory.push({
      category_id:   null as unknown as string,
      category_name: 'Uncategorized',
      category_kind: null as unknown as string,
      actual_cents:  uncategorizedCents,
      budget_cents:  null,
    });
  }

  const totals = totalsResult.rows[0];
  const totalIncomeCents  = parseInt(totals.total_income_cents, 10);
  const totalExpenseCents = parseInt(totals.total_expense_cents, 10);

  return jsonResponse(200, {
    month,
    total_income_cents:  totalIncomeCents,
    total_expense_cents: totalExpenseCents,
    net_cents:           totalIncomeCents + totalExpenseCents,
    by_category:         byCategory,
  });
}
