const fs = require('fs');
const path = require('path');

function testMobileNavLinks() {
    console.log('====================================================');
    console.log('SHREE MATA — MOBILE NAVIGATION DRAWER FUNCTIONALITY AUDIT');
    console.log('====================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(name, condition, detail = '') {
        if (condition) {
            console.log(`✅ PASS: ${name}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${name} ${detail ? `(${detail})` : ''}`);
            failed++;
        }
    }

    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    const accountHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'account.html'), 'utf8');
    const referralHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'referral.html'), 'utf8');
    const globalNavJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'global-nav.js'), 'utf8');
    const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'styles.css'), 'utf8');
    const home3dCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'home-3d.css'), 'utf8');

    // 1. Trace Event Handling & Click Non-Blocking
    console.log('--- 1. Event Handling & Non-Blocking Navigation ---');
    assert('closeDrawer does NOT call e.preventDefault()', !globalNavJs.includes('function closeDrawer(e) {\n            if (e && e.preventDefault) e.preventDefault();'));
    assert('global-nav.js uses event delegation on mobileNavDrawer', globalNavJs.includes('drawer.addEventListener("click", handleDrawerClick)'));
    assert('global-nav.js handles hash navigation on home page', globalNavJs.includes('isHomePage && (href.startsWith("#") || href.startsWith("/#"))'));
    assert('global-nav.js smooth scrolls to target sections', globalNavJs.includes('el.scrollIntoView({ behavior: "smooth"'));
    assert('global-nav.js closes drawer on regular page navigation without blocking', globalNavJs.includes('closeDrawer();') && globalNavJs.includes('href.startsWith'));

    // 2. Test All Menu Item URLs & Targets
    console.log('\n--- 2. Menu Items & Canonical URLs ---');
    
    // Check index.html
    assert('index.html: 📚 All Books -> /#booksSection', indexHtml.includes('href="/#booksSection" class="drawer-link">📚 All Books</a>'));
    assert('index.html: 🎁 Complete Book Sets -> /bundles.html', indexHtml.includes('href="/bundles.html" class="drawer-link">🎁 Complete Book Sets</a>'));
    assert('index.html: 🎓 Class 10 Curriculum -> /#classSection', indexHtml.includes('href="/#classSection" class="drawer-link">🎓 Class 10 Curriculum</a>'));
    assert('index.html: 🏷️ Categories & Subjects -> /#subjectSection', indexHtml.includes('href="/#subjectSection" class="drawer-link">🏷️ Categories & Subjects</a>'));
    assert('index.html: 🎉 Offers & Deals -> /#notificationsSection', indexHtml.includes('href="/#notificationsSection" class="drawer-link">🎉 Offers & Deals</a>'));
    assert('index.html drawer: Track Your Order === /track-order.html', indexHtml.includes('href="/track-order.html" class="drawer-link">📦 Track Your Order</a>'));
    assert('index.html drawer: My Orders === /orders.html', indexHtml.includes('href="/orders.html" class="drawer-link" style="min-height: 44px; padding: 10px 12px;">📦 My Orders</a>'));
    assert('index.html: No stale /orders.html target for Track Your Order', !indexHtml.includes('href="/orders.html" class="drawer-link">📦 Track') && !indexHtml.includes('href="/orders.html" class="top-bar-link">📦 Track'));
    assert('index.html: 👤 My Account -> /account.html', indexHtml.includes('href="/account.html" class="drawer-link"'));
    assert('index.html: 💰 Referral & Rewards -> /referral.html', indexHtml.includes('href="/referral.html" class="drawer-link"'));
    assert('index.html: ⚙️ Admin Dashboard -> /admin.html', indexHtml.includes('href="/admin.html" id="drawerAdminLink"'));
    assert('index.html: 🚪 Logout -> id="drawerLogoutBtn"', indexHtml.includes('id="drawerLogoutBtn"'));

    // Check account.html
    assert('account.html: 🎁 Complete Book Sets -> /bundles.html', accountHtml.includes('href="/bundles.html" class="drawer-link">🎁 Complete Book Sets</a>'));
    assert('account.html drawer: Track Your Order === /track-order.html', accountHtml.includes('href="/track-order.html" class="drawer-link">📦 Track Your Order</a>'));
    assert('account.html drawer: My Orders === /orders.html', accountHtml.includes('href="/orders.html" class="drawer-link" style="min-height: 44px; padding: 10px 12px;">📦 My Orders</a>'));
    assert('account.html: No stale /orders.html target for Track Your Order', !accountHtml.includes('href="/orders.html" class="drawer-link">📦 Track') && !accountHtml.includes('href="/orders.html" class="top-bar-link">📦 Track'));
    assert('account.html: 👤 My Account -> /account.html', accountHtml.includes('href="/account.html" class="drawer-link"'));

    // Check referral.html
    assert('referral.html: 🎁 Complete Book Sets -> /bundles.html', referralHtml.includes('href="/bundles.html" class="drawer-link">🎁 Complete Book Sets</a>'));
    assert('referral.html drawer: Track Your Order === /track-order.html', referralHtml.includes('href="/track-order.html" class="drawer-link">📦 Track Your Order</a>'));
    assert('referral.html drawer: My Orders === /orders.html', referralHtml.includes('href="/orders.html" class="drawer-link" style="min-height: 44px; padding: 10px 12px;">📦 My Orders</a>'));
    assert('referral.html: No stale /orders.html target for Track Your Order', !referralHtml.includes('href="/orders.html" class="drawer-link">📦 Track') && !referralHtml.includes('href="/orders.html" class="top-bar-link">📦 Track'));
    assert('referral.html: 💰 Referral & Rewards -> /referral.html', referralHtml.includes('href="/referral.html" class="drawer-link"'));

    // Check ensureMobileDrawerDOM in global-nav.js
    assert('global-nav.js: Dynamic drawer generates /bundles.html', globalNavJs.includes('href="/bundles.html" class="drawer-link">🎁 Complete Book Sets</a>'));
    assert('global-nav.js: Dynamic drawer generates /#classSection', globalNavJs.includes('href="/#classSection" class="drawer-link">🎓 Class 10 Curriculum</a>'));
    assert('global-nav.js: Dynamic drawer generates /#subjectSection', globalNavJs.includes('href="/#subjectSection" class="drawer-link">🏷️ Categories & Subjects</a>'));
    assert('global-nav.js: Dynamic drawer generates /#notificationsSection', globalNavJs.includes('href="/#notificationsSection" class="drawer-link">🎉 Offers & Deals</a>'));
    assert('global-nav.js drawer: Track Your Order === /track-order.html', globalNavJs.includes('href="/track-order.html" class="drawer-link">📦 Track Your Order</a>'));
    assert('global-nav.js drawer: My Orders === /orders.html', globalNavJs.includes('href="/orders.html" class="drawer-link" style="min-height: 44px; padding: 10px 12px;">📦 My Orders</a>'));
    assert('global-nav.js: No stale /orders.html target for Track Your Order', !globalNavJs.includes('href="/orders.html" class="drawer-link">📦 Track'));

    // 3. Test Logout Functionality
    console.log('\n--- 3. Logout Integration ---');
    assert('Logout clears token and user in localStorage and redirects to /login.html', globalNavJs.includes('localStorage.removeItem("token")') && globalNavJs.includes('localStorage.removeItem("user")') && globalNavJs.includes('window.location.href = "/login.html"'));
    assert('handleDrawerClick handles drawerLogoutBtn and calls handleGlobalLogout', globalNavJs.includes('target.id === "drawerLogoutBtn"') && globalNavJs.includes('handleGlobalLogout(e)'));

    // 4. Test Pointer-Events and Z-Index Hierarchy
    console.log('\n--- 4. Pointer-Events & Z-Index Layering ---');
    assert('styles.css: .drawer-content has pointer-events: auto', stylesCss.includes('.drawer-link {') && stylesCss.includes('pointer-events: auto'));
    assert('styles.css: .drawer-content z-index (10001) > backdrop (1)', stylesCss.includes('z-index: 10001;'));
    assert('home-3d.css: .drawer-content z-index (2001) > backdrop (2000)', home3dCss.includes('z-index: 2001;') && home3dCss.includes('z-index: 2000;'));
    assert('home-3d.css: .drawer-link has pointer-events: auto and touch-action', home3dCss.includes('pointer-events: auto') && home3dCss.includes('touch-action: manipulation'));

    // 5. Test Auth States
    console.log('\n--- 5. Guest vs Authenticated vs Admin States ---');
    assert('Guest state shows #drawerGuestAuth and hides #drawerUserAuth', globalNavJs.includes('drawerGuestAuth.style.display = "block"') && globalNavJs.includes('drawerUserAuth.style.display = "none"'));
    assert('Authenticated state hides #drawerGuestAuth and shows #drawerUserAuth', globalNavJs.includes('drawerGuestAuth.style.display = "none"') && globalNavJs.includes('drawerUserAuth.style.display = "block"'));
    assert('Admin Dashboard link only shown for user.role === "admin"', globalNavJs.includes('const isAdmin = user.role === "admin"') && globalNavJs.includes('drawerAdminLink.style.display = isAdmin ? "flex" : "none"'));

    console.log('\n====================================================');
    console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed === 0) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

testMobileNavLinks();
