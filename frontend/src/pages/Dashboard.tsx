import { useEffect, useRef, useState } from 'react';
import { getSummary, upsertBudget, deleteBudget, type Summary } from '../api';

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

interface EditingBudget {
  categoryId: string;
  current: number | null; // current budget_cents, null if not set
}

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<EditingBudget | null>(null);
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function load(m: string) {
    setLoading(true);
    setError(null);
    getSummary(m)
      .then(setSummary)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(month); }, [month]);

  function startEdit(categoryId: string, currentBudget: number | null) {
    setEditing({ categoryId, current: currentBudget });
    setInputVal(currentBudget !== null ? (currentBudget / 100).toFixed(2) : '');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEdit() {
    setEditing(null);
    setInputVal('');
  }

  async function commitEdit() {
    if (!editing) return;

    const dollars = parseFloat(inputVal);

    // Empty input = delete the budget
    if (inputVal.trim() === '' || isNaN(dollars) || dollars <= 0) {
      if (editing.current !== null) {
        try {
          await deleteBudget(editing.categoryId, month);
          load(month);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Failed to remove budget');
        }
      }
      cancelEdit();
      return;
    }

    const cents = Math.round(dollars * 100);
    try {
      await upsertBudget(editing.categoryId, month, cents);
      load(month);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save budget');
    }
    cancelEdit();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') cancelEdit();
  }

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

          <p className="muted budget-hint">Click any budget cell to set or edit it. Clear the value and press Enter to remove.</p>

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
                const variance = c.budget_cents !== null ? c.budget_cents - c.actual_cents : null;
                const isEditingThis = editing?.categoryId === c.category_id;

                return (
                  <tr key={c.category_id ?? 'uncategorized'}>
                    <td>{c.category_name}</td>
                    <td><span className={`badge ${c.category_kind ?? ''}`}>{c.category_kind ?? '—'}</span></td>
                    <td className="num">{fmt(c.actual_cents)}</td>
                    <td className="num budget-cell">
                      {/* Uncategorized and income rows can't have a budget */}
                      {c.category_id === null || c.category_kind === 'income' ? (
                        <span className="muted">—</span>
                      ) : isEditingThis ? (
                        <input
                          ref={inputRef}
                          className="budget-input"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={inputVal}
                          onChange={e => setInputVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={handleKeyDown}
                        />
                      ) : (
                        <button
                          className="budget-btn"
                          onClick={() => startEdit(c.category_id!, c.budget_cents)}
                          title="Click to set budget"
                        >
                          {c.budget_cents !== null ? fmt(c.budget_cents) : <span className="muted">+ Set</span>}
                        </button>
                      )}
                    </td>
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
