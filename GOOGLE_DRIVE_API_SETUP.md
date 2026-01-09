# Google Drive API Setup Guide

## 🎯 Overview
This guide will help you set up Google Drive API to store check payment images in Google Drive instead of locally on your server.

## 📋 Step 1: Create Google Cloud Project
https://console.cloud.google.com/
1. **Go to Google Cloud Console:** 
2. **Create a new project** or select an existing one
3. **Note down your Project ID** (you'll need this later)

## 🔧 Step 2: Enable Google Drive API

1. **Go to APIs & Services** → **Library**
2. **Search for "Google Drive API"**
3. **Click on it** and **Enable**

## 🔑 Step 3: Create Service Account

1. **Go to APIs & Services** → **Credentials**
2. **Click "Create Credentials"** → **Service Account**
3. **Fill in details:**
   - Service account name: `check-payment-uploader`
   - Description: `Service account for uploading check payment images`
4. **Click "Create and Continue"**
5. **Skip role assignment** (click "Continue")
6. **Click "Done"**

## 📄 Step 4: Generate Service Account Key

1. **Click on the service account** you just created
2. **Go to "Keys" tab**
3. **Click "Add Key"** → **Create new key**
4. **Select "JSON"** and click **Create**
5. **Download the JSON file** (keep it safe!)

## 🔐 Step 5: Extract Credentials

Open the downloaded JSON file and extract these values:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "your-private-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "check-payment-uploader@your-project-id.iam.gserviceaccount.com",
  "client_id": "your-client-id"
}
```

## ⚙️ Step 6: Update Environment Variables

Update your `.env` file with the extracted values:

```env
# Google Drive API Settings
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_PRIVATE_KEY_ID=your-private-key-id
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key-here\n-----END PRIVATE KEY-----"
GOOGLE_CLIENT_EMAIL=check-payment-uploader@your-project-id.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your-client-id
```

**Important:** 
- Keep the quotes around `GOOGLE_PRIVATE_KEY`
- Replace `\n` in the private key with actual line breaks if needed

## 📁 Step 7: Create Google Drive Folder (Optional)

1. **Go to Google Drive:** https://drive.google.com/
2. **Create a folder** called "Check Payment Images"
3. **Right-click the folder** → **Share**
4. **Add your service account email** with "Editor" permissions
5. **Copy the folder ID** from the URL (optional - the code will create folders automatically)

## 🧪 Step 8: Test the Setup

1. **Restart your server**
2. **Try uploading a check payment image**
3. **Check your server logs** for success messages
4. **Check Google Drive** for the uploaded image

## 🔍 Troubleshooting

### Common Issues:

1. **"Invalid credentials" error:**
   - Check that all environment variables are set correctly
   - Ensure the private key includes the full `-----BEGIN PRIVATE KEY-----` header

2. **"Permission denied" error:**
   - Make sure Google Drive API is enabled
   - Check that the service account has proper permissions

3. **"File not found" error:**
   - The service account might not have access to create folders
   - Try creating the folder manually and sharing it with the service account

### Debug Steps:

1. **Check server logs** for detailed error messages
2. **Verify environment variables** are loaded correctly
3. **Test with a simple image upload**

## ✅ Expected Behavior

When working correctly:

1. **User uploads image** → Temporarily stored on server
2. **Server uploads to Google Drive** → Gets file ID and public URL
3. **Database stores Drive links** → Local temp file deleted
4. **Admin views image** → Loads from Google Drive public URL
5. **Admin clicks "View in Drive"** → Opens full Google Drive interface

## 🔐 Security Notes

- **Service account key** is sensitive - keep it secure
- **Images are made publicly viewable** for admin access
- **Only authenticated users** can upload images
- **Temp files are automatically cleaned up**

## 📊 Benefits

✅ **Works with hosted websites**  
✅ **Unlimited storage** (Google Drive)  
✅ **Automatic backups** (Google's infrastructure)  
✅ **Easy sharing** with team members  
✅ **No server storage issues**  
✅ **Professional file management**

Once set up, your check payment system will store all images securely in Google Drive! 🚀