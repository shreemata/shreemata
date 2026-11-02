// routes/notes.js
// Secure catalog, metadata management, and authenticated PDF/media streaming for 4-Section platform
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
const { FEATURES } = require("../config/features");

const router = express.Router();

// =========================================================================
// 1. Private Storage Configuration & Security Isolation
// =========================================================================

const DEFAULT_STORAGE_DIR = path.resolve(__dirname, "../storage/notes/private");
function getStorageDir() {
  const dir = process.env.READ_NOTES_STORAGE_DIR
    ? path.resolve(process.env.READ_NOTES_STORAGE_DIR)
    : DEFAULT_STORAGE_DIR;
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (dirErr) {
    console.error("CRITICAL: Failed to initialize private storage directory:", dirErr.message);
  }
  return dir;
}

// Ensure private storage directory exists on bootstrap
getStorageDir();

const MAX_UPLOAD_BYTES = Number(process.env.READ_NOTES_MAX_UPLOAD_BYTES) || (50 * 1024 * 1024);

/**
 * Resolves and strictly validates that a storage key resides inside storageDir.
 * Prevents directory traversal attacks (e.g. ../../etc/passwd or absolute paths).
 */
function getSafeStoragePath(storageKey) {
  if (!storageKey || typeof storageKey !== "string") {
    throw new Error("Invalid or missing storage key");
  }

  const cleanKey = storageKey.replace(/^private:/, "");

  if (cleanKey.includes("/") || cleanKey.includes("\\") || cleanKey.includes("..")) {
    throw new Error("Path traversal or illegal path characters detected");
  }

  const safeFilename = path.basename(cleanKey);
  if (!safeFilename || safeFilename === "." || safeFilename === "..") {
    throw new Error("Illegal filename in storage key");
  }

  const currentStorageDir = getStorageDir();
  const resolved = path.resolve(currentStorageDir, safeFilename);
  const normalizedStorage = path.resolve(currentStorageDir);

  if (!resolved.startsWith(normalizedStorage + path.sep) && resolved !== normalizedStorage) {
    throw new Error("Resolved path escapes designated private storage directory");
  }

  return resolved;
}

/**
 * Validates binary content against standard PDF magic bytes (%PDF-).
 */
function verifyPdfMagicBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 5) {
    return false;
  }
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

// Memory-based multer upload handler
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

function handleOptionalPdfUpload(req, res, next) {
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

// =========================================================================
// 2. Video URL Validation & Allow-List
// =========================================================================

const ALLOWED_VIDEO_HOSTS = [
  'iframe.mediadelivery.net',
  'video.bunnycdn.com',
  'player.vimeo.com',
  'vimeo.com',
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com'
];

function isYouTubeHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  const h = hostname.toLowerCase();
  return (
    h === 'youtube.com' ||
    h.endsWith('.youtube.com') ||
    h === 'youtu.be' ||
    h.endsWith('.youtu.be') ||
    h === 'youtube-nocookie.com' ||
    h.endsWith('.youtube-nocookie.com')
  );
}

function validateVideoUrl(urlStr, isFree = false, provider = 'none') {
  if (!urlStr || typeof urlStr !== 'string' || !urlStr.trim()) {
    return { valid: false, error: 'Video URL is required for video lecture items' };
  }
  const cleanUrl = urlStr.trim();

  let parsed;
  try {
    parsed = new URL(cleanUrl);
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Must be HTTPS only
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Video URL must use HTTPS protocol' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Paid items may NOT use youtube_unlisted or youtube URLs
  const isYouTube = isYouTubeHost(hostname) || provider === 'youtube_unlisted';
  if (isYouTube && !isFree) {
    return { valid: false, error: 'YouTube unlisted videos are only permitted for free preview items. Paid items must use protected video providers.' };
  }

  const isHls = parsed.pathname.toLowerCase().endsWith('.m3u8');
  const isAllowedHost = isYouTubeHost(hostname) || ALLOWED_VIDEO_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));

  if (!isAllowedHost && !isHls) {
    return { valid: false, error: `Host "${hostname}" is not in the allowed video provider list.` };
  }

  return { valid: true, cleanUrl };
}

// =========================================================================
// 3. Optional Authentication & Access Evaluation Engine
// =========================================================================

