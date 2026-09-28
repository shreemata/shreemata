const fs = require('fs');
const path = require('path');

const filesToTest = [
    path.join(__dirname, '..', 'public', 'invoice.html'),
    path.join(__dirname, '..', 'public', 'customer-invoice.html'),
    path.join(__dirname, '..', 'public', 'admin-invoice-print.html')
];

let allPassed = true;

filesToTest.forEach(filePath => {
    const filename = path.basename(filePath);
    console.log(`\n--- Checking ${filename} ---`);
    if (!fs.existsSync(filePath)) {
        console.error(`❌ File missing: ${filePath}`);
        allPassed = false;
        return;
    }

    const html = fs.readFileSync(filePath, 'utf8');

    const checks = [
        { name: 'Quick Share Button', regex: /Quick Share/ },
        { name: 'openQuickShareModal() call', regex: /openQuickShareModal\(\)/ },
        { name: 'quickShareModal Element', regex: /id=["']quickShareModal["']/ },
        { name: 'quickShareToast Element', regex: /id=["']quickShareToast["']/ },
        { name: 'WhatsApp Share Function', regex: /function shareViaWhatsApp\(\)/ },
        { name: 'Customer WhatsApp Share Function', regex: /function shareDirectToCustomerWhatsApp\(\)/ },
        { name: 'Copy Invoice Link Function', regex: /function copyInvoiceLink\(\)/ },
        { name: 'Native Share Function', regex: /function triggerNativeShare\(\)/ },
        { name: 'Dynamic Share Text Generator', regex: /function getWhatsAppShareText\(\)/ },
        { name: 'Customer Phone Extractor', regex: /function getCustomerPhoneNumber\(\)/ },
        { name: 'WhatsApp URL Pattern', regex: /https:\/\/wa\.me\// }
    ];

    checks.forEach(check => {
        if (check.regex.test(html)) {
            console.log(`  ✅ ${check.name}`);
        } else {
            console.error(`  ❌ ${check.name} missing!`);
            allPassed = false;
        }
    });
});

if (allPassed) {
    console.log('\n🎉 ALL QUICK SHARE VERIFICATIONS PASSED SUCCESSFULLY!');
} else {
    console.error('\n❌ SOME VERIFICATIONS FAILED');
    process.exit(1);
}
