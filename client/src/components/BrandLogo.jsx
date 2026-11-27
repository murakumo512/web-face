import { Church, ScanFace, SlidersHorizontal } from 'lucide-react';

export const WORKSPACE_META = {
  gereja: {
    key: 'gereja',
    shortLabel: 'Gereja',
    title: 'Gereja',
    subtitle: 'Presensi jemaat, pendeta, majelis, dan pelayan ibadah',
    adminTitle: 'Gereja — Panel Administrasi',
    adminSubtitle: 'Kelola Data Jemaat & Pelayan, Log Ibadah, serta Export CSV / PDF',
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
    badgeClass: 'badge-secondary badge-outline',
    accentSolidClass: 'btn-primary text-primary-content',
  },
  piloting: {
    key: 'piloting',
    shortLabel: 'Piloting',
    title: 'Piloting',
    subtitle: 'Simulasi presensi dan uji operasional harian',
    adminTitle: 'Piloting — Panel Admin',
    adminSubtitle: 'Kelola Data Piloting, Log Simulasi, dan Export CSV / PDF',
    livePath: '/piloting/live',
    adminPath: '/piloting/admin',
    memberNoun: 'Anggota',
    membersNoun: 'Daftar Anggota',
    defaultDepartment: 'Umum',
    defaultRole: 'Anggota',
    departmentPlaceholder: 'Misal: Teknik Informatika / Divisi IT / Umum',
    identifierPlaceholder: 'Opsional (NIM / NIP / ID)',
    roleOptions: ['Anggota', 'Karyawan', 'Mahasiswa / Siswa', 'Admin', 'Tamu VIP'],
    unregisteredLabel: 'Tamu (Belum Terdaftar)',
    badgeClass: 'badge-primary badge-outline',
    accentSolidClass: 'btn-primary text-primary-content',
  },
  testing: {
    key: 'testing',
    shortLabel: 'Testing',
    title: 'Testing',
    subtitle: 'Uji kamera, kalibrasi deteksi wajah, dan eksperimen',
    adminTitle: 'Testing — Panel Admin',
    adminSubtitle: 'Kelola Data Testing, Log Uji Kamera, dan Export CSV / PDF',
    livePath: '/testing/live',
    adminPath: '/testing/admin',
    memberNoun: 'Tester',
    membersNoun: 'Daftar Tester',
    defaultDepartment: 'Testing',
    defaultRole: 'Tester',
    departmentPlaceholder: 'Misal: Uji Kamera / Lab / QA',
    identifierPlaceholder: 'Opsional (ID Tester)',
    roleOptions: ['Tester', 'Pengembang', 'Tamu'],
    unregisteredLabel: 'Tamu (Testing)',
    badgeClass: 'badge-accent badge-outline',
    accentSolidClass: 'btn-primary text-primary-content',
  },
};

export function getWorkspaceMeta(workspace) {
  if (workspace === 'gereja') return WORKSPACE_META.gereja;
  if (workspace === 'testing') return WORKSPACE_META.testing;
  return WORKSPACE_META.piloting;
}

export function formatWilayahLabel(wilayah) {
  const clean = String(wilayah || '').trim();
  if (!clean) return '';
  return /^wilayah\b/i.test(clean) ? clean : `Wilayah ${clean}`;
}

export function WorkspaceIcon({ workspace = 'piloting', className = 'h-5 w-5' }) {
  if (workspace === 'gereja') {
    return <Church className={className} strokeWidth={1.75} />;
  }
  if (workspace === 'testing') {
    return <ScanFace className={className} strokeWidth={1.75} />;
  }
  return <SlidersHorizontal className={className} strokeWidth={1.75} />;
}

export function MardoniusRielMark({ workspace = 'portal', size = 36, className = '' }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-box border border-base-300 bg-base-200 text-primary ${className}`}
      aria-label="Logo Presensi Wajah"
    >
      <WorkspaceIcon workspace={workspace} className="h-5 w-5" />
    </div>
  );
}