// Optional authentication: extracts Bearer token from headers only. Invalid token = treated as guest.
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      if (token && process.env.JWT_SECRET) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded.id && mongoose.Types.ObjectId.isValid(decoded.id)) {
          const user = await User.findById(decoded.id).select("_id role name email").lean();
          if (user) {
            req.user = { id: user._id, role: user.role, name: user.name, email: user.email };
          }
        }
      }
    }
  } catch (e) {
    // Treat invalid or expired token as guest
    req.user = undefined;
  }
  next();
};

/**
 * Authoritative Access Evaluation Rule:
 * 1. Published check: ordinary users ONLY see isPublished: true. Unpublished items return 404 to non-admins.
 * 2. isFree check: if item.isFree is true, allowed for everyone (even unauthenticated).
 * 3. Paid items: require login (401 if unauthenticated).
 * 4. Admin bypass: admin user can view any item.
 * 5. Subscription check: user must have an active subscription for item.section with expiresAt > NOW.
 *    If expired or missing: 403 Forbidden with code 'SUBSCRIPTION_REQUIRED' and section.
 */
async function evaluateItemAccess(item, user) {
  const isAdminUser = Boolean(user && user.role === 'admin');
  const targetSection = item.section || 'notes';

  if (!checkSectionFeatureFlag(targetSection, isAdminUser)) {
    return { allowed: false, status: 404, error: `Section ${targetSection} is currently disabled` };
  }

  if (!item.isPublished && !isAdminUser) {
    return { allowed: false, status: 404, error: "Note not found" };
  }

  if (item.isFree) {
    return { allowed: true, isFree: true, isAdmin: isAdminUser };
  }

  if (!user) {
    return { allowed: false, status: 401, error: "Authentication required to access this item" };
  }

  if (isAdminUser) {
    return { allowed: true, isFree: false, isAdmin: true };
  }

  const now = new Date();

  const subQuery = {
    userId: user.id,
    status: 'active',
    expiresAt: { $gt: now }
  };
  if (targetSection === 'notes') {
    subQuery.$or = [
      { section: 'notes' },
      { section: { $exists: false } },
      { section: null }
    ];
  } else {
    subQuery.section = targetSection;
  }

  const activeSubscription = await NoteSubscription.findOne(subQuery).lean();

  if (!activeSubscription) {
    return {
      allowed: false,
      status: 403,
      error: `An active subscription is required to access ${targetSection}`,
      code: "SUBSCRIPTION_REQUIRED",
      section: targetSection
    };
  }

  return { allowed: true, isFree: false, isAdmin: false, subscription: activeSubscription };
}

/**
 * Sanitizes item to NEVER leak internal storage paths (pdfUrl) or video URLs in list endpoints.
 */
function sanitizeNote(note) {
  if (!note) return null;
  return {
    id: note._id,
    section: note.section || 'notes',
    title: note.title,
    subject: note.subject || '',
    classLevel: note.classLevel || '',
    category: note.category || 'Study Notes',
    description: note.description || '',
    coverImage: note.coverImage || '',
    videoProvider: note.videoProvider || 'none',
    durationMinutes: note.durationMinutes || 0,
    totalPages: note.totalPages || 0,
    fileSize: note.fileSize || 0,
    isFree: Boolean(note.isFree),
    order: note.order || 0,
    allowDownload: Boolean(note.allowDownload),
    isPublished: Boolean(note.isPublished),
    viewCount: note.viewCount || 0,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt
  };
}

function checkSectionFeatureFlag(section, isAdminUser) {
  if (isAdminUser) return true;
  if (section === 'notes') return Boolean(FEATURES.readNotes);
  if (section === 'question_papers') return Boolean(FEATURES.questionPapers);
  if (section === 'videos') return Boolean(FEATURES.videos);
  return false;
}

