import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import * as db from '../db/client';
import { jsonResponse, errorResponse } from '../utils/response';

const VALID_TYPES = ['checking', 'savings', 'credit', 'cash'] as const;
type AccountType = typeof VALID_TYPES[number];

interface AccountRow {
  id: string;
  name: string;
  type: string;
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

export async function handleListAccounts(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const result = await db.query<AccountRow>(
    'SELECT id, name, type, created_at FROM accounts WHERE user_id = $1 ORDER BY created_at',
    [userId]
  );
  return jsonResponse(200, result.rows);
}

export async function handleCreateAccount(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const body = parseBody(event.body);
  if (!body) return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');

  const { name, type } = body;

  if (typeof name !== 'string' || name.trim() === '') {
    return errorResponse(400, 'VALIDATION_ERROR', 'name is required and must be a non-empty string');
  }
  if (!VALID_TYPES.includes(type as AccountType)) {
    return errorResponse(400, 'VALIDATION_ERROR', `type must be one of: ${VALID_TYPES.join(', ')}`);
  }

  const result = await db.query<AccountRow>(
    'INSERT INTO accounts (user_id, name, type) VALUES ($1, $2, $3) RETURNING id, name, type, created_at',
    [userId, name.trim(), type]
  );
  return jsonResponse(201, result.rows[0]);
}

export async function handleUpdateAccount(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const accountId = event.pathParameters?.id;
  if (!accountId) return errorResponse(400, 'MISSING_PARAM', 'Account ID is required');

  const body = parseBody(event.body);
  if (!body) return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');

  const { name, type } = body;

  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    return errorResponse(400, 'VALIDATION_ERROR', 'name must be a non-empty string');
  }
  if (type !== undefined && !VALID_TYPES.includes(type as AccountType)) {
    return errorResponse(400, 'VALIDATION_ERROR', `type must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (name === undefined && type === undefined) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Provide at least one of: name, type');
  }

  // Field names are hardcoded (not from user input) — only values are parameterized.
  const setClauses: string[] = [];
  const params: unknown[] = [userId, accountId];

  if (name !== undefined) {
    params.push((name as string).trim());
    setClauses.push(`name = $${params.length}`);
  }
  if (type !== undefined) {
    params.push(type);
    setClauses.push(`type = $${params.length}`);
  }

  const result = await db.query<AccountRow>(
    `UPDATE accounts SET ${setClauses.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING id, name, type, created_at`,
    params
  );

  if (result.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Account not found');
  return jsonResponse(200, result.rows[0]);
}

export async function handleDeleteAccount(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const accountId = event.pathParameters?.id;
  if (!accountId) return errorResponse(400, 'MISSING_PARAM', 'Account ID is required');

  const result = await db.query(
    'DELETE FROM accounts WHERE user_id = $1 AND id = $2 RETURNING id',
    [userId, accountId]
  );

  if (result.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Account not found');
  return jsonResponse(200, { deleted: true });
}
