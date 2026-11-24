import express from 'express';
import {
  DEFAULT_SITE_CONFIG,
  SiteConfig,
  createDefaultAccounts,
  hashPassword,
  verifyPassword,
} from '../models/SiteConfig.js';
import { extractBearer, signAuthToken, verifyAuthToken } from '../utils/authToken.js';

const router = express.Router();

const ALLOWED_THEMES = new Set([
  'light',
  'dark',
  'cupcake',
  'bumblebee',
  'emerald',
  'corporate',
  'synthwave',
  'retro',
  'cyberpunk',
  'valentine',
  'halloween',
  'garden',
  'forest',
  'aqua',
  'lofi',
  'pastel',
  'fantasy',
  'wireframe',
  'black',
  'luxury',
  'dracula',
  'cmyk',
  'autumn',
  'business',
  'acid',
  'lemonade',
  'night',
  'coffee',
  'winter',
  'dim',
  'nord',
  'sunset',
]);

function normalizeAccountsFromDoc(plain) {
  if (Array.isArray(plain.accounts) && plain.accounts.length > 0) {
    return plain.accounts;
  }
  const defaults = createDefaultAccounts();
  if (plain.adminUsername && plain.adminPasswordHash) {
    defaults[0].username = plain.adminUsername;
    defaults[0].passwordHash = plain.adminPasswordHash;
  }
  return defaults;
}

