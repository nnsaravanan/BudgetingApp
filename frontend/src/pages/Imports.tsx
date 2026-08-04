import { useEffect, useState } from 'react';
import { listAccounts, getPresignedUrl, type Account } from '../api';

type UploadStatus = 'idle' | 'presigning' | 'uploading' | 'done' | 'error';

export default function Imports() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    listAccounts()
      .then(accs => {
        setAccounts(accs);
        if (accs.length > 0) setAccountId(accs[0].id);
      })
      .catch(() => {});
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setStatus('idle');
    setError(null);
  }

  async function handleUpload() {
    if (!file || !accountId) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('File must be under 10 MB');
      return;
    }

    setError(null);
    setStatus('presigning');
    setProgress(0);

    let url: string;
    try {
      const presign = await getPresignedUrl(accountId);
      url = presign.url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to get upload URL');
      setStatus('error');
      return;
    }

    setStatus('uploading');

    // Upload directly to S3 with the pre-signed URL
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`S3 upload failed (HTTP ${xhr.status})`));
        });
        xhr.addEventListener('error', () => reject(new Error('Upload failed — check your network')));
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', 'text/csv');
        xhr.send(file);
      });

      setStatus('done');
      setFile(null);
      // Reset the file input
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      if (input) input.value = '';
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setStatus('error');
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Import CSV</h2>
      </div>

      <div className="import-card">
        <p className="muted import-intro">
          Upload a CSV export from your bank. The system will automatically match imported
          rows against any <strong>expected</strong> transactions from your schedules and
          promote them to <strong>confirmed</strong>. Unmatched rows are created as new confirmed
          transactions. Re-uploading the same file is safe — duplicates are ignored.
        </p>

        <div className="import-format">
          <p className="muted">Supported column formats:</p>
          <ul className="muted">
            <li><code>Date, Description, Amount</code> — amount negative for expenses</li>
            <li><code>Date, Description, Debit, Credit</code> — separate columns</li>
            <li><code>Transaction Date, Description, Amount</code> — Chase-style headers</li>
          </ul>
          <p className="muted">Date formats accepted: <code>YYYY-MM-DD</code> or <code>MM/DD/YYYY</code></p>
        </div>

        <div className="import-form">
          <label>Account to assign unmatched rows to
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              disabled={status === 'uploading' || status === 'presigning'}
            >
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          <label>CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={status === 'uploading' || status === 'presigning'}
            />
          </label>

          {file && (
            <p className="muted">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
          )}

          {error && <p className="error-text">{error}</p>}

          {status === 'uploading' && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}

          {status === 'done' && (
            <p className="import-success">
              Upload complete. Rows are being processed — check Transactions in a few seconds.
            </p>
          )}

          <button
            className="btn-primary btn-lg"
            onClick={handleUpload}
            disabled={!file || !accountId || status === 'uploading' || status === 'presigning'}
          >
            {status === 'presigning' ? 'Preparing…'
           : status === 'uploading' ? `Uploading ${progress}%…`
           : 'Upload CSV'}
          </button>
        </div>
      </div>
    </div>
  );
}
