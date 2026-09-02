# 🚀 POC: Online Reading System - Step-by-Step Setup

## 📋 Overview
This POC will implement:
1. ✅ Google Drive API setup for PDF storage
2. ✅ Upload one test PDF to Google Drive
3. ✅ Stream PDF through your server
4. ✅ Basic protected viewer with watermark
5. ✅ Test with one book

**Time Estimate:** 1-2 days

---

## 🎯 Phase 1: Google Drive API Setup (30 minutes)

### Step 1.1: Create/Configure Google Cloud Project

1. **Go to Google Cloud Console:**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google Workspace account

2. **Create New Project (or use existing):**
   - Click "Select a project" → "New Project"
   - Project name: `shreemata-online-reading`
   - Click "Create"

3. **Enable Google Drive API:**
   - Go to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click on it → Click "Enable"

### Step 1.2: Create Service Account for PDF Access

1. **Create Service Account:**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "Service Account"
   - Name: `pdf-reader-service`
   - Description: `Service account for secure PDF streaming`
   - Click "Create and Continue"

2. **Assign Role:**
   - Role: "Editor" (or "Storage Admin" for more restricted access)
   - Click "Continue" → "Done"

3. **Generate JSON Key:**
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Select "JSON" → Click "Create"
   - **Save the downloaded JSON file securely!**

### Step 1.3: Update Environment Variables

Open the downloaded JSON file and extract these values:

```json
{
  "type": "service_account",
  "project_id": "shreemata-online-reading",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "pdf-reader-service@shreemata-online-reading.iam.gserviceaccount.com",
  "client_id": "123456789..."
}
```

**Update your `.env` file:**

```env
# Google Drive API Settings (for PDF storage)
GOOGLE_PROJECT_ID=shreemata-online-reading
GOOGLE_PRIVATE_KEY_ID=abc123...
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_ACTUAL_KEY_HERE\n-----END PRIVATE KEY-----"
GOOGLE_CLIENT_EMAIL=pdf-reader-service@shreemata-online-reading.iam.gserviceaccount.com
GOOGLE_CLIENT_ID=123456789...

# Google Drive Folder ID (we'll create this next)
GOOGLE_DRIVE_PDF_FOLDER_ID=
```

### Step 1.4: Create Google Drive Folder Structure

1. **Go to Google Drive:**
   - Visit: https://drive.google.com/
   - Sign in with your Google Workspace account

2. **Create Folder Structure:**
   ```
   Shreemata Books (root folder)
   └── PDFs (subfolder for all book PDFs)
   ```

3. **Share with Service Account:**
   - Right-click "PDFs" folder → "Share"
   - Add your service account email: `pdf-reader-service@shreemata-online-reading.iam.gserviceaccount.com`
   - Give "Editor" permission
   - Click "Send"

4. **Get Folder ID:**
   - Open the "PDFs" folder
   - Copy the ID from URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
   - Update `.env`: `GOOGLE_DRIVE_PDF_FOLDER_ID=FOLDER_ID_HERE`

---

## 🔧 Phase 2: Install Dependencies (5 minutes)

Run these commands in your project directory:

```bash
npm install googleapis
npm install pdf-lib
npm install multer
```

**What these do:**
- `googleapis` - Google Drive API client
- `pdf-lib` - PDF manipulation (for watermarking)
- `multer` - File upload handling (already installed?)

---

## 💾 Phase 3: Create Database Models (15 minutes)

### Step 3.1: Extend Book Model

**File:** `models/Book.js`

Add these fields to your existing Book schema:

```javascript
// Add to existing Book schema
digitalContent: {
  available: { type: Boolean, default: false },
  googleDriveFileId: { type: String, default: null },
  fileSize: { type: Number, default: 0 },
  totalPages: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: null }
},

// Pricing
physicalPrice: { type: Number, required: true }, // Rename from 'price'
onlinePrice: { type: Number, default: null }     // New field
```

### Step 3.2: Create DigitalPurchase Model

**File:** `models/DigitalPurchase.js` (NEW FILE)

```javascript
const mongoose = require('mongoose');

const digitalPurchaseSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  bookId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Book', 
    required: true 
  },
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order', 
    required: true 
  },
  
  purchaseDate: { type: Date, default: Date.now },
  
  readingProgress: {
    currentPage: { type: Number, default: 1 },
    totalPages: { type: Number, default: 0 },
    lastReadAt: { type: Date, default: null }
  },
  
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Index for fast lookups
digitalPurchaseSchema.index({ userId: 1, bookId: 1 });
digitalPurchaseSchema.index({ orderId: 1 });

module.exports = mongoose.model('DigitalPurchase', digitalPurchaseSchema);
```

### Step 3.3: Create ReadingSession Model

**File:** `models/ReadingSession.js` (NEW FILE)

```javascript
const mongoose = require('mongoose');

const readingSessionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  digitalPurchaseId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'DigitalPurchase', 
    required: true 
  },
  
  sessionToken: { type: String, required: true, unique: true },
  startTime: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  
  ipAddress: { type: String, required: true },
  userAgent: { type: String, required: true },
  
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Index for fast session lookups
readingSessionSchema.index({ sessionToken: 1 });
readingSessionSchema.index({ userId: 1, isActive: 1 });

module.exports = mongoose.model('ReadingSession', readingSessionSchema);
```

---

## 🛠️ Phase 4: Create Google Drive Service (30 minutes)

**File:** `services/googleDriveService.js` (NEW FILE)

