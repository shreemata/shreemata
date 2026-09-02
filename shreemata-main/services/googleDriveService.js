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
   * @returns {Promise<{fileId: string, fileName: string, fileSize: number}>}
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
        fileSize: parseInt(response.data.size)
      };
    } catch (error) {
      console.error('❌ Error uploading PDF to Google Drive:', error);
      throw new Error('Failed to upload PDF to Google Drive: ' + error.message);
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
      throw new Error('Failed to retrieve PDF from Google Drive: ' + error.message);
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
      throw new Error('Failed to get file metadata: ' + error.message);
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
      throw new Error('Failed to delete file from Google Drive: ' + error.message);
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
