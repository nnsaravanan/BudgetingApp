import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import * as db from '../db/client';
import { jsonResponse } from '../utils/response';

interface UserRow {
  id: string;
  email: string;
  created_at: Date;
}

/**
 * GET /me
 *
 * Returns the current user's profile. Creates the user record on first login
 * (the JWT claims are the source of truth — we never take userId from the request).
 */
export async function handleGetMe(
  event: APIGatewayProxyEventV2WithJWTAuthorizer
): Promise<APIGatewayProxyResultV2> {
  const claims = event.requestContext.authorizer.jwt.claims;
  const cognitoSub = claims['sub'] as string;
  const email = (claims['email'] as string | undefined) ?? '';

  const result = await db.query<UserRow>(
    `INSERT INTO users (cognito_sub, email)
     VALUES ($1, $2)
     ON CONFLICT (cognito_sub) DO UPDATE SET email = EXCLUDED.email
     RETURNING id, email, created_at`,
    [cognitoSub, email]
  );

  const user = result.rows[0];
  return jsonResponse(200, { id: user.id, email: user.email, created_at: user.created_at });
}