```javascript
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleDriveService {
  constructor() {
    // Initialize Google Drive API client
    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: 'service_account',
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID
      },
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    this.drive = google.drive({ version: 'v3', auth });
    this.folderId = process.env.GOOGLE_DRIVE_PDF_FOLDER_ID;
  }

  /**
   * Upload PDF to Google Drive
   * @param {string} filePath - Local file path
   * @param {string} fileName - Name for the file in Drive
   * @returns {Promise<{fileId: string, fileName: string}>}
   */
  async uploadPDF(filePath, fileName) {
    try {
      const fileMetadata = {
        name: fileName,
        parents: [this.folderId]
      };

      const media = {
        mimeType: 'application/pdf',
        body: fs.createReadStream(filePath)
      };

      const response = await this.drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, size'
      });

      console.log('✅ PDF uploaded to Google Drive:', response.data);

      return {
        fileId: response.data.id,
        fileName: response.data.name,
        fileSize: response.data.size
      };
    } catch (error) {
      console.error('❌ Error uploading PDF to Google Drive:', error);
      throw new Error('Failed to upload PDF to Google Drive');
    }
  }

  /**
   * Get PDF file stream from Google Drive
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<Stream>}
   */
  async getFileStream(fileId) {
    try {
      const response = await this.drive.files.get(
        { fileId: fileId, alt: 'media' },
        { responseType: 'stream' }
      );

      return response.data;
    } catch (error) {
      console.error('❌ Error getting file stream:', error);
      throw new Error('Failed to retrieve PDF from Google Drive');
    }
  }

  /**
   * Get file metadata
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<Object>}
   */
  async getFileMetadata(fileId) {
    try {
      const response = await this.drive.files.get({
        fileId: fileId,
        fields: 'id, name, size, mimeType, createdTime'
      });

      return response.data;
    } catch (error) {
      console.error('❌ Error getting file metadata:', error);
      throw new Error('Failed to get file metadata');
    }
  }

  /**
   * Delete file from Google Drive
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<void>}
   */
  async deleteFile(fileId) {
    try {
      await this.drive.files.delete({ fileId: fileId });
      console.log('✅ File deleted from Google Drive:', fileId);
    } catch (error) {
      console.error('❌ Error deleting file:', error);
      throw new Error('Failed to delete file from Google Drive');
    }
  }

  /**
   * Verify file exists
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<boolean>}
   */
  async verifyFileExists(fileId) {
    try {
      await this.drive.files.get({ fileId: fileId, fields: 'id' });
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new GoogleDriveService();
```

---

## 🧪 Phase 5: Test Google Drive Upload (15 minutes)

**File:** `test-google-drive-upload.js` (NEW FILE - for testing only)

```javascript
const googleDriveService = require('./services/googleDriveService');
const path = require('path');
require('dotenv').config();

async function testUpload() {
  try {
    console.log('🧪 Testing Google Drive Upload...\n');

    // Create a test PDF file path (you'll need to provide a real PDF)
    const testPdfPath = path.join(__dirname, 'test-book.pdf');
    
    console.log('📤 Uploading test PDF...');
    const result = await googleDriveService.uploadPDF(
      testPdfPath,
      'test-book-' + Date.now() + '.pdf'
    );

    console.log('\n✅ Upload successful!');
    console.log('File ID:', result.fileId);
    console.log('File Name:', result.fileName);
    console.log('File Size:', result.fileSize, 'bytes');

    // Test file retrieval
    console.log('\n📥 Testing file retrieval...');
    const metadata = await googleDriveService.getFileMetadata(result.fileId);
    console.log('✅ File metadata retrieved:', metadata);

    // Test file exists check
    console.log('\n🔍 Testing file exists check...');
    const exists = await googleDriveService.verifyFileExists(result.fileId);
    console.log('✅ File exists:', exists);

    console.log('\n🎉 All tests passed!');
    console.log('\n⚠️  Note: File ID for cleanup:', result.fileId);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testUpload();
```

**To run the test:**

1. Place a test PDF file in your project root named `test-book.pdf`
2. Run: `node test-google-drive-upload.js`
3. Check Google Drive to see if the file was uploaded

---

## 📝 Next Steps After POC Phase 1

Once Google Drive upload is working, we'll move to:

1. **Phase 6:** Create admin upload interface
2. **Phase 7:** Build PDF streaming endpoint
3. **Phase 8:** Create protected viewer with watermark
4. **Phase 9:** Test end-to-end flow

---

## ✅ Checklist for Phase 1

- [ ] Google Cloud Project created
- [ ] Google Drive API enabled
- [ ] Service Account created with JSON key
- [ ] Environment variables updated in `.env`
- [ ] Google Drive folder created and shared
- [ ] Dependencies installed (`googleapis`, `pdf-lib`, `multer`)
- [ ] Database models created
- [ ] Google Drive service created
- [ ] Test upload script runs successfully
- [ ] Test PDF appears in Google Drive

---

## 🆘 Troubleshooting

### Error: "Invalid credentials"
- Check that `GOOGLE_PRIVATE_KEY` has proper line breaks (`\n`)
- Verify all environment variables are set correctly
- Restart your server after updating `.env`

### Error: "Permission denied"
- Make sure Google Drive API is enabled
- Verify service account has "Editor" role
- Check that folder is shared with service account email

### Error: "Folder not found"
- Verify `GOOGLE_DRIVE_PDF_FOLDER_ID` is correct
- Make sure folder is shared with service account

---

## 🎯 Success Criteria

You'll know Phase 1 is complete when:
1. ✅ Test script uploads PDF to Google Drive
2. ✅ You can see the file in your Google Drive folder
3. ✅ File metadata can be retrieved
4. ✅ No errors in console

**Ready to start?** Begin with Step 1.1 and let me know when you complete each phase!
