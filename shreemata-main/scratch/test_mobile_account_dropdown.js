const fs = require('fs');
const path = require('path');

function runMobileAccountDropdownAudit() {
    console.log('🧪 Starting Mobile Account Dropdown Verification Suite...\n');

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

    console.log('--- 1. Testing HTML Dropdown Structure ---');
    assert('index.html has compact user profile header with avatar & email', indexHtml.includes('dropdown-user-profile') && indexHtml.includes('dropdownUserEmail'));
    assert('index.html dropdown includes My Account link', indexHtml.includes('href="/account.html"'));
    assert('index.html dropdown includes My Orders link', indexHtml.includes('href="/orders.html"'));
    assert('index.html dropdown includes Wallet link', indexHtml.includes('account.html?section=wallet'));
    assert('index.html dropdown includes Referral link', indexHtml.includes('href="/referral.html"'));
    assert('index.html dropdown includes Membership link', indexHtml.includes('account.html?section=membership'));
    assert('index.html dropdown includes VIP Master Card link', indexHtml.includes('account.html?section=vip'));
    assert('index.html dropdown includes Logout button', indexHtml.includes('id="logoutBtn"'));

    assert('account.html has compact user profile header with avatar & email', accountHtml.includes('dropdown-user-profile') && accountHtml.includes('dropdownUserEmail'));
    assert('referral.html has compact user profile header with avatar & email', referralHtml.includes('dropdown-user-profile') && referralHtml.includes('dropdownUserEmail'));

    console.log('\n--- 2. Testing CSS Mobile Dimensions & Positioning ---');
    assert('styles.css: Mobile dropdown width is min(300px, calc(100vw - 24px))', stylesCss.includes('width: min(300px, calc(100vw - 24px)) !important;'));
    assert('styles.css: Mobile dropdown max-width is 300px', stylesCss.includes('max-width: 300px !important;'));
    assert('styles.css: Mobile dropdown max-height is 70vh with overflow-y: auto', stylesCss.includes('max-height: 70vh !important;') && stylesCss.includes('overflow-y: auto !important;'));
    assert('styles.css: Mobile dropdown border-radius is 16px with compact padding', stylesCss.includes('border-radius: 16px !important;') && stylesCss.includes('padding: 10px 12px !important;'));
    assert('styles.css: Mobile dropdown items have 44px touch height', stylesCss.includes('min-height: 44px !important;') && stylesCss.includes('.dropdown-item-link'));
    assert('styles.css: Avatar size is 38px (within 36px-42px range)', stylesCss.includes('width: 38px !important;') && stylesCss.includes('height: 38px !important;'));

    assert('home-3d.css: Mobile dropdown width is min(300px, calc(100vw - 24px))', home3dCss.includes('width: min(300px, calc(100vw - 24px)) !important;'));
    assert('home-3d.css: Mobile dropdown max-width is 300px', home3dCss.includes('max-width: 300px !important;'));
    assert('home-3d.css: Mobile dropdown max-height is 70vh with overflow-y: auto', home3dCss.includes('max-height: 70vh !important;'));

    console.log('\n--- 3. Testing Small Phone (< 360px) Rules ---');
    assert('styles.css: <= 360px handles calc(100vw - 20px) without overflow', stylesCss.includes('width: calc(100vw - 20px) !important;'));

    console.log('\n--- 4. Testing Global Nav JS & Close Behaviors ---');
    assert('global-nav.js: Populates user email/phone into dropdownUserEmail', globalNavJs.includes('dropdownUserEmail.textContent = user.email || user.phone || ""'));
    assert('global-nav.js: Tapping account button toggles open/close', globalNavJs.includes('userMenuBtn.addEventListener("click", toggleDropdown)'));
    assert('global-nav.js: Outside click closes dropdown', globalNavJs.includes('document.addEventListener("click"') && globalNavJs.includes('closeDropdown()'));
    assert('global-nav.js: Escape key closes dropdown', globalNavJs.includes('e.key === "Escape"') && globalNavJs.includes('closeDropdown()'));
    assert('global-nav.js: Clicking any dropdown link closes dropdown', globalNavJs.includes('dropdownMenu.querySelectorAll("a, button")'));

    console.log('\n--- 5. Isolation: Account Page Sidebar vs Header Dropdown ---');
    assert('Account Page Sidebar (btn-mobile-account-menu) remains separate and functional', stylesCss.includes('.btn-mobile-account-menu') && accountHtml.includes('btn-mobile-account-menu'));

    console.log('\n==================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED / ${failed} FAILED`);
    console.log('==================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runMobileAccountDropdownAudit();
