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
