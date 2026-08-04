import { logout } from '../auth';
import type { Page } from '../App';

interface Props {
  page: Page;
  onNav: (p: Page) => void;
  email: string;
}

const links: { id: Page; label: string }[] = [
  { id: 'dashboard',    label: 'Summary' },
  { id: 'accounts',     label: 'Accounts' },
  { id: 'categories',   label: 'Categories' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'schedules',    label: 'Schedules' },
  { id: 'imports',      label: 'Import CSV' },
];

export default function Nav({ page, onNav, email }: Props) {
  return (
    <nav className="nav">
      <span className="nav-brand">Budget</span>
      <div className="nav-links">
        {links.map(l => (
          <button
            key={l.id}
            className={`nav-link ${page === l.id ? 'active' : ''}`}
            onClick={() => onNav(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="nav-right">
        <span className="nav-email">{email}</span>
        <button className="btn-ghost" onClick={logout}>Sign out</button>
      </div>
    </nav>
  );
}
