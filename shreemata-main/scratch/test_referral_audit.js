const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function testReferralDashboard() {
    console.log('--- 1. Testing Server HTTP Endpoint ---');
    const res = await axios.get('http://localhost:3000/referral.html');
    console.log(`Status: ${res.status} ${res.statusText}`);
    const html = res.data;

    console.log('\n--- 2. Auditing Single Shared Shell Elements ---');
    const topBarCount = (html.match(/class="top-bar"/g) || []).length;
    const mainHeaderCount = (html.match(/class="main-header"/g) || []).length;
    const mainFooterCount = (html.match(/class="main-footer"/g) || []).length;
    const mobileDrawerCount = (html.match(/id="mobileNavDrawer"/g) || []).length;
    const userDropdownCount = (html.match(/id="userDropdownMenu"/g) || []).length;

    console.log(`Top Bar count: ${topBarCount} (Expected: 1) -> ${topBarCount === 1 ? 'PASS' : 'FAIL'}`);
    console.log(`Main Header count: ${mainHeaderCount} (Expected: 1) -> ${mainHeaderCount === 1 ? 'PASS' : 'FAIL'}`);
    console.log(`Main Footer count: ${mainFooterCount} (Expected: 1) -> ${mainFooterCount === 1 ? 'PASS' : 'FAIL'}`);
    console.log(`Mobile Drawer count: ${mobileDrawerCount} (Expected: 1) -> ${mobileDrawerCount === 1 ? 'PASS' : 'FAIL'}`);
    console.log(`User Dropdown count: ${userDropdownCount} (Expected: 1) -> ${userDropdownCount === 1 ? 'PASS' : 'FAIL'}`);

    console.log('\n--- 3. Verifying All Required Functional DOM IDs ---');
    const requiredIds = [
        "userName", "adminLink", "logoutBtn", "cartCount",
        "wallet", "referralCount", "treeLevel", "treeChildrenCount",
        "refCode", "refLink", "copyCodeBtn", "copyLinkBtn",
        "directCommission", "directPercentage", "treeCommission", "treePercentage",
        "treePositionInfo", "userTreeLevel", "treeParentInfo", "directTreeChildren",
        "referralsLoading", "referralsContent", "noReferrals",
        "filterAll", "filterDirect", "filterSpillover",
        "countAll", "countDirect", "countSpillover", "referralsTableBody",
        "bankSetupSection", "bankDetailsForm",
        "accountHolderName", "accountNumber", "ifscCode", "bankName", "upiId",
        "withdrawalFormSection", "useSavedModeBtn", "enterDifferentModeBtn",
        "useSavedDetailsPanel", "enterDifferentDetailsPanel", "deleteSavedBankBtn",
        "maskedBankDetails", "minWithdrawalInfo", "dailyLimitInfo", "monthlyLimitInfo",
        "walletBalance", "minWithdrawal", "dailyLimit", "monthlyLimit",
        "withdrawalAmount", "withdrawalForm",
        "diffAccountHolderName", "diffAccountNumber", "diffIfscCode", "diffBankName", "diffUpiId",
        "differentBankDetailsForm", "withdrawalHistory", "withdrawalHistoryList",
        "withdrawMsg", "bankChangeStatusDisplay", "bankChangeStatusContent",
        "bankChangeModal", "bankChangePopupForm",
        "popupAccountHolderName", "popupAccountNumber", "popupIfscCode", "popupBankName",
        "popupUpiId", "popupChangeReason", "refToastContainer"
    ];

    let missingIds = [];
    requiredIds.forEach(id => {
        if (!html.includes(`id="${id}"`)) {
            missingIds.push(id);
        }
    });

    if (missingIds.length === 0) {
        console.log(`✅ All ${requiredIds.length} required DOM IDs are properly preserved and present in referral.html!`);
    } else {
        console.error(`❌ Missing DOM IDs:`, missingIds);
    }

    console.log('\n--- 4. Checking Stylesheet & Design Tokens in referral.css ---');
    const cssPath = path.join(__dirname, '..', 'public', 'css', 'referral.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    const hasStickySidebar = cssContent.includes('position: sticky') && cssContent.includes('.referral-sidebar');
    const hasMobileTabs = cssContent.includes('.referral-mobile-nav');
    const hasTabularNums = cssContent.includes('font-variant-numeric: tabular-nums');
    const hasFixedModal = cssContent.includes('position: fixed') && cssContent.includes('.ref-modal-backdrop');

    console.log(`Sticky Desktop Sidebar: ${hasStickySidebar ? 'PASS' : 'FAIL'}`);
    console.log(`Mobile Horizontal Tabs: ${hasMobileTabs ? 'PASS' : 'FAIL'}`);
    console.log(`Tabular Numerals (Inter): ${hasTabularNums ? 'PASS' : 'FAIL'}`);
    console.log(`Fixed Viewport Modal: ${hasFixedModal ? 'PASS' : 'FAIL'}`);

    console.log('\n--- 5. Checking API Endpoints Connected in referral.js ---');
    const jsPath = path.join(__dirname, '..', 'public', 'js', 'referral.js');
    const jsContent = fs.readFileSync(jsPath, 'utf8');

    const expectedEndpoints = [
        "/referral/details",
        "/referral/withdrawal-settings",
        "/referral/setup-bank-details",
        "/referral/bank-details",
        "/referral/withdraw",
        "/users/profile",
        "/referral/bank-change-status",
        "/referral/request-bank-change"
    ];

    let missingEndpoints = [];
    expectedEndpoints.forEach(ep => {
        if (!jsContent.includes(ep)) {
            missingEndpoints.push(ep);
        }
    });

    if (missingEndpoints.length === 0) {
        console.log(`✅ All ${expectedEndpoints.length} referral API endpoints are correctly connected!`);
    } else {
        console.error(`❌ Missing endpoints:`, missingEndpoints);
    }
}

testReferralDashboard().catch(console.error);
