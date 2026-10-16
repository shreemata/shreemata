// routes/notes.js
// Secure catalog, metadata management, and authenticated PDF streaming for READ NOTES
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const multer = require("multer");
const jwt = require("jsonwebtoken");

const Note = require("../models/Note");
const NoteSubscription = require("../models/NoteSubscription");
const User = require("../models/User");
const { authenticateToken, isAdmin } = require("../middleware/auth");

const router = express.Router();

// =========================================================================
// 1. Private Storage Configuration & Security Isolation
// =========================================================================

// Storage directory MUST be strictly outside public/ and outside express.static
const DEFAULT_STORAGE_DIR = path.resolve(__dirname, "../storage/notes/private");
const storageDir = process.env.READ_NOTES_STORAGE_DIR
  ? path.resolve(process.env.READ_NOTES_STORAGE_DIR)
  : DEFAULT_STORAGE_DIR;

// Configurable maximum upload size (default: 50MB)
const MAX_UPLOAD_BYTES = Number(process.env.READ_NOTES_MAX_UPLOAD_BYTES) || (50 * 1024 * 1024);

// Safely ensure private storage directory exists
try {
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
} catch (dirErr) {
  console.error("CRITICAL: Failed to initialize private storage directory:", dirErr.message);
}

/**
 * Resolves and strictly validates that a storage key resides inside storageDir.
 * Prevents directory traversal attacks (e.g. ../../etc/passwd or absolute paths).
 */
function getSafeStoragePath(storageKey) {
  if (!storageKey || typeof storageKey !== "string") {
    throw new Error("Invalid or missing storage key");
  }

  // Strip optional internal prefix if stored (e.g. 'private:uuid.pdf')
  const cleanKey = storageKey.replace(/^private:/, "");

  // Prevent directory separators and path traversal
  if (cleanKey.includes("/") || cleanKey.includes("\\") || cleanKey.includes("..")) {
    throw new Error("Path traversal or illegal path characters detected");
  }

  const safeFilename = path.basename(cleanKey);
  if (!safeFilename || safeFilename === "." || safeFilename === "..") {
    throw new Error("Illegal filename in storage key");
  }

  const resolved = path.resolve(storageDir, safeFilename);
  const normalizedStorage = path.resolve(storageDir);

  if (!resolved.startsWith(normalizedStorage + path.sep) && resolved !== normalizedStorage) {
    throw new Error("Resolved path escapes designated private storage directory");
  }

  return resolved;
}

/**
 * Validates binary content against standard PDF magic bytes (%PDF-).
 * Rejects disguised non-PDF binaries or scripts.
 */
function verifyPdfMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 5) {
    return false;
  }
  // %PDF- in ASCII is 0x25, 0x50, 0x44, 0x46, 0x2D
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

// Memory-based multer upload handler to permit binary inspection before disk persistence
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const isPdfExt = file.originalname && file.originalname.toLowerCase().endsWith(".pdf");
    const isPdfMime = file.mimetype === "application/pdf" || file.mimetype === "application/x-pdf";
    if (isPdfExt || isPdfMime) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type: Only PDF documents are allowed"));
    }
  }
});

// Middleware wrapper for friendly upload error handling
function handlePdfUpload(req, res, next) {
  upload.single("pdf")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: `File size exceeds the permitted limit of ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB`
        });
      }
      return res.status(400).json({ error: err.message || "File upload validation error" });
    }
    next();
  });
}

// Optional authentication middleware for catalog / preview (does not reject unauthenticated users)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (authHeader) {
      const token = authHeader.split(" ")[1];
      if (token && process.env.JWT_SECRET) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("_id role name email").lean();
        if (user) {
          req.user = { id: user._id, role: user.role, name: user.name, email: user.email };
        }
      }
    }
  } catch (e) {
    // Ignore invalid optional tokens for public catalog access
  }
  next();
};

/**
 * Sanitizes note document to ensure internal filesystem paths or storage keys
 * are NEVER returned to clients or public catalog listings.
 */
function sanitizeNote(note) {
  if (!note) return null;
  return {
    id: note._id,
    title: note.title,
    subject: note.subject,
    classLevel: note.classLevel,
    category: note.category,
    description: note.description,
    coverImage: note.coverImage,
    totalPages: note.totalPages,
    fileSize: note.fileSize,
    allowDownload: note.allowDownload,
    isPublished: note.isPublished,
    viewCount: note.viewCount,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  };
}

