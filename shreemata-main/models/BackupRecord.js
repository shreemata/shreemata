const mongoose = require('mongoose');

const BackupRecordSchema = new mongoose.Schema({
  filename: {
    type: String,
    default: () => `shreemata-uncreated-${Date.now()}.archive.gz`,
    index: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'manual', 'test'],
    default: 'daily',
    index: true
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'WARNING', 'IN_PROGRESS'],
    default: 'IN_PROGRESS',
    index: true
  },
  failureStage: {
    type: String,
    enum: ['NONE', 'PRECHECK', 'DUMP', 'VERIFY', 'CHECKSUM', 'UPLOAD', 'RETENTION', 'RESTORE_TEST'],
    default: 'NONE'
  },
  localStatus: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'NOT_ATTEMPTED'],
    default: 'NOT_ATTEMPTED'
  },
  remoteStatus: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'NOT_CONFIGURED', 'NOT_ATTEMPTED'],
    default: 'NOT_CONFIGURED'
  },
  sizeBytes: {
    type: Number,
    default: 0
  },
  checksumSha256: {
    type: String,
    default: null
  },
  storageLocation: {
    type: String,
    enum: ['local', 's3', 'both', 'none'],
    default: 'none'
  },
  s3Bucket: {
    type: String,
    default: null
  },
  s3Key: {
    type: String,
    default: null
  },
  databaseName: {
    type: String,
    default: null
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  },
  durationMs: {
    type: Number,
    default: 0
  },
  errorMessage: {
    type: String,
    default: null
  },
  restoreTested: {
    type: Boolean,
    default: false,
    index: true
  },
  restoreTestedAt: {
    type: Date,
    default: null
  },
  collectionsCount: {
    type: Number,
    default: null
  },
  documentsCount: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

BackupRecordSchema.index({ startedAt: -1 });

module.exports = mongoose.model('BackupRecord', BackupRecordSchema);
