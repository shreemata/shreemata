# 💰 Withdrawal Payment System

## Overview

This document explains how the withdrawal payment system works when admin approves user withdrawal requests.

## Current Implementation

### 🔄 Withdrawal Process Flow

1. **User Requests Withdrawal**
   - User goes to their account page
   - Enters withdrawal amount and payment details (UPI ID or Bank Account)
   - System deducts amount from user's wallet
   - Creates withdrawal request with status "pending"

2. **Admin Reviews Request**
   - Admin sees withdrawal request in admin panel
   - Admin can approve or reject the request

3. **Admin Approves Withdrawal**
   - System attempts automatic payment transfer via Razorpay Payouts
   - If successful: Money is transferred automatically
   - If failed: Marked for manual processing

4. **Payment Transfer Methods**
   - **UPI Transfer**: Direct transfer to user's UPI ID
   - **Bank Transfer**: IMPS transfer to user's bank account
   - **Manual Transfer**: Admin processes payment manually if auto-transfer fails

## 🚀 New Features Added

### Automatic Payment Transfer
```javascript
// When admin approves withdrawal:
1. Create Razorpay contact for user
2. Create fund account (UPI or Bank)
3. Initiate payout via Razorpay API
4. Track transfer status via webhooks
5. Send confirmation emails to user
```

### Transfer Status Tracking
- `pending` - Withdrawal request submitted
- `approved` - Approved and money transferred successfully
- `approved_pending_transfer` - Approved but transfer failed, needs manual processing
- `rejected` - Rejected and money refunded to wallet

### Webhook Integration
- Receives real-time updates from Razorpay about payout status
- Automatically updates withdrawal status
- Sends email notifications to users

## 📋 Required Setup

### 1. Razorpay Payout Configuration

Add to `.env` file:
```env
RAZORPAY_ACCOUNT_NUMBER=your_razorpay_account_number_here
```

### 2. Enable Razorpay Payouts
- Login to Razorpay Dashboard
- Go to Settings > API Keys
- Enable "Payouts" feature
- Get your account number from Dashboard > Account & Settings

### 3. Webhook Configuration
- Add webhook URL: `https://yourdomain.com/api/admin/withdrawals/payout-webhook`
- Subscribe to events: `payout.processed`, `payout.failed`

## 💳 Payment Methods Supported

### UPI Transfer
- User provides UPI ID (e.g., user@paytm, 9876543210@ybl)
- Instant transfer via Razorpay UPI payout
- Usually processed within minutes

### Bank Transfer
- User provides Account Number and IFSC Code
- Transfer via IMPS (Immediate Payment Service)
- Usually processed within 30 minutes

### Manual Transfer (Fallback)
- If automatic transfer fails
- Admin processes payment manually
- Admin marks transfer as completed in system

## 📧 Email Notifications

### Successful Transfer
```
Subject: Withdrawal Transfer Completed
- Amount transferred
- Transfer ID
- Method used
- Date of transfer
```

### Failed Transfer
```
Subject: Withdrawal Transfer Failed - Manual Processing Required
- Reason for failure
- Manual processing timeline (24 hours)
- Assurance of completion
```

### Manual Transfer Completion
```
Subject: Withdrawal Transfer Completed (Manual)
- Confirmation of manual transfer
- Reference number
- Transfer details
```

## 🔧 Admin Panel Features

### Withdrawal Management
- View all withdrawal requests
- See transfer status and method
- Approve/reject requests
- Mark manual transfers as completed
- View transfer history and errors

### Transfer Status Indicators
- 🟡 **Pending**: Awaiting admin approval
- 🟢 **Approved**: Successfully transferred
- 🟠 **Pending Transfer**: Approved but transfer in progress
- 🔴 **Failed**: Transfer failed, needs manual processing
- ❌ **Rejected**: Request rejected, money refunded

## 🛡️ Security Features

### Webhook Verification
- Verifies Razorpay webhook signatures
- Prevents unauthorized status updates
- Logs all webhook events

### Transfer Validation
- Validates payment details before transfer
- Checks account balance before processing
- Prevents duplicate transfers

### Error Handling
- Graceful fallback to manual processing
- Detailed error logging
- User notification of issues

## 📊 Monitoring & Analytics

### Transfer Metrics
- Success rate of automatic transfers
- Average transfer time
- Common failure reasons
- Manual processing volume

### User Experience
- Real-time status updates
- Email confirmations
- Clear error messages
- Support contact information

## 🔄 Fallback Process

If automatic transfer fails:

1. **System Response**
   - Marks withdrawal as "approved_pending_transfer"
   - Logs error details
   - Sends notification to admin

2. **Admin Action**
   - Reviews failed transfer
   - Processes payment manually via bank/UPI
   - Marks transfer as completed in system

3. **User Notification**
   - Receives email about manual processing
   - Gets confirmation once completed
   - Can contact support if needed

## 🚨 Important Notes

### Razorpay Account Requirements
- Business account with KYC completed
- Sufficient balance for payouts
- Payouts feature enabled
- Valid bank account linked

### Transaction Limits
- Daily payout limits apply
- Minimum transfer amount: ₹10
- Maximum transfer amount: ₹50,000 per transaction

### Processing Times
- UPI: Instant to 30 minutes
- Bank Transfer: 30 minutes to 2 hours
- Manual Transfer: Up to 24 hours

## 📞 Support & Troubleshooting

### Common Issues
1. **Invalid UPI ID**: User receives error, needs to update UPI ID
2. **Bank Details Mismatch**: Transfer fails, admin processes manually
3. **Insufficient Balance**: Razorpay account needs funding
4. **API Limits Exceeded**: Transfers queued for later processing

### Resolution Steps
1. Check Razorpay dashboard for payout status
2. Verify user payment details
3. Process manual transfer if needed
4. Update system status accordingly
5. Notify user of completion

This system ensures reliable, automated payment processing with manual fallback for maximum reliability.