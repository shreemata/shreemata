// tests/watermarkPdf.test.js
// Automated verification for Shree Mata PDF watermarking service

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const {
  getOrCreateStampedPdf,
  invalidateWatermarkCache,
  MAX_STAMP_BYTES
} = require('../utils/pdfWatermarkService');
const { getOrCreatePreviewPdf } = require('../utils/pdfPreviewService');

function hasWatermarkText(doc) {
  const context = doc.context;
  const p0 = doc.getPages()[0];
  if (!p0) return false;
  const contentsRef = p0.node.get(context.obj('Contents'));
  if (!contentsRef) return false;
  const contentsObj = context.lookup(contentsRef);
  const streams = contentsObj.asArray ? contentsObj.asArray() : [contentsObj];
  const targetHex = Buffer.from('SHREE MATA').toString('hex').toUpperCase();

  for (const ref of streams) {
    const stream = context.lookup(ref);
    if (!stream || !stream.getContents) continue;
    const raw = stream.getContents();
    let decoded = '';
    try {
      decoded = zlib.inflateSync(Buffer.from(raw)).toString('utf8');
    } catch (_) {
      decoded = Buffer.from(raw).toString('utf8');
    }
    if (decoded.includes('SHREE MATA') || decoded.includes(targetHex)) {
      return true;
    }
  }
  return false;
}

describe('PDF Watermarking Service', () => {
  const testDir = path.resolve(__dirname, '../storage/notes/private/test_watermark');
  const originalFileName = 'original_test_note.pdf';
  const originalFilePath = path.join(testDir, originalFileName);
  let originalBytes;
  let originalSha256;

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create a 3-page original PDF
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 3; i++) {
      const page = doc.addPage([595, 842]);
      page.drawText(`Original Curriculum Page ${i}`, {
        x: 50,
        y: 750,
        size: 16,
        font,
        color: rgb(0, 0, 0)
      });
    }
    originalBytes = await doc.save();
    originalSha256 = crypto.createHash('sha256').update(originalBytes).digest('hex');
    await fs.promises.writeFile(originalFilePath, originalBytes);
  });

  afterAll(async () => {
    if (fs.existsSync(testDir)) {
      try {
        await fs.promises.rm(testDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });

  // =========================================================================
  // 1. STAMPED DERIVATIVE GENERATION & BYTE-FOR-BYTE ORIGINAL INTEGRITY
  // =========================================================================
  it('generates stamped derivative with identical page count while keeping original byte-for-byte unchanged', async () => {
    const stampedPath = await getOrCreateStampedPdf(originalFilePath);

    expect(fs.existsSync(stampedPath)).toBe(true);
    expect(stampedPath).not.toBe(originalFilePath);
    expect(path.basename(stampedPath)).toBe(`stamped_${originalFileName}`);

    // Verify original file is 100% byte-for-byte unchanged
    const currentOriginalBytes = await fs.promises.readFile(originalFilePath);
    const currentSha256 = crypto.createHash('sha256').update(currentOriginalBytes).digest('hex');
    expect(currentSha256).toBe(originalSha256);

    // Verify stamped PDF has matching page count
    const stampedBytes = await fs.promises.readFile(stampedPath);
    const stampedDoc = await PDFDocument.load(stampedBytes);
    expect(stampedDoc.getPageCount()).toBe(3);

    // Verify watermark text appears in the stamped PDF content stream
    expect(hasWatermarkText(stampedDoc)).toBe(true);
  });

  // =========================================================================
  // 2. PREVIEW PAGES EXTRACTED FROM STAMPED FILE CARRY WATERMARK
  // =========================================================================
  it('extracts preview pages from the stamped file, ensuring previews retain the watermark', async () => {
    const stampedPath = await getOrCreateStampedPdf(originalFilePath);
    const previewPath = await getOrCreatePreviewPdf(stampedPath, 2);

    expect(fs.existsSync(previewPath)).toBe(true);
    const previewBytes = await fs.promises.readFile(previewPath);
    const previewDoc = await PDFDocument.load(previewBytes);

    expect(previewDoc.getPageCount()).toBe(2);
    expect(hasWatermarkText(previewDoc)).toBe(true);
  });

  // =========================================================================
  // 3. CACHE HIT EFFICIENCY
  // =========================================================================
  it('returns cached stamped PDF on subsequent requests without re-processing', async () => {
    const stampedPath1 = await getOrCreateStampedPdf(originalFilePath);
    const stat1 = await fs.promises.stat(stampedPath1);

    const stampedPath2 = await getOrCreateStampedPdf(originalFilePath);
    const stat2 = await fs.promises.stat(stampedPath2);

    expect(stampedPath1).toBe(stampedPath2);
    expect(stat1.mtimeMs).toBe(stat2.mtimeMs);
    expect(stat1.size).toBe(stat2.size);
  });

  // =========================================================================
  // 4. CACHE INVALIDATION ON UPDATE / DELETE
  // =========================================================================
  it('invalidates and deletes cached stamped file when original is replaced or deleted', async () => {
    const stampedPath = await getOrCreateStampedPdf(originalFilePath);
    expect(fs.existsSync(stampedPath)).toBe(true);

    await invalidateWatermarkCache(originalFilePath);
    expect(fs.existsSync(stampedPath)).toBe(false);
  });

  // =========================================================================
  // 5. CONCURRENCY SAFETY (RACE CONDITION PREVENTION)
  // =========================================================================
  it('handles multiple concurrent stamping requests with a single generation promise', async () => {
    // Invalidate first
    await invalidateWatermarkCache(originalFilePath);

    // Launch 5 parallel requests
    const results = await Promise.all([
      getOrCreateStampedPdf(originalFilePath),
      getOrCreateStampedPdf(originalFilePath),
      getOrCreateStampedPdf(originalFilePath),
      getOrCreateStampedPdf(originalFilePath),
      getOrCreateStampedPdf(originalFilePath)
    ]);

    // All should resolve to the exact same path
    results.forEach((p) => {
      expect(p).toBe(path.join(testDir, `stamped_${originalFileName}`));
      expect(fs.existsSync(p)).toBe(true);
    });
  });

  // =========================================================================
  // 6. SAFE FALLBACK ON OVERSIZED PDF (> MAX_STAMP_BYTES)
  // =========================================================================
  it('falls back gracefully to serving original file when size exceeds safety threshold', async () => {
    // Mock fs.promises.stat to report a size exceeding MAX_STAMP_BYTES
    const originalStat = fs.promises.stat;
    jest.spyOn(fs.promises, 'stat').mockImplementation(async (filePath) => {
      const realStat = await originalStat(filePath);
      if (filePath === originalFilePath) {
        return {
          ...realStat,
          size: MAX_STAMP_BYTES + 1024,
          mtimeMs: realStat.mtimeMs
        };
      }
      return realStat;
    });

    const fallbackPath = await getOrCreateStampedPdf(originalFilePath);
    expect(fallbackPath).toBe(originalFilePath);

    fs.promises.stat.mockRestore();
  });
});
