const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.auth = null;
    this.initialized = false;
    this.rootFolderId = null;
  }

  /**
   * Initialize Google Drive service with service account authentication
   */
  async initialize() {
    try {
      // Check for service account credentials
      const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH || './config/google-service-account.json';
      
      if (!fs.existsSync(serviceAccountPath)) {
        throw new Error(`Google service account file not found at: ${serviceAccountPath}`);
      }

      // Check if we should use domain-wide delegation
      const userEmail = process.env.GOOGLE_USER_EMAIL; // Your personal Gmail
      
      if (userEmail) {
        // Use domain-wide delegation to impersonate user
        this.auth = new google.auth.GoogleAuth({
          keyFile: serviceAccountPath,
          scopes: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/drive.file'
          ],
          subject: userEmail // Impersonate this user
        });
      } else {
        // Use service account directly (requires shared drive)
        this.auth = new google.auth.GoogleAuth({
          keyFile: serviceAccountPath,
          scopes: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/drive.file'
          ]
        });
      }

      // Initialize Drive API
      this.drive = google.drive({ version: 'v3', auth: this.auth });
      
      // Create or find root folder for digital books
      await this.ensureRootFolder();
      
      this.initialized = true;
      console.log('Google Drive service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Google Drive service:', error.message);
      throw error;
    }
  }

  /**
   * Ensure the service is initialized before operations
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Create or find the root folder for digital books
   */
  async ensureRootFolder() {
    const folderName = 'Digital Books Store';
    
    try {
      // Check if we have a shared drive ID configured
      const sharedDriveId = process.env.GOOGLE_SHARED_DRIVE_ID;
      
      if (sharedDriveId) {
        // Use shared drive as root
        this.rootFolderId = sharedDriveId;
        console.log(`Using shared drive as root: ${this.rootFolderId}`);
        return;
      }
      
      // Fallback: Search for existing folder in shared drives
      const response = await this.drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      if (response.data.files.length > 0) {
        this.rootFolderId = response.data.files[0].id;
        console.log(`Found existing root folder: ${this.rootFolderId}`);
      } else {
        // If no shared drive ID is configured, we need to create in a shared drive
        throw new Error('No shared drive configured. Please set GOOGLE_SHARED_DRIVE_ID in your .env file or create a shared drive and add the service account to it.');
      }
    } catch (error) {
      console.error('Error ensuring root folder:', error.message);
      throw error;
    }
  }

  /**
   * Create a structured folder hierarchy for a book
   * @param {string} bookId - The book ID
   * @param {string} bookTitle - The book title for folder naming
   * @returns {string} - The folder ID where the PDF should be stored
   */
  async createBookFolder(bookId, bookTitle) {
    await this.ensureInitialized();
    
    try {
      // Sanitize book title for folder name
      const sanitizedTitle = bookTitle.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
      const folderName = `${bookId}_${sanitizedTitle}`;
      
      // Check if folder already exists
      const existingResponse = await this.drive.files.list({
        q: `name='${folderName}' and parents in '${this.rootFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      if (existingResponse.data.files.length > 0) {
        return existingResponse.data.files[0].id;
      }

      // Create new folder
      const folderResponse = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [this.rootFolderId]
        },
        fields: 'id',
        supportsAllDrives: true
      });

      return folderResponse.data.id;
    } catch (error) {
      console.error('Error creating book folder:', error.message);
      throw error;
    }
  }

  /**
   * Upload a PDF file to Google Drive
   * @param {string} filePath - Local path to the PDF file
   * @param {string} bookId - The book ID
   * @param {string} bookTitle - The book title
   * @returns {Object} - File metadata including fileId
   */
  async uploadPDF(filePath, bookId, bookTitle) {
    await this.ensureInitialized();
    
    try {
      // Validate file exists and is PDF
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileExtension = path.extname(filePath).toLowerCase();
      if (fileExtension !== '.pdf') {
        throw new Error(`Invalid file type. Expected PDF, got: ${fileExtension}`);
      }

      // Create book folder
      const folderId = await this.createBookFolder(bookId, bookTitle);
      
      // Get file stats
      const stats = fs.statSync(filePath);
      const fileName = `${bookId}_${bookTitle.replace(/[<>:"/\\|?*]/g, '_')}.pdf`;

      // Upload file with retry mechanism
      const uploadResponse = await this.retryOperation(async () => {
        return await this.drive.files.create({
          requestBody: {
            name: fileName,
            parents: [folderId],
            mimeType: 'application/pdf'
          },
          media: {
            mimeType: 'application/pdf',
            body: fs.createReadStream(filePath)
          },
          fields: 'id, name, size, createdTime, md5Checksum',
          supportsAllDrives: true
        });
      });

      const fileData = uploadResponse.data;
      
      return {
        fileId: fileData.id,
        fileName: fileData.name,
        fileSize: parseInt(fileData.size),
        uploadedAt: new Date(fileData.createdTime),
        md5Checksum: fileData.md5Checksum,
        folderId: folderId
      };
    } catch (error) {
      console.error('Error uploading PDF:', error.message);
      throw error;
    }
  }

  /**
   * Get a readable stream for a PDF file
   * @param {string} fileId - Google Drive file ID
   * @returns {ReadableStream} - File stream
   */
  async getFileStream(fileId) {
    await this.ensureInitialized();
    
    try {
      const response = await this.retryOperation(async () => {
        return await this.drive.files.get({
          fileId: fileId,
          alt: 'media',
          supportsAllDrives: true
        }, { responseType: 'stream' });
      });

      return response.data;
    } catch (error) {
      console.error('Error getting file stream:', error.message);
      throw error;
    }
  }

  /**
   * Delete a file from Google Drive
   * @param {string} fileId - Google Drive file ID
   */
  async deleteFile(fileId) {
    await this.ensureInitialized();
    
    try {
      await this.retryOperation(async () => {
        return await this.drive.files.delete({
          fileId: fileId,
          supportsAllDrives: true
        });
      });
      
      console.log(`File deleted successfully: ${fileId}`);
    } catch (error) {
      console.error('Error deleting file:', error.message);
      throw error;
    }
  }

  /**
   * Verify if a file exists and is accessible
   * @param {string} fileId - Google Drive file ID
   * @returns {boolean} - True if file exists and is accessible
   */
  async verifyFileExists(fileId) {
    await this.ensureInitialized();
    
    try {
      await this.retryOperation(async () => {
        return await this.drive.files.get({
          fileId: fileId,
          fields: 'id, name, trashed',
          supportsAllDrives: true
        });
      });
      
      return true;
    } catch (error) {
      if (error.code === 404) {
        return false;
      }
      console.error('Error verifying file existence:', error.message);
      throw error;
    }
  }

  /**
   * Get file metadata
   * @param {string} fileId - Google Drive file ID
   * @returns {Object} - File metadata
   */
  async getFileMetadata(fileId) {
    await this.ensureInitialized();
    
    try {
      const response = await this.retryOperation(async () => {
        return await this.drive.files.get({
          fileId: fileId,
          fields: 'id, name, size, createdTime, modifiedTime, md5Checksum, mimeType, trashed',
          supportsAllDrives: true
        });
      });

      const file = response.data;
      
      return {
        fileId: file.id,
        fileName: file.name,
        fileSize: parseInt(file.size),
        mimeType: file.mimeType,
        createdAt: new Date(file.createdTime),
        modifiedAt: new Date(file.modifiedTime),
        md5Checksum: file.md5Checksum,
        isTrashed: file.trashed || false
      };
    } catch (error) {
      console.error('Error getting file metadata:', error.message);
      throw error;
    }
  }

  /**
   * Retry operation with exponential backoff for rate limiting
   * @param {Function} operation - The operation to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {Promise} - Result of the operation
   */
  async retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if it's a rate limit error
        if (error.code === 429 || (error.response && error.response.status === 429)) {
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await this.sleep(delay);
            continue;
          }
        }
        
        // Check if it's a network error that might be transient
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
            await this.sleep(delay);
            continue;
          }
        }
        
        // For other errors, don't retry
        throw error;
      }
    }
    
    throw lastError;
  }

  /**
   * Sleep utility for retry delays
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service health status
   * @returns {Object} - Service health information
   */
  async getHealthStatus() {
    try {
      await this.ensureInitialized();
      
      // Test basic API access
      await this.drive.files.list({
        pageSize: 1,
        fields: 'files(id)'
      });
      
      return {
        status: 'healthy',
        initialized: this.initialized,
        rootFolderId: this.rootFolderId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        initialized: this.initialized,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export singleton instance
module.exports = new GoogleDriveService();