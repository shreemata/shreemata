// utils/pdfWatermarkService.js
// High-performance, concurrency-safe PDF watermarking service using pure-JS pdf-lib

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');

const watermarkLocks = new Map();

// Maximum file size threshold for in-memory server stamping (35 MB)
// Files larger than this fallback gracefully to the original file + on-screen viewer watermark
const MAX_STAMP_BYTES = 35 * 1024 * 1024;

/**
 * Returns the cached stamped PDF path, generating it lazily if not yet created.
 * Burned-in watermark: Diagonal repeated "SHREE MATA" in light grey at 14% opacity across every page.
 *
 * @param {string} sourceFilePath - Absolute path to the original PDF file
 * @returns {Promise<string>} - Absolute path to the stamped PDF (or original on fallback)
 */
async function getOrCreateStampedPdf(sourceFilePath) {
  if (!sourceFilePath || typeof sourceFilePath !== 'string') {
    throw new Error('Invalid sourceFilePath provided to watermark service');
  }

  // Pre-flight file check
  let sourceStat;
  try {
    sourceStat = await fs.promises.stat(sourceFilePath);
  } catch (err) {
    throw new Error(`Source PDF file not accessible: ${err.message}`);
  }

  // If file exceeds safe in-memory threshold, fallback gracefully to original
  if (sourceStat.size > MAX_STAMP_BYTES) {
    console.warn(`[Watermark] PDF size ${(sourceStat.size / (1024 * 1024)).toFixed(2)} MB exceeds ${MAX_STAMP_BYTES / (1024 * 1024)} MB threshold. Serving original with on-screen watermark.`);
    return sourceFilePath;
  }

  const dir = path.dirname(sourceFilePath);
  const baseName = path.basename(sourceFilePath);
  const stampedFilename = `stamped_${baseName}`;
  const stampedPath = path.join(dir, stampedFilename);

  // Check existing cached stamped file validity
  try {
    if (fs.existsSync(stampedPath)) {
      const stampedStat = await fs.promises.stat(stampedPath);
      if (stampedStat.size > 0 && stampedStat.mtimeMs >= sourceStat.mtimeMs) {
        return stampedPath;
      }
    }
  } catch (_) {}

  // Concurrency lock: ensure only one promise performs stamping per file
  if (watermarkLocks.has(stampedPath)) {
    return await watermarkLocks.get(stampedPath);
  }

  const stampingPromise = (async () => {
    try {
      const sourceBytes = await fs.promises.readFile(sourceFilePath);
      const doc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
      const font = await doc.embedFont(StandardFonts.HelveticaBold);
      const pages = doc.getPages();

      if (!pages || pages.length === 0) {
        throw new Error('PDF has 0 pages or invalid structure');
      }

      // Stamp every page with repeated diagonal "SHREE MATA" watermarks
      for (const page of pages) {
        const { width, height } = page.getSize();
        // Repeat diagonally across a clean grid
        for (let x = 40; x < width; x += 180) {
          for (let y = 60; y < height; y += 200) {
            page.drawText('SHREE MATA', {
              x,
              y,
              size: 32,
              font,
              color: rgb(0.5, 0.5, 0.5),
              opacity: 0.14,
              rotate: degrees(45)
            });
          }
        }
      }

      const stampedBytes = await doc.save();

      // Write atomically to temp file then rename
      const tempPath = `${stampedPath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      await fs.promises.writeFile(tempPath, stampedBytes);
      await fs.promises.rename(tempPath, stampedPath);

      return stampedPath;
    } catch (err) {
      console.error(`[Watermark] Notice: PDF stamping encountered error (${err.message}). Falling back gracefully to original.`);
      return sourceFilePath;
    } finally {
      watermarkLocks.delete(stampedPath);
    }
  })();

  watermarkLocks.set(stampedPath, stampingPromise);
  return await stampingPromise;
}

/**
 * Invalidates and deletes any cached stamped PDF file for a given document.
 *
 * @param {string} sourceFilePath - Absolute path or base filename of the document
 */
async function invalidateWatermarkCache(sourceFilePath) {
  try {
    const dir = path.dirname(sourceFilePath);
    const baseName = path.basename(sourceFilePath);
    const stampedPath = path.join(dir, `stamped_${baseName}`);
    if (fs.existsSync(stampedPath)) {
      await fs.promises.unlink(stampedPath);
    }
  } catch (err) {
    console.warn('[Watermark] Notice during watermark cache invalidation:', err.message);
  }
}

module.exports = {
  getOrCreateStampedPdf,
  invalidateWatermarkCache,
  MAX_STAMP_BYTES
};

