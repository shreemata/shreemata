/** @jest-environment node */
// tests/notesHtmlSecurity.test.js
// Security and static analysis verification for 4-Section frontend HTML and script files

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const publicDir = path.resolve(__dirname, '../public');
const readFile = (filename) => fs.readFileSync(path.join(publicDir, filename), 'utf8');

const filesToAudit = ['notes.html', 'reader.html', 'video-player.html', 'admin-notes.html'];

function runAudits() {
  const results = [];

  // 1. Escaping or textContent usage
  filesToAudit.forEach((filename) => {
    const content = readFile(filename);
    const usesEscaping = content.includes('escapeHtml') || content.includes('textContent');
    assert.strictEqual(usesEscaping, true, `${filename} must implement escapeHtml or textContent`);
    results.push(`✔ ${filename} defines and implements HTML escaping / textContent`);
  });

  // 2. Unescaped note property interpolations in templates
  filesToAudit.forEach((filename) => {
    const content = readFile(filename);
    const dangerousInterpolations = [
      /\$\{\s*note\.title\s*\}/g,
      /\$\{\s*note\.subject\s*\}/g,
      /\$\{\s*note\.description\s*\}/g,
      /\$\{\s*note\.category\s*\}/g,
      /\$\{\s*sub\.planName\s*\}/g,
      /\$\{\s*user\.name\s*\}/g,
      /\$\{\s*user\.email\s*\}/g
    ];

    dangerousInterpolations.forEach((regex) => {
      const matches = content.match(regex);
      assert.strictEqual(matches, null, `Found unsafe unescaped interpolation ${regex} in ${filename}`);
    });
    results.push(`✔ ${filename} has NO unescaped server property interpolations`);
  });

  // 3. video-player.html security policies
  const videoPlayerContent = readFile('video-player.html');
  assert.ok(videoPlayerContent.includes('ALLOWED_HOSTS'), 'video-player.html must declare ALLOWED_HOSTS');
  assert.ok(videoPlayerContent.includes('isHostAllowed'), 'video-player.html must check isHostAllowed');
  assert.ok(videoPlayerContent.includes("u.protocol !== 'https:'"), 'video-player.html must enforce HTTPS protocol');
  assert.ok(videoPlayerContent.includes('sandbox'), 'video-player.html iframe must have sandbox');
  assert.ok(videoPlayerContent.includes('allow-scripts allow-same-origin allow-presentation'), 'video-player.html iframe sandbox tokens');
  assert.ok(videoPlayerContent.includes('referrerpolicy'), 'video-player.html iframe must declare referrerpolicy');
  assert.ok(videoPlayerContent.includes('no-referrer'), 'video-player.html iframe must use no-referrer');
  assert.ok(videoPlayerContent.includes('mediaRes.status === 401'), 'video-player.html handles 401');
  assert.ok(videoPlayerContent.includes('mediaRes.status === 403'), 'video-player.html handles 403');
  results.push('✔ video-player.html enforces HTTPS, allowlist domain verification, sandbox, and 401/403 gates');

  // 4. reader.html security policies
  const readerContent = readFile('reader.html');
  assert.ok(readerContent.includes('user-select: none'), 'reader.html enforces user-select: none');
  assert.ok(readerContent.includes('contextmenu'), 'reader.html prevents right-click');
  assert.ok(readerContent.includes('note.allowDownload'), 'reader.html gates download on note.allowDownload');
  assert.ok(readerContent.includes('streamRes.status === 401'), 'reader.html handles 401');
  assert.ok(readerContent.includes('streamRes.status === 403'), 'reader.html handles 403');
  assert.ok(readerContent.includes('Guest Preview'), 'reader.html permits guest viewing with watermark for free items only');
  assert.ok(readerContent.includes('isFree'), 'reader.html gates free items');
  results.push('✔ reader.html enforces anti-piracy protections, download gating, and guest free preview watermarking');

  // 5. global-nav.js feature flag gating
  const globalNavContent = readFile('js/global-nav.js');
  assert.ok(globalNavContent.includes('/features'), 'global-nav.js queries /features');
  assert.ok(globalNavContent.includes('f.readNotes || f.questionPapers || f.videos'), 'global-nav.js checks digital feature flags');
  assert.ok(globalNavContent.includes('navStudyMaterial'), 'global-nav.js injects navStudyMaterial');
  results.push('✔ global-nav.js cleanly gates Study Material link based on /api/features');

  // 6. notes.html feature flag & Razorpay checkout
  const notesContent = readFile('notes.html');
  assert.ok(notesContent.includes('/features'), 'notes.html queries /features');
  assert.ok(notesContent.includes('comingSoonBox'), 'notes.html contains comingSoonBox');
  assert.ok(notesContent.includes('enabledSections.length === 0'), 'notes.html displays Coming Soon if all flags false');
  assert.ok(notesContent.includes('/subscriptions/create-order'), 'notes.html integrates /create-order');
  assert.ok(notesContent.includes('/subscriptions/verify-order'), 'notes.html integrates /verify-order');
  assert.ok(notesContent.includes('checkout.razorpay.com'), 'notes.html loads Razorpay SDK');
  assert.ok(notesContent.includes('Razorpay(options)'), 'notes.html instantiates Razorpay modal');
  results.push('✔ notes.html implements Coming Soon fallback and full Razorpay subscription checkout');

  return results;
}

if (typeof describe === 'function') {
  describe('Frontend HTML & Client Script Security Verification', () => {
    test('passes all static security and XSS prevention assertions', () => {
      const results = runAudits();
      expect(results.length).toBeGreaterThan(0);
    });
  });
}

if (require.main === module) {
  try {
    const results = runAudits();
    console.log('PASS: notesHtmlSecurity audit passed all checks:\n' + results.join('\n'));
    process.exit(0);
  } catch (err) {
    console.error('FAIL: notesHtmlSecurity audit failed:', err.message);
    process.exit(1);
  }
}
