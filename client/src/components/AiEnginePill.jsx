import React, { useState } from 'react';
import { ChevronDown, Cpu, MonitorSmartphone, Server } from 'lucide-react';

/**
 * PrimeVue Aura-style status button & controlled dropdown menu showing whether
 * Face Recognition executes on the Swarm server (`ubuntu-swarm1`) or locally in browser.
 */
export default function AiEnginePill({
  aiMode,
  onSelectMode,
  serverHealth,
  useServerAi,
  telemetry,
  compact = false,
  align = 'end',
}) {
  const [open, setOpen] = useState(false);

  const activeIsServer =
    aiMode === 'server'
      ? true
      : aiMode === 'browser'
        ? false
        : telemetry?.processedBy != null
          ? telemetry.processedBy === 'server'
          : useServerAi;

  const latencyText =
    telemetry?.inferenceMs != null ? `${Math.round(telemetry.inferenceMs)}ms` : null;

  const nodeLabel = telemetry?.serverNode || serverHealth?.serverNode || 'ubuntu-swarm1';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-sm btn-ghost border border-base-300 shadow-none font-medium gap-1.5"
        title={
          activeIsServer
            ? `Diproses Server (${nodeLabel}) • ${telemetry?.containerId || serverHealth?.containerId || 'YuNet+SFace'}`
            : 'Diproses lokal di Browser/HP (face-api.js)'
        }
      >
        <span
          className={`h-2 w-2 rounded-full ${
            activeIsServer ? 'bg-emerald-500' : 'bg-sky-500'
          }`}
        />
        {activeIsServer ? (
          <Server className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <MonitorSmartphone className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
        )}
        <span className="whitespace-nowrap">
          {activeIsServer ? `Server · ${nodeLabel}` : 'Browser Lokal'}
        </span>
        {latencyText && (
          <span className="hidden tabular-nums text-base-content/60 sm:inline">
            {latencyText}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute top-full z-50 mt-1.5 w-72 rounded-md border border-base-300 bg-base-100 p-3 text-xs text-base-content shadow-lg ${
              align === 'start' ? 'left-0' : 'right-0'
            }`}
          >
            <div className="mb-2 flex items-center justify-between border-b border-base-200 pb-2">
              <span className="flex items-center gap-1.5 font-semibold">
                <Cpu className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                Mesin Face Recognition
              </span>
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                  serverHealth?.available
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                }`}
              >
                {serverHealth?.available ? 'Server Online' : 'Server Offline'}
              </span>
            </div>

            <div className="mb-2.5 space-y-1 rounded border border-base-200 bg-base-200/60 p-2 text-[11px]">
              <div className="flex justify-between">
                <span className="opacity-70">Eksekusi:</span>
                <span className="font-semibold">
                  {activeIsServer ? `Server (${nodeLabel})` : 'Browser Lokal'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">Engine:</span>
                <span className="font-mono">
                  {telemetry?.engine ||
                    (activeIsServer ? serverHealth?.engine || 'YuNet+SFace' : 'face-api.js')}
                </span>
              </div>
              {activeIsServer && (telemetry?.containerId || serverHealth?.containerId) && (
                <div className="flex justify-between">
                  <span className="opacity-70">Container:</span>
                  <span className="font-mono">{telemetry?.containerId || serverHealth?.containerId}</span>
                </div>
              )}
              {telemetry?.inferenceMs != null && (
                <div className="flex justify-between">
                  <span className="opacity-70">Waktu Proses:</span>
                  <span className="font-medium tabular-nums">
                    {telemetry.inferenceMs} ms
                    {activeIsServer && telemetry.roundTripMs ? ` (${telemetry.roundTripMs} ms e2e)` : ''}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium opacity-70">Mode Eksekusi:</p>
              {[
                {
                  id: 'auto',
                  title: 'Auto (Prioritas Server)',
                  desc: 'Gunakan ubuntu-swarm1 bila online, fallback ke browser jika terputus.',
                },
                {
                  id: 'server',
                  title: `Server Only (${serverHealth?.serverNode || 'ubuntu-swarm1'})`,
                  desc: 'Ringan di HP — AI wajah diproses di server.',
                  disabled: !serverHealth?.available,
                },
                {
                  id: 'browser',
                  title: 'Browser Lokal (face-api.js)',
                  desc: 'Proses AI langsung di perangkat ini.',
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => {
                    onSelectMode?.(opt.id);
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col rounded border px-2.5 py-1.5 text-left transition ${
                    aiMode === opt.id
                      ? 'border-emerald-500 bg-emerald-500/10 font-semibold'
                      : 'border-base-300 hover:bg-base-200'
                  } ${opt.disabled ? 'cursor-not-allowed opacity-45' : ''}`}
                >
                  <span className="flex items-center justify-between text-xs">
                    <span>{opt.title}</span>
                    {aiMode === opt.id && (
                      <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        Aktif
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-normal opacity-70">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
