# 🚀 Quick Start: Online Reading POC

## ⚡ Fast Track Setup (30 minutes)

### Step 1: Install Dependencies (2 minutes)

```bash
npm install googleapis pdf-lib multer
```

### Step 2: Google Cloud Setup (10 minutes)

1. **Go to:** https://console.cloud.google.com/
2. **Create project:** `shreemata-online-reading`
3. **Enable API:** Search "Google Drive API" → Enable
4. **Create Service Account:**
   - APIs & Services → Credentials
   - Create Credentials → Service Account
   - Name: `pdf-reader-service`
   - Role: Editor
   - Create Key → JSON → Download

### Step 3: Update .env File (5 minutes)

Open the downloaded JSON file and copy values to `.env`:

```env
# Google Drive API Settings (for PDF storage)
GOOGLE_PROJECT_ID=your-project-id-from-json
GOOGLE_PRIVATE_KEY_ID=your-private-key-id-from-json
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----"
GOOGLE_CLIENT_EMAIL=pdf-reader-service@your-project.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=your-client-id-from-json

# Google Drive Folder ID (get this in next step)
GOOGLE_DRIVE_PDF_FOLDER_ID=
```

### Step 4: Create Google Drive Folder (3 minutes)

1. **Go to:** https://drive.google.com/
2. **Create folder:** "Shreemata PDFs"
3. **Share folder:**
   - Right-click → Share
   - Add: `pdf-reader-service@your-project.iam.gserviceaccount.com`
   - Permission: Editor
4. **Get Folder ID:**
   - Open folder
   - Copy ID from URL: `drive.google.com/drive/folders/FOLDER_ID_HERE`
   - Add to `.env`: `GOOGLE_DRIVE_PDF_FOLDER_ID=FOLDER_ID_HERE`

### Step 5: Test Upload (5 minutes)

1. **Create test PDF:**
   - Place any PDF file in project root
   - Name it: `test-book.pdf`

2. **Run test:**
   ```bash
   node test-google-drive-upload.js
   ```

3. **Expected output:**
   ```
   🧪 Testing Google Drive Upload...
   ✅ Upload successful!
   ✅ File metadata retrieved
   ✅ File exists: true
   🎉 All tests passed!
   ```

4. **Verify:**
   - Check Google Drive folder
   - You should see the uploaded PDF

### Step 6: Restart Server (1 minute)

```bash
# Stop current server (Ctrl+C)
# Restart with PM2
pm2 restart shreemata
```

---

## ✅ Success Checklist

- [ ] Dependencies installed
- [ ] Google Cloud project created
- [ ] Google Drive API enabled
- [ ] Service account created with JSON key
- [ ] `.env` file updated with credentials
- [ ] Google Drive folder created and shared
- [ ] Folder ID added to `.env`
- [ ] Test PDF uploaded successfully
- [ ] File visible in Google Drive
- [ ] Server restarted

---

## 🎯 What's Next?

Once the test passes, you're ready for:

1. **Admin Upload Interface** - Let admins upload PDFs for books
2. **PDF Streaming** - Stream PDFs securely through your server
3. **Protected Viewer** - Build viewer with watermarks
4. **Test with Real Book** - Try with actual book from your store

---

## 🆘 Common Issues

### "Invalid credentials"
```bash
# Check .env file has correct values
# Restart server after updating .env
pm2 restart shreemata
```

### "Permission denied"
```bash
# Make sure folder is shared with service account email
# Check service account has "Editor" role
```

### "Folder not found"
```bash
# Verify GOOGLE_DRIVE_PDF_FOLDER_ID is correct
# Make sure you copied the ID from the URL correctly
```

### "Test PDF not found"
```bash
# Create a file named test-book.pdf in project root
# Any PDF file will work for testing
```

---

## 📞 Need Help?

If you get stuck:
1. Check the error message carefully
2. Verify all environment variables are set
3. Make sure Google Drive API is enabled
4. Confirm folder is shared with service account
5. See `POC_ONLINE_READING_SETUP.md` for detailed troubleshooting

---

## 🎉 Ready to Start?

Run this command to begin:

```bash
npm install googleapis pdf-lib multer && node test-google-drive-upload.js
```

Good luck! 🚀
