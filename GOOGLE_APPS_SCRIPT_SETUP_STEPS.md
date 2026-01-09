# Google Apps Script Setup for Check Payment System

## Current Status
- ✅ Check payment system implemented
- ✅ Google Form created (ID: 1FAIpQLSdzVs8LdM9G6wEHwIwfxLvwGbEV43ZfK8F_9QXmNbnHpN_G5Q)
- ✅ Admin approval panel working
- ❌ **Google Apps Script needs authorization** ← This is what we need to fix

## Step-by-Step Setup Instructions

### Step 1: Access Google Apps Script
1. Go to [script.google.com](https://script.google.com)
2. Click "New Project"
3. Replace the default code with the content from `YOUR_GOOGLE_APPS_SCRIPT.js`

### Step 2: Save and Name the Project
1. Click the save icon (💾) or press Ctrl+S
2. Name your project: "Check Payment Form Handler"

### Step 3: Grant Permissions
1. Click the "Run" button (▶️) next to `setupTrigger`
2. You'll see a permission dialog - click "Review permissions"
3. Choose your Google account
4. Click "Advanced" → "Go to Check Payment Form Handler (unsafe)"
5. Click "Allow"

### Step 4: Verify Setup
1. After permissions are granted, run `setupTrigger` again
2. Check the execution log - you should see "✅ Trigger created successfully"
3. Run `testWebhook` to verify connection to your server

### Step 5: Test the Complete Flow
1. Create a test order with check payment
2. Fill out the Google Form
3. Check your admin panel for the new submission
4. Verify images are accessible

## Expected Results After Setup

### When a user submits the Google Form:
1. ✅ Form data is automatically sent to your webhook
2. ✅ Images are uploaded to Google Drive
3. ✅ Files are made publicly viewable
4. ✅ Order status updates to "pending_verification"
5. ✅ Admin can see the submission in the approval panel

### Admin Panel Features:
- View all pending check payments
- See uploaded check images
- Approve/reject payments
- Automatic reward processing on approval

## Troubleshooting

### If you get "This project requires access to your Google Account":
- This is normal for the first run
- Click "Allow" to grant permissions
- The script will work after authorization

### If webhook test fails:
- Check that your server is running
- Verify the webhook URL in the script matches your domain
- Check server logs for incoming requests

### If images don't appear:
- Verify the Google Form has file upload fields
- Check that files are being uploaded to Google Drive
- Ensure the script has Drive API permissions

## Current Form Fields (Pre-filled automatically):
- Order ID: `entry.209098555`
- Amount: `entry.701631358`
- Email: `entry.1509226876`
- Name: `entry.485473134`
- Phone: `entry.4317222`

## Next Steps After Setup:
1. Test with a real order
2. Verify admin can approve/reject
3. Check that rewards are processed correctly
4. Monitor webhook logs for any issues

## Support
If you encounter issues:
1. Check the Google Apps Script execution log
2. Check your server logs for webhook calls
3. Verify the Google Form is accessible
4. Ensure all permissions are granted