// =========================================================================
// 4. GET /api/notes (Catalog with ?section=, pagination, search, filters)
// =========================================================================
router.get("/", optionalAuth, async (req, res) => {
  try {
    const rawSection = (req.query.section || 'notes').toLowerCase().trim();
    const validSections = ['notes', 'question_papers', 'videos'];
    if (!validSections.includes(rawSection)) {
      return res.status(400).json({ error: "Invalid section parameter. Allowed: notes, question_papers, videos" });
    }

    const isAdminUser = req.user && req.user.role === "admin";

    // Section feature flag gate
    if (!checkSectionFeatureFlag(rawSection, isAdminUser)) {
      return res.status(404).json({
        success: false,
        error: `Section ${rawSection} is currently disabled`,
        featureDisabled: true
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const skip = (page - 1) * limit;

    const sectionClause = (rawSection === 'notes')
      ? { $or: [{ section: 'notes' }, { section: { $exists: false } }, { section: null }] }
      : { section: rawSection };

    const andConditions = [sectionClause];

    // Publication filter
    if (!isAdminUser) {
      andConditions.push({ isPublished: true });
    } else if (req.query.isPublished !== undefined && req.query.isPublished !== "all") {
      andConditions.push({ isPublished: req.query.isPublished === "true" || req.query.isPublished === true });
    }

    // Free filter
    if (req.query.isFree !== undefined && req.query.isFree !== "all") {
      andConditions.push({ isFree: req.query.isFree === "true" || req.query.isFree === true });
    }

    // Category filter
    if (req.query.category && typeof req.query.category === "string" && req.query.category.trim()) {
      andConditions.push({ category: req.query.category.trim() });
    }

    // Class level filter
    if (req.query.classLevel && typeof req.query.classLevel === "string" && req.query.classLevel.trim()) {
      andConditions.push({ classLevel: req.query.classLevel.trim() });
    }

    // Subject filter
    if (req.query.subject && typeof req.query.subject === "string" && req.query.subject.trim()) {
      const sanitizedSubject = req.query.subject.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      andConditions.push({ subject: { $regex: new RegExp(`^${sanitizedSubject}$`, "i") } });
    }

    // Search query
    if (req.query.search && typeof req.query.search === "string" && req.query.search.trim()) {
      const sanitizedSearch = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (sanitizedSearch) {
        andConditions.push({
          $or: [
            { title: { $regex: sanitizedSearch, $options: "i" } },
            { subject: { $regex: sanitizedSearch, $options: "i" } },
            { description: { $regex: sanitizedSearch, $options: "i" } }
          ]
        });
      }
    }

    const query = andConditions.length > 1 ? { $and: andConditions } : andConditions[0];

    // Projections strictly omit pdfUrl and videoUrl
    const [totalNotes, notes] = await Promise.all([
      Note.countDocuments(query),
      Note.find(query)
        .select("-pdfUrl -videoUrl -uploadedBy")
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const sanitizedNotes = notes.map(sanitizeNote);

    return res.json({
      success: true,
      section: rawSection,
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
// 5. GET /api/notes/subjects (Distinct available subjects per section)
// =========================================================================
router.get("/subjects", optionalAuth, async (req, res) => {
  try {
    const rawSection = (req.query.section || 'notes').toLowerCase().trim();
    const validSections = ['notes', 'question_papers', 'videos'];
    if (!validSections.includes(rawSection)) {
      return res.status(400).json({ error: "Invalid section parameter" });
    }

    const isAdminUser = req.user && req.user.role === "admin";
    if (!checkSectionFeatureFlag(rawSection, isAdminUser)) {
      return res.status(404).json({ error: `Section ${rawSection} is currently disabled` });
    }

    const sectionClause = (rawSection === 'notes')
      ? { $or: [{ section: 'notes' }, { section: { $exists: false } }, { section: null }] }
      : { section: rawSection };

    const andConditions = [sectionClause];
    if (!isAdminUser) andConditions.push({ isPublished: true });

    const filter = andConditions.length > 1 ? { $and: andConditions } : andConditions[0];

    const rawSubjects = await Note.distinct("subject", filter);
    const subjects = rawSubjects
      .filter((s) => s && typeof s === "string" && s.trim().length > 0)
      .map((s) => s.trim())
      .sort((a, b) => a.localeCompare(b));

    return res.json({ success: true, section: rawSection, subjects });
  } catch (err) {
    console.error("Error retrieving note subjects:", err.message);
    return res.status(500).json({ error: "Failed to retrieve subjects" });
  }
});

// =========================================================================
// 6. GET /api/notes/:id (Single note metadata, never leaks pdfUrl or videoUrl)
// =========================================================================
router.get("/:id", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid note ID format" });
    }

    const note = await Note.findById(id).select("-pdfUrl -videoUrl -uploadedBy").lean();

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    const isAdminUser = req.user && req.user.role === "admin";

    if (!note.isPublished && !isAdminUser) {
      return res.status(404).json({ error: "Note not found" });
    }

    if (!checkSectionFeatureFlag(note.section || 'notes', isAdminUser)) {
      return res.status(404).json({ error: `Section ${note.section || 'notes'} is currently disabled` });
    }

    if (req.user) {
      await Note.findByIdAndUpdate(note._id, { $inc: { viewCount: 1 } });
    }

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
// 7. GET /api/notes/:id/stream (Protected PDF streaming with byte-ranges)
// =========================================================================
router.get("/:id/stream", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid note ID format" });
    }

    const note = await Note.findById(id).lean();
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    // Gate: access rule
    const access = await evaluateItemAccess(note, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({
        error: access.error,
        code: access.code,
        section: access.section
      });
    }

    if (note.section === 'videos') {
      return res.status(400).json({ error: "Video lecture items cannot be streamed as PDF documents. Use /media-url instead." });
    }

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

    const rangeHeader = req.headers["range"];

    if (rangeHeader && typeof rangeHeader === "string") {
      const match = rangeHeader.trim().match(/^bytes=(-?\d*)-(\d*)$/);
      if (!match) {
        res.setHeader("Content-Range", `bytes */${fileSize}`);
        return res.status(416).json({ error: "Requested Range Not Satisfiable" });
      }

      let start;
      let end;
      const rawStart = match[1];
      const rawEnd = match[2];

      if (rawStart === "") {
        // Suffix range: bytes=-N
        const suffixLength = parseInt(rawEnd, 10);
        if (isNaN(suffixLength) || suffixLength <= 0) {
          res.setHeader("Content-Range", `bytes */${fileSize}`);
          return res.status(416).json({ error: "Requested Range Not Satisfiable" });
        }
        start = Math.max(0, fileSize - suffixLength);
        end = fileSize - 1;
      } else {
        start = parseInt(rawStart, 10);
        if (isNaN(start) || start < 0 || start >= fileSize) {
          res.setHeader("Content-Range", `bytes */${fileSize}`);
          return res.status(416).json({ error: "Requested Range Not Satisfiable" });
        }
        if (rawEnd === "") {
          end = fileSize - 1;
        } else {
          const parsedEnd = parseInt(rawEnd, 10);
          if (isNaN(parsedEnd) || parsedEnd < start) {
            res.setHeader("Content-Range", `bytes */${fileSize}`);
            return res.status(416).json({ error: "Requested Range Not Satisfiable" });
          }
          // Clamp end to fileSize - 1 (do not 416 when end >= fileSize)
          end = Math.min(parsedEnd, fileSize - 1);
        }
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

// =========================================================================
// 8. GET /api/notes/:id/media-url (Protected Video URL retrieval)
// =========================================================================
router.get("/:id/media-url", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid note ID format" });
    }

    const note = await Note.findById(id).lean();
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    if (note.section !== 'videos') {
      return res.status(400).json({ error: "This item is not a video lecture" });
    }

    // Gate: access rule
    const access = await evaluateItemAccess(note, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({
        error: access.error,
        code: access.code,
        section: access.section
      });
    }

    return res.json({
      success: true,
      provider: note.videoProvider || 'none',
      url: note.videoUrl
    });
  } catch (err) {
    console.error("Media URL retrieval error:", err.message);
    return res.status(500).json({ error: "Failed to retrieve media playback URL" });
  }
});

// =========================================================================
// 9. GET /api/notes/:id/download (Dedicated authenticated download)
// =========================================================================
router.get("/:id/download", optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid note ID format" });
    }

    const note = await Note.findById(id).lean();
    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    if (note.section === 'videos') {
      return res.status(400).json({ error: "Direct downloads are not supported for video lectures" });
    }

    const access = await evaluateItemAccess(note, req.user);
    if (!access.allowed) {
      return res.status(access.status).json({
        error: access.error,
        code: access.code,
        section: access.section
      });
    }

    const isAdminUser = req.user && req.user.role === "admin";
    if (!isAdminUser && !note.allowDownload) {
      return res.status(403).json({
        error: "Offline download is disabled for this item",
        code: "DOWNLOAD_DISABLED"
      });
    }

    let filePath;
    try {
      filePath = getSafeStoragePath(note.pdfUrl);
    } catch (pathErr) {
      console.error("Security path violation on download request:", pathErr.message);
      return res.status(400).json({ error: "Invalid document storage configuration", code: "ILLEGAL_PATH" });
    }

    if (!fs.existsSync(filePath)) {
      console.error(`Missing PDF file on disk for download: ${filePath}`);
      return res.status(404).json({ error: "Document content file is not available" });
    }

    const stat = await fs.promises.stat(filePath);
    const fileSize = stat.size;

    const rawTitle = (note.title || "study_item").trim();
    const safeTitle = rawTitle.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_") || "study_item";
    const filename = `${safeTitle}.pdf`;

    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.on("error", (err) => {
      console.error("Download stream transmission error:", err.message);
      if (!res.headersSent) res.status(500).end();
    });
    return fileStream.pipe(res);
  } catch (err) {
    console.error("Download endpoint unexpected error:", err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to download document" });
    }
  }
});

// =========================================================================
// 10. POST /api/notes (Admin create item across sections)
// =========================================================================
router.post("/", authenticateToken, isAdmin, handleOptionalPdfUpload, async (req, res) => {
  try {
    const {
      section = 'notes',
      title,
      subject,
      classLevel,
      category,
      description,
      coverImage,
      totalPages,
      allowDownload,
      isPublished,
      isFree,
      order,
      videoUrl,
      videoProvider = 'none',
      durationMinutes
    } = req.body;

    const validSections = ['notes', 'question_papers', 'videos'];
    const cleanSection = String(section || 'notes').toLowerCase().trim();
    if (!validSections.includes(cleanSection)) {
      return res.status(400).json({ error: "Invalid section. Must be one of: notes, question_papers, videos" });
    }

    const validProviders = ['bunny', 'vimeo', 'youtube_unlisted', 'hls', 'none'];
    if (videoProvider !== undefined && !validProviders.includes(videoProvider)) {
      return res.status(400).json({ error: `Invalid videoProvider: ${videoProvider}. Must be one of: ${validProviders.join(', ')}` });
    }

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "Title is required and must not be empty" });
    }

    const cleanIsFree = isFree === "true" || isFree === true;

    // SECTION: VIDEOS
    if (cleanSection === 'videos') {
      if (req.file) {
        return res.status(400).json({ error: "PDF uploads are not allowed for video lecture items" });
      }

      const videoValidation = validateVideoUrl(videoUrl, cleanIsFree, videoProvider);
      if (!videoValidation.valid) {
        return res.status(400).json({ error: videoValidation.error });
      }

      const validProviders = ['bunny', 'vimeo', 'youtube_unlisted', 'hls', 'none'];
      const cleanProvider = validProviders.includes(videoProvider) ? videoProvider : 'none';

      const note = await Note.create({
        section: 'videos',
        title: title.trim(),
        subject: (subject || "").trim(),
        classLevel: (classLevel || "").trim(),
        category: (category || "Video Lectures").trim(),
        description: (description || "").trim(),
        coverImage: (coverImage || "").trim(),
        pdfUrl: "",
        videoUrl: videoValidation.cleanUrl,
        videoProvider: cleanProvider,
        durationMinutes: durationMinutes ? Math.max(0, parseInt(durationMinutes, 10) || 0) : 0,
        isFree: cleanIsFree,
        order: order !== undefined ? parseInt(order, 10) || 0 : 0,
        allowDownload: false,
        isPublished: isPublished !== "false" && isPublished !== false,
        uploadedBy: req.user.id
      });

      return res.status(201).json({
        success: true,
        message: "Video lecture created successfully",
        note: sanitizeNote(note)
      });
    }

    // SECTION: NOTES or QUESTION PAPERS
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "PDF file is required for document upload" });
    }

    if (!verifyPdfMagicBytes(req.file.buffer)) {
      return res.status(400).json({ error: "Invalid file content: Uploaded file is not a valid PDF document" });
    }

    const randomKey = `doc_${crypto.randomUUID()}.pdf`;
    const safeFilePath = getSafeStoragePath(randomKey);

    await fs.promises.writeFile(safeFilePath, req.file.buffer);

    let note;
    try {
      note = await Note.create({
        section: cleanSection,
        title: title.trim(),
        subject: (subject || "").trim(),
        classLevel: (classLevel || "").trim(),
        category: (category || (cleanSection === 'question_papers' ? 'Question Bank' : 'Study Notes')).trim(),
        description: (description || "").trim(),
        coverImage: (coverImage || "").trim(),
        pdfUrl: randomKey,
        fileSize: req.file.size || req.file.buffer.length,
        totalPages: totalPages ? Math.max(0, parseInt(totalPages, 10) || 0) : 0,
        isFree: cleanIsFree,
        order: order !== undefined ? parseInt(order, 10) || 0 : 0,
        allowDownload: allowDownload === "true" || allowDownload === true,
        isPublished: isPublished !== "false" && isPublished !== false,
        uploadedBy: req.user.id
      });
    } catch (createErr) {
      try {
        if (fs.existsSync(safeFilePath)) {
          await fs.promises.unlink(safeFilePath);
        }
      } catch (_) {}
      throw createErr;
    }

    return res.status(201).json({
      success: true,
      message: `${cleanSection === 'question_papers' ? 'Question paper' : 'Note'} uploaded and created successfully`,
      note: sanitizeNote(note)
    });
  } catch (err) {
    console.error("Error creating item:", err.message);
    return res.status(500).json({ error: "Failed to create content item" });
  }
});

