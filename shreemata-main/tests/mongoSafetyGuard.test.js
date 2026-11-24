/**
 * @jest-environment node
 *
 * tests/mongoSafetyGuard.test.js
 *
 * Verifies that the MongoDB Safety Guard in tests/jest.setup.js strictly
 * blocks non-local database connection attempts before any network socket is opened,
 * scrubs credentials from all error messages, and permits 127.0.0.1 / localhost.
 */

const net = require('net');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

describe('MongoDB Connection Safety Guard', () => {
  let netConnectSpy;
  let socketConnectSpy;

  beforeEach(() => {
    netConnectSpy = jest.spyOn(net, 'connect');
    socketConnectSpy = jest.spyOn(net.Socket.prototype, 'connect');
  });

  afterEach(async () => {
    netConnectSpy.mockRestore();
    socketConnectSpy.mockRestore();
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('1. Rejects non-local host on mongoose.connect and verifies no network socket is opened', async () => {
    const fakePass = 'super_secret_password_123';
    const fakeUser = 'fakeuser';
    const remoteHost = '203.0.113.10';
    const remoteUri = `mongodb://${fakeUser}:${fakePass}@${remoteHost}:27017/testdb`;

    let caughtError = null;
    try {
      await mongoose.connect(remoteUri);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.message).toContain('TEST SAFETY GUARD');
    expect(caughtError.message).toContain(remoteHost);
    expect(caughtError.message).not.toContain(fakePass);
    expect(caughtError.message).not.toContain(fakeUser);

    // Verify zero network socket attempts were initiated
    expect(netConnectSpy).not.toHaveBeenCalled();
    expect(socketConnectSpy).not.toHaveBeenCalled();
  });

  test('2. Rejects non-local host on mongoose.createConnection synchronously without opening socket', () => {
    const fakePass = 'confidential_pw_456';
    const fakeUser = 'audituser';
    const remoteHost = '198.51.100.25';
    const remoteUri = `mongodb://${fakeUser}:${fakePass}@${remoteHost}:27017/reporting`;

    let caughtError = null;
    try {
      mongoose.createConnection(remoteUri);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.message).toContain('TEST SAFETY GUARD');
    expect(caughtError.message).toContain(remoteHost);
    expect(caughtError.message).not.toContain(fakePass);
    expect(caughtError.message).not.toContain(fakeUser);

    // Verify zero network socket attempts were initiated
    expect(netConnectSpy).not.toHaveBeenCalled();
    expect(socketConnectSpy).not.toHaveBeenCalled();
  });

  test('3. Rejects non-local host on Connection.prototype.openUri without leaking credentials', async () => {
    const fakePass = 'classified_pass_789';
    const fakeUser = 'dbuser';
    const remoteHost = '13.232.234.218';
    const remoteUri = `mongodb://${fakeUser}:${fakePass}@${remoteHost}:27017/app`;

    const conn = mongoose.createConnection();
    let caughtError = null;
    try {
      await conn.openUri(remoteUri);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.message).toContain('TEST SAFETY GUARD');
    expect(caughtError.message).toContain(remoteHost);
    expect(caughtError.message).not.toContain(fakePass);
    expect(caughtError.message).not.toContain(fakeUser);

    expect(netConnectSpy).not.toHaveBeenCalled();
    expect(socketConnectSpy).not.toHaveBeenCalled();
  });

  test('4. Rejects mongodb+srv remote connection strings without leaking credentials', async () => {
    const fakePass = 'vault_secret_999';
    const fakeUser = 'adminuser';
    const srvHost = 'atlas-cluster.example.mongodb.net';
    const remoteUri = `mongodb+srv://${fakeUser}:${fakePass}@${srvHost}/production?retryWrites=true`;

    let caughtError = null;
    try {
      await mongoose.connect(remoteUri);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.message).toContain('TEST SAFETY GUARD');
    expect(caughtError.message).toContain(srvHost);
    expect(caughtError.message).not.toContain(fakePass);
    expect(caughtError.message).not.toContain(fakeUser);

    expect(netConnectSpy).not.toHaveBeenCalled();
    expect(socketConnectSpy).not.toHaveBeenCalled();
  });

  test('5. Rejects multi-host URI containing at least one remote host', async () => {
    const fakePass = 'shhhh_key_000';
    const fakeUser = 'clusteruser';
    const remotePeer = 'remote-peer.corp.internal';
    const multiUri = `mongodb://${fakeUser}:${fakePass}@127.0.0.1:27017,${remotePeer}:27017/replica`;

    let caughtError = null;
    try {
      await mongoose.connect(multiUri);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.message).toContain('TEST SAFETY GUARD');
    expect(caughtError.message).toContain(remotePeer);
    expect(caughtError.message).not.toContain(fakePass);
    expect(caughtError.message).not.toContain(fakeUser);

    expect(netConnectSpy).not.toHaveBeenCalled();
    expect(socketConnectSpy).not.toHaveBeenCalled();
  });

  test('6. Accepts 127.0.0.1 and localhost connections to MongoMemoryServer', async () => {
    const mongod = await MongoMemoryServer.create();
    const localUri = mongod.getUri();

    // 1. mongoose.connect with localUri succeeds
    await mongoose.connect(localUri);
    expect(mongoose.connection.readyState).toBe(1);
    await mongoose.disconnect();

    // 2. mongoose.createConnection with localUri succeeds
    const conn = mongoose.createConnection(localUri);
    await conn.asPromise();
    expect(conn.readyState).toBe(1);
    await conn.close();

    await mongod.stop();
  });

  test('7. Allows missing or undefined URI to fail through standard Mongoose parameter validation', async () => {
    let caughtError = null;
    try {
      await mongoose.connect();
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.message).toContain('must be a string');
    expect(caughtError.message).not.toContain('TEST SAFETY GUARD');
  });
});
