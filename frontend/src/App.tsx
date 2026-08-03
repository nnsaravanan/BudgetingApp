import { useEffect, useState } from 'react';
import { isAuthenticated, getValidToken } from './auth';
import { getMe } from './api';
import Login from './pages/Login';
import Callback from './pages/Callback';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Categories from './pages/Categories';
import Transactions from './pages/Transactions';
import Nav from './components/Nav';

type Page = 'dashboard' | 'accounts' | 'categories' | 'transactions';

export default function App() {
  const path = window.location.pathname;

  // Handle OAuth callback at /callback
  if (path === '/callback') return <Callback />;

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [page, setPage] = useState<Page>('dashboard');

  useEffect(() => {
    if (!isAuthenticated()) { setAuthed(false); return; }
    getValidToken()
      .then(token => {
        if (!token) { setAuthed(false); return; }
        return getMe();
      })
      .then(user => {
        if (user) { setEmail(user.email); setAuthed(true); }
      })
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return <div className="login-container"><p className="muted">Loading…</p></div>;
  if (!authed) return <Login />;

  return (
    <>
      <Nav page={page} onNav={setPage} email={email} />
      <main>
        {page === 'dashboard'    && <Dashboard />}
        {page === 'accounts'     && <Accounts />}
        {page === 'categories'   && <Categories />}
        {page === 'transactions' && <Transactions />}
      </main>
    </>
  );
}
