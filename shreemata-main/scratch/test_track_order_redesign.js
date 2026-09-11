const fs = require('fs');
const path = require('path');
const http = require('http');

async function runTrackOrderAudit() {
    console.log('====================================================');
    console.log('SHREE MATA — "TRACK YOUR ORDER" REDESIGN AUDIT');
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

    const trackHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'track-order.html'), 'utf8');
    const ordersJs = fs.readFileSync(path.join(__dirname, '..', 'routes', 'orders.js'), 'utf8');

    // 1. DESIGN SYSTEM & VISUAL IDENTITY
    console.log('--- 1. Design System & Visual Identity ---');
    assert('track-order.html links to Playfair Display & Inter Google Fonts', trackHtml.includes('Playfair+Display') && trackHtml.includes('Inter'));
    assert('track-order.html links to styles.css & home-3d.css', trackHtml.includes('css/styles.css') && trackHtml.includes('css/home-3d.css'));
    assert('track-order.html uses warm ivory background (#f8f6f0)', trackHtml.includes('#f8f6f0') || trackHtml.includes('var(--bg-warm-ivory)'));
    assert('track-order.html uses gold accents & navy text', trackHtml.includes('#d4a72c') || trackHtml.includes('var(--gold-primary)'));

    // 2. GLOBAL HEADER & SCRIPTS
    console.log('\n--- 2. Global Header & Navigation ---');
    assert('Global header with id="globalNavbar" present', trackHtml.includes('id="globalNavbar"') && trackHtml.includes('class="main-header"'));
    assert('Mobile hamburger button (#mobileMenuToggle) present', trackHtml.includes('id="mobileMenuToggle"'));
    assert('Header includes brand logo and title', trackHtml.includes('class="brand-logo"') && trackHtml.includes('Shree Mata'));
    assert('Header includes search box (#searchInput & #searchBtn)', trackHtml.includes('id="searchInput"') && trackHtml.includes('id="searchBtn"'));
    assert('Header includes user auth dropdown & cart badge', trackHtml.includes('id="userLinks"') && trackHtml.includes('id="cartLink"'));
    assert('Scripts loaded: config.js, cartUtils.js, global.js, global-nav.js', 
        trackHtml.includes('js/config.js') && trackHtml.includes('js/cartUtils.js') && trackHtml.includes('js/global.js') && trackHtml.includes('js/global-nav.js')
    );

    // 3. PAGE HERO SECTION
    console.log('\n--- 3. Page Hero Section ---');
    assert('Hero kicker present', trackHtml.includes('track-hero-kicker'));
    assert('Hero title: "Know exactly where your order is."', trackHtml.includes('Know exactly where your order is.'));
    assert('Hero subtitle present', trackHtml.includes('track-hero-subtitle'));

    // 4. TRACKING SEARCH CARD
    console.log('\n--- 4. Tracking Search Card ---');
    assert('Form with id="trackOrderForm" and handleTrackFormSubmit', trackHtml.includes('id="trackOrderForm"') && trackHtml.includes('handleTrackFormSubmit'));
    assert('Input field with id="trackInput" and icon', trackHtml.includes('id="trackInput"') && trackHtml.includes('track-input-icon'));
    assert('Submit button with id="trackSubmitBtn" and gold hover styling', trackHtml.includes('id="trackSubmitBtn"') && trackHtml.includes('btn-track-submit'));

    // 5. EMPTY, LOADING & ERROR STATES
    console.log('\n--- 5. Empty, Loading & Error States ---');
    assert('Empty state (#trackEmptyState) with "Your order journey will appear here."', trackHtml.includes('id="trackEmptyState"') && trackHtml.includes('Your order journey will appear here.'));
    assert('Loading state (#trackLoadingBox) with spinner and "Finding your order..."', trackHtml.includes('id="trackLoadingBox"') && trackHtml.includes('Finding your order...'));
    assert('Error state (#trackErrorBox) with helpful message & support contact', trackHtml.includes('id="trackErrorBox"') && trackHtml.includes('+91 98451 63604'));

    // 6. RESULT CARD & TIMELINE
    console.log('\n--- 6. Result Card, Timeline & Delivery ---');
    assert('Result card (#trackResultCard) with meta header', trackHtml.includes('id="trackResultCard"') && trackHtml.includes('track-header-meta'));
    assert('Copy order ID button (#copyIdBtn)', trackHtml.includes('id="copyIdBtn"') && trackHtml.includes('copyOrderId()'));
    assert('Status badge (#resStatusBadge) and payment badge (#resPaymentBadge)', trackHtml.includes('id="resStatusBadge"') && trackHtml.includes('id="resPaymentBadge"'));
    assert('Timeline container (#resTimelineList)', trackHtml.includes('id="resTimelineList"'));
    assert('Courier & delivery box (#resDeliveryBox & #resCourierRow)', trackHtml.includes('id="resDeliveryBox"') && trackHtml.includes('id="resCourierRow"'));
    assert('Items list container (#resItemsList)', trackHtml.includes('id="resItemsList"'));
    assert('Total amount display (#resTotalAmount)', trackHtml.includes('id="resTotalAmount"'));

    // 7. ACTION BUTTONS & RECENT ORDERS
    console.log('\n--- 7. Action Buttons & Logged-In UX ---');
    assert('Action buttons: View My Orders, Continue Shopping, Contact Support', 
        trackHtml.includes('href="/orders.html"') && trackHtml.includes('href="/#booksSection"') && trackHtml.includes('tel:+919845163604')
    );
    assert('Recent orders container (#recentOrdersCard) for logged-in users', trackHtml.includes('id="recentOrdersCard"') && trackHtml.includes('loadLoggedInRecentOrders'));

    // 8. BACKEND API AUDIT
    console.log('\n--- 8. Backend Order Tracking API Audit ---');
    assert('routes/orders.js defines GET /track/:orderId', ordersJs.includes('router.get("/track/:orderId"'));
    assert('sanitizeOrderForCustomer strips profitAmount & snapshots', ordersJs.includes('delete obj.profitAmount') && ordersJs.includes('delete itemObj.profitTypeSnapshot'));

    // 9. LIVE ENDPOINT TEST
    console.log('\n--- 9. Live HTTP API Request Test ---');
    await new Promise((resolve) => {
        const req = http.get('http://localhost:3000/api/orders/track/invalid-id-test-12345', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                assert('GET /api/orders/track/:orderId with invalid ID returns 404', res.statusCode === 404);
                resolve();
            });
        });
        req.on('error', (e) => {
            console.error('HTTP Request error:', e.message);
            failed++;
            resolve();
        });
    });

    // 10. FOOTER CONSISTENCY
    console.log('\n--- 10. Multi-Column Footer ---');
    assert('Footer includes Quick Links, Customer Account, Store & Support', 
        trackHtml.includes('Quick Links') && trackHtml.includes('Customer Account') && trackHtml.includes('Store & Support')
    );

    console.log('\n====================================================');
    console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed === 0) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runTrackOrderAudit();
