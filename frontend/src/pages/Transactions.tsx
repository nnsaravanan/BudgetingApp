import { useEffect, useState } from 'react';
import {
  listTransactions, createTransaction, deleteTransaction,
  listAccounts, listCategories,
  type Transaction, type Account, type Category,
} from '../api';
import Modal from '../components/Modal';

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

export default function Transactions() {
  const [month, setMonth] = useState(currentMonth());
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [txnDate, setTxnDate] = useState(new Date().toISOString().slice(0, 10));
  const [isExpense, setIsExpense] = useState(true);

  useEffect(() => {
    Promise.all([listAccounts(), listCategories()])
      .then(([accs, cats]) => {
        setAccounts(accs);
        setCategories(cats);
        if (accs.length > 0) setAccountId(accs[0].id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    listTransactions(month)
      .then(setTxns)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [month]);

  function openCreate() {
    setAmountStr('');
    setDescription('');
    setTxnDate(new Date().toISOString().slice(0, 10));
    setIsExpense(true);
    setCategoryId('');
    setShowModal(true);
  }

  async function handleSave() {
    const dollars = parseFloat(amountStr);
    if (isNaN(dollars) || dollars <= 0) { setError('Enter a valid positive amount'); return; }
    const cents = Math.round(dollars * 100) * (isExpense ? -1 : 1);

    setSaving(true);
    try {
      const t = await createTransaction({
        account_id:  accountId,
        category_id: categoryId || null,
        amount_cents: cents,
        description,
        txn_date:    txnDate,
      });
      // Reload current month if the new txn falls in it
      if (t.txn_date.startsWith(month)) {
        setTxns(prev => [t, ...prev]);
      }
      setShowModal(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this transaction?')) return;
    try {
      await deleteTransaction(id);
      setTxns(prev => prev.filter(t => t.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

  return (
    <div className="page">
      <div className="page-header">
        <h2>Transactions</h2>
        <div className="header-right">
          <div className="month-nav">
            <button className="btn-ghost" onClick={() => setMonth(m => addMonths(m, -1))}>&#8592;</button>
            <span className="month-label">{month}</span>
            <button className="btn-ghost" onClick={() => setMonth(m => addMonths(m, 1))}>&#8594;</button>
          </div>
          <button className="btn-primary" onClick={openCreate} disabled={accounts.length === 0}>
            + Add transaction
          </button>
        </div>
      </div>

      {accounts.length === 0 && !loading && (
        <p className="muted">Create an account first before adding transactions.</p>
      )}
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && (
        <table className="table">
          <thead>
            <tr><th>Date</th><th>Description</th><th>Account</th><th>Category</th><th className="num">Amount</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {txns.length === 0 && (
              <tr><td colSpan={7} className="muted">No transactions for {month}.</td></tr>
            )}
            {txns.map(t => (
              <tr key={t.id} className={t.status === 'expected' ? 'row-expected' : ''}>
                <td className="muted">{t.txn_date.slice(0, 10)}</td>
                <td>{t.description ?? <span className="muted">—</span>}</td>
                <td className="muted">{accountMap[t.account_id] ?? t.account_id.slice(0, 8)}</td>
                <td>{t.category_id ? categoryMap[t.category_id] ?? '—' : <span className="muted">Uncategorized</span>}</td>
                <td className={`num ${t.amount_cents >= 0 ? 'income' : 'expense'}`}>{fmt(t.amount_cents)}</td>
                <td>
                  {t.status === 'expected'  && <span className="badge badge-expected">Expected</span>}
                  {t.status === 'confirmed' && <span className="badge badge-confirmed">Confirmed</span>}
                </td>
                <td className="actions">
                  <button className="btn-danger-ghost" onClick={() => handleDelete(t.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <Modal title="Add transaction" onClose={() => setShowModal(false)}>
          <label>Date
            <input type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} />
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
              <option value="expense">Expense (money out)</option>
              <option value="income">Income (money in)</option>
            </select>
          </label>
          <label>Amount ($)
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={amountStr}
              onChange={e => setAmountStr(e.target.value)}
            />
          </label>
          <label>Description
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
          </label>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !amountStr || !accountId}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
