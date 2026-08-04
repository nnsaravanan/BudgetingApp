export interface CsvRow {
  date: string;        // YYYY-MM-DD
  description: string;
  amount_cents: number; // negative = expense, positive = income
  row_type?: string;   // raw value from a Type/TransactionType column, if present
}

// Minimal RFC 4180-compatible CSV parser (handles quoted fields).
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let val = '';
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      fields.push(val.trim());
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { fields.push(line.slice(i).trim()); break; }
      fields.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  return fields;
}

function parseDate(raw: string): string | null {
  raw = raw.trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // MM/DD/YYYY or MM/DD/YY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${year}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }
  return null;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.round(n * 100);
}

// Normalize header names to canonical keys.
function headerKey(h: string): string {
  return h.toLowerCase().replace(/[^a-z]/g, '');
}

const DATE_KEYS   = new Set(['date','transactiondate','posteddate','postdate']);
const DESC_KEYS   = new Set(['description','merchant','name','memo','narration']);
const AMT_KEYS    = new Set(['amount','transactionamount','amt']);
const DEBIT_KEYS  = new Set(['debit','withdrawal','debitamount']);
const CREDIT_KEYS = new Set(['credit','deposit','creditamount']);
const TYPE_KEYS   = new Set(['type','transactiontype','txntype']);

export function parseCSV(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]).map(headerKey);
  const idx = (keys: Set<string>) => headers.findIndex(h => keys.has(h));

  const dateIdx   = idx(DATE_KEYS);
  const descIdx   = idx(DESC_KEYS);
  const amtIdx    = idx(AMT_KEYS);
  const debitIdx  = idx(DEBIT_KEYS);
  const creditIdx = idx(CREDIT_KEYS);
  const typeIdx   = idx(TYPE_KEYS);

  if (dateIdx === -1 || descIdx === -1) {
    console.error('CSV missing required date or description column. Headers:', headers);
    return [];
  }
  if (amtIdx === -1 && (debitIdx === -1 || creditIdx === -1)) {
    console.error('CSV missing amount column(s). Headers:', headers);
    return [];
  }

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    if (fields.length < 2) continue;

    const rawDate = fields[dateIdx] ?? '';
    const rawDesc = fields[descIdx] ?? '';

    const date = parseDate(rawDate);
    if (!date) { console.warn(`Row ${i}: unparseable date "${rawDate}" — skipped`); continue; }

    let amount_cents: number | null = null;

    if (amtIdx !== -1) {
      amount_cents = parseAmount(fields[amtIdx] ?? '');
    } else {
      // Separate debit / credit columns — debit is money out (negative)
      const debit  = debitIdx  !== -1 ? parseAmount(fields[debitIdx]  ?? '') : null;
      const credit = creditIdx !== -1 ? parseAmount(fields[creditIdx] ?? '') : null;
      if (debit  && debit  !== 0) amount_cents = -Math.abs(debit);
      if (credit && credit !== 0) amount_cents = Math.abs(credit);
    }

    if (amount_cents === null || amount_cents === 0) {
      console.warn(`Row ${i}: unparseable amount — skipped`);
      continue;
    }

    const row_type = typeIdx !== -1 ? (fields[typeIdx] ?? '').trim() : undefined;
    rows.push({ date, description: rawDesc, amount_cents, row_type });
  }

  return rows;
}
