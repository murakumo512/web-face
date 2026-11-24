import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { connectDB, disconnectDB, getDBState } from './config/db.js';
import usersRouter from './routes/users.js';
import logsRouter from './routes/logs.js';
import summaryRouter from './routes/summary.js';
import siteConfigRouter from './routes/siteConfig.js';
import aiRouter from './routes/ai.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 5001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    db: getDBState(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/users', usersRouter);
app.use('/api/logs', logsRouter);
app.use('/api/summary', summaryRouter);
app.use('/api/site-config', siteConfigRouter);
app.use('/api/ai', aiRouter);

// Serve built React app in production if available
const distDir = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

let server;

async function start() {
  await connectDB();
  server = app.listen(PORT, () => {
    console.log(`[API] Server running on http://localhost:${PORT}`);
  });
}

async function shutdown(signal) {
  console.log(`\n[Server] Received ${signal}, shutting down...`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDB();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
