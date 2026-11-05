// utils/pdfPreviewService.js
// High-performance, concurrency-safe PDF preview generator and cache manager using pure-JS pdf-lib

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const previewLocks = new Map();

/**
 * Returns the cached preview PDF file path, generating it lazily if not yet created.
 * Preview contains strictly pages 1..N (where N = Math.min(previewPages, totalPages)).
 *
 * @param {string} sourceFilePath - Absolute path to the source (or stamped) PDF
 * @param {number} previewPages - Desired preview page count (1-20)
 * @returns {Promise<string>} - Absolute path to the generated preview PDF
 */
async function getOrCreatePreviewPdf(sourceFilePath, previewPages) {
  const parsedPages = parseInt(previewPages, 10);
  if (isNaN(parsedPages) || parsedPages <= 0) {
    throw new Error('Invalid previewPages requested (must be > 0)');
  }

  const dir = path.dirname(sourceFilePath);
  const baseName = path.basename(sourceFilePath);
  const previewFilename = `preview_${parsedPages}_${baseName}`;
  const previewPath = path.join(dir, previewFilename);

  // Check if preview already exists and is up-to-date with source
  try {
    if (fs.existsSync(previewPath)) {
      const [sourceStat, previewStat] = await Promise.all([
        fs.promises.stat(sourceFilePath),
        fs.promises.stat(previewPath)
      ]);
      if (previewStat.size > 0 && previewStat.mtimeMs >= sourceStat.mtimeMs) {
        return previewPath;
      }
    }
  } catch (_) {}

  // Lock to ensure only one worker/promise generates this preview concurrently
  if (previewLocks.has(previewPath)) {
    return await previewLocks.get(previewPath);
  }

  const generationPromise = (async () => {
    try {
      const sourceBytes = await fs.promises.readFile(sourceFilePath);
      const srcDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
      const totalPages = srcDoc.getPageCount();

      const countToCopy = Math.min(parsedPages, totalPages);
      if (countToCopy <= 0) {
        throw new Error('Source PDF has 0 pages or invalid page structure');
      }

      const previewDoc = await PDFDocument.create();
      const pageIndices = Array.from({ length: countToCopy }, (_, i) => i);
      const copiedPages = await previewDoc.copyPages(srcDoc, pageIndices);
      copiedPages.forEach((page) => previewDoc.addPage(page));

      const previewBytes = await previewDoc.save();

      // Write atomically to temp file then rename
      const tempPath = `${previewPath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await fs.promises.writeFile(tempPath, previewBytes);
      await fs.promises.rename(tempPath, previewPath);

      return previewPath;
    } finally {
      previewLocks.delete(previewPath);
    }
  })();

  previewLocks.set(previewPath, generationPromise);
  return await generationPromise;
}

/**
 * Invalidates and removes all cached preview files associated with a given storage key or file.
 *
 * @param {string} sourceFilePath - Absolute path or base filename of the document
 */
async function invalidatePreviewCache(sourceFilePath) {
  try {
    const dir = path.dirname(sourceFilePath);
    const baseName = path.basename(sourceFilePath);
    if (!fs.existsSync(dir)) return;

    const files = await fs.promises.readdir(dir);
    const cleanBase = baseName.replace(/^stamped_/, '');

    for (const f of files) {
      if (f.startsWith('preview_') && (f.endsWith(`_${baseName}`) || f.endsWith(`_${cleanBase}`))) {
        try {
          await fs.promises.unlink(path.join(dir, f));
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn('Notice during preview cache invalidation:', err.message);
  }
}

module.exports = {
  getOrCreatePreviewPdf,
  invalidatePreviewCache
};
