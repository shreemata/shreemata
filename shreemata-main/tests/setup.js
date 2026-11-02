const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Setup before all tests
async function setupTestDB() {
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'test',
      storageEngine: 'wiredTiger'
    },
    binary: {
      version: '7.0.0'
    }
  });
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 30000
  });

  const host = mongoose.connection.host || '';
  const name = mongoose.connection.name || '';
  if (host !== '127.0.0.1' && host !== 'localhost') {
    await teardownTestDB();
    throw new Error(`[SAFETY GATE] Tests must use a local test database. Host '${host}' is forbidden.`);
  }
  if (!name || /prod|production/i.test(name)) {
    await teardownTestDB();
    throw new Error(`[SAFETY GATE] Database name '${name}' resembles production. Connection aborted.`);
  }
}

// Cleanup after all tests
async function teardownTestDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
}

// Clear all collections between tests
async function clearTestDB() {
  const host = mongoose.connection.host || '';
  const name = mongoose.connection.name || '';
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`[SAFETY GATE] Refusing to wipe non-local DB: host=${host}, name=${name}`);
  }
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
}

module.exports = {
  setupTestDB,
  teardownTestDB,
  clearTestDB
};
