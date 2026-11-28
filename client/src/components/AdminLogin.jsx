import React, { useState } from 'react';
import { ArrowLeft, Lock, LogIn } from 'lucide-react';
import { useSiteConfig } from '../context/SiteConfigContext.jsx';
import ThemePicker from './ThemePicker.jsx';

export default function AdminLogin({ targetLabel = 'Panel Admin', onBackToPortal }) {
  const { config, loginAdmin } = useSiteConfig();
  const [username, setUsername] = useState(config.adminUsername || 'admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginAdmin(username, password);
    } catch (err) {
      setError(err.message || 'Username atau password salah');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-base-200 text-base-content flex flex-col">
      <header className="border-b border-base-300 bg-base-100">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            {onBackToPortal && (
              <button
                type="button"
                onClick={onBackToPortal}
                className="btn btn-sm btn-ghost border border-base-300 font-normal gap-1.5 shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Kembali</span>
              </button>
            )}
            <span className="truncate text-sm font-semibold">{targetLabel}</span>
          </div>
          <ThemePicker compact />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="card w-full max-w-sm border border-base-300 bg-base-100">
          <div className="card-body p-6 gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-base-content">Masuk Admin</h1>
                <p className="text-sm text-base-content/75">
                  Silakan login untuk mengelola data.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="form-control">
                <span className="label-text mb-1.5 text-sm font-semibold">Username</span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="input input-bordered h-11 w-full text-sm"
                  autoComplete="username"
                />
              </label>

              <label className="form-control">
                <span className="label-text mb-1.5 text-sm font-semibold">Password</span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className="input input-bordered h-11 w-full text-sm"
                  autoComplete="current-password"
                />
              </label>

              {error && (
                <div className="alert alert-error is-error py-2.5 text-sm font-medium text-error-content">
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-full h-11 min-h-11 gap-2 text-sm font-semibold"
              >
                {loading ? (
                  <span className="spinner !border-white/30 !border-t-white" aria-hidden="true" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                <span>{loading ? 'Memeriksa...' : 'Masuk'}</span>
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
