import mongoose from 'mongoose';

let memoryServer = null;
let dbState = {
  mode: 'disconnected',
  uri: '',
  connected: false,
};

export function getDBState() {
  return {
    ...dbState,
    readyState: mongoose.connection.readyState,
  };
}

export async function connectDB() {
  const targetUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    'mongodb://127.0.0.1:27017/presensi_wajah';
  const allowFallback = process.env.ALLOW_EMBEDDED_MONGO_FALLBACK === 'true';

  const maxAttempts = allowFallback ? 1 : 10;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(targetUri, {
        serverSelectionTimeoutMS: allowFallback ? 3000 : 5000,
      });
      dbState = {
        mode: targetUri.includes('mongodb+srv') ? 'atlas' : 'external',
        uri: targetUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
        connected: true,
      };
      console.log(`[MongoDB] Connected (${dbState.mode}): ${dbState.uri}`);
      return dbState;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        console.warn(`[MongoDB] Attempt ${attempt}/${maxAttempts} failed (${err.message}), retrying in 3s...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  if (!allowFallback) {
    console.error('[MongoDB] Connection failed:', lastError?.message);
    throw lastError;
  }

  console.warn(`[MongoDB] External MongoDB unreachable (${lastError?.message}). Starting embedded MongoDB fallback...`);
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'presensi_wajah',
    },
  });
  const memUri = memoryServer.getUri('presensi_wajah');
  await mongoose.connect(memUri);
  dbState = {
    mode: 'embedded',
    uri: memUri,
    connected: true,
  };
  console.log(`[MongoDB] Connected (embedded mongodb-memory-server): ${memUri}`);
  return dbState;
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
