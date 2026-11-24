// Increase timeout for MongoDB memory server
jest.setTimeout(60000);

const mongoose = require('mongoose');

/**
 * TEST SAFETY GUARD:
 * Enforces that no Jest test may ever connect to a non-local MongoDB instance.
 * Allows only 127.0.0.1, localhost, or ::1.
 * Throws an Error naming only the disallowed host, never credentials or full URI.
 */
function assertLocalMongoUri(uriStr) {
  if (typeof uriStr !== 'string') {
    return; // Let native Mongoose handle missing or non-string parameter
  }

  const match = uriStr.match(/^mongodb(?:\+srv)?:\/\/(?:[^@]+@)?([^/?#]+)/i);
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);

  if (!match) {
    let hostname = '';
    try {
      const u = new URL(uriStr);
      hostname = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    } catch {
      return; // Invalid format - let native Mongoose handle
    }
    if (!allowedHosts.has(hostname)) {
      throw new Error(`TEST SAFETY GUARD: Refusing connection to non-local MongoDB host "${hostname}". Tests may only connect to 127.0.0.1, localhost, or ::1.`);
    }
    return;
  }

  const hostSection = match[1];
  const hostEntries = hostSection.split(',');

  for (const entry of hostEntries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    let hostname;
    try {
      const u = new URL('mongodb://' + trimmed);
      hostname = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    } catch {
      hostname = trimmed.split(':')[0].replace(/^\[|\]$/g, '').toLowerCase();
    }

    if (!allowedHosts.has(hostname)) {
      throw new Error(`TEST SAFETY GUARD: Refusing connection to non-local MongoDB host "${hostname}". Tests may only connect to 127.0.0.1, localhost, or ::1.`);
    }
  }
}

// Wrap mongoose.connect
const origConnect = mongoose.connect;
mongoose.connect = function(uri) {
  assertLocalMongoUri(uri);
  return origConnect.apply(this, arguments);
};

// Wrap mongoose.createConnection
const origCreateConnection = mongoose.createConnection;
mongoose.createConnection = function(uri) {
  if (arguments.length > 0) {
    assertLocalMongoUri(uri);
  }
  return origCreateConnection.apply(this, arguments);
};

// Wrap Connection.prototype.openUri
const origOpenUri = mongoose.Connection.prototype.openUri;
mongoose.Connection.prototype.openUri = function(uri) {
  assertLocalMongoUri(uri);
  return origOpenUri.apply(this, arguments);
};