function sanitizePublicConfig(doc) {
  const plain = doc ? (typeof doc.toObject === 'function' ? doc.toObject() : doc) : {};
  const defaults = JSON.parse(JSON.stringify(DEFAULT_SITE_CONFIG));
  const accounts = normalizeAccountsFromDoc(plain).map((acc) => ({
    id: acc.id,
    username: acc.username,
    displayName: acc.displayName || acc.username,
    role: acc.role === 'viewer' ? 'viewer' : 'admin',
    isActive: acc.isActive !== false,
  }));

  const activeTheme =
    typeof plain.activeTheme === 'string' && ALLOWED_THEMES.has(plain.activeTheme)
      ? plain.activeTheme
      : defaults.activeTheme;

  return {
    key: 'main',
    activeTheme,
    authEnabled: typeof plain.authEnabled === 'boolean' ? plain.authEnabled : defaults.authEnabled,
    adminUsername: plain.adminUsername || accounts[0]?.username || 'admin',
    accounts,
    brandName: plain.brandName ?? defaults.brandName,
    portalEyebrow: plain.portalEyebrow ?? defaults.portalEyebrow,
    portalTitle: plain.portalTitle ?? defaults.portalTitle,
    portalHeading: plain.portalHeading ?? defaults.portalHeading,
    portalDescription: plain.portalDescription ?? defaults.portalDescription,
    portalFooter: plain.portalFooter ?? defaults.portalFooter,
    portalQuickHint: plain.portalQuickHint ?? defaults.portalQuickHint,
    tabs: {
      ...defaults.tabs,
      ...(plain.tabs || {}),
    },
    workspaces: {
      gereja: {
        ...defaults.workspaces.gereja,
        ...(plain.workspaces?.gereja || {}),
        roleOptions:
          Array.isArray(plain.workspaces?.gereja?.roleOptions) &&
          plain.workspaces.gereja.roleOptions.length > 0
            ? plain.workspaces.gereja.roleOptions
            : defaults.workspaces.gereja.roleOptions,
        highlights: Array.isArray(plain.workspaces?.gereja?.highlights)
          ? plain.workspaces.gereja.highlights
          : defaults.workspaces.gereja.highlights,
      },
      piloting: {
        ...defaults.workspaces.piloting,
        ...(plain.workspaces?.piloting || {}),
        roleOptions:
          Array.isArray(plain.workspaces?.piloting?.roleOptions) &&
          plain.workspaces.piloting.roleOptions.length > 0
            ? plain.workspaces.piloting.roleOptions
            : defaults.workspaces.piloting.roleOptions,
        highlights: Array.isArray(plain.workspaces?.piloting?.highlights)
          ? plain.workspaces.piloting.highlights
          : defaults.workspaces.piloting.highlights,
      },
    },
    customSections: Array.isArray(plain.customSections)
      ? [...plain.customSections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      : defaults.customSections,
  };
}

async function ensureConfigDoc() {
  let doc = await SiteConfig.findOne({ key: 'main' });
  if (!doc) {
    doc = await SiteConfig.create(JSON.parse(JSON.stringify(DEFAULT_SITE_CONFIG)));
  } else if (!Array.isArray(doc.accounts) || doc.accounts.length === 0) {
    doc.accounts = normalizeAccountsFromDoc(doc.toObject());
    await doc.save();
  }
  return doc;
}

// GET /api/site-config - Public website configuration (password hashes omitted)
router.get('/', async (req, res) => {
  try {
    const doc = await ensureConfigDoc();
    res.json({ config: sanitizePublicConfig(doc) });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat konfigurasi tampilan website', detail: err.message });
  }
});

// POST /api/site-config/login - Authenticate with role ('admin' | 'viewer')
router.post('/login', async (req, res) => {
  try {
    const doc = await ensureConfigDoc();
    const { username = '', password = '' } = req.body || {};
    const accounts = normalizeAccountsFromDoc(doc.toObject());

    if (!doc.authEnabled) {
      const adminAcc = accounts.find((a) => a.role === 'admin') || accounts[0];
      return res.json({
        ok: true,
        authEnabled: false,
        user: {
          id: adminAcc.id,
          username: adminAcc.username,
          displayName: adminAcc.displayName,
          role: 'admin',
        },
        token: signAuthToken(adminAcc),
      });
    }

    const cleanUser = String(username).trim().toLowerCase();
    const matched = accounts.find(
      (a) => a.username.toLowerCase() === cleanUser && a.isActive !== false
    );
    if (!matched || !verifyPassword(password, matched.passwordHash)) {
      return res.status(401).json({ error: 'Username atau password tidak sesuai (atau akun nonaktif)' });
    }

    res.json({
      ok: true,
      authEnabled: true,
      user: {
        id: matched.id,
        username: matched.username,
        displayName: matched.displayName || matched.username,
        role: matched.role,
      },
      token: signAuthToken(matched),
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memproses login', detail: err.message });
  }
});

// GET /api/site-config/verify - Validate current token & role
router.get('/verify', async (req, res) => {
  try {
    const doc = await ensureConfigDoc();
    if (!doc.authEnabled) {
      return res.json({
        authenticated: true,
        authEnabled: false,
        user: { username: doc.adminUsername || 'admin', displayName: 'Administrator', role: 'admin' },
      });
    }
    const decoded = verifyAuthToken(extractBearer(req));
    if (!decoded) {
      return res.status(401).json({ authenticated: false, authEnabled: true });
    }
    res.json({
      authenticated: true,
      authEnabled: true,
      user: {
        id: decoded.id,
        username: decoded.sub,
        displayName: decoded.displayName || decoded.sub,
        role: decoded.role === 'viewer' ? 'viewer' : 'admin',
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memeriksa sesi', detail: err.message });
  }
});

// POST /api/site-config/change-password - Logged-in user (admin or viewer) changes own password
router.post('/change-password', async (req, res) => {
  try {
    const doc = await ensureConfigDoc();
    const decoded = verifyAuthToken(extractBearer(req));
    if (doc.authEnabled && !decoded) {
      return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
    }

    const { currentPassword = '', newPassword = '', targetUsername = '' } = req.body || {};
    if (String(newPassword).trim().length < 4) {
      return res.status(400).json({ error: 'Password baru minimal 4 karakter' });
    }

    const usernameToUpdate = (decoded?.sub || targetUsername || doc.adminUsername || 'admin').toLowerCase();
    const idx = doc.accounts.findIndex((a) => a.username.toLowerCase() === usernameToUpdate);
    if (idx === -1) {
      return res.status(404).json({ error: 'Akun tidak ditemukan' });
    }

    if (!verifyPassword(currentPassword, doc.accounts[idx].passwordHash)) {
      return res.status(400).json({ error: 'Password saat ini salah' });
    }

    doc.accounts[idx].passwordHash = hashPassword(String(newPassword).trim());
    if (doc.accounts[idx].role === 'admin') {
      doc.adminPasswordHash = doc.accounts[idx].passwordHash;
    }
    await doc.save();

    res.json({
      message: `Password untuk "${doc.accounts[idx].username}" berhasil diubah`,
      config: sanitizePublicConfig(doc),
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengganti password', detail: err.message });
  }
});

// POST /api/site-config/accounts - Admin creates/updates/deletes user accounts & roles
router.post('/accounts', async (req, res) => {
  try {
    const doc = await ensureConfigDoc();
    if (doc.authEnabled) {
      const decoded = verifyAuthToken(extractBearer(req));
      if (!decoded) return res.status(401).json({ error: 'Silakan login admin terlebih dahulu' });
      if (decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Mode Read-Only tidak boleh mengelola akun pengguna' });
      }
    }

    const { action = 'upsert', id, username, displayName, role, password, isActive } = req.body || {};
    let accounts = [...doc.accounts];

    if (action === 'delete') {
      const target = accounts.find((a) => a.id === id);
      if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan' });
      const activeAdmins = accounts.filter((a) => a.role === 'admin' && a.isActive !== false && a.id !== id);
      if (target.role === 'admin' && activeAdmins.length === 0) {
        return res.status(400).json({ error: 'Minimal harus tersisa 1 akun Admin aktif' });
      }
      accounts = accounts.filter((a) => a.id !== id);
    } else {
      const cleanUser = String(username || '').trim();
      if (!cleanUser) return res.status(400).json({ error: 'Username wajib diisi' });
      const normalizedRole = role === 'admin' ? 'admin' : 'viewer';

      const existingIdx = id
        ? accounts.findIndex((a) => a.id === id)
        : accounts.findIndex((a) => a.username.toLowerCase() === cleanUser.toLowerCase());

      if (existingIdx >= 0) {
        accounts[existingIdx].username = cleanUser;
        if (typeof displayName === 'string') accounts[existingIdx].displayName = displayName.trim() || cleanUser;
        accounts[existingIdx].role = normalizedRole;
        if (typeof isActive === 'boolean') accounts[existingIdx].isActive = isActive;
        if (typeof password === 'string' && password.trim().length >= 4) {
          accounts[existingIdx].passwordHash = hashPassword(password.trim());
        }
      } else {
        if (!password || String(password).trim().length < 4) {
          return res.status(400).json({ error: 'Password akun baru minimal 4 karakter' });
        }
        accounts.push({
          id: `acc-${Date.now()}`,
          username: cleanUser,
          displayName: String(displayName || '').trim() || cleanUser,
          role: normalizedRole,
          passwordHash: hashPassword(String(password).trim()),
          isActive: isActive !== false,
        });
      }
    }

    doc.accounts = accounts;
    const primaryAdmin = accounts.find((a) => a.role === 'admin' && a.isActive !== false);
    if (primaryAdmin) {
      doc.adminUsername = primaryAdmin.username;
      doc.adminPasswordHash = primaryAdmin.passwordHash;
    }
    await doc.save();

    res.json({
      message: 'Daftar akun & role berhasil diperbarui',
      config: sanitizePublicConfig(doc),
    });
  } catch (err) {
    res.status(400).json({ error: 'Gagal memperbarui akun/role', detail: err.message });
  }
});

// POST /api/site-config/role-options - Add or delete dropdown role option per workspace
router.post('/role-options', async (req, res) => {
  try {
    const doc = await ensureConfigDoc();
    if (doc.authEnabled) {
      const decoded = verifyAuthToken(extractBearer(req));
      if (!decoded) return res.status(401).json({ error: 'Silakan login admin terlebih dahulu' });
      if (decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Mode Read-Only tidak boleh mengubah daftar peran' });
      }
    }

    const ws = req.body?.workspace === 'gereja' ? 'gereja' : 'piloting';
    const action = req.body?.action === 'delete' ? 'delete' : 'add';
    const roleName = String(req.body?.role || '').trim();
    if (!roleName) {
      return res.status(400).json({ error: 'Nama peran wajib diisi' });
    }

    const base = sanitizePublicConfig(doc);
    let current = [...(base.workspaces?.[ws]?.roleOptions || DEFAULT_SITE_CONFIG.workspaces[ws].roleOptions)];

    if (action === 'add') {
      const exists = current.some((r) => r.toLowerCase() === roleName.toLowerCase());
      if (exists) {
        return res.status(409).json({ error: `Peran "${roleName}" sudah ada di daftar` });
      }
      current.push(roleName);
    } else {
      const filtered = current.filter((r) => r.toLowerCase() !== roleName.toLowerCase());
      if (filtered.length === 0) {
        return res.status(400).json({ error: 'Minimal harus tersisa 1 pilihan peran' });
      }
      current = filtered;
    }

    const nextWorkspaces = {
      ...base.workspaces,
      [ws]: {
        ...base.workspaces[ws],
        roleOptions: current,
      },
    };

    const updated = await SiteConfig.findOneAndUpdate(
      { key: 'main' },
      { $set: { workspaces: nextWorkspaces } },
      { new: true }
    );

    res.json({
      message: action === 'add' ? `Peran "${roleName}" ditambahkan` : `Peran "${roleName}" dihapus`,
      config: sanitizePublicConfig(updated),
    });
  } catch (err) {
    res.status(400).json({ error: 'Gagal memperbarui daftar peran', detail: err.message });
  }
});

// PUT /api/site-config - Admin saves texts, DaisyUI theme, authEnabled toggle, or sections
router.put('/', async (req, res) => {
  try {
    const doc = await ensureConfigDoc();
    const base = sanitizePublicConfig(doc);
    const incoming = req.body?.config || req.body || {};

    const onlyThemeChange =
      Object.keys(incoming).length === 1 && typeof incoming.activeTheme === 'string';

    if (doc.authEnabled && !onlyThemeChange) {
      const decoded = verifyAuthToken(extractBearer(req));
      if (!decoded) {
        return res.status(401).json({ error: 'Sesi belum login atau sudah kedaluwarsa' });
      }
      if (decoded.role !== 'admin') {
        return res.status(403).json({
          error: 'Mode Read-Only: hanya akun Admin yang dapat mengubah konfigurasi cPanel.',
        });
      }
    }

    const nextActiveTheme =
      typeof incoming.activeTheme === 'string' && ALLOWED_THEMES.has(incoming.activeTheme)
        ? incoming.activeTheme
        : base.activeTheme;

    // Sync primary admin username/password if submitted directly
    const accounts = doc.accounts.map((a) => (typeof a.toObject === 'function' ? a.toObject() : { ...a }));
    const adminIdx = accounts.findIndex((a) => a.role === 'admin');
    if (adminIdx >= 0) {
      if (typeof incoming.adminUsername === 'string' && incoming.adminUsername.trim()) {
        accounts[adminIdx].username = incoming.adminUsername.trim();
      }
      if (typeof incoming.newPassword === 'string' && incoming.newPassword.trim().length >= 4) {
        accounts[adminIdx].passwordHash = hashPassword(incoming.newPassword.trim());
      }
    }

    const merged = {
      key: 'main',
      activeTheme: nextActiveTheme,
      authEnabled:
        typeof incoming.authEnabled === 'boolean' ? incoming.authEnabled : base.authEnabled,
      adminUsername: accounts[adminIdx]?.username || base.adminUsername,
      adminPasswordHash: accounts[adminIdx]?.passwordHash || doc.adminPasswordHash,
      accounts,
      brandName: typeof incoming.brandName === 'string' ? incoming.brandName : base.brandName,
      portalEyebrow:
        typeof incoming.portalEyebrow === 'string' ? incoming.portalEyebrow : base.portalEyebrow,
      portalTitle: typeof incoming.portalTitle === 'string' ? incoming.portalTitle : base.portalTitle,
      portalHeading:
        typeof incoming.portalHeading === 'string' ? incoming.portalHeading : base.portalHeading,
      portalDescription:
        typeof incoming.portalDescription === 'string'
          ? incoming.portalDescription
          : base.portalDescription,
      portalFooter:
        typeof incoming.portalFooter === 'string' ? incoming.portalFooter : base.portalFooter,
      portalQuickHint:
        typeof incoming.portalQuickHint === 'string'
          ? incoming.portalQuickHint
          : base.portalQuickHint,
      tabs: {
        ...base.tabs,
        ...(incoming.tabs && typeof incoming.tabs === 'object' ? incoming.tabs : {}),
      },
      workspaces: {
        gereja: {
          ...base.workspaces.gereja,
          ...(incoming.workspaces?.gereja || {}),
        },
        piloting: {
          ...base.workspaces.piloting,
          ...(incoming.workspaces?.piloting || {}),
        },
      },
      customSections: Array.isArray(incoming.customSections)
        ? incoming.customSections.map((sec, idx) => ({
            id: String(sec.id || `sec-${Date.now()}-${idx}`),
            target: ['portal', 'gereja', 'piloting'].includes(sec.target) ? sec.target : 'portal',
            layout: ['info', 'announcement', 'stats', 'checklist'].includes(sec.layout)
              ? sec.layout
              : 'info',
            badge: String(sec.badge ?? ''),
            title: String(sec.title ?? 'Section Tanpa Judul'),
            body: String(sec.body ?? ''),
            items: Array.isArray(sec.items)
              ? sec.items.map((it) => ({
                  label: String(it?.label ?? ''),
                  value: String(it?.value ?? ''),
                }))
              : [],
            ctaLabel: String(sec.ctaLabel ?? ''),
            ctaUrl: String(sec.ctaUrl ?? ''),
            visible: sec.visible !== false,
            order: Number.isFinite(Number(sec.order)) ? Number(sec.order) : idx + 1,
          }))
        : base.customSections,
    };

    const updated = await SiteConfig.findOneAndUpdate(
      { key: 'main' },
      { $set: merged },
      { new: true, upsert: true, runValidators: true }
    );

    res.json({
      message: 'Konfigurasi cPanel & tampilan berhasil disimpan ke MongoDB',
      config: sanitizePublicConfig(updated),
    });
  } catch (err) {
    res.status(400).json({ error: 'Gagal menyimpan konfigurasi website', detail: err.message });
  }
});

// POST /api/site-config/reset - Restore default template texts & theme (preserves accounts & auth)
router.post('/reset', async (req, res) => {
  try {
    const doc = await ensureConfigDoc();
    if (doc.authEnabled) {
      const decoded = verifyAuthToken(extractBearer(req));
      if (!decoded) return res.status(401).json({ error: 'Silakan login admin terlebih dahulu' });
      if (decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Mode Read-Only tidak diizinkan mereset konfigurasi' });
      }
    }

    const fresh = JSON.parse(JSON.stringify(DEFAULT_SITE_CONFIG));
    fresh.authEnabled = doc.authEnabled;
    fresh.adminUsername = doc.adminUsername;
    fresh.adminPasswordHash = doc.adminPasswordHash;
    fresh.accounts = doc.accounts;

    const updated = await SiteConfig.findOneAndUpdate(
      { key: 'main' },
      { $set: fresh },
      { new: true, upsert: true }
    );
    res.json({
      message: 'Tampilan & teks website dikembalikan ke setelan awal',
      config: sanitizePublicConfig(updated),
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mereset konfigurasi', detail: err.message });
  }
});

export default router;
