// public/js/admin-commission-settings.js
/**
 * Admin Commission Settings Helper & Live Calculator Functions
 */

function calculateProfitSplit(profitInput, settings) {
    const profit = Math.max(0, parseFloat(profitInput) || 0);
    const direct = parseFloat(settings.direct) || 0;
    const referral = parseFloat(settings.referral) || 0;
    const admin = parseFloat(settings.admin) || 0;
    const trust = parseFloat(settings.trust) || 0;
    const tree = parseFloat(settings.tree) || 0;

    const totalPercent = parseFloat((direct + referral + admin + trust + tree).toFixed(4));

    const directAmount = profit * (direct / 100);
    const referralAmount = profit * (referral / 100);
    const adminAmount = profit * (admin / 100);
    const trustAmount = profit * (trust / 100);
    const treeAmount = profit * (tree / 100);
    const totalAmount = profit * (totalPercent / 100);

    return {
        profit,
        totalPercent,
        totalAmount,
        direct: { percentage: direct, amount: directAmount },
        referral: { percentage: referral, amount: referralAmount },
        admin: { percentage: admin, amount: adminAmount },
        trust: { percentage: trust, amount: trustAmount },
        tree: { percentage: tree, amount: treeAmount }
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calculateProfitSplit };
}

document.addEventListener('DOMContentLoaded', () => {
    const btnSimulate = document.getElementById('btnSimulatePayout');
    if (btnSimulate) {
        btnSimulate.addEventListener('click', () => {
            const profitInputVal = parseFloat(document.getElementById('testProfitInput').value) || 0;
            if (profitInputVal <= 0) {
                if (typeof showAlert === 'function') {
                    showAlert('⚠️ Please enter a profit amount greater than 0 first.', 'error');
                } else {
                    alert('Please enter a profit amount greater than 0 first.');
                }
                return;
            }
            
            const direct = parseFloat(document.getElementById('directCommission')?.value) || 0;
            const referral = parseFloat(document.getElementById('referralCommission')?.value) || 0;
            const admin = parseFloat(document.getElementById('adminCommission')?.value) || 0;
            const trust = parseFloat(document.getElementById('trustFund')?.value) || 0;
            const tree = parseFloat(document.getElementById('treePool')?.value) || 0;
            const totalPercent = parseFloat((direct + referral + admin + trust + tree).toFixed(4));
            const totalAmount = profitInputVal * (totalPercent / 100);

            const msg = `🧪 Read-Only Payout Simulation Preview:\n\n` +
                        `• Base Profit Input: ₹${profitInputVal.toFixed(2)}\n` +
                        `• Buyer Cashback (${direct}%): ₹${(profitInputVal * direct / 100).toFixed(2)}\n` +
                        `• Direct Referral (${referral}%): ₹${(profitInputVal * referral / 100).toFixed(2)}\n` +
                        `• Tree Pool (${tree}%): ₹${(profitInputVal * tree / 100).toFixed(2)}\n` +
                        `• Trust Fund (${trust}%): ₹${(profitInputVal * trust / 100).toFixed(2)}\n` +
                        `• Admin Share (${admin}%): ₹${(profitInputVal * admin / 100).toFixed(2)}\n` +
                        `----------------------------------------\n` +
                        `Total Allocated (${totalPercent}%): ₹${totalAmount.toFixed(2)}\n\n` +
                        `ℹ️ Note: This is a read-only preview. No wallets or database records were modified.`;

            if (typeof showAlert === 'function') {
                showAlert(`🧪 Read-Only Simulation Preview: Total Allocation ₹${totalAmount.toFixed(2)} (${totalPercent}%). No wallet balances were modified.`, "success");
            } else {
                alert(msg);
            }
        });
    }

    const btnExport = document.getElementById('btnExportCalculatorCsv');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            const profitInputVal = parseFloat(document.getElementById('testProfitInput').value) || 0;
            if (profitInputVal <= 0) return;

            const direct = parseFloat(document.getElementById('directCommission')?.value) || 0;
            const referral = parseFloat(document.getElementById('referralCommission')?.value) || 0;
            const admin = parseFloat(document.getElementById('adminCommission')?.value) || 0;
            const trust = parseFloat(document.getElementById('trustFund')?.value) || 0;
            const tree = parseFloat(document.getElementById('treePool')?.value) || 0;

            const totalPercent = parseFloat((direct + referral + admin + trust + tree).toFixed(4));

            const directAmount = profitInputVal * (direct / 100);
            const referralAmount = profitInputVal * (referral / 100);
            const adminAmount = profitInputVal * (admin / 100);
            const trustAmount = profitInputVal * (trust / 100);
            const treeAmount = profitInputVal * (tree / 100);
            const totalAmount = profitInputVal * (totalPercent / 100);

            // Construct CSV contents
            let csvRows = [
                ['Company/System', 'Shreemata Commission Engine', ''],
                ['Document Type', 'Profit Split Simulation Receipt', ''],
                ['Generated On', new Date().toLocaleString(), ''],
                ['Base Profit Input (₹)', profitInputVal.toFixed(2), ''],
                ['', '', ''], // Empty row for spacing
                ['Category', 'Percentage (%)', 'Amount (₹)'],
                ['Total Commission', totalPercent, totalAmount.toFixed(2)],
                ['Direct Commission', direct, directAmount.toFixed(2)],
                ['Referral Commission', referral, referralAmount.toFixed(2)]
            ];

            if (admin > 0) {
                csvRows.push(['Admin Share', admin, adminAmount.toFixed(2)]);
            }

            csvRows.push(['Trust Fund', trust, trustAmount.toFixed(2)]);
            csvRows.push(['Tree Commission', tree, treeAmount.toFixed(2)]);
            
            // Add professional footer block
            csvRows.push(['', '', '']); // Empty row for spacing
            csvRows.push(['*** END OF RECEIPT ***', 'CONFIDENTIAL - INTERNAL USE ONLY', '']);

            // Convert to CSV string
            const csvContent = csvRows.map(row => row.map(val => `"${val}"`).join(',')).join('\n');

            // Trigger download with timestamp
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            
            const timestamp = Date.now();
            link.setAttribute('download', `profit_split_receipt_${timestamp}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            if (typeof showAlert === 'function') {
                showAlert('✅ CSV exported successfully!', 'success');
            }
        });
    }
});

