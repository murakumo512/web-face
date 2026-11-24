import React, { useState } from 'react';
import { Check, ChevronDown, Palette } from 'lucide-react';
import { DAISY_THEMES, useSiteConfig } from '../context/SiteConfigContext.jsx';

/**
 * Official daisyui.com style Theme Dropdown controller.
 */
export default function ThemePicker({ compact = false }) {
  const { activeTheme, setActiveTheme } = useSiteConfig();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-sm btn-ghost border border-base-300 shadow-none font-medium gap-1.5 whitespace-nowrap"
        title="Pilih Tema Tampilan"
      >
        <Palette className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="capitalize">
          {compact ? 'Tema' : `Tema: ${activeTheme}`}
        </span>
        <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="dropdown-content absolute right-0 top-10 z-50 w-60 rounded-md border border-base-300 bg-base-100 p-2 text-base-content shadow-lg">
            <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider opacity-60">
              Tema ({DAISY_THEMES.length})
            </div>
            <div className="grid max-h-72 grid-cols-1 gap-1 overflow-y-auto p-0.5">
              {DAISY_THEMES.map((t) => {
                const selected = activeTheme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-theme={t.id}
                    onClick={() => {
                      setActiveTheme(t.id);
                      setOpen(false);
                    }}
                    className={`overflow-hidden rounded border text-left transition ${
                      selected ? 'border-emerald-600 ring-1 ring-emerald-600' : 'border-base-300 hover:border-base-content/30'
                    }`}
                  >
                    <div className="bg-base-100 text-base-content flex w-full cursor-pointer items-center justify-between px-3 py-2 font-sans">
                      <span className="flex items-center gap-2 text-xs font-bold capitalize">
                        {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                        <span>{t.label}</span>
                      </span>
                      <span className="flex h-full shrink-0 flex-wrap gap-1">
                        <span className="bg-primary w-2 h-4 rounded-sm" />
                        <span className="bg-secondary w-2 h-4 rounded-sm" />
                        <span className="bg-accent w-2 h-4 rounded-sm" />
                        <span className="bg-neutral w-2 h-4 rounded-sm" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
