import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import * as db from '../db/client';
import { jsonResponse, errorResponse } from '../utils/response';

interface TransactionRow {
  id: string;
  account_id: string;
  category_id: string | null;
  amount_cents: string; // pg returns BIGINT as string
  description: string | null;
  txn_date: string;
  source: string;
  created_at: Date;
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

function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}

function isValidUuid(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function accountBelongsToUser(accountId: string, userId: string): Promise<boolean> {
  const r = await db.query('SELECT id FROM accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
  return r.rows.length > 0;
}

async function categoryBelongsToUser(categoryId: string, userId: string): Promise<boolean> {
  const r = await db.query('SELECT id FROM categories WHERE id = $1 AND user_id = $2', [categoryId, userId]);
  return r.rows.length > 0;
}

export async function handleListTransactions(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const month = event.queryStringParameters?.month;

  if (month !== undefined && !/^\d{4}-\d{2}$/.test(month)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'month must be in YYYY-MM format');
  }

  let sql: string;
  let params: unknown[];

  if (month) {
    // Filter to just the requested calendar month
    sql = `
      SELECT id, account_id, category_id, amount_cents, description, txn_date, source, created_at
      FROM transactions
      WHERE user_id = $1
        AND txn_date >= ($2 || '-01')::date
        AND txn_date <  (($2 || '-01')::date + INTERVAL '1 month')
      ORDER BY txn_date DESC, created_at DESC
    `;
    params = [userId, month];
  } else {
    sql = `
      SELECT id, account_id, category_id, amount_cents, description, txn_date, source, created_at
      FROM transactions
      WHERE user_id = $1
      ORDER BY txn_date DESC, created_at DESC
      LIMIT 500
    `;
    params = [userId];
  }

  const result = await db.query<TransactionRow>(sql, params);
  // Return amount_cents as a number (BIGINT arrives as string from pg)
  const rows = result.rows.map(r => ({ ...r, amount_cents: parseInt(r.amount_cents, 10) }));
  return jsonResponse(200, rows);
}

export async function handleCreateTransaction(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const body = parseBody(event.body);
  if (!body) return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');

  const { account_id, category_id, amount_cents, description, txn_date } = body;

  // --- Validate required fields ---
  if (!isValidUuid(account_id)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'account_id must be a valid UUID');
  }
  if (!Number.isInteger(amount_cents)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'amount_cents must be an integer (use negative for expenses)');
  }
  if (!isValidDate(txn_date)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'txn_date must be a valid date in YYYY-MM-DD format');
  }

  // --- Validate optional fields ---
  if (category_id !== undefined && category_id !== null && !isValidUuid(category_id)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'category_id must be a valid UUID or null');
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return errorResponse(400, 'VALIDATION_ERROR', 'description must be a string or null');
  }

  // --- Verify ownership of referenced records ---
  if (!(await accountBelongsToUser(account_id, userId))) {
    return errorResponse(404, 'NOT_FOUND', 'Account not found');
  }
  if (category_id && !(await categoryBelongsToUser(category_id as string, userId))) {
    return errorResponse(404, 'NOT_FOUND', 'Category not found');
  }

  const result = await db.query<TransactionRow>(
    `INSERT INTO transactions (user_id, account_id, category_id, amount_cents, description, txn_date, source)
     VALUES ($1, $2, $3, $4, $5, $6, 'manual')
     RETURNING id, account_id, category_id, amount_cents, description, txn_date, source, created_at`,
    [userId, account_id, category_id ?? null, amount_cents, description ?? null, txn_date]
  );

  const row = result.rows[0];
  return jsonResponse(201, { ...row, amount_cents: parseInt(row.amount_cents, 10) });
}

export async function handleUpdateTransaction(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const txnId = event.pathParameters?.id;
  if (!txnId) return errorResponse(400, 'MISSING_PARAM', 'Transaction ID is required');

  const body = parseBody(event.body);
  if (!body) return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');

  const { account_id, category_id, amount_cents, description, txn_date } = body;

  // Validate each field that was provided
  if (account_id !== undefined && !isValidUuid(account_id)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'account_id must be a valid UUID');
  }
  if (amount_cents !== undefined && !Number.isInteger(amount_cents)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'amount_cents must be an integer');
  }
  if (txn_date !== undefined && !isValidDate(txn_date)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'txn_date must be a valid date in YYYY-MM-DD format');
  }
  if (category_id !== undefined && category_id !== null && !isValidUuid(category_id)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'category_id must be a valid UUID or null');
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return errorResponse(400, 'VALIDATION_ERROR', 'description must be a string or null');
  }

  const hasUpdates = [account_id, category_id, amount_cents, description, txn_date].some(v => v !== undefined);
  if (!hasUpdates) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Provide at least one field to update');
  }

  // Verify ownership of referenced records
  if (account_id !== undefined && !(await accountBelongsToUser(account_id as string, userId))) {
    return errorResponse(404, 'NOT_FOUND', 'Account not found');
  }
  if (category_id !== undefined && category_id !== null && !(await categoryBelongsToUser(category_id as string, userId))) {
    return errorResponse(404, 'NOT_FOUND', 'Category not found');
  }

  // Build SET clause — only update fields that were explicitly included in the body
  const setClauses: string[] = [];
  const params: unknown[] = [userId, txnId];

  if (account_id !== undefined) {
    params.push(account_id);
    setClauses.push(`account_id = $${params.length}`);
  }
  // category_id and description can be explicitly set to null
  if ('category_id' in body) {
    params.push(category_id ?? null);
    setClauses.push(`category_id = $${params.length}`);
  }
  if (amount_cents !== undefined) {
    params.push(amount_cents);
    setClauses.push(`amount_cents = $${params.length}`);
  }
  if ('description' in body) {
    params.push(description ?? null);
    setClauses.push(`description = $${params.length}`);
  }
  if (txn_date !== undefined) {
    params.push(txn_date);
    setClauses.push(`txn_date = $${params.length}`);
  }

  const result = await db.query<TransactionRow>(
    `UPDATE transactions SET ${setClauses.join(', ')}
     WHERE user_id = $1 AND id = $2
     RETURNING id, account_id, category_id, amount_cents, description, txn_date, source, created_at`,
    params
  );

  if (result.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Transaction not found');
  const row = result.rows[0];
  return jsonResponse(200, { ...row, amount_cents: parseInt(row.amount_cents, 10) });
}

export async function handleDeleteTransaction(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const txnId = event.pathParameters?.id;
  if (!txnId) return errorResponse(400, 'MISSING_PARAM', 'Transaction ID is required');

  const result = await db.query(
    'DELETE FROM transactions WHERE user_id = $1 AND id = $2 RETURNING id',
    [userId, txnId]
  );

  if (result.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Transaction not found');
  return jsonResponse(200, { deleted: true });
}
