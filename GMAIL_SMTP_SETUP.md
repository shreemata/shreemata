# Gmail SMTP Setup Guide for Shree Mata

## ✅ Files Already Updated

1. ✅ `utils/sendMail.js` - Updated to use Gmail SMTP
2. ✅ `utils/emailService.js` - Transporter updated to Gmail
3. ✅ `.env` - Gmail credentials added

## 🔧 Step 1: Get Gmail App Password

Since you're using Gmail, you need to create an **App Password** (not your regular Gmail password):

### Instructions:

1. **Go to your Google Account**: https://myaccount.google.com/
2. **Enable 2-Step Verification** (if not already enabled):
   - Go to Security → 2-Step Verification
   - Follow the setup process
3. **Create App Password**:
   - Go to Security → 2-Step Verification → App passwords
   - Select "Mail" and "Other (Custom name)"
   - Enter "Shree Mata Website"
   - Click "Generate"
   - **Copy the 16-character password** (it will look like: `abcd efgh ijkl mnop`)

## 📝 Step 2: Update .env File

Replace the placeholder in your `.env` file:

```properties
# Gmail SMTP Configuration
GMAIL_USER=shashistudy2125@gmail.com
GMAIL_APP_PASSWORD=your_16_character_app_password_here
```

**Important**: 
- Remove all spaces from the app password
- Example: If Google shows `abcd efgh ijkl mnop`, use `abcdefghijklmnop`

## 🔄 Step 3: Update emailService.js

You need to manually replace all occurrences of:

```javascript
from: `"Shree Mata" <${process.env.SES_FROM_EMAIL || 'no-reply@shreemata.com'}>`
```

With:

```javascript
from: `"Shree Mata" <${process.env.GMAIL_USER}>`
```

**Locations to update** (5 places in `utils/emailService.js`):
- Line 81: `sendOrderConfirmationEmail` function
- Line 176: `sendAdminNotification` function  
- Line 286: `sendDeliveryStatusEmail` function
- Line 378: `sendEmailOTP` function
- Line 450: `sendPasswordResetOTP` function

## 🧪 Step 4: Test Your Gmail SMTP

Run the test script:

```bash
node test-gmail-smtp.js
```

## ⚠️ Common Issues & Solutions

### Issue 1: "Invalid login" or "Username and Password not accepted"
**Solution**: Make sure you're using an App Password, not your regular Gmail password

### Issue 2: "Less secure app access"
**Solution**: Use App Password instead (Google deprecated less secure apps)

### Issue 3: "Daily sending limit exceeded"
**Solution**: Gmail has a limit of 500 emails per day for free accounts

### Issue 4: Emails going to spam
**Solution**: 
- Add SPF record to your domain
- Use a custom domain email (not @gmail.com) for better deliverability
- Consider using a professional email service for production

## 🚀 Step 5: Restart Your Server

After updating the configuration:

```bash
pm2 restart shreemata
```

Or if running locally:

```bash
npm start
```

## 📊 Gmail SMTP Limits

- **Daily limit**: 500 emails per day
- **Rate limit**: ~100 emails per hour
- **Recipients per email**: 100
- **Attachment size**: 25 MB

## 🎯 Production Recommendations

For production use, consider:

1. **Google Workspace** (formerly G Suite)
   - Higher sending limits (2000 emails/day)
   - Custom domain email
   - Better deliverability

2. **AWS SES** (if you want to keep AWS)
   - Unlimited emails (pay per email)
   - Better for high volume
   - Requires domain verification

3. **SendGrid** or **Mailgun**
   - Professional email services
   - Better analytics
   - Higher deliverability rates

## ✅ Verification Checklist

- [ ] 2-Step Verification enabled on Gmail
- [ ] App Password generated
- [ ] `.env` file updated with Gmail credentials
- [ ] `emailService.js` updated (all 5 locations)
- [ ] Test email sent successfully
- [ ] Server restarted
- [ ] Order confirmation emails working
- [ ] Admin notification emails working

## 📧 Test Email Command

Create a test file `test-gmail-smtp.js`:

```javascript
require('dotenv').config();
const sendMail = require('./utils/sendMail');

async function test() {
    await sendMail(
        'shashistudy2125@gmail.com',
        'Test Email from Shree Mata',
        '<h1>Gmail SMTP is working!</h1><p>This is a test email.</p>'
    );
    console.log('Test email sent!');
}

test();
```

Run: `node test-gmail-smtp.js`

## 🔒 Security Notes

- Never commit `.env` file to Git
- Keep your App Password secure
- Rotate App Passwords periodically
- Monitor your Gmail account for suspicious activity
- Use environment variables for all sensitive data

---

**Need Help?** Contact: shashistudy2125@gmail.com
