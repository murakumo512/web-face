import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  Megaphone,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useSiteConfig } from '../context/SiteConfigContext.jsx';

const EMPTY_FORM = {
  id: '',
  target: 'portal',
  layout: 'info',
  badge: 'INFO TERBARU',
  title: '',
  body: '',
  items: [{ label: '', value: '' }],
  ctaLabel: '',
  ctaUrl: '',
  visible: true,
};

/**
 * Renders dynamic CMS sections cleanly for public or workspace pages.
 * Builder controls (`+ Add Section`, edit, reorder, delete) are strictly hidden unless `canManage` is true (inside cPanel / Admin).
 */
export default function DynamicSections({
  target = 'portal',
  showAllTargets = false,
  canManage = false,
  onNavigate,
}) {
  const { config, addSection, updateSection, deleteSection, moveSection } = useSiteConfig();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, target });

  const allSections = [...(config.customSections || [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );
  const visibleSections = allSections.filter((sec) => {
    const matchTarget = showAllTargets ? true : sec.target === target;
    return matchTarget && (canManage || sec.visible !== false);
  });

  const openNewModal = () => {
    setForm({
      ...EMPTY_FORM,
      target,
      items: [{ label: 'Keterangan', value: 'Detail di sini' }],
    });
    setModalOpen(true);
  };

  const openEditModal = (sec) => {
    setForm({
      id: sec.id,
      target: sec.target || target,
      layout: sec.layout || 'info',
      badge: sec.badge || '',
      title: sec.title || '',
      body: sec.body || '',
      items: Array.isArray(sec.items) && sec.items.length > 0 ? sec.items : [{ label: '', value: '' }],
      ctaLabel: sec.ctaLabel || '',
      ctaUrl: sec.ctaUrl || '',
      visible: sec.visible !== false,
    });
    setModalOpen(true);
  };

  const handleItemChange = (idx, field, val) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? { ...it, [field]: val } : it)),
    }));
  };

  const handleSaveSection = async (e) => {
    e.preventDefault();
    const cleanedItems = (form.items || []).filter(
      (it) => (it.label && it.label.trim()) || (it.value && it.value.trim())
    );
    const payload = {
      ...form,
      title: form.title.trim() || 'Section Baru',
      items: cleanedItems,
    };
    if (form.id) {
      await updateSection(form.id, payload);
    } else {
      await addSection(payload);
    }
    setModalOpen(false);
  };

  const handleCtaClick = (url) => {
    if (!url) return;
    if (url.startsWith('/') && onNavigate) {
      onNavigate(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  if (visibleSections.length === 0 && !canManage) {
    return null;
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
          <div>
            <h3 className="text-sm font-bold text-base-content">
              Kelola Section Tambahan ({visibleSections.length})
            </h3>
            <p className="text-xs text-base-content/65">
              Tambahkan kartu jadwal ibadah, pengumuman, target jemaat, atau panduan ke Portal (/), Ruang Gereja, maupun Mode Piloting.
            </p>
          </div>
          <button type="button" onClick={openNewModal} className="btn btn-primary btn-sm gap-1.5">
            <Plus className="h-4 w-4" />
            Add Section
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {visibleSections.map((sec) => {
          const isHidden = sec.visible === false;
          const cardSpan =
            sec.layout === 'announcement' || visibleSections.length === 1 ? 'md:col-span-2' : '';

          return (
            <section
              key={sec.id}
              className={`card border border-base-300 bg-base-100 shadow-sm ${cardSpan} ${
                isHidden ? 'opacity-60 border-dashed border-warning' : ''
              }`}
            >
              <div className="card-body gap-3 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {sec.badge && (
                        <span
                          className={`badge badge-sm font-bold uppercase tracking-wider ${
                            sec.layout === 'announcement'
                              ? 'badge-warning'
                              : sec.layout === 'stats'
                                ? 'badge-secondary'
                                : 'badge-primary badge-outline'
                          }`}
                        >
                          {sec.badge}
                        </span>
                      )}
                      {canManage && (
                        <span className="badge badge-ghost badge-xs uppercase">
                          Halaman: {sec.target}
                        </span>
                      )}
                    </div>
                    <h3 className="card-title text-base sm:text-lg font-bold text-base-content">
                      {sec.layout === 'announcement' && <Megaphone className="h-4 w-4 text-warning shrink-0" />}
                      <span>{sec.title}</span>
                    </h3>
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveSection(sec.id, -1)}
                        className="btn btn-ghost btn-xs"
                        title="Geser Naik"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(sec.id, 1)}
                        className="btn btn-ghost btn-xs"
                        title="Geser Turun"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSection(sec.id, { visible: isHidden })}
                        className="btn btn-ghost btn-xs"
                        title={isHidden ? 'Tampilkan' : 'Sembunyikan'}
                      >
                        {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(sec)}
                        className="btn btn-ghost btn-xs text-primary"
                        title="Edit Section"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSection(sec.id)}
                        className="btn btn-ghost btn-xs text-error"
                        title="Hapus Section"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {sec.body && (
                  <p className="text-sm leading-relaxed text-base-content/75 whitespace-pre-line">
                    {sec.body}
                  </p>
                )}

                {Array.isArray(sec.items) && sec.items.length > 0 && (
                  sec.layout === 'stats' ? (
                    <div className="stats stats-vertical sm:stats-horizontal border border-base-300 bg-base-200">
                      {sec.items.map((it, idx) => (
                        <div key={idx} className="stat px-4 py-3">
                          <div className="stat-title text-xs">{it.label}</div>
                          <div className="stat-value text-lg sm:text-xl text-primary">{it.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ul className="divide-y divide-base-300 rounded-box border border-base-300 bg-base-200/50 px-4 py-1 text-xs sm:text-sm">
                      {sec.items.map((it, idx) => (
                        <li key={idx} className="flex items-center justify-between gap-3 py-2.5">
                          <span className="flex items-center gap-2 font-medium text-base-content">
                            {sec.layout === 'checklist' && (
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-secondary" />
                            )}
                            {it.label}
                          </span>
                          {it.value && (
                            <span className="text-right font-semibold text-base-content/75">
                              {it.value}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )
                )}

                {sec.ctaLabel && (
                  <div className="card-actions justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => handleCtaClick(sec.ctaUrl)}
                      className="btn btn-primary btn-sm gap-1.5"
                    >
                      {sec.ctaLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Add / Edit Section Modal */}
      {canManage && modalOpen && (
        <div className="modal modal-open z-50">
          <div className="modal-box max-w-xl border border-base-300 bg-base-100">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-base-content">
                {form.id ? 'Edit Section' : 'Tambah Section Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn btn-ghost btn-sm btn-circle"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSection} className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="form-control">
                  <span className="label-text mb-1 text-xs font-semibold">Tampilkan Di Halaman</span>
                  <select
                    value={form.target}
                    onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                    className="select select-bordered select-sm w-full"
                  >
                    <option value="portal">Portal Utama (/)</option>
                    <option value="gereja">Ruang Gereja (/gereja/admin)</option>
                    <option value="piloting">Mode Piloting (/piloting/admin)</option>
                  </select>
                </label>

                <label className="form-control">
                  <span className="label-text mb-1 text-xs font-semibold">Model Tampilan</span>
                  <select
                    value={form.layout}
                    onChange={(e) => setForm((f) => ({ ...f, layout: e.target.value }))}
                    className="select select-bordered select-sm w-full"
                  >
                    <option value="info">Kartu Info / Jadwal</option>
                    <option value="announcement">Banner Pengumuman</option>
                    <option value="stats">Kartu Target / Angka</option>
                    <option value="checklist">Daftar Poin / Tata Tertib</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="form-control">
                  <span className="label-text mb-1 text-xs font-semibold">Badge Kecil</span>
                  <input
                    type="text"
                    value={form.badge}
                    onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
                    placeholder="INFO IBADAH"
                    className="input input-bordered input-sm w-full"
                  />
                </label>
                <label className="form-control sm:col-span-2">
                  <span className="label-text mb-1 text-xs font-semibold">Judul Section *</span>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Contoh: Jadwal Kebaktian Minggu Ini"
                    className="input input-bordered input-sm w-full"
                  />
                </label>
              </div>

              <label className="form-control">
                <span className="label-text mb-1 text-xs font-semibold">Paragraf / Isi</span>
                <textarea
                  rows={3}
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  placeholder="Tulis keterangan atau catatan di sini..."
                  className="textarea textarea-bordered textarea-sm w-full"
                />
              </label>

              <div className="space-y-2 rounded-box border border-base-300 bg-base-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-base-content">
                    Baris Poin / Jadwal / Angka
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, items: [...f.items, { label: '', value: '' }] }))
                    }
                    className="btn btn-ghost btn-xs gap-1 text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah Baris
                  </button>
                </div>

                {form.items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={it.label}
                      onChange={(e) => handleItemChange(idx, 'label', e.target.value)}
                      placeholder="Label (mis: Ibadah 1)"
                      className="input input-bordered input-xs flex-1"
                    />
                    <input
                      type="text"
                      value={it.value}
                      onChange={(e) => handleItemChange(idx, 'value', e.target.value)}
                      placeholder="Nilai (mis: 08.00 WIB)"
                      className="input input-bordered input-xs flex-1"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          items: f.items.filter((_, i) => i !== idx),
                        }))
                      }
                      className="btn btn-ghost btn-xs text-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="form-control">
                  <span className="label-text mb-1 text-xs font-semibold">Teks Tombol (Opsional)</span>
                  <input
                    type="text"
                    value={form.ctaLabel}
                    onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))}
                    placeholder="Mis: Buka Kamera Gereja"
                    className="input input-bordered input-sm w-full"
                  />
                </label>
                <label className="form-control">
                  <span className="label-text mb-1 text-xs font-semibold">Link Tombol (Opsional)</span>
                  <input
                    type="text"
                    value={form.ctaUrl}
                    onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))}
                    placeholder="Mis: /gereja/live"
                    className="input input-bordered input-sm w-full"
                  />
                </label>
              </div>

              <div className="modal-action">
                <button type="button" onClick={() => setModalOpen(false)} className="btn btn-ghost btn-sm">
                  Batal
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  Simpan Section ke MongoDB
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={() => setModalOpen(false)} />
        </div>
      )}
    </div>
  );
}
