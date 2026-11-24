import React, { useState } from 'react';
import { Check, KeyRound, X } from 'lucide-react';
import { useSiteConfig } from '../context/SiteConfigContext.jsx';

export default function ChangePasswordModal({ open, onClose }) {
  const { currentUser, changeOwnPassword } = useSiteConfig();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.trim().length < 4) {
      setError('Password baru minimal 4 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak sama.');
      return;
    }

    setSaving(true);
    try {
      const res = await changeOwnPassword(currentPassword, newPassword);
      setSuccess(res.message || 'Password berhasil diubah.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setSuccess('');
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Gagal mengganti password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box max-w-md border border-base-300 bg-base-100">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-base-content">Ganti Password Akun</h3>
              <p className="text-xs text-base-content/65">
                Akun: <strong>{currentUser?.username || 'admin'}</strong> (
                {currentUser?.role === 'viewer' ? 'Mode Read-Only' : 'Admin'})
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="form-control">
            <span className="label-text mb-1 text-xs font-semibold">Password Saat Ini</span>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Masukkan password lama..."
              className="input input-bordered input-sm w-full"
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1 text-xs font-semibold">Password Baru</span>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 4 karakter"
              className="input input-bordered input-sm w-full"
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1 text-xs font-semibold">Konfirmasi Password Baru</span>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password baru"
              className="input input-bordered input-sm w-full"
            />
          </label>

          {error && (
            <div className="alert alert-error py-2 text-xs">
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="alert alert-success py-2 text-xs">
              <Check className="h-4 w-4" />
              <span>{success}</span>
            </div>
          )}

          <div className="modal-action pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
              Batal
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary btn-sm gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan Password Baru'}
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
