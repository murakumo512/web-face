import crypto from 'node:crypto';
import mongoose from 'mongoose';

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(String(password), salt, 32);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function createDefaultAccounts() {
  return [
    {
      id: 'acc-admin',
      username: 'admin',
      displayName: 'Administrator (Mardonius Riel)',
      role: 'admin',
      passwordHash: hashPassword(process.env.ADMIN_DEFAULT_PASSWORD || 'riel2026'),
      isActive: true,
    },
    {
      id: 'acc-reader',
      username: 'reader',
      displayName: 'Mode Read-Only (Jemaat / Majelis)',
      role: 'viewer',
      passwordHash: hashPassword(process.env.READER_DEFAULT_PASSWORD || 'baca2026'),
      isActive: true,
    },
  ];
}

export const DEFAULT_SITE_CONFIG = {
  key: 'main',
  activeTheme: 'light',
  authEnabled: true,
  adminUsername: 'admin',
  adminPasswordHash: hashPassword(process.env.ADMIN_DEFAULT_PASSWORD || 'riel2026'),
  accounts: createDefaultAccounts(),
  brandName: 'Mardonius Riel',
  portalEyebrow: 'Pilih Lingkungan Kerja',
  portalTitle: 'Portal Presensi & Counting Wajah',
  portalHeading: 'Silakan pilih tujuan penggunaan hari ini.',
  portalDescription:
    'Data wajah jemaat, pendeta, dan laporan ibadah tersimpan di ruang khusus gereja agar tetap bersih dari pengujian teknis maupun simulasi harian.',
  portalFooter: 'Dirancang khusus oleh Mardonius Riel — Sistem Presensi & People Counting Biometrik.',
  portalQuickHint: 'Akses langsung: /gereja/live • /gereja/admin • /piloting/live • /piloting/admin • /cpanel',
  tabs: {
    admin: 'Dashboard CRUD',
    register: 'Registrasi Wajah',
    reports: 'Laporan & PDF',
    live: 'Live & Test Foto',
    cpanel: 'cPanel & CMS',
  },
  workspaces: {
    gereja: {
      shortLabel: 'Ruang Gereja',
      eyebrow: 'PELAYANAN & IBADAH',
      title: 'Presensi & Counting Jemaat',
      subtitle: 'Pencatatan kehadiran jemaat, pendeta, majelis & pelayan ibadah secara terpisah.',
      adminTitle: 'Ruang Gereja — Panel Admin',
      adminSubtitle: 'Kelola Data Jemaat & Pendeta, Log Ibadah, serta Export CSV / PDF',
      primaryButton: 'Kamera Jemaat',
      secondaryButton: 'Admin Gereja',
      cameraReadyTitle: 'Presensi & Counting Jemaat — Siap',
      cameraReadySubtitle: 'Arahkan wajah jemaat atau pendeta ke kamera untuk presensi dan counting ibadah.',
      roleOptions: [
        'Jemaat',
        'Pendeta',
        'Majelis',
        'Pelayan Ibadah',
        'Pemusik / Multimedia',
        'Simpatisan / Tamu',
      ],
      highlights: [
        'Khusus presensi & counting wajah jemaat, pendeta, majelis, serta pelayan',
        'Database terpisah sepenuhnya dari data uji coba piloting',
        'Ekspor laporan kehadiran harian & periode ke PDF / CSV siap arsip gereja',
      ],
    },
    piloting: {
      shortLabel: 'Mode Piloting',
      eyebrow: 'SANDBOX & KALIBRASI',
      title: 'Piloting & Pengujian',
      subtitle: 'Area uji coba kamera, deteksi multi-wajah, dan simulasi presensi.',
      adminTitle: 'Piloting & Testing — Panel Admin',
      adminSubtitle: 'Kelola Data Uji Coba, Log Simulasi, dan Export CSV / PDF',
      primaryButton: 'Kamera Piloting',
      secondaryButton: 'Admin Piloting',
      cameraReadyTitle: 'Piloting & Pengujian — Siap',
      cameraReadySubtitle: 'Aktifkan kamera untuk kalibrasi pengenalan wajah dan simulasi counting.',
      roleOptions: ['Anggota', 'Karyawan', 'Mahasiswa / Siswa', 'Admin', 'Tamu VIP'],
      highlights: [
        'Ruang terpisah untuk uji coba kamera, deteksi multi-wajah, dan demo umum',
        'Tidak mencemari daftar anggota atau rekap laporan kehadiran gereja',
        'Tetap lengkap dengan pencatatan anti-duplikat 1x/hari & laporan periode',
      ],
    },
  },
  customSections: [
    {
      id: 'sec-gereja-jadwal',
      target: 'gereja',
      layout: 'info',
      badge: 'INFO PELAYANAN',
      title: 'Jadwal Pelayanan & Ibadah Umum',
      body: 'Gunakan mode kamera full-screen di pintu masuk untuk mencatat kehadiran jemaat, pendeta, majelis, serta menghitung tamu ibadah secara otomatis.',
      items: [
        { label: 'Ibadah Raya 1', value: '07.30 WIB • Pintu Utama' },
        { label: 'Ibadah Raya 2', value: '10.00 WIB • Pintu Utama' },
        { label: 'Pelayan & Majelis', value: 'Hadir 30 menit sebelum ibadah' },
      ],
      ctaLabel: 'Mulai Kamera Jemaat',
      ctaUrl: '/gereja/live',
      visible: true,
      order: 1,
    },
  ],
};

const accountSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true },
    displayName: { type: String, trim: true, default: '' },
    role: { type: String, enum: ['admin', 'viewer'], default: 'viewer' },
    passwordHash: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const customItemSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: '' },
    value: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const customSectionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    target: {
      type: String,
      enum: ['portal', 'gereja', 'piloting'],
      default: 'portal',
    },
    layout: {
      type: String,
      enum: ['info', 'announcement', 'stats', 'checklist'],
      default: 'info',
    },
    badge: { type: String, trim: true, default: 'SECTION BARU' },
    title: { type: String, trim: true, default: 'Judul Section' },
    body: { type: String, trim: true, default: '' },
    items: { type: [customItemSchema], default: [] },
    ctaLabel: { type: String, trim: true, default: '' },
    ctaUrl: { type: String, trim: true, default: '' },
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 1 },
  },
  { _id: false }
);

const siteConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'main' },
    activeTheme: { type: String, trim: true, default: DEFAULT_SITE_CONFIG.activeTheme },
    authEnabled: { type: Boolean, default: true },
    adminUsername: { type: String, trim: true, default: 'admin' },
    adminPasswordHash: { type: String, default: () => DEFAULT_SITE_CONFIG.adminPasswordHash },
    accounts: {
      type: [accountSchema],
      default: () => createDefaultAccounts(),
    },
    brandName: { type: String, trim: true, default: DEFAULT_SITE_CONFIG.brandName },
    portalEyebrow: { type: String, trim: true, default: DEFAULT_SITE_CONFIG.portalEyebrow },
    portalTitle: { type: String, trim: true, default: DEFAULT_SITE_CONFIG.portalTitle },
    portalHeading: { type: String, trim: true, default: DEFAULT_SITE_CONFIG.portalHeading },
    portalDescription: { type: String, trim: true, default: DEFAULT_SITE_CONFIG.portalDescription },
    portalFooter: { type: String, trim: true, default: DEFAULT_SITE_CONFIG.portalFooter },
    portalQuickHint: { type: String, trim: true, default: DEFAULT_SITE_CONFIG.portalQuickHint },
    tabs: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ ...DEFAULT_SITE_CONFIG.tabs }),
    },
    workspaces: {
      type: mongoose.Schema.Types.Mixed,
      default: () => JSON.parse(JSON.stringify(DEFAULT_SITE_CONFIG.workspaces)),
    },
    customSections: {
      type: [customSectionSchema],
      default: () => JSON.parse(JSON.stringify(DEFAULT_SITE_CONFIG.customSections)),
    },
  },
  { timestamps: true }
);

export const SiteConfig =
  mongoose.models.SiteConfig || mongoose.model('SiteConfig', siteConfigSchema);
