const fs = require('fs');
const path = require('path');
const http = require('http');

async function checkUrl(urlPath) {
    return new Promise((resolve) => {
        http.get(`http://localhost:3000${urlPath}`, (res) => {
            resolve({ statusCode: res.statusCode });
        }).on('error', (err) => {
            resolve({ statusCode: 500, error: err.message });
        });
    });
}

async function runAudit() {
    console.log('====================================================');
    console.log('SHREE MATA — TRACK ORDER ROUTING AUDIT');
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
    const trackOrderHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'track-order.html'), 'utf8');
    const ordersHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'orders.html'), 'utf8');
    const globalNavJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'global-nav.js'), 'utf8');

    // 1. Mobile Drawer Routing
    console.log('--- 1. Mobile Drawer Routing ---');
    assert('global-nav.js drawer: Track Your Order -> /track-order.html', globalNavJs.includes('href="/track-order.html" class="drawer-link">📦 Track Your Order</a>'));
    assert('global-nav.js drawer: My Orders -> /orders.html', globalNavJs.includes('href="/orders.html" class="drawer-link" style="min-height: 44px; padding: 10px 12px;">📦 My Orders</a>'));
    assert('index.html drawer: Track Your Order -> /track-order.html', indexHtml.includes('href="/track-order.html" class="drawer-link">📦 Track Your Order</a>'));
    assert('index.html drawer: My Orders -> /orders.html', indexHtml.includes('href="/orders.html" class="drawer-link" style="min-height: 44px; padding: 10px 12px;">📦 My Orders</a>'));
    assert('account.html drawer: Track Your Order -> /track-order.html', accountHtml.includes('href="/track-order.html" class="drawer-link">📦 Track Your Order</a>'));
    assert('account.html drawer: My Orders -> /orders.html', accountHtml.includes('href="/orders.html" class="drawer-link" style="min-height: 44px; padding: 10px 12px;">📦 My Orders</a>'));
    assert('referral.html drawer: Track Your Order -> /track-order.html', referralHtml.includes('href="/track-order.html" class="drawer-link">📦 Track Your Order</a>'));
    assert('referral.html drawer: My Orders -> /orders.html', referralHtml.includes('href="/orders.html" class="drawer-link" style="min-height: 44px; padding: 10px 12px;">📦 My Orders</a>'));

    // 2. Track Page Actions
    console.log('\n--- 2. Track Page Actions ---');
    assert('track-order.html: View My Orders -> /orders.html', trackOrderHtml.includes('href="/orders.html" class="btn-action-outline">📦 View My Orders</a>'));
    assert('track-order.html: Continue Shopping -> homepage catalog', trackOrderHtml.includes('href="/#booksSection" class="btn-action-primary">📚 Continue Shopping</a>') || trackOrderHtml.includes('href="/" class="btn-action-primary">📚 Continue Shopping</a>'));
    assert('track-order.html: Contact Support -> helpline link', trackOrderHtml.includes('href="tel:+919845163604"') || trackOrderHtml.includes('href="https://wa.me/'));

    // 3. Desktop Navigation Routing
    console.log('\n--- 3. Desktop Navigation Routing ---');
    assert('index.html desktop top-bar: Track Your Order -> /track-order.html', indexHtml.includes('href="/track-order.html" class="top-bar-link">📦 Track Your Order</a>'));
    assert('account.html desktop top-bar: Track Your Order -> /track-order.html', accountHtml.includes('href="/track-order.html" class="top-bar-link">📦 Track Your Order</a>'));
    assert('referral.html desktop top-bar: Track Your Order -> /track-order.html', referralHtml.includes('href="/track-order.html" class="top-bar-link">📦 Track Your Order</a>'));
    assert('track-order.html desktop nav: Track Your Order -> /track-order.html', trackOrderHtml.includes('href="/track-order.html" class="nav-link active">Track Your Order</a>'));

    // 4. Footer Routing
    console.log('\n--- 4. Footer Routing ---');
    assert('index.html footer: Track Your Order -> /track-order.html', indexHtml.includes('href="/track-order.html">Track Your Order</a>'));
    assert('index.html footer: Orders -> /orders.html', indexHtml.includes('href="/orders.html">Orders</a>'));
    assert('account.html footer: Track Your Order -> /track-order.html', accountHtml.includes('href="/track-order.html">Track Your Order</a>'));
    assert('account.html footer: My Orders -> /orders.html', accountHtml.includes('href="/orders.html">My Orders</a>'));
    assert('referral.html footer: Track Your Order -> /track-order.html', referralHtml.includes('href="/track-order.html">Track Your Order</a>'));
    assert('referral.html footer: My Orders -> /orders.html', referralHtml.includes('href="/orders.html">My Orders</a>'));
    assert('track-order.html footer: Track Your Order -> /track-order.html', trackOrderHtml.includes('href="/track-order.html" style="color: #ffffff; text-decoration: none; font-weight: 600;">Track Your Order</a>'));
    assert('track-order.html footer: Order History -> /orders.html', trackOrderHtml.includes('href="/orders.html" style="color: #94a3b8; text-decoration: none;">Order History</a>'));

    // 5. HTTP Availability Checks (No 404s)
    console.log('\n--- 5. HTTP Availability Checks ---');
    const trackOrderRes = await checkUrl('/track-order.html');
    assert('/track-order.html responds with 200 OK', trackOrderRes.statusCode === 200);

    const ordersRes = await checkUrl('/orders.html');
    assert('/orders.html responds with 200 OK', ordersRes.statusCode === 200);

    const accountRes = await checkUrl('/account.html');
    assert('/account.html responds with 200 OK', accountRes.statusCode === 200);

    const indexRes = await checkUrl('/index.html');
    assert('/index.html responds with 200 OK', indexRes.statusCode === 200);

    console.log('\n====================================================');
    console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed === 0) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runAudit();
