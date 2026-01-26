# Setup Guide for Your Working Google Form

## ✅ Updated System Configuration

I've updated your system to use your **working Google Form**:
- **Form ID**: `1FAIpQLSdkaIGD87RUORM210G8kCWeIx60Fdc88KKkxcnmuee1bOL2Pg`
- **Your test URL**: https://docs.google.com/forms/d/e/1FAIpQLSdkaIGD87RUORM210G8kCWeIx60Fdc88KKkxcnmuee1bOL2Pg/viewform

## Field Mapping (From Your Test URL)

Your form fields are now correctly mapped:
- **Order ID**: `entry.1788264298` ✅
- **Amount**: `entry.1894225499` ✅  
- **Email**: `entry.774046160` ✅
- **Name**: `entry.1406386079` ✅
- **Phone**: `entry.632794616` ✅
- **Bank**: `entry.980862279` ✅
- **Date**: `entry.790413540` ✅

## Quick Setup Steps

### 1. Update Google Apps Script
1. Go to [script.google.com](https://script.google.com)
2. Create new project
3. Copy the **updated** content from `YOUR_GOOGLE_APPS_SCRIPT.js`
4. Save as "Check Payment Handler"

### 2. Run Setup
1. Click "Run" next to `setupTrigger`
2. Grant permissions when asked
3. Should see "✅ Trigger created successfully"

### 3. Test Webhook
```bash
node test-your-form.js
```

### 4. Test Complete Flow
1. Create a check payment order
2. Google Form should open with your form
3. Submit the form
4. Check admin panel for the submission

## What Changed

### ✅ Fixed Issues:
1. **Correct Form ID** - Now using your working form
2. **Correct Field Mapping** - Matches your form structure  
3. **Updated Webhook** - Handles your form's data format
4. **Updated Admin Panel** - Links to correct form responses

### ✅ Your Form Structure:
Based on your test URL, your form has these fields:
- Order ID (1788264298)
- Amount (1894225499) 
- Email (774046160)
- Name (1406386079)
- Phone (632794616)
- Bank Name (980862279)
- Date (790413540)

## Expected Flow Now

1. **User selects check payment** → System generates URL with your form
2. **Form opens pre-filled** → Uses your working form structure
3. **User submits** → Google Apps Script processes with correct field mapping
4. **Webhook receives data** → Updates order status
5. **Admin sees submission** → In approval panel with correct form link

## Test Commands

```bash
# Test webhook connectivity
node test-your-form.js

# Create test order (if you have this script)
node create-test-check-order.js
```

## Verification Checklist

- [ ] Google Apps Script updated with your form ID
- [ ] Permissions granted to the script
- [ ] Webhook test passes
- [ ] Test order creates successfully
- [ ] Form opens with pre-filled data
- [ ] Form submission updates order status
- [ ] Admin panel shows the submission

## Next Steps

1. **Run the Google Apps Script setup** (2 minutes)
2. **Test with a real order** to verify everything works
3. **Check admin panel** to see submissions
4. **Approve a test order** to verify reward processing

Your form integration should work perfectly now since we're using your actual working form structure!