// =========================================================================
// 2. GET /api/notes (Catalog with safe pagination and filters)
// =========================================================================
router.get("/", optionalAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const skip = (page - 1) * limit;

    const query = {};
    const isAdminUser = req.user && req.user.role === "admin";

    // Publication filter: Ordinary users ONLY see isPublished: true
    if (!isAdminUser) {
      query.isPublished = true;
    } else if (req.query.isPublished !== undefined && req.query.isPublished !== "all") {
      query.isPublished = req.query.isPublished === "true" || req.query.isPublished === true;
    }

    // Category filter
    if (req.query.category && typeof req.query.category === "string") {
      query.category = req.query.category.trim();
    }

    // Class level filter
    if (req.query.classLevel && typeof req.query.classLevel === "string") {
      query.classLevel = req.query.classLevel.trim();
    }

    // Subject filter
    if (req.query.subject && typeof req.query.subject === "string") {
      query.subject = req.query.subject.trim();
    }

    // Search query (safe regex escaping to prevent ReDoS)
    if (req.query.search && typeof req.query.search === "string") {
      const sanitizedSearch = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (sanitizedSearch) {
        query.$or = [
          { title: { $regex: sanitizedSearch, $options: "i" } },
          { subject: { $regex: sanitizedSearch, $options: "i" } },
          { description: { $regex: sanitizedSearch, $options: "i" } }
        ];
      }
    }

    const [totalNotes, notes] = await Promise.all([
      Note.countDocuments(query),
      Note.find(query)
        .select("-pdfUrl -uploadedBy") // Explicitly exclude internal storage keys
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const sanitizedNotes = notes.map(sanitizeNote);

    return res.json({
      success: true,
      notes: sanitizedNotes,
      pagination: {
        page,
        limit,
        totalNotes,
        totalPages: Math.ceil(totalNotes / limit) || 1
      }
    });
  } catch (err) {
    console.error("Error fetching notes catalog:", err.message);
    return res.status(500).json({ error: "Failed to retrieve notes catalog" });
  }
});

// =========================================================================
// 3. GET /api/notes/:id (Safe note metadata)
// =========================================================================
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid note ID format" });
    }

    const note = await Note.findById(id).lean();

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    const isAdminUser = req.user && req.user.role === "admin";

    // If unpublished and not admin, return 404 to avoid leaking metadata
    if (!note.isPublished && !isAdminUser) {
      return res.status(404).json({ error: "Note not found" });
    }

    // Atomically increment view count
    await Note.findByIdAndUpdate(note._id, { $inc: { viewCount: 1 } });

    return res.json({
      success: true,
      note: sanitizeNote(note)
    });
  } catch (err) {
    console.error("Error fetching note details:", err.message);
    return res.status(500).json({ error: "Failed to retrieve note details" });
  }
});

// =========================================================================
// 4. POST /api/notes (Admin-only PDF upload & note creation)
// =========================================================================
router.post("/", authenticateToken, isAdmin, handlePdfUpload, async (req, res) => {
  try {
    const { title, subject, classLevel, category, description, coverImage, totalPages, allowDownload, isPublished } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Title is required and must not be empty" });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "PDF file is required for upload" });
    }

    // Binary magic bytes inspection
    if (!verifyPdfMagicBytes(req.file.buffer)) {
      return res.status(400).json({ error: "Invalid file content: Uploaded file is not a valid PDF document" });
    }

    // Generate random server-side filename (UUID based)
    const randomKey = `note_${crypto.randomUUID()}.pdf`;
    const safeFilePath = getSafeStoragePath(randomKey);

    // Write file to private storage
    await fs.promises.writeFile(safeFilePath, req.file.buffer);

    const note = await Note.create({
      title: title.trim(),
      subject: (subject || "").trim(),
      classLevel: (classLevel || "").trim(),
      category: (category || "Study Notes").trim(),
      description: (description || "").trim(),
      coverImage: (coverImage || "").trim(),
      pdfUrl: randomKey, // Internal storage key, never an absolute path
      fileSize: req.file.size || req.file.buffer.length,
      totalPages: totalPages ? Math.max(0, parseInt(totalPages, 10) || 0) : 0,
      allowDownload: allowDownload === "true" || allowDownload === true,
      isPublished: isPublished !== "false" && isPublished !== false,
      uploadedBy: req.user.id
    });

    return res.status(201).json({
      success: true,
      message: "Note uploaded and created successfully",
      note: sanitizeNote(note)
    });
  } catch (err) {
    console.error("Error creating note:", err.message);
    return res.status(500).json({ error: "Failed to create note record" });
  }
});

