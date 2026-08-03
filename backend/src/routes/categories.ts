import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import * as db from '../db/client';
import { jsonResponse, errorResponse } from '../utils/response';

const VALID_KINDS = ['income', 'expense'] as const;
type CategoryKind = typeof VALID_KINDS[number];

interface CategoryRow {
  id: string;
  name: string;
  kind: string;
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

export async function handleListCategories(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const result = await db.query<CategoryRow>(
    'SELECT id, name, kind, created_at FROM categories WHERE user_id = $1 ORDER BY kind, name',
    [userId]
  );
  return jsonResponse(200, result.rows);
}

export async function handleCreateCategory(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const body = parseBody(event.body);
  if (!body) return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');

  const { name, kind } = body;

  if (typeof name !== 'string' || name.trim() === '') {
    return errorResponse(400, 'VALIDATION_ERROR', 'name is required and must be a non-empty string');
  }
  if (!VALID_KINDS.includes(kind as CategoryKind)) {
    return errorResponse(400, 'VALIDATION_ERROR', `kind must be one of: ${VALID_KINDS.join(', ')}`);
  }

  try {
    const result = await db.query<CategoryRow>(
      'INSERT INTO categories (user_id, name, kind) VALUES ($1, $2, $3) RETURNING id, name, kind, created_at',
      [userId, name.trim(), kind]
    );
    return jsonResponse(201, result.rows[0]);
  } catch (err: unknown) {
    // UNIQUE (user_id, name) violation
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return errorResponse(409, 'CONFLICT', `A category named "${name.trim()}" already exists`);
    }
    throw err;
  }
}

export async function handleUpdateCategory(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const categoryId = event.pathParameters?.id;
  if (!categoryId) return errorResponse(400, 'MISSING_PARAM', 'Category ID is required');

  const body = parseBody(event.body);
  if (!body) return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');

  const { name, kind } = body;

  if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
    return errorResponse(400, 'VALIDATION_ERROR', 'name must be a non-empty string');
  }
  if (kind !== undefined && !VALID_KINDS.includes(kind as CategoryKind)) {
    return errorResponse(400, 'VALIDATION_ERROR', `kind must be one of: ${VALID_KINDS.join(', ')}`);
  }
  if (name === undefined && kind === undefined) {
    return errorResponse(400, 'VALIDATION_ERROR', 'Provide at least one of: name, kind');
  }

  const setClauses: string[] = [];
  const params: unknown[] = [userId, categoryId];

  if (name !== undefined) {
    params.push((name as string).trim());
    setClauses.push(`name = $${params.length}`);
  }
  if (kind !== undefined) {
    params.push(kind);
    setClauses.push(`kind = $${params.length}`);
  }

  try {
    const result = await db.query<CategoryRow>(
      `UPDATE categories SET ${setClauses.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING id, name, kind, created_at`,
      params
    );
    if (result.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Category not found');
    return jsonResponse(200, result.rows[0]);
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return errorResponse(409, 'CONFLICT', `A category named "${(name as string).trim()}" already exists`);
    }
    throw err;
  }
}

export async function handleDeleteCategory(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first to create your profile');

  const categoryId = event.pathParameters?.id;
  if (!categoryId) return errorResponse(400, 'MISSING_PARAM', 'Category ID is required');

  const result = await db.query(
    'DELETE FROM categories WHERE user_id = $1 AND id = $2 RETURNING id',
    [userId, categoryId]
  );

  if (result.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Category not found');
  return jsonResponse(200, { deleted: true });
}
