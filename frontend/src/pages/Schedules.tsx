import { useEffect, useState } from 'react';
import {
  listSchedules, createSchedule, updateSchedule, deleteSchedule, generateExpected,
  listAccounts, listCategories,
  type Schedule, type Account, type Category,
} from '../api';
import Modal from '../components/Modal';

function fmt(cents: number) {
  return (Math.abs(cents) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export default function Schedules() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);

  // Form state
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [nextDue, setNextDue] = useState(new Date().toISOString().slice(0, 10));
  const [isExpense, setIsExpense] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([listSchedules(), listAccounts(), listCategories()])
      .then(([scheds, accs, cats]) => {
        setSchedules(scheds);
        setAccounts(accs);
        setCategories(cats);
        if (accs.length > 0 && !accountId) setAccountId(accs[0].id);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setAmountStr('');
    setDescription('');
    setFrequency('monthly');
    setNextDue(new Date().toISOString().slice(0, 10));
    setIsExpense(true);
    setCategoryId('');
    if (accounts.length > 0) setAccountId(accounts[0].id);
    setShowModal(true);
  }

  function openEdit(s: Schedule) {
    setEditing(s);
    const abs = Math.abs(s.amount_cents) / 100;
    setAmountStr(abs.toFixed(2));
    setIsExpense(s.amount_cents < 0);
    setDescription(s.description);
    setFrequency(s.frequency);
    setNextDue(s.next_due.slice(0, 10));
    setAccountId(s.account_id);
    setCategoryId(s.category_id ?? '');
    setShowModal(true);
  }

  async function handleSave() {
    const dollars = parseFloat(amountStr);
    if (isNaN(dollars) || dollars <= 0) { setError('Enter a valid positive amount'); return; }
    const cents = Math.round(dollars * 100) * (isExpense ? -1 : 1);

    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const updated = await updateSchedule(editing.id, {
          account_id: accountId,
          category_id: categoryId || null,
          amount_cents: cents,
          description,
          frequency,
          next_due: nextDue,
        } as Parameters<typeof updateSchedule>[1]);
        setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s));
      } else {
        const created = await createSchedule({
          account_id: accountId,
          category_id: categoryId || null,
          amount_cents: cents,
          description,
          frequency,
          next_due: nextDue,
        });
        setSchedules(prev => [...prev, created]);
      }
      setShowModal(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(s: Schedule) {
    try {
      const updated = await updateSchedule(s.id, { active: !s.active });
      setSchedules(prev => prev.map(x => x.id === updated.id ? updated : x));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this schedule? Existing expected transactions will remain.')) return;
    try {
      await deleteSchedule(id);
      setSchedules(prev => prev.filter(s => s.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const { created } = await generateExpected();
      alert(`Generated ${created} expected transaction(s). Reload Transactions to see them.`);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  const accountMap  = Object.fromEntries(accounts.map(a => [a.id, a.name]));
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

  return (
    <div className="page">
      <div className="page-header">
        <h2>Recurring Schedules</h2>
        <div className="header-right">
          <button className="btn-ghost" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate due now'}
          </button>
          <button className="btn-primary" onClick={openCreate} disabled={accounts.length === 0}>
            + Add schedule
          </button>
        </div>
      </div>

      {accounts.length === 0 && !loading && (
        <p className="muted">Create an account first before adding schedules.</p>
      )}
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      <p className="muted schedule-hint">
        Active schedules automatically generate <strong>expected</strong> transactions each day.
        When you import a bank CSV, matching rows reconcile to <strong>confirmed</strong>.
      </p>

      {!loading && (
        <table className="table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Account</th>
              <th>Category</th>
              <th>Frequency</th>
              <th>Next Due</th>
              <th className="num">Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {schedules.length === 0 && (
              <tr><td colSpan={8} className="muted">No schedules yet.</td></tr>
            )}
            {schedules.map(s => (
              <tr key={s.id} className={s.active ? '' : 'row-inactive'}>
                <td>{s.description}</td>
                <td className="muted">{accountMap[s.account_id] ?? '—'}</td>
                <td className="muted">{s.category_id ? categoryMap[s.category_id] ?? '—' : <span className="muted">Uncategorized</span>}</td>
                <td>{FREQ_LABELS[s.frequency]}</td>
                <td className="muted">{s.next_due.slice(0, 10)}</td>
                <td className={`num ${s.amount_cents >= 0 ? 'income' : 'expense'}`}>
                  {s.amount_cents < 0 ? '-' : '+'}{fmt(s.amount_cents)}
                </td>
                <td>
                  <span className={`badge ${s.active ? 'badge-active' : 'badge-paused'}`}>
                    {s.active ? 'Active' : 'Paused'}
                  </span>
                </td>
                <td className="actions">
                  <button className="btn-ghost" onClick={() => openEdit(s)}>Edit</button>
                  <button className="btn-ghost" onClick={() => handleToggleActive(s)}>
                    {s.active ? 'Pause' : 'Resume'}
                  </button>
                  <button className="btn-danger-ghost" onClick={() => handleDelete(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit schedule' : 'New schedule'} onClose={() => setShowModal(false)}>
          <label>Description
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Netflix, Salary" />
          </label>
          <label>Account
            <select value={accountId} onChange={e => setAccountId(e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label>Category
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">— Uncategorized —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}
            </select>
          </label>
          <label>Type
            <select value={isExpense ? 'expense' : 'income'} onChange={e => setIsExpense(e.target.value === 'expense')}>
              <option value="expense">Expense (subscription, bill)</option>
              <option value="income">Income (salary, rental)</option>
            </select>
          </label>
          <label>Amount ($)
            <input type="number" min="0.01" step="0.01" placeholder="0.00" value={amountStr} onChange={e => setAmountStr(e.target.value)} />
          </label>
          <label>Frequency
            <select value={frequency} onChange={e => setFrequency(e.target.value as typeof frequency)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label>Next due date
            <input type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} />
          </label>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !amountStr || !accountId || !description}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
