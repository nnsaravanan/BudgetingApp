import { useEffect, useState } from 'react';
import { exchangeCode } from '../auth';
import { getMe } from '../api';

export default function Callback() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) {
      setError('No authorization code found in URL.');
      return;
    }
    exchangeCode(code)
      .then(async (ok) => {
        if (!ok) throw new Error('Token exchange failed');
        // Ensure user row exists in Aurora before redirecting
        await getMe();
        window.location.href = '/';
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Authentication failed');
      });
  }, []);

  if (error) {
    return (
      <div className="login-container">
        <div className="login-card">
          <p className="error-text">{error}</p>
          <a href="/">Back to login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <p>Signing you in…</p>
      </div>
    </div>
  );
}
