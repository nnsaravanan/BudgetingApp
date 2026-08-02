import { useEffect, useState } from 'react';
import { listAccounts, createAccount, updateAccount, deleteAccount, type Account } from '../api';
import Modal from '../components/Modal';

const TYPES = ['checking', 'savings', 'credit', 'cash'] as const;

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'create' | Account | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('checking');

  function openCreate() { setName(''); setType('checking'); setModal('create'); }
  function openEdit(a: Account) { setName(a.name); setType(a.type); setModal(a); }

  function load() {
    setLoading(true);
    listAccounts()
      .then(setAccounts)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleSave() {
    setSaving(true);
    try {
      if (modal === 'create') {
        const a = await createAccount(name, type);
        setAccounts(prev => [...prev, a]);
      } else if (modal) {
        const a = await updateAccount(modal.id, { name, type: type as Account['type'] });
        setAccounts(prev => prev.map(x => x.id === a.id ? a : x));
      }
      setModal(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this account? All transactions will also be deleted.')) return;
    try {
      await deleteAccount(id);
      setAccounts(prev => prev.filter(a => a.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Accounts</h2>
        <button className="btn-primary" onClick={openCreate}>+ Add account</button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && (
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr><td colSpan={4} className="muted">No accounts yet.</td></tr>
            )}
            {accounts.map(a => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td><span className="badge">{a.type}</span></td>
                <td className="muted">{a.created_at.slice(0, 10)}</td>
                <td className="actions">
                  <button className="btn-ghost" onClick={() => openEdit(a)}>Edit</button>
                  <button className="btn-danger-ghost" onClick={() => handleDelete(a.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal !== null && (
        <Modal title={modal === 'create' ? 'Add account' : 'Edit account'} onClose={() => setModal(null)}>
          <label>Name
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Chase Checking" />
          </label>
          <label>Type
            <select value={type} onChange={e => setType(e.target.value)}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
