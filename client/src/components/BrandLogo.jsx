/**
 * Bespoke SVG identity & shared domain configuration for Mardonius Riel.
 * Deliberately crafted with architectural hairline geometry — no generic neon gradients.
 */

export const WORKSPACE_META = {
  gereja: {
    key: 'gereja',
    shortLabel: 'Ruang Gereja',
    title: 'Presensi & Counting Jemaat',
    subtitle: 'Pencatatan kehadiran jemaat, pendeta, majelis & pelayan ibadah secara terpisah',
    adminTitle: 'Ruang Gereja — Panel Administrasi',
    adminSubtitle: 'Kelola Data Jemaat & Pendeta, Log Ibadah, serta Export Laporan CSV / PDF',
    livePath: '/gereja/live',
    adminPath: '/gereja/admin',
    memberNoun: 'Jemaat / Pelayan',
    membersNoun: 'Daftar Jemaat & Pelayan',
    defaultDepartment: 'Ibadah Umum',
    defaultRole: 'Jemaat',
    departmentPlaceholder: 'Misal: Ibadah Umum 1, Sekolah Minggu, Komisi Pemuda',
    identifierPlaceholder: 'Opsional (Nomor Induk Jemaat / Wilayah)',
    roleOptions: [
      'Jemaat',
      'Pendeta',
      'Majelis',
      'Pelayan Ibadah',
      'Pemusik / Multimedia',
      'Simpatisan / Tamu',
    ],
    unregisteredLabel: 'Tamu / Pengunjung Ibadah',
    badgeClass:
      'border-amber-800/30 bg-amber-900/10 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    accentSolidClass:
      'bg-[#7C2D12] text-[#FAF7F2] hover:bg-[#64220c] dark:bg-amber-700 dark:hover:bg-amber-600',
  },
  piloting: {
    key: 'piloting',
    shortLabel: 'Mode Piloting',
    title: 'Piloting & Pengujian',
    subtitle: 'Area uji coba kamera, kalibrasi pengenalan wajah, dan simulasi presensi',
    adminTitle: 'Piloting & Testing — Panel Administrasi',
    adminSubtitle: 'Kelola Data Uji Coba, Log Simulasi, dan Export CSV / PDF',
    livePath: '/piloting/live',
    adminPath: '/piloting/admin',
    memberNoun: 'Anggota',
    membersNoun: 'Daftar Anggota',
    defaultDepartment: 'Umum',
    defaultRole: 'Anggota',
    departmentPlaceholder: 'Misal: Teknik Informatika / Divisi IT / Umum',
    identifierPlaceholder: 'Opsional (NIM / NIP / ID)',
    roleOptions: ['Anggota', 'Karyawan', 'Mahasiswa / Siswa', 'Admin', 'Tamu VIP'],
    unregisteredLabel: 'Tidak Terdaftar (Bablas)',
    badgeClass:
      'border-[#1E4D3B]/30 bg-[#1E4D3B]/10 text-[#1E4D3B] dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    accentSolidClass:
      'bg-[#1E4D3B] text-[#FAF7F2] hover:bg-[#173c2e] dark:bg-emerald-800 dark:hover:bg-emerald-700',
  },
};

export function getWorkspaceMeta(workspace) {
  return WORKSPACE_META[workspace === 'gereja' ? 'gereja' : 'piloting'];
}

export function formatWilayahLabel(wilayah) {
  const clean = String(wilayah || '').trim();
  if (!clean) return '';
  return /^wilayah\b/i.test(clean) ? clean : `Wilayah ${clean}`;
}

export function MardoniusRielMark({ workspace = 'portal', size = 40, className = '' }) {
  const isChurch = workspace === 'gereja';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-label="Monogram Mardonius Riel"
    >
      {/* Crisp architectural frame */}
      <rect
        x="1.5"
        y="1.5"
        width="41"
        height="41"
        rx="10"
        className="fill-[#1C1917] stroke-[#B45309]/45 dark:fill-[#26221E] dark:stroke-amber-500/45"
        strokeWidth="1.25"
      />
      <rect
        x="4.5"
        y="4.5"
        width="35"
        height="35"
        rx="7.5"
        className="stroke-[#FAF7F2]/15"
        strokeWidth="0.75"
      />

      {isChurch ? (
        /* Sanctuary arch + subtle cross beam motif for Gereja workspace */
        <>
          <path
            d="M13 31V18C13 13.0294 17.0294 9 22 9C26.9706 9 31 13.0294 31 18V31"
            stroke="#F5D0A9"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path d="M22 14V26.5M17.5 18.5H26.5" stroke="#FAF7F2" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M11 31H33" stroke="#D97706" strokeWidth="1.4" strokeLinecap="round" />
        </>
      ) : (
        /* Signature M + R architectural monogram for Mardonius Riel */
        <>
          {/* M stem + chevron */}
          <path
            d="M11 30V14.5L17.5 23.5L24 14.5V30"
            stroke="#FAF7F2"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* R bowl + leg */}
          <path
            d="M27.5 30V14.5H31.8C33.8 14.5 35.2 15.8 35.2 17.7C35.2 19.6 33.8 20.9 31.8 20.9H27.5M31.2 20.9L35.3 30"
            stroke="#F59E0B"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}
