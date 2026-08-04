import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import * as db from '../db/client';
import { jsonResponse, errorResponse } from '../utils/response';

interface ScheduleRow {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  amount_cents: string;
  description: string;
  frequency: string;
  next_due: string;
  active: boolean;
  created_at: string;
}

const VALID_FREQUENCIES = new Set(['weekly', 'monthly', 'yearly']);

function getCognitoSub(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  return event.requestContext.authorizer.jwt.claims['sub'] as string;
}

async function resolveUserId(cognitoSub: string): Promise<string | null> {
  const r = await db.query<{ id: string }>('SELECT id FROM users WHERE cognito_sub = $1', [cognitoSub]);
  return r.rows[0]?.id ?? null;
}

function parseBody(raw: string | undefined): Record<string, unknown> | null {
  try { return JSON.parse(raw ?? '{}') as Record<string, unknown>; }
  catch { return null; }
}

function serializeSchedule(r: ScheduleRow) {
  return { ...r, amount_cents: parseInt(r.amount_cents, 10) };
}

// GET /schedules
export async function handleListSchedules(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first');

  const result = await db.query<ScheduleRow>(
    `SELECT * FROM schedules WHERE user_id = $1 ORDER BY next_due ASC`,
    [userId]
  );
  return jsonResponse(200, result.rows.map(serializeSchedule));
}

// POST /schedules
export async function handleCreateSchedule(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first');

  const body = parseBody(event.body);
  if (!body) return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');

  const { account_id, category_id, amount_cents, description, frequency, next_due } = body;

  if (typeof account_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(account_id))
    return errorResponse(400, 'VALIDATION_ERROR', 'account_id must be a valid UUID');
  if (category_id !== null && category_id !== undefined &&
      (typeof category_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(category_id as string)))
    return errorResponse(400, 'VALIDATION_ERROR', 'category_id must be a valid UUID or null');
  if (!Number.isInteger(amount_cents) || (amount_cents as number) === 0)
    return errorResponse(400, 'VALIDATION_ERROR', 'amount_cents must be a non-zero integer');
  if (typeof description !== 'string' || description.trim() === '')
    return errorResponse(400, 'VALIDATION_ERROR', 'description is required');
  if (typeof frequency !== 'string' || !VALID_FREQUENCIES.has(frequency))
    return errorResponse(400, 'VALIDATION_ERROR', 'frequency must be weekly, monthly, or yearly');
  if (typeof next_due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(next_due))
    return errorResponse(400, 'VALIDATION_ERROR', 'next_due must be YYYY-MM-DD');

  // Verify account belongs to user
  const accCheck = await db.query('SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [account_id, userId]);
  if (accCheck.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Account not found');

  if (category_id) {
    const catCheck = await db.query('SELECT id FROM categories WHERE id=$1 AND user_id=$2', [category_id, userId]);
    if (catCheck.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Category not found');
  }

  const result = await db.query<ScheduleRow>(
    `INSERT INTO schedules (user_id, account_id, category_id, amount_cents, description, frequency, next_due)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, account_id, category_id ?? null, amount_cents, description.trim(), frequency, next_due]
  );
  return jsonResponse(201, serializeSchedule(result.rows[0]));
}

// PUT /schedules/{id}
export async function handleUpdateSchedule(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first');

  const id = event.pathParameters?.id;
  if (!id) return errorResponse(400, 'MISSING_PARAM', 'id is required');

  const body = parseBody(event.body);
  if (!body) return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');

  const updates: string[] = [];
  const params: unknown[] = [userId, id];

  const push = (col: string, val: unknown) => { params.push(val); updates.push(`${col} = $${params.length}`); };

  if ('amount_cents' in body) {
    if (!Number.isInteger(body.amount_cents) || (body.amount_cents as number) === 0)
      return errorResponse(400, 'VALIDATION_ERROR', 'amount_cents must be a non-zero integer');
    push('amount_cents', body.amount_cents);
  }
  if ('description' in body) {
    if (typeof body.description !== 'string' || body.description.trim() === '')
      return errorResponse(400, 'VALIDATION_ERROR', 'description is required');
    push('description', (body.description as string).trim());
  }
  if ('frequency' in body) {
    if (typeof body.frequency !== 'string' || !VALID_FREQUENCIES.has(body.frequency))
      return errorResponse(400, 'VALIDATION_ERROR', 'frequency must be weekly, monthly, or yearly');
    push('frequency', body.frequency);
  }
  if ('next_due' in body) {
    if (typeof body.next_due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.next_due))
      return errorResponse(400, 'VALIDATION_ERROR', 'next_due must be YYYY-MM-DD');
    push('next_due', body.next_due);
  }
  if ('active' in body) {
    if (typeof body.active !== 'boolean')
      return errorResponse(400, 'VALIDATION_ERROR', 'active must be boolean');
    push('active', body.active);
  }
  if ('category_id' in body) {
    const cid = body.category_id;
    if (cid !== null && (typeof cid !== 'string' || !/^[0-9a-f-]{36}$/i.test(cid as string)))
      return errorResponse(400, 'VALIDATION_ERROR', 'category_id must be a valid UUID or null');
    push('category_id', cid ?? null);
  }

  if (updates.length === 0) return errorResponse(400, 'NO_FIELDS', 'No fields to update');

  const result = await db.query<ScheduleRow>(
    `UPDATE schedules SET ${updates.join(', ')} WHERE user_id=$1 AND id=$2 RETURNING *`,
    params
  );
  if (result.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Schedule not found');
  return jsonResponse(200, serializeSchedule(result.rows[0]));
}

// DELETE /schedules/{id}
export async function handleDeleteSchedule(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first');

  const id = event.pathParameters?.id;
  if (!id) return errorResponse(400, 'MISSING_PARAM', 'id is required');

  const result = await db.query(
    'DELETE FROM schedules WHERE user_id=$1 AND id=$2 RETURNING id',
    [userId, id]
  );
  if (result.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Schedule not found');
  return jsonResponse(200, { deleted: true });
}

// POST /schedules/generate — manually trigger expected-transaction generation for all due schedules.
// Useful for testing without waiting for the daily cron.
export async function handleGenerateExpected(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first');

  const { created } = await generateExpectedForUser(userId);
  return jsonResponse(200, { created });
}

export async function generateExpectedForUser(userId: string): Promise<{ created: number }> {
  const due = await db.query<ScheduleRow>(
    `SELECT * FROM schedules WHERE user_id=$1 AND active=true AND next_due <= CURRENT_DATE`,
    [userId]
  );

  let created = 0;
  for (const s of due.rows) {
    const inserted = await db.query(
      `INSERT INTO transactions
         (user_id, account_id, category_id, amount_cents, description, txn_date, source, status, schedule_id)
       SELECT $1, $2, $3, $4, $5, $6, 'scheduled', 'expected', $7
       WHERE NOT EXISTS (
         SELECT 1 FROM transactions
         WHERE schedule_id=$7 AND txn_date=$6 AND status='expected'
       )`,
      [s.user_id, s.account_id, s.category_id, s.amount_cents, s.description, s.next_due, s.id]
    );
    if (inserted.rowCount && inserted.rowCount > 0) created++;

    const interval = s.frequency === 'weekly'  ? '7 days'
                   : s.frequency === 'monthly' ? '1 month'
                   : '1 year';
    await db.query(
      `UPDATE schedules SET next_due = next_due + $1::interval WHERE id=$2`,
      [interval, s.id]
    );
  }

  return { created };
}
