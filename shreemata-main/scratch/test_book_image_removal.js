const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API = 'http://localhost:3000/api';
const adminId = '6a2e71e995ab8626a57076e7';
const token = jwt.sign(
  { id: adminId, role: 'admin', name: 'Shakuntaladevi' },
  process.env.JWT_SECRET || 'shreemata_jwt_secret_key_2026',
  { expiresIn: '1h' }
);

async function runBackendTests() {
  console.log('🧪 Starting backend test suite for Book Image Removal...');
  let testBookId = null;

  try {
    // 1. Create a dummy book with cover & preview images (via JSON)
    console.log('\n--- Test 1: Creating test book ---');
    const createRes = await axios.post(`${API}/books`, {
      title: 'Test Image Removal Book',
      author: 'Test Author',
      price: 299,
      description: 'Test book description for image removal testing',
      class: '10',
      subject: 'Science',
      cover_image: 'https://example.com/cover-test.jpg',
      preview_images: [
        'https://example.com/page1.jpg',
        'https://example.com/page2.jpg',
        'https://example.com/page3.jpg'
      ]
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (createRes.status === 201 && createRes.data.book) {
      testBookId = createRes.data.book._id;
      console.log('✅ PASS: Book created with ID:', testBookId);
      console.log('   Cover:', createRes.data.book.cover_image);
      console.log('   Previews:', createRes.data.book.preview_images);
    } else {
      throw new Error('Failed to create test book');
    }

    // 2. Remove preview image #2 (keep page1 and page3)
    console.log('\n--- Test 2: Retaining page1 and page3, removing page2 ---');
    const retainedPreviews = [
      'https://example.com/page1.jpg',
      'https://example.com/page3.jpg'
    ];

    const update1 = await axios.put(`${API}/books/${testBookId}`, {
      title: 'Test Image Removal Book',
      author: 'Test Author',
      price: 299,
      retainedPreviewImages: retainedPreviews
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const updatedBook1 = update1.data.book;
    if (updatedBook1.preview_images.length === 2 &&
        updatedBook1.preview_images.includes('https://example.com/page1.jpg') &&
        updatedBook1.preview_images.includes('https://example.com/page3.jpg') &&
        !updatedBook1.preview_images.includes('https://example.com/page2.jpg')) {
      console.log('✅ PASS: Preview image #2 removed, other 2 retained correctly.');
      console.log('   Updated Previews:', updatedBook1.preview_images);
    } else {
      throw new Error('Preview image removal verification failed');
    }

    // 3. Mark existing cover for removal without uploading new cover
    console.log('\n--- Test 3: Removing existing cover image ---');
    const update2 = await axios.put(`${API}/books/${testBookId}`, {
      title: 'Test Image Removal Book',
      author: 'Test Author',
      price: 299,
      existingCoverRemoved: true,
      cover_image: ''
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const updatedBook2 = update2.data.book;
    if (updatedBook2.cover_image === '') {
      console.log('✅ PASS: Existing cover image marked for removal updated to empty string.');
    } else {
      throw new Error('Cover image removal verification failed');
    }

    // 4. Restore cover image
    console.log('\n--- Test 4: Restoring cover image ---');
    const update3 = await axios.put(`${API}/books/${testBookId}`, {
      title: 'Test Image Removal Book',
      author: 'Test Author',
      price: 299,
      cover_image: 'https://example.com/new-cover-test.jpg'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (update3.data.book.cover_image === 'https://example.com/new-cover-test.jpg') {
      console.log('✅ PASS: Cover image updated successfully.');
    } else {
      throw new Error('Cover image update failed');
    }

    // Clean up test book
    console.log('\n--- Cleanup: Deleting test book ---');
    await axios.delete(`${API}/books/${testBookId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ PASS: Test book deleted successfully.');

    console.log('\n🎉 ALL BACKEND API TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ FAIL:', err.response ? err.response.data : err.message);
    if (testBookId) {
      await axios.delete(`${API}/books/${testBookId}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
    process.exit(1);
  }
}

runBackendTests();
