const fs = require('fs');
const path = require('path');

const accountHtmlPath = path.join(__dirname, '..', 'public', 'account.html');
const accountCssPath = path.join(__dirname, '..', 'public', 'css', 'account.css');
const accountJsPath = path.join(__dirname, '..', 'public', 'js', 'account.js');
const stylesCssPath = path.join(__dirname, '..', 'public', 'css', 'styles.css');

console.log('🧪 Testing Mobile Account Sidebar Implementation...\n');

let allPassed = true;

function assert(condition, message) {
    if (condition) {
        console.log(`✅ PASS: ${message}`);
    } else {
        console.error(`❌ FAIL: ${message}`);
        allPassed = false;
    }
}

// 1. Check account.html Markup
console.log('--- 1. Account.html Markup Verification ---');
const htmlContent = fs.readFileSync(accountHtmlPath, 'utf8');

assert(htmlContent.includes('id="mobileAccountMenuBtn"'), 'Mobile Account Menu trigger button present');
assert(htmlContent.includes('id="mobileAccountBackdrop"'), 'Mobile Account backdrop present');
assert(htmlContent.includes('id="mobileAccountSidebar"'), 'Mobile Account off-canvas sidebar present');
assert(htmlContent.includes('id="mobileAccountCloseBtn"'), 'Mobile Account close button present');
assert(htmlContent.includes('id="mobileAccountNav"'), 'Mobile Account navigation container present');
assert(htmlContent.includes('data-section="profile"'), 'Sidebar has Profile Overview item');
assert(htmlContent.includes('data-section="edit"'), 'Sidebar has Edit Profile item');
assert(htmlContent.includes('data-section="address"'), 'Sidebar has Delivery Address item');
assert(htmlContent.includes('data-section="store"'), 'Sidebar has Store Details item');
assert(htmlContent.includes('data-section="orders"'), 'Sidebar has Order History item');
assert(htmlContent.includes('data-section="wallet"'), 'Sidebar has Wallet & Cashback item');
assert(htmlContent.includes('data-section="points"'), 'Sidebar has Points & Rewards item');
assert(htmlContent.includes('data-section="referral"'), 'Sidebar has Referral & Rewards item');
assert(htmlContent.includes('data-section="membership"'), 'Sidebar has Membership item');
assert(htmlContent.includes('data-section="vip"'), 'Sidebar has VIP Master Card item');
assert(htmlContent.includes('logout()'), 'Sidebar has Logout item');

// 2. Check account.css Styles
console.log('\n--- 2. Account.css Styles Verification ---');
const cssContent = fs.readFileSync(accountCssPath, 'utf8');

assert(cssContent.includes('.btn-mobile-account-menu'), 'CSS rule for .btn-mobile-account-menu defined');
assert(cssContent.includes('.mobile-account-backdrop'), 'CSS rule for .mobile-account-backdrop defined');
assert(cssContent.includes('.mobile-account-offcanvas'), 'CSS rule for .mobile-account-offcanvas defined');
assert(cssContent.includes('transform: translateX(-100%)'), 'Off-canvas sidebar uses translateX(-100%) initial transition');
assert(cssContent.includes('.mobile-account-offcanvas.open'), 'Off-canvas sidebar .open class uses translateX(0)');
assert(cssContent.includes('min(82vw, 320px)'), 'Sidebar width uses min(82vw, 320px)');
assert(cssContent.includes('calc(100vw - 32px)'), 'Small screen width <=360px handles calc(100vw - 32px)');
assert(cssContent.includes('.account-sidebar {\n        display: none !important;') || cssContent.includes('.account-sidebar {\r\n        display: none !important;'), 'Desktop sidebar hidden at <= 768px');
assert(cssContent.includes('.btn-mobile-account-menu {\n        display: flex !important;') || cssContent.includes('.btn-mobile-account-menu {\r\n        display: flex !important;'), 'Mobile menu button displayed at <= 768px');

// 3. Check account.js Logic
console.log('\n--- 3. Account.js Logic Verification ---');
const jsContent = fs.readFileSync(accountJsPath, 'utf8');

assert(jsContent.includes('function openMobileAccountSidebar()'), 'openMobileAccountSidebar function defined');
assert(jsContent.includes('function closeMobileAccountSidebar()'), 'closeMobileAccountSidebar function defined');
assert(jsContent.includes('function handleMobileNavClick('), 'handleMobileNavClick function defined');
assert(jsContent.includes('function updateMobileActiveNav('), 'updateMobileActiveNav function defined');
assert(jsContent.includes('document.body.style.overflow = "hidden"'), 'Body scroll locked on sidebar open');
assert(jsContent.includes('document.body.style.overflow = ""'), 'Body scroll restored on sidebar close');
assert(jsContent.includes('e.key === "Escape"'), 'Escape key closes mobile account sidebar');

console.log('\n==================================================');
if (allPassed) {
    console.log('🎉 ALL MOBILE ACCOUNT SIDEBAR TESTS PASSED! ✅');
} else {
    console.error('⚠️ SOME TESTS FAILED.');
    process.exit(1);
}
console.log('==================================================\n');