// =========================================================================
// 11. PUT /api/notes/:id (Admin update item)
// =========================================================================
router.put("/:id", authenticateToken, isAdmin, handleOptionalPdfUpload, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID format" });
    }

    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ error: "Item not found" });
    }

    const targetSection = req.body.section ? String(req.body.section).toLowerCase().trim() : (note.section || 'notes');
    const validSections = ['notes', 'question_papers', 'videos'];
    if (req.body.section !== undefined && !validSections.includes(targetSection)) {
      return res.status(400).json({ error: "Invalid section. Must be one of: notes, question_papers, videos" });
    }

    const validProviders = ['bunny', 'vimeo', 'youtube_unlisted', 'hls', 'none'];
    if (req.body.videoProvider !== undefined && !validProviders.includes(req.body.videoProvider)) {
      return res.status(400).json({ error: `Invalid videoProvider: ${req.body.videoProvider}. Must be one of: ${validProviders.join(', ')}` });
    }

    const isTargetVideos = targetSection === 'videos';

    if (isTargetVideos && req.file) {
      return res.status(400).json({ error: "PDF uploads are not allowed for video lecture items" });
    }

    if (req.body.title !== undefined) {
      if (typeof req.body.title !== "string" || !req.body.title.trim()) {
        return res.status(400).json({ error: "Title must not be empty" });
      }
    }

    const cleanIsFree = req.body.isFree !== undefined
      ? (req.body.isFree === "true" || req.body.isFree === true)
      : note.isFree;

    const resultingProvider = req.body.videoProvider !== undefined
      ? req.body.videoProvider
      : (note.videoProvider || 'none');

    const resultingVideoUrl = req.body.videoUrl !== undefined
      ? req.body.videoUrl
      : note.videoUrl;

    const videoFieldsChanged = (
      req.body.isFree !== undefined ||
      req.body.videoProvider !== undefined ||
      req.body.section !== undefined ||
      req.body.videoUrl !== undefined
    );

    if (isTargetVideos) {
      if (videoFieldsChanged) {
        const videoValidation = validateVideoUrl(resultingVideoUrl, cleanIsFree, resultingProvider);
        if (!videoValidation.valid) {
          return res.status(400).json({ error: videoValidation.error });
        }
        note.videoUrl = videoValidation.cleanUrl;
      }
    } else {
      // when section changes away from 'videos', clear videoUrl/videoProvider
      note.videoUrl = '';
      note.videoProvider = 'none';
      if (note.section === 'videos' && !req.file && !note.pdfUrl) {
        return res.status(400).json({ error: "PDF file is required when switching from videos to a document section" });
      }
    }

    if (req.file && req.file.buffer) {
      if (!verifyPdfMagicBytes(req.file.buffer)) {
        return res.status(400).json({ error: "Invalid file content: Uploaded replacement file is not a valid PDF" });
      }
    }

    let newKey = null;
    let newFilePath = null;
    const oldKey = note.pdfUrl;

    if (req.file && req.file.buffer) {
      newKey = `doc_${crypto.randomUUID()}.pdf`;
      newFilePath = getSafeStoragePath(newKey);
      await fs.promises.writeFile(newFilePath, req.file.buffer);
    }

    try {
      if (newKey) {
        note.pdfUrl = newKey;
        note.fileSize = req.file.size || req.file.buffer.length;
      } else if (isTargetVideos) {
        note.pdfUrl = '';
        note.fileSize = 0;
        note.totalPages = 0;
      }

      if (req.body.section !== undefined) note.section = targetSection;
      if (req.body.title !== undefined) note.title = req.body.title.trim();
      if (req.body.subject !== undefined) note.subject = req.body.subject.trim();
      if (req.body.classLevel !== undefined) note.classLevel = req.body.classLevel.trim();
      if (req.body.category !== undefined) note.category = req.body.category.trim();
      if (req.body.description !== undefined) note.description = req.body.description.trim();
      if (req.body.coverImage !== undefined) note.coverImage = req.body.coverImage.trim();
      if (req.body.videoProvider !== undefined) note.videoProvider = req.body.videoProvider;
      if (req.body.durationMinutes !== undefined) {
        note.durationMinutes = Math.max(0, parseInt(req.body.durationMinutes, 10) || 0);
      }
      if (req.body.totalPages !== undefined) {
        note.totalPages = Math.max(0, parseInt(req.body.totalPages, 10) || 0);
      }
      if (req.body.isFree !== undefined) {
        note.isFree = cleanIsFree;
      }
      if (req.body.order !== undefined) {
        note.order = parseInt(req.body.order, 10) || 0;
      }
      if (req.body.allowDownload !== undefined) {
        note.allowDownload = req.body.allowDownload === "true" || req.body.allowDownload === true;
      }
      if (req.body.isPublished !== undefined) {
        note.isPublished = req.body.isPublished === "true" || req.body.isPublished === true;
      }

      await note.save();
    } catch (saveErr) {
      if (newFilePath) {
        try {
          if (fs.existsSync(newFilePath)) await fs.promises.unlink(newFilePath);
        } catch (_) {}
      }
      if (saveErr.name === 'ValidationError') {
        return res.status(400).json({ error: saveErr.message });
      }
      throw saveErr;
    }

    if (oldKey && ((newKey && oldKey !== newKey) || (isTargetVideos && oldKey !== note.pdfUrl))) {
      try {
        const oldFilePath = getSafeStoragePath(oldKey);
        if (fs.existsSync(oldFilePath)) await fs.promises.unlink(oldFilePath);
      } catch (unlinkErr) {
        console.warn("Storage cleanup notice on old PDF removal:", unlinkErr.message);
      }
    }

    return res.json({
      success: true,
      message: "Item updated successfully",
      note: sanitizeNote(note)
    });
  } catch (err) {
    console.error("Error updating item:", err.message);
    return res.status(500).json({ error: "Failed to update item" });
  }
});

// =========================================================================
// 12. DELETE /api/notes/:id (Admin delete item)
// =========================================================================
router.delete("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID format" });
    }

    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ error: "Item not found" });
    }

    let filePath = null;
    if (note.pdfUrl) {
      try {
        filePath = getSafeStoragePath(note.pdfUrl);
      } catch (_) {}
    }

    await Note.findByIdAndDelete(note._id);

    if (filePath) {
      try {
        if (fs.existsSync(filePath)) await fs.promises.unlink(filePath);
      } catch (unlinkErr) {
        console.warn("Storage cleanup notice on delete:", unlinkErr.message);
      }
    }

    return res.json({
      success: true,
      message: "Item deleted successfully"
    });
  } catch (err) {
    console.error("Error deleting item:", err.message);
    return res.status(500).json({ error: "Failed to delete item" });
  }
});

// Export helper utilities for test suite
router._testHelpers = {
  getSafeStoragePath,
  verifyPdfMagicBytes,
  sanitizeNote,
  validateVideoUrl,
  evaluateItemAccess,
  checkSectionFeatureFlag,
  ALLOWED_VIDEO_HOSTS
};

module.exports = router;
