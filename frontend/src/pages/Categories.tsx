import { useEffect, useState } from 'react';
import { listCategories, createCategory, updateCategory, deleteCategory, type Category } from '../api';
import Modal from '../components/Modal';

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'create' | Category | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [kind, setKind] = useState<'income' | 'expense'>('expense');

  function openCreate() { setName(''); setKind('expense'); setModal('create'); }
  function openEdit(c: Category) { setName(c.name); setKind(c.kind); setModal(c); }

  function load() {
    setLoading(true);
    listCategories()
      .then(setCategories)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleSave() {
    setSaving(true);
    try {
      if (modal === 'create') {
        const c = await createCategory(name, kind);
        setCategories(prev => [...prev, c]);
      } else if (modal) {
        const c = await updateCategory(modal.id, { name, kind });
        setCategories(prev => prev.map(x => x.id === c.id ? c : x));
      }
      setModal(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this category?')) return;
    try {
      await deleteCategory(id);
      setCategories(prev => prev.filter(c => c.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Categories</h2>
        <button className="btn-primary" onClick={openCreate}>+ Add category</button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">Loading…</p>}

      {!loading && (
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Kind</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr><td colSpan={4} className="muted">No categories yet.</td></tr>
            )}
            {categories.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td><span className={`badge ${c.kind}`}>{c.kind}</span></td>
                <td className="muted">{c.created_at.slice(0, 10)}</td>
                <td className="actions">
                  <button className="btn-ghost" onClick={() => openEdit(c)}>Edit</button>
                  <button className="btn-danger-ghost" onClick={() => handleDelete(c.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal !== null && (
        <Modal title={modal === 'create' ? 'Add category' : 'Edit category'} onClose={() => setModal(null)}>
          <label>Name
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Groceries" />
          </label>
          <label>Kind
            <select value={kind} onChange={e => setKind(e.target.value as 'income' | 'expense')}>
              <option value="expense">expense</option>
              <option value="income">income</option>
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
