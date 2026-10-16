// models/Note.js
// Data model for digital study notes (READ NOTES feature)
const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    default: '',
    trim: true
  },
  classLevel: {
    type: String,
    default: '',
    trim: true
  },
  category: {
    type: String,
    default: 'Study Notes',
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  coverImage: {
    type: String,
    default: ''
  },
  // Private internal storage key or path (e.g., 'private/notes/uuid.pdf')
  // Digital assets MUST NEVER be stored in public folders or exposed via public permanent URLs.
  pdfUrl: {
    type: String,
    required: true,
    trim: true
  },
  fileSize: {
    type: Number,
    default: 0,
    min: [0, 'fileSize cannot be negative']
  },
  totalPages: {
    type: Number,
    default: 0,
    min: [0, 'totalPages cannot be negative']
  },
  // Default policy: downloads disabled by default. Content read strictly inside protected reader.
  allowDownload: {
    type: Boolean,
    default: false
  },
  isPublished: {
    type: Boolean,
    default: true
  },
  viewCount: {
    type: Number,
    default: 0,
    min: [0, 'viewCount cannot be negative']
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for high-performance catalog browsing and filtering
noteSchema.index({ isPublished: 1, category: 1, classLevel: 1 });
noteSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Note', noteSchema);
