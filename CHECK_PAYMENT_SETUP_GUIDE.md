# Check Payment System Setup Guide

## ✅ What's Already Implemented

### 1. **Backend System**
- ✅ Pending order creation for check payments
- ✅ Webhook endpoint to receive Google Form data
- ✅ Admin approval/rejection API endpoints
- ✅ Automated processing (commissions, points, cashback, emails)
- ✅ Database schema with image URL storage

### 2. **Admin Interface**
- ✅ Check Payment Approvals page (`/admin-check-payments.html`)
- ✅ Added to admin navigation menu
- ✅ Image viewing with modal popup
- ✅ One-click approve/reject functionality
- ✅ Statistics dashboard

### 3. **Frontend Integration**
- ✅ Check payment option in cart checkout
- ✅ Automatic redirect to Google Form with pre-filled data

## 🔧 What You Need to Set Up

### Step 1: Create Google Form

1. **Go to Google Forms** (forms.google.com)
2. **Create a new form** titled "Check Payment Verification"
3. **Add these fields:**

   **Required Fields:**
   - Order ID (Short answer, required)
   - User Name (Short answer, required)  
   - User Email (Short answer, required)
   - Amount (Short answer, required)
   - Phone Number (Short answer, required)

   **Payment Details:**
   - Check Number (Short answer, required)
   - Bank Name (Short answer, required)
   - Check Date (Date, required)
   - UTR Number (Short answer, optional)

   **File Upload:**
   - Upload Check Image (File upload, required)
     - Allow: Images only
     - Max files: 3
     - Max file size: 10MB

4. **Configure file upload settings:**
   - Go to Settings → Responses
   - Enable "Collect email addresses"
   - Enable "Limit to 1 response"

### Step 2: Set Up Google Apps Script

1. **Open your form** → Click three dots (⋮) → Script editor
2. **Replace default code** with the script from `GOOGLE_APPS_SCRIPT_EXAMPLE.js`
3. **Update the webhook URL:**
   ```javascript
   const WEBHOOK_URL = 'https://shreemata.com/api/payments/webhook/check-payment-submitted';
   ```
4. **Save the script** (Ctrl+S)
5. **Run `setupTrigger()` function** once to enable automatic webhook calls

### Step 3: Update Your Code

1. **Replace Google Form ID** in these files:
   
   **In `routes/payments.js`:**
   ```javascript
   const googleFormUrl = `https://docs.google.com/forms/d/e/YOUR_ACTUAL_FORM_ID/viewform?usp=pp_url`
   ```

   **In `public/admin-check-payments.html`:**
   ```javascript
   href="https://docs.google.com/forms/d/YOUR_ACTUAL_FORM_ID/edit#response=${order.paymentDetails.googleFormSubmissionId}"
   ```

2. **Get your Form ID:**
   - Open your Google Form
   - Look at the URL: `https://docs.google.com/forms/d/FORM_ID_HERE/edit`
   - Copy the long ID between `/d/` and `/edit`

### Step 4: Configure Pre-filled URLs

1. **In your Google Form**, click "Send" → Link tab
2. **Add URL parameters** for pre-filling:
   ```
   ?usp=pp_url&entry.ENTRY_ID_1=ORDER_ID&entry.ENTRY_ID_2=USER_NAME
   ```
3. **Find entry IDs:**
   - Right-click on each form field → Inspect element
   - Look for `name="entry.XXXXXXXXX"`
   - Update the URLs in your code with correct entry IDs

### Step 5: Test the System

1. **Test webhook connectivity:**
   - In Google Apps Script, run `testWebhook()` function
   - Check your server logs for webhook calls

2. **Test complete flow:**
   - Add items to cart
   - Select "Check Payment" option
   - Verify Google Form opens with pre-filled data
   - Submit form with test image
   - Check admin panel for pending approval

## 📋 Admin Workflow

### Daily Check Payment Management

1. **Access Admin Panel:**
   - Go to `/admin-check-payments.html`
   - Or use admin menu → Check Payment Approvals

2. **Review Submissions:**
   - View customer details and order information
   - Click on uploaded images to view full size
   - Check Google Form response for additional details

3. **Approve/Reject Payments:**
   - Click "✅ Approve Payment" to process order
   - Click "❌ Reject Payment" to cancel order
   - Add notes explaining your decision

4. **Automated Processing:**
   - Approved orders automatically trigger:
     - Commission distribution to referral chain
     - Points and cashback awards
     - Email confirmations to customer and admin
     - Order status updates

## 🔍 Image Viewing Features

### For Admins:
- **Thumbnail gallery** showing all uploaded images
- **Click to enlarge** with full-screen modal
- **Direct Google Drive links** for original files
- **Multiple image support** for complex submissions

### Image Sources:
- **Google Drive URLs** (automatically generated)
- **Public viewing links** (set by Apps Script)
- **Fallback to form response** if direct links fail

## 🚨 Troubleshooting

### Common Issues:

1. **Images not showing:**
   - Check Google Drive file permissions
   - Verify Apps Script is making files public
   - Check webhook is receiving file IDs

2. **Form not pre-filling:**
   - Verify entry IDs in URL parameters
   - Check Google Form field names match script

3. **Webhook not working:**
   - Test webhook URL manually
   - Check Google Apps Script logs
   - Verify trigger is set up correctly

4. **Orders not processing:**
   - Check admin approval API endpoints
   - Verify database connections
   - Review server logs for errors

## 📊 System Benefits

### For Customers:
- ✅ Easy Google Form interface
- ✅ File upload with drag & drop
- ✅ Automatic order tracking
- ✅ Email confirmations

### For Admins:
- ✅ Centralized approval dashboard
- ✅ Visual image verification
- ✅ One-click processing
- ✅ Automated reward distribution
- ✅ Complete audit trail

### For Business:
- ✅ Reduced manual processing
- ✅ Faster payment verification
- ✅ Better customer experience
- ✅ Automated accounting integration

## 🔐 Security Considerations

- **File permissions:** Images are made publicly viewable for admin access
- **Data validation:** All form inputs are validated before processing
- **Admin authentication:** Only authenticated admins can approve payments
- **Audit logging:** All actions are logged with timestamps and user IDs

The system is now ready for production use! 🚀