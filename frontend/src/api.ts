import { getValidToken, clearTokens } from './auth';

const API_URL = import.meta.env.VITE_API_URL as string;

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidToken();
  if (!token) {
    clearTokens();
    window.location.href = '/';
    throw new Error('Not authenticated');
  }
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    const err = (data as { error?: { message?: string } }).error;
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }
  return data as T;
}

// ---------- Types ----------

export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'cash';
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  created_at: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  category_id: string | null;
  amount_cents: number;
  description: string | null;
  txn_date: string;
  source: string;
  status: 'manual' | 'expected' | 'confirmed';
  schedule_id: string | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  account_id: string;
  category_id: string | null;
  amount_cents: number;
  description: string;
  frequency: 'weekly' | 'monthly' | 'yearly';
  next_due: string;
  active: boolean;
  created_at: string;
}

export interface CategorySummary {
  category_id: string | null;
  category_name: string;
  category_kind: string | null;
  actual_cents: number;
  budget_cents: number | null;
}

export interface Summary {
  month: string;
  total_income_cents: number;
  total_expense_cents: number;
  net_cents: number;
  by_category: CategorySummary[];
}

// ---------- Me ----------

export async function getMe() {
  return json<{ id: string; email: string }>(await apiFetch('/me'));
}

// ---------- Accounts ----------

export async function listAccounts() {
  return json<Account[]>(await apiFetch('/accounts'));
}

export async function createAccount(name: string, type: string) {
  return json<Account>(await apiFetch('/accounts', {
    method: 'POST',
    body: JSON.stringify({ name, type }),
  }));
}

export async function updateAccount(id: string, fields: Partial<Pick<Account, 'name' | 'type'>>) {
  return json<Account>(await apiFetch(`/accounts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  }));
}

export async function deleteAccount(id: string) {
  return json<{ deleted: boolean }>(await apiFetch(`/accounts/${id}`, { method: 'DELETE' }));
}

// ---------- Categories ----------

export async function listCategories() {
  return json<Category[]>(await apiFetch('/categories'));
}

export async function createCategory(name: string, kind: string) {
  return json<Category>(await apiFetch('/categories', {
    method: 'POST',
    body: JSON.stringify({ name, kind }),
  }));
}

export async function updateCategory(id: string, fields: Partial<Pick<Category, 'name' | 'kind'>>) {
  return json<Category>(await apiFetch(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  }));
}

export async function deleteCategory(id: string) {
  return json<{ deleted: boolean }>(await apiFetch(`/categories/${id}`, { method: 'DELETE' }));
}

// ---------- Transactions ----------

export async function listTransactions(month?: string) {
  const qs = month ? `?month=${month}` : '';
  return json<Transaction[]>(await apiFetch(`/transactions${qs}`));
}

export async function createTransaction(fields: {
  account_id: string;
  category_id: string | null;
  amount_cents: number;
  description: string;
  txn_date: string;
}) {
  return json<Transaction>(await apiFetch('/transactions', {
    method: 'POST',
    body: JSON.stringify(fields),
  }));
}

export async function updateTransaction(id: string, fields: Partial<{
  account_id: string;
  category_id: string | null;
  amount_cents: number;
  description: string | null;
  txn_date: string;
}>) {
  return json<Transaction>(await apiFetch(`/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  }));
}

export async function deleteTransaction(id: string) {
  return json<{ deleted: boolean }>(await apiFetch(`/transactions/${id}`, { method: 'DELETE' }));
}

// ---------- Summary ----------

export async function getSummary(month: string) {
  return json<Summary>(await apiFetch(`/summary?month=${month}`));
}

// ---------- Schedules ----------

export async function listSchedules() {
  return json<Schedule[]>(await apiFetch('/schedules'));
}

export async function createSchedule(fields: {
  account_id: string;
  category_id: string | null;
  amount_cents: number;
  description: string;
  frequency: string;
  next_due: string;
}) {
  return json<Schedule>(await apiFetch('/schedules', { method: 'POST', body: JSON.stringify(fields) }));
}

export async function updateSchedule(id: string, fields: Partial<{
  amount_cents: number;
  description: string;
  frequency: string;
  next_due: string;
  active: boolean;
  category_id: string | null;
}>) {
  return json<Schedule>(await apiFetch(`/schedules/${id}`, { method: 'PUT', body: JSON.stringify(fields) }));
}

export async function deleteSchedule(id: string) {
  return json<{ deleted: boolean }>(await apiFetch(`/schedules/${id}`, { method: 'DELETE' }));
}

export async function generateExpected() {
  return json<{ created: number }>(await apiFetch('/schedules/generate', { method: 'POST' }));
}

// ---------- Uploads ----------

export async function getPresignedUrl(account_id: string) {
  return json<{ url: string; key: string; expires_in: number }>(
    await apiFetch('/uploads/presign', { method: 'POST', body: JSON.stringify({ account_id }) })
  );
}

// ---------- Budgets ----------

export async function upsertBudget(category_id: string, period: string, amount_cents: number) {
  return json<{ id: string; category_id: string; period: string; amount_cents: number }>(
    await apiFetch('/budgets', {
      method: 'PUT',
      body: JSON.stringify({ category_id, period, amount_cents }),
    })
  );
}

export async function deleteBudget(categoryId: string, period: string) {
  return json<{ deleted: boolean }>(
    await apiFetch(`/budgets/${categoryId}/${period}`, { method: 'DELETE' })
  );
}
