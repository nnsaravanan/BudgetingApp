import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import * as db from '../db/client';
import { jsonResponse, errorResponse } from '../utils/response';

interface BudgetRow {
  id: string;
  category_id: string;
  period: string;
  amount_cents: string;
}

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

function parseBody(raw: string | undefined): Record<string, unknown> | null {
  try {
    return JSON.parse(raw ?? '{}') as Record<string, unknown>;
  } catch {
    return null;
  }
}

// PUT /budgets — upsert a budget for a category + month
export async function handleUpsertBudget(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const body = parseBody(event.body);
  if (!body) return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');

  const { category_id, period, amount_cents } = body;

  if (typeof category_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(category_id)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'category_id must be a valid UUID');
  }
  if (typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'period must be in YYYY-MM format');
  }
  if (!Number.isInteger(amount_cents) || (amount_cents as number) <= 0) {
    return errorResponse(400, 'VALIDATION_ERROR', 'amount_cents must be a positive integer');
  }

  // Verify the category belongs to this user
  const catCheck = await db.query(
    'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
    [category_id, userId]
  );
  if (catCheck.rows.length === 0) {
    return errorResponse(404, 'NOT_FOUND', 'Category not found');
  }

  const result = await db.query<BudgetRow>(
    `INSERT INTO budgets (user_id, category_id, period, amount_cents)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, category_id, period)
     DO UPDATE SET amount_cents = EXCLUDED.amount_cents
     RETURNING id, category_id, period, amount_cents`,
    [userId, category_id, period, amount_cents]
  );

  const row = result.rows[0];
  return jsonResponse(200, { ...row, amount_cents: parseInt(row.amount_cents, 10) });
}

// DELETE /budgets/{categoryId}/{period}
export async function handleDeleteBudget(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const categoryId = event.pathParameters?.categoryId;
  const period     = event.pathParameters?.period;

  if (!categoryId || !period) {
    return errorResponse(400, 'MISSING_PARAM', 'categoryId and period are required');
  }

  const result = await db.query(
    'DELETE FROM budgets WHERE user_id = $1 AND category_id = $2 AND period = $3 RETURNING id',
    [userId, categoryId, period]
  );

  if (result.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Budget not found');
  return jsonResponse(200, { deleted: true });
}
