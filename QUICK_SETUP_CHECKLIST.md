# ✅ Quick Setup Checklist for Your Check Payment System

## Your Form Details
- **Form ID:** `1FAIpQLSdzVs8LdM9G6wEHwIwfxLvwGbEV43ZfK8F_9QXmNbnHpN_G5Q`
- **Form URL:** https://docs.google.com/forms/d/1FAIpQLSdzVs8LdM9G6wEHwIwfxLvwGbEV43ZfK8F_9QXmNbnHpN_G5Q/edit

## ✅ Already Done
- [x] Updated `routes/payments.js` with your Form ID
- [x] Updated `public/admin-check-payments.html` with your Form ID  
- [x] Created custom Google Apps Script for your form
- [x] Admin interface is ready with image viewing

## 🔧 What You Need to Do Now

### Step 1: Set Up Google Apps Script (5 minutes)

1. **Open your form:** https://docs.google.com/forms/d/1FAIpQLSdzVs8LdM9G6wEHwIwfxLvwGbEV43ZfK8F_9QXmNbnHpN_G5Q/edit

2. **Go to Apps Script:**
   - Click **Extensions** → **Apps Script**

3. **Replace the code:**
   - Delete all existing code
   - Copy and paste the code from `YOUR_GOOGLE_APPS_SCRIPT.js`

4. **Save the script:**
   - Press **Ctrl+S** or click the save icon
   - Give it a name like "Check Payment Webhook"

5. **Run setup (one time only):**
   - In the function dropdown, select `setupTrigger`
   - Click **Run**
   - Grant permissions when prompted

6. **Test the webhook:**
   - Select `testWebhook` function
   - Click **Run**
   - Check your server logs to see if the test data arrives

### Step 2: Test the Complete Flow (10 minutes)

1. **Test order creation:**
   - Go to your website
   - Add items to cart
   - Select "Check Payment" option
   - Verify Google Form opens with pre-filled data

2. **Test form submission:**
   - Fill out the form with test data
   - Upload a test image (any image file)
   - Submit the form

3. **Check admin panel:**
   - Go to `/admin-check-payments.html`
   - Look for your test order
   - Click on the uploaded image to verify it displays
   - Try approving the test order

### Step 3: Field Name Verification (if needed)

If the webhook isn't receiving data correctly:

1. **Debug form structure:**
   - In Google Apps Script, run `debugFormStructure()` function
   - Check the console logs to see actual field names

2. **Update field mappings:**
   - In the Apps Script, adjust the field names in `getResponseValue()` calls
   - Match them with your actual form question titles

## 🎯 Expected Behavior

### When User Selects Check Payment:
1. Order created with status "pending_payment_verification"
2. Google Form opens in new tab with pre-filled:
   - Order ID
   - Amount  
   - User email
   - User name
   - User phone

### When User Submits Form:
1. Google Apps Script runs automatically
2. Webhook sends data to your server
3. Order status updates to "pending_verification"
4. Images are made publicly viewable
5. Admin can see the order in approval queue

### When Admin Approves:
1. Order status changes to "completed"
2. All automated processes trigger:
   - Commission distribution
   - Points and cashback
   - Email confirmations
   - Tree placement

## 🚨 Troubleshooting

### If webhook isn't working:
1. Check Google Apps Script execution logs
2. Verify webhook URL is correct
3. Test with `testWebhook()` function
4. Check your server logs for incoming requests

### If images aren't showing:
1. Verify file upload field exists in form
2. Check if files are being made public in Apps Script
3. Look for Drive file IDs in webhook data

### If form isn't pre-filling:
1. Check entry IDs match your form
2. Verify URL encoding of special characters
3. Test the generated URL manually

## 📞 Support

If you encounter issues:
1. Check the Google Apps Script execution logs
2. Review your server logs for webhook calls
3. Test each step individually
4. Verify all URLs and IDs are correct

The system is ready to go live once you complete the Google Apps Script setup! 🚀