// =========================================================================
// 5. PUT /api/notes/:id (Admin-only metadata & optional replacement PDF)
// =========================================================================
router.put("/:id", authenticateToken, isAdmin, handlePdfUpload, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid note ID format" });
    }

    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    // If replacement PDF is uploaded
    if (req.file && req.file.buffer) {
      if (!verifyPdfMagicBytes(req.file.buffer)) {
        return res.status(400).json({ error: "Invalid file content: Uploaded replacement file is not a valid PDF" });
      }

      const newKey = `note_${crypto.randomUUID()}.pdf`;
      const newFilePath = getSafeStoragePath(newKey);
      await fs.promises.writeFile(newFilePath, req.file.buffer);

      // Clean up previous storage file safely
      if (note.pdfUrl) {
        try {
          const oldFilePath = getSafeStoragePath(note.pdfUrl);
          if (fs.existsSync(oldFilePath)) {
            await fs.promises.unlink(oldFilePath);
          }
        } catch (unlinkErr) {
          console.warn("Storage cleanup notice on note replacement:", unlinkErr.message);
        }
      }

      note.pdfUrl = newKey;
      note.fileSize = req.file.size || req.file.buffer.length;
    }

    // Update metadata fields if provided
    if (req.body.title !== undefined) {
      if (typeof req.body.title !== "string" || !req.body.title.trim()) {
        return res.status(400).json({ error: "Title must not be empty" });
      }
      note.title = req.body.title.trim();
    }
    if (req.body.subject !== undefined) note.subject = req.body.subject.trim();
    if (req.body.classLevel !== undefined) note.classLevel = req.body.classLevel.trim();
    if (req.body.category !== undefined) note.category = req.body.category.trim();
    if (req.body.description !== undefined) note.description = req.body.description.trim();
    if (req.body.coverImage !== undefined) note.coverImage = req.body.coverImage.trim();
    if (req.body.totalPages !== undefined) {
      note.totalPages = Math.max(0, parseInt(req.body.totalPages, 10) || 0);
    }
    if (req.body.allowDownload !== undefined) {
      note.allowDownload = req.body.allowDownload === "true" || req.body.allowDownload === true;
    }
    if (req.body.isPublished !== undefined) {
      note.isPublished = req.body.isPublished === "true" || req.body.isPublished === true;
    }

    await note.save();

    return res.json({
      success: true,
      message: "Note updated successfully",
      note: sanitizeNote(note)
    });
  } catch (err) {
    console.error("Error updating note:", err.message);
    return res.status(500).json({ error: "Failed to update note" });
  }
});

// =========================================================================
// 6. DELETE /api/notes/:id (Admin-only safe deletion with storage cleanup)
// =========================================================================
router.delete("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid note ID format" });
    }

    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    // Safely remove PDF file from private disk storage
    if (note.pdfUrl) {
      try {
        const filePath = getSafeStoragePath(note.pdfUrl);
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
      } catch (unlinkErr) {
        console.warn("Storage cleanup notice on note delete:", unlinkErr.message);
      }
    }

    await Note.findByIdAndDelete(note._id);

    return res.json({
      success: true,
      message: "Note deleted successfully"
    });
  } catch (err) {
    console.error("Error deleting note:", err.message);
    return res.status(500).json({ error: "Failed to delete note" });
  }
});

// =========================================================================
// 7. GET /api/notes/:id/stream (Protected streaming endpoint with byte-ranges)
// =========================================================================
router.get("/:id/stream", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Gate 1: Parameter format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid note ID format" });
    }

    // Gate 2: Note existence & publication check
    const note = await Note.findById(id).lean();
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    const isAdminUser = req.user && req.user.role === "admin";
    if (!note.isPublished && !isAdminUser) {
      return res.status(404).json({ error: "Note not found" });
    }

    // Gate 3: Entitlement verification (Active subscription OR Admin preview)
    if (!isAdminUser) {
      const now = new Date();
      const activeSubscription = await NoteSubscription.findOne({
        userId: req.user.id,
        status: "active",
        expiresAt: { $gt: now }
      }).lean();

      if (!activeSubscription) {
        return res.status(403).json({
          error: "An active READ NOTES subscription is required to view this note",
          code: "SUBSCRIPTION_REQUIRED"
        });
      }
    }

    // Gate 4: Resolve and verify private storage file
    let filePath;
    try {
      filePath = getSafeStoragePath(note.pdfUrl);
    } catch (pathErr) {
      console.error("Security path violation on streaming request:", pathErr.message);
      return res.status(500).json({ error: "Internal file resolution error" });
    }

    if (!fs.existsSync(filePath)) {
      console.error(`Missing PDF file on disk: ${filePath}`);
      return res.status(404).json({ error: "Document content file is not available" });
    }

    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;

    // Gate 5: Byte-Range handling for protected readers (PDF.js / native mobile viewers)
    const rangeHeader = req.headers["range"];

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      // Validate range boundaries
      if (isNaN(start) || isNaN(end) || start > end || start >= fileSize || end >= fileSize || start < 0) {
        res.setHeader("Content-Range", `bytes */${fileSize}`);
        return res.status(416).json({ error: "Requested Range Not Satisfiable" });
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="document.pdf"',
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.on("error", (err) => {
        console.error("Range stream transmission error:", err.message);
        if (!res.headersSent) res.status(500).end();
      });
      return stream.pipe(res);
    }

    // Full document streaming
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="document.pdf"',
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    });

    const fullStream = fs.createReadStream(filePath);
    fullStream.on("error", (err) => {
      console.error("Full stream transmission error:", err.message);
      if (!res.headersSent) res.status(500).end();
    });
    return fullStream.pipe(res);
  } catch (err) {
    console.error("Streaming endpoint unexpected error:", err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to stream document" });
    }
  }
});

// Export helper utilities for isolated testing
router._testHelpers = {
  getSafeStoragePath,
  verifyPdfMagicBytes,
  sanitizeNote,
  DEFAULT_STORAGE_DIR
};

module.exports = router;
