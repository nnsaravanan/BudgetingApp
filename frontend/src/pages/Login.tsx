import { login } from '../auth';

export default function Login() {
  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Budgeting App</h1>
        <p>Track accounts, categories, and transactions.</p>
        <button className="btn-primary btn-lg" onClick={login}>
          Sign in
        </button>
      </div>
    </div>
  );
}
