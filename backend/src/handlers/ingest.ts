import { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import * as db from '../db/client';
import { parseCSV } from '../utils/csv';

const s3 = new S3Client({});

export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key    = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log(`Ingest: processing s3://${bucket}/${key}`);

    // Key format: uploads/{userId}/{accountId}/{uuid}.csv — set server-side at presign time
    const parts = key.split('/');
    if (parts.length < 4 || parts[0] !== 'uploads') {
      console.error('Ingest: unexpected key format:', key);
      continue;
    }
    const userId    = parts[1];
    const accountId = parts[2];

    // Verify user and account still exist
    const userCheck = await db.query('SELECT id FROM users WHERE id=$1', [userId]);
    if (userCheck.rows.length === 0) { console.error('Ingest: unknown userId', userId); continue; }

    const accCheck = await db.query(
      'SELECT id FROM accounts WHERE id=$1 AND user_id=$2',
      [accountId, userId]
    );
    if (accCheck.rows.length === 0) { console.error('Ingest: account not found', accountId); continue; }

    // Fetch CSV from S3
    let csvText: string;
    try {
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      csvText = await res.Body!.transformToString();
    } catch (e) {
      console.error('Ingest: failed to read S3 object', e);
      continue;
    }

    const rows = parseCSV(csvText);
    console.log(`Ingest: parsed ${rows.length} row(s)`);

    let imported = 0, reconciled = 0, skipped = 0;

    for (const row of rows) {
      const { date, description, amount_cents } = row;

      // Stable dedup key — same row re-imported always produces same hash
      const external_ref = createHash('sha256')
        .update(`${userId}:${date}:${amount_cents}:${description}`)
        .digest('hex');

      // Already imported this exact row — skip
      const already = await db.query(
        'SELECT id FROM transactions WHERE user_id=$1 AND external_ref=$2',
        [userId, external_ref]
      );
      if (already.rows.length > 0) { skipped++; continue; }

      // Try to reconcile against an existing expected transaction:
      // same user, same amount, within ±3 days, not yet matched to a CSV row
      const match = await db.query<{ id: string }>(
        `SELECT id FROM transactions
         WHERE user_id=$1
           AND status='expected'
           AND amount_cents=$2
           AND ABS(txn_date - $3::date) <= 3
           AND external_ref IS NULL
         ORDER BY ABS(txn_date - $3::date) ASC
         LIMIT 1`,
        [userId, amount_cents, date]
      );

      if (match.rows.length > 0) {
        await db.query(
          `UPDATE transactions
           SET status='confirmed', source='csv', external_ref=$1, txn_date=$2, description=$3
           WHERE id=$4`,
          [external_ref, date, description, match.rows[0].id]
        );
        reconciled++;
      } else {
        try {
          await db.query(
            `INSERT INTO transactions
               (user_id, account_id, amount_cents, description, txn_date, source, status, external_ref)
             VALUES ($1, $2, $3, $4, $5, 'csv', 'confirmed', $6)`,
            [userId, accountId, amount_cents, description, date, external_ref]
          );
          imported++;
        } catch (e: unknown) {
          // UNIQUE constraint violation means this external_ref was just inserted concurrently — safe to skip
          const pg = e as { code?: string };
          if (pg.code !== '23505') console.error('Ingest: insert error:', e);
          else skipped++;
        }
      }
    }

    console.log(`Ingest: done — imported=${imported}, reconciled=${reconciled}, skipped=${skipped}`);
  }
};
