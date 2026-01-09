// services/googleDriveService.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleDriveService {
    constructor() {
        this.drive = null;
        this.auth = null;
        this.initializeAuth();
    }

    async initializeAuth() {
        try {
            // Use service account credentials
            const credentials = {
                type: "service_account",
                project_id: process.env.GOOGLE_PROJECT_ID,
                private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                client_id: process.env.GOOGLE_CLIENT_ID,
                auth_uri: "https://accounts.google.com/o/oauth2/auth",
                token_uri: "https://oauth2.googleapis.com/token",
                auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.GOOGLE_CLIENT_EMAIL}`
            };

            this.auth = new google.auth.GoogleAuth({
                credentials: credentials,
                scopes: ['https://www.googleapis.com/auth/drive.file']
            });

            this.drive = google.drive({ version: 'v3', auth: this.auth });
            console.log('✅ Google Drive service initialized');
        } catch (error) {
            console.error('❌ Error initializing Google Drive service:', error);
        }
    }

    async uploadFile(filePath, fileName, orderId) {
        try {
            if (!this.drive) {
                throw new Error('Google Drive service not initialized');
            }

            // Create folder for check images if it doesn't exist
            const folderId = await this.getOrCreateFolder('Check Payment Images');

            const fileMetadata = {
                name: `${orderId}_${fileName}`,
                parents: [folderId]
            };

            const media = {
                mimeType: 'image/jpeg',
                body: fs.createReadStream(filePath)
            };

            const response = await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id,name,webViewLink,webContentLink'
            });

            // Make file publicly viewable
            await this.drive.permissions.create({
                fileId: response.data.id,
                resource: {
                    role: 'reader',
                    type: 'anyone'
                }
            });

            console.log(`✅ File uploaded to Google Drive: ${response.data.id}`);

            return {
                fileId: response.data.id,
                fileName: response.data.name,
                webViewLink: response.data.webViewLink,
                webContentLink: response.data.webContentLink,
                publicUrl: `https://drive.google.com/uc?id=${response.data.id}`
            };

        } catch (error) {
            console.error('❌ Error uploading file to Google Drive:', error);
            throw error;
        }
    }

    async getOrCreateFolder(folderName) {
        try {
            // Search for existing folder
            const response = await this.drive.files.list({
                q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder'`,
                fields: 'files(id, name)'
            });

            if (response.data.files.length > 0) {
                return response.data.files[0].id;
            }

            // Create folder if it doesn't exist
            const folderMetadata = {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            };

            const folder = await this.drive.files.create({
                resource: folderMetadata,
                fields: 'id'
            });

            console.log(`✅ Created Google Drive folder: ${folderName}`);
            return folder.data.id;

        } catch (error) {
            console.error('❌ Error creating Google Drive folder:', error);
            throw error;
        }
    }

    async deleteFile(fileId) {
        try {
            await this.drive.files.delete({
                fileId: fileId
            });
            console.log(`✅ Deleted file from Google Drive: ${fileId}`);
        } catch (error) {
            console.error('❌ Error deleting file from Google Drive:', error);
            throw error;
        }
    }
}

module.exports = new GoogleDriveService();