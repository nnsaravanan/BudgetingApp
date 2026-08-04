import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import * as db from '../db/client';
import { jsonResponse, errorResponse } from '../utils/response';

const s3 = new S3Client({});
const BUCKET = process.env.UPLOAD_BUCKET ?? '';

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

// POST /uploads/presign
// Body: { account_id: string }
// Returns: { url: string, key: string, expires_in: number }
export async function handlePresign(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const userId = await resolveUserId(getCognitoSub(event));
  if (!userId) return errorResponse(404, 'USER_NOT_FOUND', 'Call GET /me first');

  const body = parseBody(event.body);
  if (!body) return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');

  const { account_id } = body;
  if (typeof account_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(account_id))
    return errorResponse(400, 'VALIDATION_ERROR', 'account_id must be a valid UUID');

  // Verify account belongs to this user — userId comes from JWT, not client
  const accCheck = await db.query('SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [account_id, userId]);
  if (accCheck.rows.length === 0) return errorResponse(404, 'NOT_FOUND', 'Account not found');

  // Key bakes in userId (server-set) and accountId so the Ingest Lambda can read both
  const key = `uploads/${userId}/${account_id}/${randomUUID()}.csv`;
  const expiresIn = 300; // 5 minutes

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: 'text/csv',
  });

  const url = await getSignedUrl(s3, command, { expiresIn });
  return jsonResponse(200, { url, key, expires_in: expiresIn });
}
