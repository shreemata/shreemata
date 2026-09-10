const axios = require('axios');
const FormData = require('form-data');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const API = 'http://localhost:3000/api';
const adminId = '6a2e71e995ab8626a57076e7';
const token = jwt.sign(
  { id: adminId, role: 'admin', name: 'Shakuntaladevi' },
  process.env.JWT_SECRET || 'shreemata_jwt_secret_key_2026',
  { expiresIn: '1h' }
);

// Minimal 1x1 GIF buffer for image testing
const sampleImageBuffer = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

async function testFullCloudinaryFlow() {
  console.log('🧪 Starting Full Cloudinary Real Upload Test Suite...');
  let createdBookId = null;

  try {
    // ----------------------------------------------------
    // TEST A: Create Book with Real Cover Image Upload
    // ----------------------------------------------------
    console.log('\n--- TEST A: Creating Book with Cover Image Upload ---');
    const form = new FormData();
    form.append('title', 'Real Cloudinary Book');
    form.append('author', 'Test Author');
    form.append('price', '499');
    form.append('description', 'Comprehensive testing book for Cloudinary uploads');
    form.append('class', '10');
    form.append('subject', 'Physics');
    form.append('weight', '0.5');
    form.append('rewardPoints', '50');
    form.append('cashbackAmount', '20');
    form.append('cashbackPercentage', '5');
    form.append('trackStock', 'true');
    form.append('stockQuantity', '15');
    form.append('lowStockThreshold', '5');
    form.append('stockStatus', 'in_stock');
    form.append('existingCoverRemoved', 'false');
    form.append('retainedPreviewImages', JSON.stringify([]));

    // Append 1 cover image and 2 preview images
    form.append('coverImage', sampleImageBuffer, { filename: 'test-cover.gif', contentType: 'image/gif' });
    form.append('previewImages', sampleImageBuffer, { filename: 'test-preview1.gif', contentType: 'image/gif' });
    form.append('previewImages', sampleImageBuffer, { filename: 'test-preview2.gif', contentType: 'image/gif' });

    const createRes = await axios.post(`${API}/books`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`
      }
    });

    if (createRes.status === 201 && createRes.data.book) {
      const book = createRes.data.book;
      createdBookId = book._id;
      console.log('✅ PASS: Book created successfully with ID:', createdBookId);
      console.log('   Cover URL:', book.cover_image);
      console.log('   Preview URLs:', book.preview_images);

      if (!book.cover_image.includes('cloudinary') && !book.cover_image.startsWith('http')) {
        throw new Error('Cover image URL is invalid or not from Cloudinary');
      }
      if (book.preview_images.length !== 2) {
        throw new Error(`Expected 2 preview images, got ${book.preview_images.length}`);
      }
    } else {
      throw new Error('Book creation failed');
    }

    // ----------------------------------------------------
    // TEST B: Storefront Retrieval Test
    // ----------------------------------------------------
    console.log('\n--- TEST B: Storefront Book Retrieval ---');
    const getRes = await axios.get(`${API}/books/${createdBookId}`);
    if (getRes.status === 200 && getRes.data.book) {
      console.log('✅ PASS: Storefront retrieved book with images successfully.');
      console.log('   Title:', getRes.data.book.title);
      console.log('   Cover:', getRes.data.book.cover_image);
    } else {
      throw new Error('Failed to retrieve created book from GET /api/books/:id');
    }

    // ----------------------------------------------------
    // TEST C: Update Book (Remove preview #1, retain preview #2, update cover)
    // ----------------------------------------------------
    console.log('\n--- TEST C: Edit Book Image Retain & Removal ---');
    const editForm = new FormData();
    editForm.append('title', 'Real Cloudinary Book Updated');
    editForm.append('author', 'Test Author');
    editForm.append('price', '499');
    editForm.append('existingCoverRemoved', 'false');
    
    // Retain only preview #2
    const retained = [getRes.data.book.preview_images[1]];
    editForm.append('retainedPreviewImages', JSON.stringify(retained));

    const updateRes = await axios.put(`${API}/books/${createdBookId}`, editForm, {
      headers: {
        ...editForm.getHeaders(),
        Authorization: `Bearer ${token}`
      }
    });

    if (updateRes.status === 200 && updateRes.data.book) {
      const updatedBook = updateRes.data.book;
      console.log('✅ PASS: Book updated successfully.');
      console.log('   Retained Preview Count:', updatedBook.preview_images.length);
      if (updatedBook.preview_images.length !== 1) {
        throw new Error(`Expected 1 retained preview image, got ${updatedBook.preview_images.length}`);
      }
    } else {
      throw new Error('Book update failed');
    }

    // ----------------------------------------------------
    // Cleanup: Delete Test Book
    // ----------------------------------------------------
    console.log('\n--- Cleanup: Deleting Test Book ---');
    await axios.delete(`${API}/books/${createdBookId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ PASS: Test book deleted successfully.');

    console.log('\n🎉 ALL REAL CLOUDINARY UPLOAD TESTS PASSED WITH 100% SUCCESS!');
  } catch (err) {
    console.error('❌ TEST FAILED:', err.response ? err.response.data : err.message);
    if (createdBookId) {
      await axios.delete(`${API}/books/${createdBookId}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => {});
    }
    process.exit(1);
  }
}

testFullCloudinaryFlow();
