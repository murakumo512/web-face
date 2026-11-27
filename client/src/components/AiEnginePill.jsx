import React, { useState } from 'react';
import { ChevronDown, Cpu, MonitorSmartphone, Server } from 'lucide-react';

export default function AiEnginePill({
  aiMode,
  onSelectMode,
  serverHealth,
  useServerAi,
  telemetry,
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

  const nodeLabel = telemetry?.serverNode || serverHealth?.serverNode || 'server';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-sm btn-ghost border border-base-300 font-normal gap-1.5"
        title={
          activeIsServer
            ? `Diproses di server (${nodeLabel})`
            : 'Diproses di perangkat ini'
        }
      >
        <span
          className={`h-2 w-2 rounded-full ${
            activeIsServer ? 'bg-success' : 'bg-info'
          }`}
        />
        {activeIsServer ? (
          <Server className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : (
          <MonitorSmartphone className="h-3.5 w-3.5 shrink-0 text-info" />
        )}
        <span className="whitespace-nowrap">
          {activeIsServer ? 'Server AI' : 'Lokal'}
        </span>
        {latencyText && (
          <span className="hidden text-base-content/60 sm:inline">
            {latencyText}
          </span>
        )}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={`absolute top-full z-50 mt-1.5 w-72 rounded-box border border-base-300 bg-base-100 p-3 text-xs text-base-content shadow-md ${
              align === 'start' ? 'left-0' : 'right-0'
            }`}
          >
            <div className="mb-2 flex items-center justify-between border-b border-base-300 pb-2">
              <span className="flex items-center gap-1.5 font-semibold">
                <Cpu className="h-3.5 w-3.5 text-primary" />
                Proses Pengenalan Wajah
              </span>
              <span
                className={`badge badge-xs ${
                  serverHealth?.available ? 'badge-success badge-outline' : 'badge-warning badge-outline'
                }`}
              >
                {serverHealth?.available ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="mb-2.5 space-y-1 rounded-box border border-base-300 bg-base-200/60 p-2 text-[11px]">
              <div className="flex justify-between">
                <span className="opacity-70">Aktif:</span>
                <span className="font-medium">
                  {activeIsServer ? `Server (${nodeLabel})` : 'Perangkat Ini'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-70">Model:</span>
                <span>
                  {telemetry?.engine ||
                    (activeIsServer ? serverHealth?.engine || 'YuNet + SFace' : 'face-api.js')}
                </span>
              </div>
              {telemetry?.inferenceMs != null && (
                <div className="flex justify-between">
                  <span className="opacity-70">Kecepatan:</span>
                  <span className="font-medium">
                    {telemetry.inferenceMs} ms
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-[11px] font-medium opacity-70">Pilih Mode:</p>
              {[
                {
                  id: 'auto',
                  title: 'Otomatis',
                  desc: 'Pakai server jika tersedia, pindah ke lokal bila terputus.',
                },
                {
                  id: 'server',
                  title: 'Khusus Server',
                  desc: 'Lebih ringan di HP karena diproses di server.',
                  disabled: !serverHealth?.available,
                },
                {
                  id: 'browser',
                  title: 'Khusus Lokal',
                  desc: 'Semua deteksi diproses langsung di perangkat ini.',
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
                  className={`flex w-full flex-col rounded-box border px-2.5 py-1.5 text-left transition ${
                    aiMode === opt.id
                      ? 'border-primary bg-primary/10 font-semibold'
                      : 'border-base-300 hover:bg-base-200'
                  } ${opt.disabled ? 'cursor-not-allowed opacity-45' : ''}`}
                >
                  <span className="flex items-center justify-between text-xs">
                    <span>{opt.title}</span>
                    {aiMode === opt.id && (
                      <span className="badge badge-primary badge-xs">Aktif</span>
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
