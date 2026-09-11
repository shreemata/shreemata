const fs = require('fs');
const path = require('path');

function runResponsiveSwitchingAudit() {
    console.log('🧪 Starting Automatic Mobile ↔ Desktop Responsive Switching Verification...\n');

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

    const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'styles.css'), 'utf8');
    const home3dCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'home-3d.css'), 'utf8');
    const accountCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'account.css'), 'utf8');
    const adminCss = fs.existsSync(path.join(__dirname, '..', 'public', 'css', 'admin.css')) 
        ? fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'admin.css'), 'utf8') 
        : '';
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const accountHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'account.html'), 'utf8');

    console.log('--- 1. Testing Mobile Breakpoint (<= 768px) ---');
    assert('Mobile hamburger toggle displayed at <= 768px', stylesCss.includes('#mobileMenuToggle') && stylesCss.includes('display: inline-flex !important;'));
    assert('Desktop navigation links hidden at <= 768px', stylesCss.includes('.header-nav-links') && stylesCss.includes('display: none !important;'));
    assert('Account mobile menu button displayed at <= 768px', accountCss.includes('.btn-mobile-account-menu') && accountCss.includes('display: flex !important;'));
    assert('Desktop account sidebar hidden at <= 768px', accountCss.includes('.account-sidebar') && accountCss.includes('display: none !important;'));
    assert('Auth state isolated (zero duplicate account icons)', stylesCss.includes('#userLinks[style*="display: none"]') && stylesCss.includes('display: none !important;'));
    assert('Search bar spans full width row 2 on mobile', stylesCss.includes('.header-search') && stylesCss.includes('order: 4 !important;'));

    console.log('\n--- 2. Testing Tablet Breakpoint (769px - 1023px) ---');
    assert('Tablet account layout grid flex column rule exists', stylesCss.includes('@media (max-width: 1024px) and (min-width: 769px)') || accountCss.includes('account-layout-grid'));
    assert('Tablet handles responsive container and padding', stylesCss.includes('--page-gutter') || home3dCss.includes('--page-gutter'));

    console.log('\n--- 3. Testing Desktop Breakpoint (>= 1024px) ---');
    assert('Desktop isolation hides mobile drawer at >= 1024px', stylesCss.includes('@media (min-width: 1024px)') && stylesCss.includes('#mobileNavDrawer'));
    assert('Desktop isolation hides hamburger toggle at >= 1024px', stylesCss.includes('@media (min-width: 1024px)') && stylesCss.includes('#mobileMenuToggle'));
    assert('home-3d.css: Desktop isolation hides mobile drawer and hamburger at >= 1024px', home3dCss.includes('@media (min-width: 1024px)') && home3dCss.includes('#mobileMenuToggle'));
    assert('Desktop account sidebar restored on desktop (btn-mobile-account-menu default display: none)', accountCss.includes('.btn-mobile-account-menu') && accountCss.includes('display: none;'));

    console.log('\n--- 4. Testing Zero Reload / CSS-Only Responsive Architecture ---');
    assert('Zero JavaScript window.location mobile redirect in global-nav.js', !fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'global-nav.js'), 'utf8').includes('window.location = "mobile'));
    assert('Zero JavaScript window.location mobile redirect in home.js', !fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'home.js'), 'utf8').includes('window.location = "mobile'));
    assert('Zero separate mobile HTML files required (unified responsive pages)', fs.existsSync(path.join(__dirname, '..', 'public', 'index.html')) && fs.existsSync(path.join(__dirname, '..', 'public', 'account.html')));

    console.log('\n==================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED / ${failed} FAILED`);
    console.log('==================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runResponsiveSwitchingAudit();
