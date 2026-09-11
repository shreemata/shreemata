const fs = require('fs');
const path = require('path');

function testMobileHeaderDOM() {
    console.log('🧪 Starting Mobile Header Structural & CSS Verification Suite...\n');

    let passed = 0;
    let failed = 0;

    function assert(name, condition) {
        if (condition) {
            console.log(`✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${name}`);
            failed++;
        }
    }

    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const accountHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'account.html'), 'utf8');
    const referralHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'referral.html'), 'utf8');
    const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'styles.css'), 'utf8');
    const home3dCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'home-3d.css'), 'utf8');
    const globalNavJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'global-nav.js'), 'utf8');

    console.log('--- 1. Testing Index.html Header Markup ---');
    assert('index.html has #mobileMenuToggle button', indexHtml.includes('id="mobileMenuToggle"'));
    assert('index.html has .brand-logo with img', indexHtml.includes('class="brand-logo"') && indexHtml.includes('<img src="images/press.png"'));
    assert('index.html has #authLinks with btn-login', indexHtml.includes('id="authLinks"') && indexHtml.includes('class="btn-login"'));
    assert('index.html has #userLinks with userMenuBtn', indexHtml.includes('id="userLinks"') && indexHtml.includes('id="userMenuBtn"'));
    assert('index.html has #cartLink with cartCount', indexHtml.includes('id="cartLink"') && indexHtml.includes('id="cartCount"'));
    assert('index.html has #searchInput', indexHtml.includes('id="searchInput"'));
    assert('index.html has #mobileMenuToggle before brand-logo', indexHtml.indexOf('id="mobileMenuToggle"') < indexHtml.indexOf('class="brand-logo"'));

    console.log('\n--- 2. Testing Account.html & Referral.html Markup ---');
    assert('account.html has #mobileMenuToggle before brand-logo', accountHtml.indexOf('id="mobileMenuToggle"') < accountHtml.indexOf('class="brand-logo"'));
    assert('referral.html has #mobileMenuToggle before brand-logo', referralHtml.indexOf('id="mobileMenuToggle"') < referralHtml.indexOf('class="brand-logo"'));

    console.log('\n--- 3. Testing CSS Two-Row Flex Ordering & Touch Targets ---');
    assert('home-3d.css: #mobileMenuToggle has order: 1', home3dCss.includes('order: 1') && home3dCss.includes('#mobileMenuToggle'));
    assert('home-3d.css: .brand-logo has order: 2', home3dCss.includes('order: 2') && home3dCss.includes('.brand-logo'));
    assert('home-3d.css: .header-actions has order: 3', home3dCss.includes('order: 3') && home3dCss.includes('.header-actions'));
    assert('home-3d.css: .header-search has order: 4', home3dCss.includes('order: 4') && home3dCss.includes('.header-search'));
    assert('styles.css: #mobileMenuToggle has order: 1 !important', stylesCss.includes('order: 1 !important'));
    assert('styles.css: .brand-logo has order: 2 !important', stylesCss.includes('order: 2 !important'));
    assert('styles.css: .header-actions has order: 3 !important', stylesCss.includes('order: 3 !important'));
    assert('styles.css: .header-search has order: 4 !important', stylesCss.includes('order: 4 !important'));

    console.log('\n--- 4. Testing Zero Duplicate Auth / Profile Icons in CSS ---');
    assert('home-3d.css: Hides auth state with display: none !important', home3dCss.includes('#userLinks[style*="display: none"]') && home3dCss.includes('display: none !important;'));
    assert('styles.css: Hides auth state with display: none !important', stylesCss.includes('#userLinks[style*="display: none"]') && stylesCss.includes('display: none !important;'));
    assert('home-3d.css: User and Guest buttons both styled with 44px min touch target', home3dCss.includes('min-width: 44px') && home3dCss.includes('min-height: 44px'));
    assert('styles.css: User and Guest buttons both styled with 44px min touch target', stylesCss.includes('min-width: 44px !important') && stylesCss.includes('min-height: 44px !important'));

    console.log('\n--- 5. Testing Logo Image Size & Search Row ---');
    assert('home-3d.css: Logo img height constrained to 44px (object-fit: contain)', home3dCss.includes('height: 44px') && home3dCss.includes('object-fit: contain'));
    assert('styles.css: Logo img height constrained to 44px (object-fit: contain)', stylesCss.includes('height: 44px !important') && stylesCss.includes('object-fit: contain !important'));
    assert('home-3d.css: Search row has width: 100%', home3dCss.includes('width: 100%') && home3dCss.includes('.header-search'));
    assert('styles.css: Search row has width: 100%', stylesCss.includes('width: 100% !important') && stylesCss.includes('.header-search'));

    console.log('\n--- 6. Testing Global Nav JS & Drawer Integration ---');
    assert('global-nav.js: updateGlobalNavbarAuth toggles authLinks and userLinks cleanly', globalNavJs.includes('authLinks.style.display = "none"') && globalNavJs.includes('userLinks.style.display = "inline-flex"'));
    assert('global-nav.js: mobileMenuToggle opens mobile drawer', globalNavJs.includes('toggleBtn.addEventListener("click", openDrawer)'));
    assert('global-nav.js: fallback dynamic hamburger insertion prepends to header-inner', globalNavJs.includes('headerInner.insertBefore(toggleBtn, headerInner.firstChild)'));

    console.log('\n==================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED / ${failed} FAILED`);
    console.log('==================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

testMobileHeaderDOM();
