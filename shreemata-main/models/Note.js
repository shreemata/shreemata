// models/Note.js
// Data model for digital study notes, question papers, and video lectures
const mongoose = require('mongoose');

function resolveSection(context) {
  if (context && context.section) return context.section;
  if (context && typeof context.getUpdate === 'function') {
    const update = context.getUpdate();
    if (update) {
      if (update.$set && update.$set.section) return update.$set.section;
      if (update.section) return update.section;
    }
  }
  return 'notes';
}

const noteSchema = new mongoose.Schema({
  // Section discriminator (4-Section architecture)
  section: {
    type: String,
    enum: ['notes', 'question_papers', 'videos'],
    default: 'notes',
    required: true,
    index: true
  },
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
  // Conditional: Required for 'notes' and 'question_papers', not required for 'videos'
  pdfUrl: {
    type: String,
    default: '',
    trim: true,
    validate: {
      validator: function(val) {
        const sec = resolveSection(this);
        if (sec === 'videos') {
          return true; // Not required for videos
        }
        return typeof val === 'string' && val.trim().length > 0;
      },
      message: 'pdfUrl is required for notes and question_papers'
    }
  },
  // Hosted video URL or ID (Bunny / Vimeo / YouTube unlisted / HLS)
  // Required when section === 'videos'
  videoUrl: {
    type: String,
    default: '',
    trim: true,
    validate: {
      validator: function(val) {
        const sec = resolveSection(this);
        if (sec === 'videos') {
          return typeof val === 'string' && val.trim().length > 0;
        }
        return true;
      },
      message: 'videoUrl is required when section is videos'
    }
  },
  videoProvider: {
    type: String,
    enum: ['bunny', 'vimeo', 'youtube_unlisted', 'hls', 'none'],
    default: 'none'
  },
  durationMinutes: {
    type: Number,
    default: 0,
    min: [0, 'durationMinutes cannot be negative']
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
  // Free preview flag per item (true = open for everyone without subscription)
  isFree: {
    type: Boolean,
    default: false,
    index: true
  },
  // Sort priority / display order
  order: {
    type: Number,
    default: 0,
    index: true
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

// Indexes for high-performance multi-section catalog browsing and filtering
noteSchema.index({ section: 1, isPublished: 1, order: 1, createdAt: -1 });
noteSchema.index({ section: 1, subject: 1, classLevel: 1 });
noteSchema.index({ isPublished: 1, category: 1, classLevel: 1 });
noteSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Note', noteSchema, 'notes');
