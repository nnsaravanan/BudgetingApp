import * as db from '../db/client';

interface ScheduleRow {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  amount_cents: string;
  description: string;
  frequency: string;
  next_due: string;
}

// EventBridge-triggered daily. Generates 'expected' transactions for all active
// schedules due today or earlier, then advances each schedule's next_due.
export const handler = async (): Promise<void> => {
  console.log('Scheduler: checking for due schedules...');

  const due = await db.query<ScheduleRow>(
    `SELECT * FROM schedules WHERE active = true AND next_due <= CURRENT_DATE`
  );

  console.log(`Scheduler: found ${due.rows.length} due schedule(s)`);

  for (const s of due.rows) {
    // Idempotent insert: skip if an expected transaction for this schedule+date already exists
    const inserted = await db.query(
      `INSERT INTO transactions
         (user_id, account_id, category_id, amount_cents, description, txn_date, source, status, schedule_id)
       SELECT $1, $2, $3, $4, $5, $6, 'scheduled', 'expected', $7
       WHERE NOT EXISTS (
         SELECT 1 FROM transactions
         WHERE schedule_id = $7 AND txn_date = $6 AND status = 'expected'
       )`,
      [s.user_id, s.account_id, s.category_id, s.amount_cents, s.description, s.next_due, s.id]
    );

    if (inserted.rowCount && inserted.rowCount > 0) {
      console.log(`Scheduler: created expected transaction for schedule ${s.id} (${s.description}, ${s.next_due})`);
    }

    const interval = s.frequency === 'weekly'  ? '7 days'
                   : s.frequency === 'monthly' ? '1 month'
                   : '1 year';

    await db.query(
      `UPDATE schedules SET next_due = next_due + $1::interval WHERE id = $2`,
      [interval, s.id]
    );
  }

  console.log('Scheduler: done');
};
