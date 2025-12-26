const express = require("express");
const User = require("../models/User");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const sendMail = require("../utils/sendMail");

const router = express.Router();

/* -------------------------------------------
   🔒 Admin — Update User Bank Details
--------------------------------------------*/
router.post("/update-bank-details/:userId", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const { accountNumber, accountHolderName, bankName, ifscCode, upiId, adminNotes } = req.body;
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Update bank details (admin can override)
        user.bankDetails = {
            ...user.bankDetails,
            accountNumber: accountNumber?.trim(),
            accountHolderName: accountHolderName?.trim(),
            bankName: bankName?.trim(),
            ifscCode: ifscCode?.trim().toUpperCase(),
            upiId: upiId?.trim().toLowerCase(),
            adminNotes: adminNotes?.trim(),
            lastModifiedBy: 'admin',
            isSetup: true,
            setupDate: user.bankDetails.setupDate || new Date()
        };

        await user.save();

        // Send notification to user
        await sendMail(
            user.email,
            "Bank Details Updated by Admin",
            `
            <h2>Hello ${user.name},</h2>
            <p>Your bank details have been updated by our admin team.</p>
            <p>If you did not request this change, please contact us immediately.</p>
            ${adminNotes ? `<p><strong>Admin Notes:</strong> ${adminNotes}</p>` : ''}
            <br>
            <p>Shree Mata Team</p>
            `
        );

        res.json({ 
            message: "Bank details updated successfully",
            maskedBankDetails: user.getMaskedBankDetails()
        });

    } catch (err) {
        console.error("Admin bank details update error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* -------------------------------------------
   🔒 Admin — Get User Bank Details
--------------------------------------------*/
router.get("/bank-details/:userId", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Admin can see full bank details
        res.json({
            bankDetails: user.bankDetails,
            withdrawalStats: user.withdrawalStats,
            userInfo: {
                name: user.name,
                email: user.email,
                wallet: user.wallet
            }
        });

    } catch (err) {
        console.error("Admin get bank details error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* -------------------------------------------
   1️⃣ Admin — Get all withdrawal requests
--------------------------------------------*/
router.get("/", authenticateToken, isAdmin, async (req, res) => {
    try {
        const users = await User.find({
            "withdrawals.0": { $exists: true }
        }).select("name email withdrawals directCommissionEarned treeCommissionEarned wallet");

        let list = [];

        users.forEach(user => {
            // Calculate total earnings from purchases
            const totalPurchaseEarnings = (user.directCommissionEarned || 0) + (user.treeCommissionEarned || 0);
            
            user.withdrawals.forEach(w => {
                list.push({
                    userId: user._id,
                    name: user.name,
                    email: user.email,
                    amount: w.amount,
                    date: w.date || w.requestedAt || null,
                    status: w.status,
                    withdrawId: w._id,
                    upi: w.upi || null,
                    bankName: w.bankName || null,
                    bank: w.bank || null,
                    ifsc: w.ifsc || null,
                    // Purchase earnings data for admin
                    purchaseEarnings: {
                        directCommission: user.directCommissionEarned || 0,
                        treeCommission: user.treeCommissionEarned || 0,
                        totalEarnings: totalPurchaseEarnings,
                        currentWallet: user.wallet || 0
                    }
                });
            });
        });

        res.json(list);

    } catch (err) {
        console.error("Admin withdraw fetch error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* -------------------------------------------
   2️⃣ Admin — Approve withdrawal
--------------------------------------------*/
router.post("/approve", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { userId, withdrawId } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const withdrawal = user.withdrawals.id(withdrawId);
        if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });

        // Process payment transfer
        let transferResult = null;
        let transferError = null;

        try {
            transferResult = await processPaymentTransfer(withdrawal, user);
            
            // Update withdrawal with transfer details
            withdrawal.status = "approved";
            withdrawal.transferId = transferResult.transferId;
            withdrawal.transferDate = new Date();
            withdrawal.transferMethod = transferResult.method;
            
            await user.save();

            // Send success email
            await sendMail(
                user.email,
                "Withdrawal Approved & Transferred",
                `
                <h2>Hello ${user.name},</h2>
                <p>Your withdrawal of <b>₹${withdrawal.amount}</b> has been approved and transferred successfully!</p>
                <p><strong>Transfer Details:</strong></p>
                <ul>
                    <li>Amount: ₹${withdrawal.amount}</li>
                    <li>Transfer ID: ${transferResult.transferId}</li>
                    <li>Method: ${transferResult.method}</li>
                    <li>Date: ${new Date().toLocaleDateString('en-IN')}</li>
                </ul>
                <p>The money should reflect in your account within 1-2 business days.</p>
                <br>
                <p>BookStore Team</p>
                `
            );

            res.json({ 
                message: "Withdrawal approved and payment transferred successfully",
                transferId: transferResult.transferId,
                method: transferResult.method
            });

        } catch (transferErr) {
            console.error("Payment transfer failed:", transferErr);
            transferError = transferErr.message;

            // Mark as approved (simplified - no transfer integration)
            withdrawal.status = "approved";
            withdrawal.transferDate = new Date();
            withdrawal.transferId = `manual_${Date.now()}`;
            await user.save();

            // Send email about manual transfer needed
            await sendMail(
                user.email,
                "Withdrawal Approved - Manual Transfer Required",
                `
                <h2>Hello ${user.name},</h2>
                <p>Your withdrawal of <b>₹${withdrawal.amount}</b> has been approved.</p>
                <p><strong>Note:</strong> Automatic transfer failed. Our team will process the payment manually within 24 hours.</p>
                <p>You will receive another confirmation once the transfer is completed.</p>
                <br>
                <p>BookStore Team</p>
                `
            );

            res.json({ 
                message: "Withdrawal approved. Manual transfer will be processed within 24 hours.",
                requiresManualTransfer: true,
                error: transferError
            });
        }

    } catch (err) {
        console.error("Approve error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* -------------------------------------------
   💰 Payment Transfer Function
--------------------------------------------*/
async function processPaymentTransfer(withdrawal, user) {
    const Razorpay = require("razorpay");
    
    // Initialize Razorpay with payout credentials
    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });

    // Determine transfer method and account details
    let transferMethod = 'UPI';
    let accountDetails = {};

    if (withdrawal.upi) {
        // UPI Transfer
        transferMethod = 'UPI';
        accountDetails = {
            account_number: withdrawal.upi,
            fund_account: {
                account_type: 'vpa',
                vpa: {
                    address: withdrawal.upi
                },
                contact: {
                    name: user.name,
                    email: user.email,
                    contact: user.phone || '9999999999',
                    type: 'customer'
                }
            }
        };
    } else if (withdrawal.bank && withdrawal.ifsc) {
        // Bank Transfer
        transferMethod = 'Bank Transfer';
        accountDetails = {
            account_number: withdrawal.bank,
            fund_account: {
                account_type: 'bank_account',
                bank_account: {
                    name: user.name,
                    ifsc: withdrawal.ifsc,
                    account_number: withdrawal.bank
                },
                contact: {
                    name: user.name,
                    email: user.email,
                    contact: user.phone || '9999999999',
                    type: 'customer'
                }
            }
        };
    } else {
        throw new Error('No valid payment method found (UPI or Bank details required)');
    }

    try {
        // Create contact first
        const contact = await razorpay.contacts.create({
            name: user.name,
            email: user.email,
            contact: user.phone || '9999999999',
            type: 'customer'
        });

        // Create fund account
        const fundAccount = await razorpay.fundAccount.create({
            contact_id: contact.id,
            account_type: accountDetails.fund_account.account_type,
            [accountDetails.fund_account.account_type]: accountDetails.fund_account[accountDetails.fund_account.account_type]
        });

        // Create payout
        const payout = await razorpay.payouts.create({
            account_number: process.env.RAZORPAY_ACCOUNT_NUMBER, // Your Razorpay account number
            fund_account_id: fundAccount.id,
            amount: withdrawal.amount * 100, // Amount in paise
            currency: 'INR',
            mode: transferMethod === 'UPI' ? 'UPI' : 'IMPS',
            purpose: 'refund',
            queue_if_low_balance: true,
            reference_id: `withdrawal_${withdrawal._id}`,
            narration: `BookStore withdrawal for ${user.name}`
        });

        console.log('✅ Payout created successfully:', payout.id);

        return {
            transferId: payout.id,
            method: transferMethod,
            status: payout.status,
            razorpayResponse: payout
        };

    } catch (razorpayError) {
        console.error('❌ Razorpay payout failed:', razorpayError);
        
        // If Razorpay fails, try alternative method or throw error
        throw new Error(`Payment transfer failed: ${razorpayError.error?.description || razorpayError.message}`);
    }
}

/* -------------------------------------------
   3️⃣ Admin — Reject withdrawal
--------------------------------------------*/
router.post("/reject", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { userId, withdrawId } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const withdrawal = user.withdrawals.id(withdrawId);
        if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });

        // refund amount
        user.wallet += withdrawal.amount;

        withdrawal.status = "rejected";
        await user.save();

        await sendMail(
    user.email,
    "Withdrawal Rejected",
    `
    <h2>Hello ${user.name},</h2>
    <p>Your withdrawal request of <b>₹${withdrawal.amount}</b> was rejected.</p>
    <p>The amount has been refunded to your wallet.</p>
    <br>
    <p>BookStore Team</p>
    `
);


        res.json({ message: "Withdrawal rejected & refunded" });

    } catch (err) {
        console.error("Reject error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* -------------------------------------------
   4️⃣ Webhook — Payout Status Updates
--------------------------------------------*/
router.post("/payout-webhook", async (req, res) => {
    try {
        const crypto = require("crypto");
        const signature = req.headers["x-razorpay-signature"];
        const body = JSON.stringify(req.body);
        
        // Verify webhook signature
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(body)
            .digest("hex");

        if (signature !== expectedSignature) {
            return res.status(400).json({ error: "Invalid signature" });
        }

        const event = req.body;
        
        if (event.event === "payout.processed" || event.event === "payout.failed") {
            const payout = event.payload.payout.entity;
            const referenceId = payout.reference_id; // withdrawal_{withdrawalId}
            
            if (referenceId && referenceId.startsWith('withdrawal_')) {
                const withdrawalId = referenceId.replace('withdrawal_', '');
                
                // Find user with this withdrawal
                const user = await User.findOne({
                    "withdrawals._id": withdrawalId
                });
                
                if (user) {
                    const withdrawal = user.withdrawals.id(withdrawalId);
                    if (withdrawal) {
                        withdrawal.transferStatus = payout.status;
                        
                        if (event.event === "payout.processed") {
                            withdrawal.status = "approved";
                            
                            // Send success email
                            await sendMail(
                                user.email,
                                "Withdrawal Transfer Completed",
                                `
                                <h2>Hello ${user.name},</h2>
                                <p>Great news! Your withdrawal of <b>₹${withdrawal.amount}</b> has been successfully transferred to your account.</p>
                                <p><strong>Transfer Details:</strong></p>
                                <ul>
                                    <li>Amount: ₹${withdrawal.amount}</li>
                                    <li>Transfer ID: ${withdrawal.transferId}</li>
                                    <li>Method: ${withdrawal.transferMethod}</li>
                                    <li>Status: Completed</li>
                                </ul>
                                <p>Thank you for using our platform!</p>
                                <br>
                                <p>BookStore Team</p>
                                `
                            );
                        } else if (event.event === "payout.failed") {
                            withdrawal.status = "approved";
                            withdrawal.transferDate = new Date();
                            withdrawal.transferId = `webhook_${Date.now()}`;
                            
                            // Send failure email
                            await sendMail(
                                user.email,
                                "Withdrawal Transfer Failed - Manual Processing Required",
                                `
                                <h2>Hello ${user.name},</h2>
                                <p>We encountered an issue while transferring your withdrawal of <b>₹${withdrawal.amount}</b>.</p>
                                <p><strong>Issue:</strong> ${payout.failure_reason || "Technical error during transfer"}</p>
                                <p>Don't worry! Our team will process your payment manually within 24 hours.</p>
                                <p>You will receive another confirmation once the transfer is completed.</p>
                                <br>
                                <p>BookStore Team</p>
                                `
                            );
                        }
                        
                        await user.save();
                        console.log(`✅ Updated withdrawal ${withdrawalId} status to ${payout.status}`);
                    }
                }
            }
        }
        
        res.json({ status: "ok" });
        
    } catch (err) {
        console.error("Payout webhook error:", err);
        res.status(500).json({ error: "Webhook processing failed" });
    }
});

/* -------------------------------------------
   5️⃣ Manual Transfer Completion (for failed auto-transfers)
--------------------------------------------*/
router.post("/manual-transfer-complete", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { userId, withdrawId, transferDetails } = req.body;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        const withdrawal = user.withdrawals.id(withdrawId);
        if (!withdrawal) return res.status(404).json({ error: "Withdrawal not found" });

        // Update withdrawal as manually completed
        withdrawal.status = "approved";
        withdrawal.transferMethod = "Manual Transfer";
        withdrawal.transferDate = new Date();
        withdrawal.transferId = `manual_${Date.now()}`;
        withdrawal.transferStatus = "processed";
        
        await user.save();

        // Send completion email
        await sendMail(
            user.email,
            "Withdrawal Transfer Completed (Manual)",
            `
            <h2>Hello ${user.name},</h2>
            <p>Your withdrawal of <b>₹${withdrawal.amount}</b> has been successfully processed and transferred to your account.</p>
            <p><strong>Transfer Details:</strong></p>
            <ul>
                <li>Amount: ₹${withdrawal.amount}</li>
                <li>Method: Manual Bank Transfer</li>
                <li>Date: ${new Date().toLocaleDateString('en-IN')}</li>
                <li>Reference: ${withdrawal.transferId}</li>
            </ul>
            <p>Thank you for your patience!</p>
            <br>
            <p>BookStore Team</p>
            `
        );

        res.json({ message: "Manual transfer marked as completed" });

    } catch (err) {
        console.error("Manual transfer completion error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
