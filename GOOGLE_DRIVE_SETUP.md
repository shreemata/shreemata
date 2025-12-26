# Google Drive Setup Guide

## Overview
This guide helps you set up Google Drive integration for the online reading system to store and serve PDF files securely.

## Prerequisites
- Google Cloud Platform account
- Admin access to your application

## Step-by-Step Setup

### 1. Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### 2. Enable Google Drive API
1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Google Drive API"
3. Click on it and press "Enable"

### 3. Create Service Account
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Enter service account details:
   - Name: `bookstore-drive-service`
   - Description: `Service account for PDF storage and retrieval`
4. Click "Create and Continue"
5. Skip role assignment for now (click "Continue")
6. Click "Done"

### 4. Generate Service Account Key
1. Click on the created service account from the credentials list
2. Go to the "Keys" tab
3. Click "Add Key" > "Create New Key"
4. Select "JSON" format
5. Click "Create"
6. The JSON file will be downloaded automatically

### 5. Configure Your Application

#### A. Place the Service Account File
1. Rename the downloaded JSON file to `google-service-account.json`
2. Place it in the `config/` directory of your project
3. **IMPORTANT**: Never commit this file to version control

#### B. Update .env File
Your `.env` file should already have:
```
GOOGLE_SERVICE_ACCOUNT_PATH=./config/google-service-account.json
```

#### C. Add to .gitignore
Ensure your `.gitignore` includes:
```
config/google-service-account.json
```

### 6. Test the Setup
1. Restart your application server
2. Try uploading a PDF through the admin interface
3. Check the server logs for successful initialization

## Security Notes

### Service Account Permissions
- The service account only needs access to files it creates
- No additional Google Drive permissions are required
- Files are stored in a dedicated folder structure

### File Access Control
- PDFs are not publicly accessible
- All access goes through your application server
- Session-based authentication is required

### Best Practices
- Keep the service account key secure
- Regularly rotate service account keys
- Monitor API usage in Google Cloud Console
- Set up billing alerts for API usage

## Troubleshooting

### Common Issues

#### "Service account file not found"
- Verify the file path in GOOGLE_SERVICE_ACCOUNT_PATH
- Check that the file exists in the config directory
- Ensure the file has proper read permissions

#### "Authentication failed"
- Verify the service account key is valid
- Check that Google Drive API is enabled
- Ensure the service account has not been deleted

#### "Rate limit exceeded"
- The service implements automatic retry with exponential backoff
- Consider implementing request queuing for high-volume uploads
- Monitor API quotas in Google Cloud Console

#### "File upload fails"
- Check file size limits (Google Drive supports up to 5TB per file)
- Verify PDF file format
- Check available storage quota

### API Quotas
- Google Drive API has generous free quotas
- Monitor usage in Google Cloud Console
- Set up billing alerts if needed

## File Organization

The service automatically creates this folder structure in Google Drive:
```
Digital Books Store/
├── {bookId}_{bookTitle}/
│   └── {bookId}_{bookTitle}.pdf
└── {bookId}_{bookTitle}/
    └── {bookId}_{bookTitle}.pdf
```

## Support
If you encounter issues:
1. Check the application logs for detailed error messages
2. Verify Google Cloud Console for API status
3. Test the service account permissions
4. Review the troubleshooting section above