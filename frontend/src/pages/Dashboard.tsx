import { useEffect, useState } from 'react';
import { getSummary, type Summary } from '../api';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getSummary(month)
      .then(setSummary)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [month]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Monthly Summary</h2>
        <div className="month-nav">
          <button className="btn-ghost" onClick={() => setMonth(m => addMonths(m, -1))}>&#8592;</button>
          <span className="month-label">{month}</span>
          <button className="btn-ghost" onClick={() => setMonth(m => addMonths(m, 1))}>&#8594;</button>
        </div>
      </div>

      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error-text">{error}</p>}

      {summary && (
        <>
          <div className="stat-row">
            <div className="stat-card">
              <span className="stat-label">Income</span>
              <span className="stat-value income">{fmt(summary.total_income_cents)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Expenses</span>
              <span className="stat-value expense">{fmt(summary.total_expense_cents)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Net</span>
              <span className={`stat-value ${summary.net_cents >= 0 ? 'income' : 'expense'}`}>
                {fmt(summary.net_cents)}
              </span>
            </div>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Kind</th>
                <th className="num">Actual</th>
                <th className="num">Budget</th>
                <th className="num">Variance</th>
              </tr>
            </thead>
            <tbody>
              {summary.by_category.map(c => {
                const variance = c.budget_cents !== null ? c.actual_cents - c.budget_cents : null;
                return (
                  <tr key={c.category_id ?? 'uncategorized'}>
                    <td>{c.category_name}</td>
                    <td><span className={`badge ${c.category_kind ?? ''}`}>{c.category_kind ?? '—'}</span></td>
                    <td className="num">{fmt(c.actual_cents)}</td>
                    <td className="num">{c.budget_cents !== null ? fmt(c.budget_cents) : '—'}</td>
                    <td className={`num ${variance !== null ? (variance >= 0 ? 'income' : 'expense') : ''}`}>
                      {variance !== null ? fmt(variance) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
