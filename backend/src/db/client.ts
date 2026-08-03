import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Pool, QueryResult, QueryResultRow } from 'pg';

let pool: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (pool) return pool;

  const sm = new SecretsManagerClient({});
  const { SecretString } = await sm.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN! })
  );

  const { username, password } = JSON.parse(SecretString!);

  pool = new Pool({
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME!,
    user: username,
    password,
    // Each Lambda instance is single-threaded; one connection is enough.
    // Keeping this at 1 limits total open connections as Lambda scales out.
    max: 1,
    idleTimeoutMillis: 120_000,
    // Aurora Serverless v2 at min 0 ACU can take 20-30s to resume from pause.
    connectionTimeoutMillis: 35_000,
  });

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const p = await getPool();
  return p.query<T>(sql, params);
}
