const googleDriveService = require('./services/googleDriveService');
const path = require('path');
require('dotenv').config();

async function testUpload() {
  try {
    console.log('🧪 Testing Google Drive Upload...\n');
    console.log('📋 Configuration Check:');
    console.log('  Project ID:', process.env.GOOGLE_PROJECT_ID ? '✅ Set' : '❌ Missing');
    console.log('  Client Email:', process.env.GOOGLE_CLIENT_EMAIL ? '✅ Set' : '❌ Missing');
    console.log('  Private Key:', process.env.GOOGLE_PRIVATE_KEY ? '✅ Set' : '❌ Missing');
    console.log('  Folder ID:', process.env.GOOGLE_DRIVE_PDF_FOLDER_ID ? '✅ Set' : '❌ Missing');
    console.log('');

    // Check if test PDF exists
    const testPdfPath = path.join(__dirname, 'test-book.pdf');
    const fs = require('fs');
    
    if (!fs.existsSync(testPdfPath)) {
      console.error('❌ Test PDF not found!');
      console.log('📝 Please create a test PDF file named "test-book.pdf" in the project root');
      console.log('   You can use any PDF file for testing');
      process.exit(1);
    }

    console.log('📤 Uploading test PDF...');
    const result = await googleDriveService.uploadPDF(
      testPdfPath,
      'test-book-' + Date.now() + '.pdf'
    );

    console.log('\n✅ Upload successful!');
    console.log('  File ID:', result.fileId);
    console.log('  File Name:', result.fileName);
    console.log('  File Size:', (result.fileSize / 1024).toFixed(2), 'KB');

    // Test file retrieval
    console.log('\n📥 Testing file retrieval...');
    const metadata = await googleDriveService.getFileMetadata(result.fileId);
    console.log('✅ File metadata retrieved:');
    console.log('  Name:', metadata.name);
    console.log('  Size:', (metadata.size / 1024).toFixed(2), 'KB');
    console.log('  Created:', metadata.createdTime);

    // Test file exists check
    console.log('\n🔍 Testing file exists check...');
    const exists = await googleDriveService.verifyFileExists(result.fileId);
    console.log('✅ File exists:', exists);

    console.log('\n🎉 All tests passed!');
    console.log('\n📁 Check your Google Drive folder to see the uploaded file');
    console.log('🔗 Folder URL: https://drive.google.com/drive/folders/' + process.env.GOOGLE_DRIVE_PDF_FOLDER_ID);
    console.log('\n⚠️  Note: File ID for cleanup:', result.fileId);
    console.log('   You can delete this test file from Google Drive manually');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\n🔍 Troubleshooting tips:');
    console.error('  1. Check that all environment variables are set in .env');
    console.error('  2. Verify Google Drive API is enabled in Google Cloud Console');
    console.error('  3. Ensure service account has access to the folder');
    console.error('  4. Check that the folder ID is correct');
    console.error('\n📖 See POC_ONLINE_READING_SETUP.md for detailed setup instructions');
    process.exit(1);
  }
}

testUpload();
