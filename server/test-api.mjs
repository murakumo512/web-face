import 'dotenv/config';
import assert from 'node:assert/strict';
import express from 'express';
import { connectDB, disconnectDB } from './config/db.js';
import usersRouter from './routes/users.js';
import logsRouter from './routes/logs.js';
import summaryRouter from './routes/summary.js';
import siteConfigRouter from './routes/siteConfig.js';
import aiRouter from './routes/ai.js';
import { toLocalDateKey } from './utils/dateUtils.js';

function makeDescriptor(seed = 0.1) {
  return Array.from({ length: 128 }, (_, i) => Number((Math.sin(i + seed) * 0.25).toFixed(5)));
}

async function runTests() {
  process.env.ALLOW_EMBEDDED_MONGO_FALLBACK = 'true';
  process.env.AI_SERVICE_URL = 'disabled';
  await connectDB();

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/users', usersRouter);
  app.use('/api/logs', logsRouter);
  app.use('/api/summary', summaryRouter);
  app.use('/api/site-config', siteConfigRouter);
  app.use('/api/ai', aiRouter);

  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    const aliceDesc = makeDescriptor(1.0);
    const aliceSimilarDesc = aliceDesc.map((v, i) => (i % 5 === 0 ? v + 0.01 : v));

    // 1. Verify unknown face before registration
    let res = await fetch(`${baseUrl}/users/verify-face`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor: aliceDesc }),
    });
    assert.equal(res.status, 200);
    let data = await res.json();
    assert.equal(data.recognized, false, 'Face should not be recognized before registration');

    // 2. Register Alice
    res = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice Test',
        identifier: 'EMP-001',
        department: 'Engineering',
        role: 'Karyawan',
        descriptor: aliceDesc,
      }),
    });
    assert.equal(res.status, 201);
    data = await res.json();
    const aliceId = data.user._id;
    assert.equal(data.user.name, 'Alice Test');

    // 3. Recognize Alice's slightly varied face
    res = await fetch(`${baseUrl}/users/verify-face`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor: aliceSimilarDesc }),
    });
    assert.equal(res.status, 200);
    data = await res.json();
    assert.equal(data.recognized, true, 'Registered face must be recognized');
    assert.equal(data.user.name, 'Alice Test');

    // 4. Duplicate registration check
    res = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Alice Duplicate',
        descriptor: aliceSimilarDesc,
      }),
    });
    assert.equal(res.status, 409, 'Duplicate face registration should be rejected');

    // 5. Log recognized entry (first time today)
    res = await fetch(`${baseUrl}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: aliceId,
        status: 'REGISTERED',
        eventType: 'ENTRY',
        confidence: 96,
      }),
    });
    assert.equal(res.status, 201);
    const firstLogBody = await res.json();
    assert.equal(firstLogBody.skipped, false);
    const regLog = firstLogBody.log;

    // 5b. Duplicate entry same day must be skipped (not overwritten or duplicated)
    res = await fetch(`${baseUrl}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: aliceId,
        status: 'REGISTERED',
        eventType: 'ENTRY',
        confidence: 88,
      }),
    });
    assert.equal(res.status, 200);
    const dupLogBody = await res.json();
    assert.equal(dupLogBody.skipped, true);
    assert.equal(dupLogBody.alreadyCheckedIn, true);
    assert.equal(String(dupLogBody.log._id), String(regLog._id));

    // Register Bob Test (who will remain absent today)
    const bobDesc = makeDescriptor(4.2);
    res = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bob Absent',
        identifier: 'EMP-002',
        department: 'Lab',
        descriptor: bobDesc,
      }),
    });
    assert.equal(res.status, 201);
    const bobId = (await res.json()).user._id;

    // 6. Log unregistered "bablas" pass-through
    res = await fetch(`${baseUrl}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'UNREGISTERED',
        eventType: 'PASS_THROUGH',
        personName: 'Tidak Terdaftar (Bablas)',
      }),
    });
    assert.equal(res.status, 201);
    const unregLog = (await res.json()).log;

    // 7. Daily summary verification (includes both Hadir and Tidak Hadir members)
    const today = toLocalDateKey(new Date());
    res = await fetch(`${baseUrl}/summary/daily?date=${today}`);
    assert.equal(res.status, 200);
    data = await res.json();
    assert.equal(data.totalCount, 2);
    assert.equal(data.registeredCount, 1);
    assert.equal(data.uniqueRegisteredCount, 1);
    assert.equal(data.unregisteredCount, 1);
    assert.equal(data.presentMembersCount, 1);
    assert.equal(data.absentMembersCount, 1);
    assert.equal(data.memberAttendance.length, 2);
    const aliceRow = data.memberAttendance.find((m) => m.personName === 'Alice Test');
    const bobRow = data.memberAttendance.find((m) => m.personName === 'Bob Absent');
    assert.equal(aliceRow.attendanceStatus, 'Hadir');
    assert.equal(bobRow.attendanceStatus, 'Tidak Hadir');

    // 7b. Period report verification (2 days: yesterday & today)
    const yestDate = new Date();
    yestDate.setDate(yestDate.getDate() - 1);
    const yesterday = toLocalDateKey(yestDate);
    res = await fetch(`${baseUrl}/summary/period?startDate=${yesterday}&endDate=${today}`);
    assert.equal(res.status, 200);
    const periodData = await res.json();
    assert.equal(periodData.totalDays, 2);
    const alicePeriod = periodData.members.find((m) => m.personName === 'Alice Test');
    const bobPeriod = periodData.members.find((m) => m.personName === 'Bob Absent');
    assert.equal(alicePeriod.presentDays, 1);
    assert.equal(alicePeriod.absentDays, 1);
    assert.equal(bobPeriod.presentDays, 0);
    assert.equal(bobPeriod.absentDays, 2);

    // 8. Export CSV (logs, summary, period)
    res = await fetch(`${baseUrl}/summary/export-csv?date=${today}&mode=logs`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const csvLogs = await res.text();
    assert.match(csvLogs, /Alice Test/);
    assert.match(csvLogs, /Tidak Terdaftar \(Bablas\)/);

    res = await fetch(`${baseUrl}/summary/export-csv?date=${today}&mode=summary`);
    assert.equal(res.status, 200);
    const csvSummary = await res.text();
    assert.match(csvSummary, /Total Orang Masuk/);
    assert.match(csvSummary, /Alice Test/);
    assert.match(csvSummary, /Tidak Hadir/);

    res = await fetch(`${baseUrl}/summary/export-period-csv?startDate=${yesterday}&endDate=${today}`);
    assert.equal(res.status, 200);
    const csvPeriod = await res.text();
    assert.match(csvPeriod, /Bob Absent/);
    assert.match(csvPeriod, /Jml Tidak Hadir/);

    // 8b. Export PDF (summary, logs, all, period)
    for (const pdfMode of ['summary', 'logs', 'all']) {
      res = await fetch(`${baseUrl}/summary/export-pdf?date=${today}&mode=${pdfMode}`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /application\/pdf/);
      const pdfBuf = Buffer.from(await res.arrayBuffer());
      assert.equal(pdfBuf.subarray(0, 5).toString('ascii'), '%PDF-', `PDF ${pdfMode} must start with %PDF-`);
    }
    res = await fetch(`${baseUrl}/summary/export-period-pdf?startDate=${yesterday}&endDate=${today}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/pdf/);
    const periodPdfBuf = Buffer.from(await res.arrayBuffer());
    assert.equal(periodPdfBuf.subarray(0, 5).toString('ascii'), '%PDF-', 'Period PDF must start with %PDF-');

    // 8c. Workspace isolation (gereja vs piloting)
    const churchDescriptor = Array.from({ length: 128 }, (_, i) => (i === 5 ? 0.85 : 0));
    res = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: 'gereja',
        name: 'Pdt. Yohanes Test',
        identifier: 'GRJ-001',
        department: 'Ibadah Umum',
        role: 'Pendeta',
        wilayah: 'Wilayah 3',
        faceDescriptors: [churchDescriptor],
      }),
    });
    assert.equal(res.status, 201);
    const churchUser = (await res.json()).user;
    assert.equal(churchUser.wilayah, 'Wilayah 3');

    res = await fetch(`${baseUrl}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: 'gereja',
        status: 'REGISTERED',
        userId: churchUser._id,
        personName: churchUser.name,
        confidence: 92,
        date: today,
        sessionTime: '09:00',
      }),
    });
    assert.equal(res.status, 201);
    const churchLog = (await res.json()).log;
    assert.equal(churchLog.wilayah, 'Wilayah 3');
    assert.equal(churchLog.sessionLabel, 'Gereja Pagi');

    // Duplicate in same morning session must be skipped
    res = await fetch(`${baseUrl}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: 'gereja',
        status: 'REGISTERED',
        userId: churchUser._id,
        personName: churchUser.name,
        confidence: 91,
        date: today,
        sessionTime: '09:30',
      }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).alreadyCheckedIn, true);

    // Same user checking in for afternoon/evening session (17:30 -> Gereja Sore) must succeed
    res = await fetch(`${baseUrl}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace: 'gereja',
        status: 'REGISTERED',
        userId: churchUser._id,
        personName: churchUser.name,
        confidence: 93,
        date: today,
        sessionTime: '17:30',
      }),
    });
    assert.equal(res.status, 201);
    const eveningLog = (await res.json()).log;
    assert.equal(eveningLog.sessionLabel, 'Gereja Sore');

    // Dynamic edit of existing log (PUT /api/logs/:id)
    res = await fetch(`${baseUrl}/logs/${churchLog._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wilayah: 'Wilayah 7',
        sessionTime: '18:15',
        notes: 'Diedit manual admin',
      }),
    });
    assert.equal(res.status, 200);
    const updatedChurchLog = (await res.json()).log;
    assert.equal(updatedChurchLog.wilayah, 'Wilayah 7');
    assert.equal(updatedChurchLog.sessionLabel, 'Gereja Sore');
    assert.equal(updatedChurchLog.notes, 'Diedit manual admin');

    // Revert back to 09:00 so summary counts remain 1 morning + 1 evening
    res = await fetch(`${baseUrl}/logs/${churchLog._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionTime: '09:00' }),
    });
    assert.equal(res.status, 200);

    // Piloting summary/users MUST NOT see Gereja records
    const pilotingUsersRes = await fetch(`${baseUrl}/users?workspace=piloting`);
    const pilotingUsers = (await pilotingUsersRes.json()).users;
    assert.equal(pilotingUsers.some((u) => u.name === 'Pdt. Yohanes Test'), false);

    // Gereja summary/users MUST ONLY see Gereja records
    const gerejaUsersRes = await fetch(`${baseUrl}/users?workspace=gereja`);
    const gerejaUsers = (await gerejaUsersRes.json()).users;
    assert.equal(gerejaUsers.length, 1);
    assert.equal(gerejaUsers[0].name, 'Pdt. Yohanes Test');

    const gerejaSummaryRes = await fetch(`${baseUrl}/summary/daily?date=${today}&workspace=gereja`);
    const gerejaSummary = await gerejaSummaryRes.json();
    assert.equal(gerejaSummary.totalCount, 2);
    assert.equal(gerejaSummary.morningCount, 1);
    assert.equal(gerejaSummary.eveningCount, 1);
    assert.equal(gerejaSummary.totalRegisteredUsersInDb, 1);

    await fetch(`${baseUrl}/logs/${churchLog._id}`, { method: 'DELETE' });
    await fetch(`${baseUrl}/logs/${eveningLog._id}`, { method: 'DELETE' });
    await fetch(`${baseUrl}/users/${churchUser._id}`, { method: 'DELETE' });

    // 8d. SiteConfig (Auth Login Gate, Enable/Disable Login Toggle, DaisyUI theme, CMS & Add Section)
    res = await fetch(`${baseUrl}/site-config`);
    assert.equal(res.status, 200);
    const initialCfg = (await res.json()).config;
    assert.equal(initialCfg.activeTheme, 'light');
    assert.equal(initialCfg.authEnabled, true);

    // Unauthenticated CMS edit should return 401 when authEnabled is true
    res = await fetch(`${baseUrl}/site-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portalTitle: 'Unauthorized Test' }),
    });
    assert.equal(res.status, 401);

    // Login as admin
    res = await fetch(`${baseUrl}/site-config/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: process.env.ADMIN_DEFAULT_PASSWORD || 'riel2026' }),
    });
    assert.equal(res.status, 200);
    const loginRes = await res.json();
    assert.ok(loginRes.token);

    // Authenticated update + disable login toggle
    res = await fetch(`${baseUrl}/site-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginRes.token}`,
      },
      body: JSON.stringify({
        activeTheme: 'cupcake',
        portalTitle: 'Portal Gereja Dinamis',
        authEnabled: false,
        customSections: [
          ...initialCfg.customSections,
          {
            id: 'sec-test-1',
            target: 'portal',
            layout: 'announcement',
            badge: 'PENGUMUMAN',
            title: 'Jadwal Baptisan Minggu Ini',
            body: 'Pendaftaran dibuka di meja sekretariat.',
            items: [{ label: 'Waktu', value: 'Minggu 11.00 WIB' }],
            visible: true,
            order: 2,
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    const updatedCfg = (await res.json()).config;
    assert.equal(updatedCfg.activeTheme, 'cupcake');
    assert.equal(updatedCfg.authEnabled, false);
    assert.equal(updatedCfg.portalTitle, 'Portal Gereja Dinamis');
    assert.equal(updatedCfg.customSections.some((s) => s.id === 'sec-test-1'), true);

    // Since authEnabled is now false, PUT without token succeeds; re-enable auth & reset
    res = await fetch(`${baseUrl}/site-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authEnabled: true }),
    });
    assert.equal(res.status, 200);

    // 8e. Role-based Read-Only Mode ('reader' / 'viewer') & Change Password
    res = await fetch(`${baseUrl}/site-config/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'reader', password: process.env.READER_DEFAULT_PASSWORD || 'baca2026' }),
    });
    assert.equal(res.status, 200);
    const readerLogin = await res.json();
    assert.equal(readerLogin.user.role, 'viewer');

    // Read-only viewer is forbidden (403) from modifying site-config or users
    res = await fetch(`${baseUrl}/site-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${readerLogin.token}`,
      },
      body: JSON.stringify({ portalTitle: 'Should Be Blocked' }),
    });
    assert.equal(res.status, 403);

    res = await fetch(`${baseUrl}/users/${aliceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${readerLogin.token}` },
    });
    assert.equal(res.status, 403);

    // Logged-in viewer CAN change their own password
    res = await fetch(`${baseUrl}/site-config/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${readerLogin.token}`,
      },
      body: JSON.stringify({ currentPassword: 'baca2026', newPassword: 'baru2026' }),
    });
    assert.equal(res.status, 200);

    res = await fetch(`${baseUrl}/site-config/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'reader', password: 'baru2026' }),
    });
    assert.equal(res.status, 200);

    // 8f. Dynamic Role Options Add & Delete per Workspace
    res = await fetch(`${baseUrl}/site-config/role-options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginRes.token}`,
      },
      body: JSON.stringify({ workspace: 'gereja', action: 'add', role: 'Diaken' }),
    });
    assert.equal(res.status, 200);
    const addedRoleCfg = (await res.json()).config;
    assert.equal(addedRoleCfg.workspaces.gereja.roleOptions.includes('Diaken'), true);

    res = await fetch(`${baseUrl}/site-config/role-options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginRes.token}`,
      },
      body: JSON.stringify({ workspace: 'gereja', action: 'delete', role: 'Diaken' }),
    });
    assert.equal(res.status, 200);
    const deletedRoleCfg = (await res.json()).config;
    assert.equal(deletedRoleCfg.workspaces.gereja.roleOptions.includes('Diaken'), false);

    res = await fetch(`${baseUrl}/site-config/reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${loginRes.token}` },
    });
    assert.equal(res.status, 200);

    // 8e. Hybrid AI endpoints & SFace-only user creation (mobile server-AI mode)
    res = await fetch(`${baseUrl}/ai/health`);
    assert.equal(res.status, 200);
    const aiHealth = await res.json();
    assert.equal(aiHealth.available, false);

    res = await fetch(`${baseUrl}/ai/recognize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'data:image/jpeg;base64,AA==', workspace: 'piloting' }),
    });
    assert.equal(res.status, 503);

    const sfaceVec = makeDescriptor(9.3);
    res = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mobile ServerAI User',
        workspace: 'gereja',
        wilayah: 'Wilayah 2',
        sfaceDescriptor: sfaceVec,
      }),
    });
    assert.equal(res.status, 201);
    const mobileUser = (await res.json()).user;
    assert.equal(mobileUser.sfaceDescriptorCount, 1);
    assert.equal(mobileUser.descriptorCount, 1);

    // Duplicate SFace registration check
    res = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mobile ServerAI Dup',
        workspace: 'gereja',
        sfaceDescriptor: sfaceVec,
      }),
    });
    assert.equal(res.status, 409);

    res = await fetch(`${baseUrl}/users/${mobileUser._id}`, { method: 'DELETE' });
    assert.equal(res.status, 200);

    // 9. Admin CRUD: Update & Delete
    res = await fetch(`${baseUrl}/users/${aliceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ department: 'AI Lab', isActive: false }),
    });
    assert.equal(res.status, 200);
    data = await res.json();
    assert.equal(data.user.department, 'AI Lab');
    assert.equal(data.user.isActive, false);

    res = await fetch(`${baseUrl}/logs/${regLog._id}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    res = await fetch(`${baseUrl}/logs/${unregLog._id}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    res = await fetch(`${baseUrl}/users/${aliceId}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    res = await fetch(`${baseUrl}/users/${bobId}`, { method: 'DELETE' });
    assert.equal(res.status, 200);

    console.log('ALL API & MONGODB INTEGRATION TESTS PASSED!');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  }
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
