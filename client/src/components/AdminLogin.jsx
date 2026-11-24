import React, { useState } from 'react';
import { ArrowLeft, Lock, LogIn } from 'lucide-react';
import { useSiteConfig } from '../context/SiteConfigContext.jsx';
import ThemePicker from './ThemePicker.jsx';

export default function AdminLogin({ targetLabel = 'Admin Panel', onBackToPortal }) {
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
    <div className="prime-admin-shell min-h-screen bg-base-200 text-base-content flex flex-col">
      <header className="border-b border-base-300 bg-base-100">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            {onBackToPortal && (
              <button
                type="button"
                onClick={onBackToPortal}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-2.5 text-xs font-medium text-base-content hover:bg-base-200 shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Portal</span>
              </button>
            )}
            <span className="truncate text-sm font-semibold">{targetLabel}</span>
          </div>
          <ThemePicker compact />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-md border border-base-300 bg-base-100 p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-base-content">Login Admin</h1>
              <p className="text-xs text-base-content/65">
                Masuk untuk mengelola data &amp; laporan presensi.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-base-content/75">Username</span>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="h-9 w-full rounded-md border border-base-300 bg-base-100 px-3 text-sm text-base-content focus:border-emerald-600 focus:outline-none"
                autoComplete="username"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-base-content/75">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password..."
                className="h-9 w-full rounded-md border border-base-300 bg-base-100 px-3 text-sm text-base-content focus:border-emerald-600 focus:outline-none"
                autoComplete="current-password"
              />
            </label>

            {error && (
              <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{loading ? 'Memverifikasi...' : 'Masuk'}</span>
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
