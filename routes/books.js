// routes/books.js
const express = require("express");
const multer = require("multer");
const cloudinary = require("../config/cloudinary");

const Book = require("../models/Book");
const Purchase = require("../models/Purchase");
const { authenticateToken, isAdmin } = require("../middleware/auth");

const router = express.Router();

/* -------------------------------------------
   CLOUDINARY STORAGE SETUP WITH RENDER OPTIMIZATIONS
------------------------------------------- */
// Use memory storage and upload directly to Cloudinary
const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Reduced to 5MB per file for Render
    files: 10, // Limit total files
    fieldSize: 2 * 1024 * 1024, // 2MB field size limit
    fieldNameSize: 100, // Field name size limit
    fields: 20 // Limit number of fields
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const uploadImages = upload.fields([
  { name: "coverImage", maxCount: 1 },
  { name: "previewImages", maxCount: 8 } // Reduced from unlimited to 8 for Render
]);

// Helper function to upload buffer to Cloudinary with Render optimizations
async function uploadToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
    try {
      // Create fresh Cloudinary instance with explicit config
      const { v2: cloudinaryFresh } = require('cloudinary');
      
      cloudinaryFresh.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME_NEW || process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY_NEW || process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET_NEW || process.env.CLOUDINARY_API_SECRET,
        secure: true
      });

      console.log('🔧 Using fresh Cloudinary config for upload:', {
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME_NEW || process.env.CLOUDINARY_CLOUD_NAME,
        api_key: (process.env.CLOUDINARY_API_KEY_NEW || process.env.CLOUDINARY_API_KEY) ? '***' + (process.env.CLOUDINARY_API_KEY_NEW || process.env.CLOUDINARY_API_KEY).slice(-4) : 'NOT SET',
        filename: filename,
        bufferSize: buffer.length
      });

      // Render-optimized upload with shorter timeout and compression
      cloudinaryFresh.uploader.upload_stream(
        {
          resource_type: "auto",
          timeout: 25000, // 25 second timeout for Render (less than 30s limit)
          quality: "auto:low", // Compress images for faster upload
          fetch_format: "auto", // Auto-optimize format
          flags: "progressive", // Progressive JPEG for faster loading
          transformation: [
            { width: 1000, height: 1500, crop: "limit" }, // Limit max dimensions
            { quality: "auto:good" } // Good quality but compressed
          ]
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error);
            reject(new Error(`Cloudinary upload failed: ${error.message}`));
          } else {
            console.log('✅ Cloudinary upload success:', result.secure_url);
            resolve(result.secure_url);
          }
        }
      ).end(buffer);
    } catch (error) {
      console.error('❌ Cloudinary setup error:', error);
      reject(new Error(`Cloudinary setup failed: ${error.message}`));
    }
  });
}

/* -------------------------------------------
   GET ALL BOOKS WITH FILTERS + PAGINATION
------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1"));
    const limit = Math.max(1, parseInt(req.query.limit || "12"));
    const skip = (page - 1) * limit;

    const { category, class: bookClass, subject, author, minPrice, maxPrice, search } = req.query;

    const query = {};

    if (category) query.category = category;
    if (bookClass) query.class = bookClass;
    if (subject) query.subject = new RegExp(subject, "i");
    if (author) query.author = new RegExp(author, "i");
    if (minPrice) query.price = { ...query.price, $gte: parseFloat(minPrice) };
    if (maxPrice) query.price = { ...query.price, $lte: parseFloat(maxPrice) };

    if (search) {
      const s = new RegExp(search, "i");
      query.$or = [
        { title: s },
        { author: s },
        { description: s },
        { class: s },
        { subject: s }
      ];
    }

    const [totalCount, books] = await Promise.all([
      Book.countDocuments(query),
      Book.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    res.json({
      books,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount
    });

  } catch (err) {
    console.error("Error fetching books:", err);
    res.status(500).json({ error: "Error fetching books" });
  }
});

/* -------------------------------------------
   GET SINGLE BOOK
------------------------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);

    if (!book) return res.status(404).json({ error: "Book not found" });

    res.json({ book });
  } catch (err) {
    console.error("Error fetching book:", err);
    res.status(500).json({ error: "Error fetching book" });
  }
});

/* -------------------------------------------
   ADD NEW BOOK (ADMIN ONLY)
   Supports direct Cloudinary upload (JSON) or server upload (multipart)
------------------------------------------- */
router.post("/", authenticateToken, isAdmin, (req, res, next) => {
  const contentType = req.headers['content-type'];
  if (contentType && contentType.includes('application/json')) {
    return next();
  }
  
  uploadImages(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      return res.status(500).json({ error: "Upload failed", details: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('📝 Book creation request received');
    console.log('📝 Content-Type:', req.headers['content-type']);
    console.log('📝 Body keys:', Object.keys(req.body));
    console.log('📝 Files:', req.files ? Object.keys(req.files) : 'No files');
    
    const { title, author, price, description, category, class: bookClass, subject, weight, rewardPoints, cover_image, preview_images } = req.body;

    if (!title || !author || !price) {
      console.log('❌ Missing required fields:', { title: !!title, author: !!author, price: !!price });
      return res.status(400).json({ error: "Missing required fields" });
    }

    let coverImage = cover_image;
    let previewImages = preview_images || [];

    // Handle file uploads
    if (req.files) {
      console.log('📤 Processing file uploads...');
      
      if (req.files["coverImage"]) {
        console.log('📤 Uploading cover image to Cloudinary...');
        try {
          coverImage = await uploadToCloudinary(
            req.files["coverImage"][0].buffer, 
            req.files["coverImage"][0].originalname
          );
          console.log('✅ Cover image uploaded:', coverImage);
        } catch (error) {
          console.error('❌ Cover image upload failed:', error);
          return res.status(500).json({ error: "Cover image upload failed", details: error.message });
        }
      }
      
      if (req.files["previewImages"]) {
        console.log('📤 Uploading preview images to Cloudinary...');
        try {
          const uploadPromises = req.files["previewImages"].map((file, index) => {
            console.log(`📤 Uploading preview image ${index + 1}:`, file.originalname);
            return uploadToCloudinary(file.buffer, file.originalname);
          });
          previewImages = await Promise.all(uploadPromises);
          console.log('✅ Preview images uploaded:', previewImages.length, 'images');
        } catch (error) {
          console.error('❌ Preview images upload failed:', error);
          return res.status(500).json({ error: "Preview images upload failed", details: error.message });
        }
      }
    }

    if (!coverImage) {
      console.log('❌ No cover image provided');
      return res.status(400).json({ error: "Cover image is required" });
    }

    console.log('💾 Creating book in database...');
    const book = await Book.create({
      title,
      author,
      price,
      description: description || "",
      cover_image: coverImage,
      preview_images: previewImages,
      category: category || "uncategorized",
      class: bookClass || "",
      subject: subject || "",
      weight: weight || 0.5,
      rewardPoints: rewardPoints || 0
    });

    console.log('✅ Book created successfully:', book._id);
    res.status(201).json({ message: "Book added successfully", book });
  } catch (err) {
    console.error("❌ Error adding book:", err);
    res.status(500).json({ error: "Error adding book", details: err.message });
  }
});

/* -------------------------------------------
   UPDATE BOOK (ADMIN ONLY)
   Supports direct Cloudinary upload (JSON) or server upload (multipart)
------------------------------------------- */
router.put("/:id", authenticateToken, isAdmin, (req, res, next) => {
  const contentType = req.headers['content-type'];
  if (contentType && contentType.includes('application/json')) {
    return next();
  }
  
  uploadImages(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      return res.status(500).json({ error: "Upload failed", details: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    console.log('📝 Book update request received for ID:', req.params.id);
    console.log('📝 Content-Type:', req.headers['content-type']);
    console.log('📝 Body keys:', Object.keys(req.body));
    console.log('📝 Files:', req.files ? Object.keys(req.files) : 'No files');
    
    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.log('❌ Invalid ObjectId format:', req.params.id);
      return res.status(400).json({ error: "Invalid book ID format" });
    }
    
    const book = await Book.findById(req.params.id);
    console.log('📚 Book found:', book ? `Yes - ${book.title}` : 'No');
    
    if (!book) {
      console.log('❌ Book not found with ID:', req.params.id);
      return res.status(404).json({ error: "Book not found" });
    }

    console.log('📝 Updating book fields...');
    book.title = req.body.title || book.title;
    book.author = req.body.author || book.author;
    book.price = req.body.price || book.price;
    book.description = req.body.description || book.description;
    book.category = req.body.category || book.category;
    book.class = req.body.class !== undefined ? req.body.class : book.class;
    book.subject = req.body.subject !== undefined ? req.body.subject : book.subject;
    book.weight = req.body.weight !== undefined ? req.body.weight : book.weight;
    book.rewardPoints = req.body.rewardPoints !== undefined ? req.body.rewardPoints : book.rewardPoints;

    if (req.body.cover_image) {
      console.log('📝 Updating cover image from body');
      book.cover_image = req.body.cover_image;
    }
    if (req.body.preview_images) {
      console.log('📝 Updating preview images from body');
      book.preview_images = req.body.preview_images;
    }

    // Handle file uploads for updates
    if (req.files && req.files["coverImage"]) {
      console.log('📤 Uploading new cover image to Cloudinary...');
      try {
        book.cover_image = await uploadToCloudinary(
          req.files["coverImage"][0].buffer, 
          req.files["coverImage"][0].originalname
        );
        console.log('✅ Cover image updated:', book.cover_image);
      } catch (error) {
        console.error('❌ Cover image upload failed:', error);
        return res.status(500).json({ error: "Cover image upload failed", details: error.message });
      }
    }
    
    if (req.files && req.files["previewImages"]) {
      console.log('📤 Uploading new preview images to Cloudinary...');
      try {
        const uploadPromises = req.files["previewImages"].map((file, index) => {
          console.log(`📤 Uploading preview image ${index + 1}:`, file.originalname);
          return uploadToCloudinary(file.buffer, file.originalname);
        });
        book.preview_images = await Promise.all(uploadPromises);
        console.log('✅ Preview images updated:', book.preview_images.length, 'images');
      } catch (error) {
        console.error('❌ Preview images upload failed:', error);
        return res.status(500).json({ error: "Preview images upload failed", details: error.message });
      }
    }

    console.log('💾 Saving updated book...');
    await book.save();
    console.log('✅ Book updated successfully:', book._id);
    res.json({ message: "Book updated successfully", book });
  } catch (err) {
    console.error("❌ Error updating book:", err);
    res.status(500).json({ error: "Error updating book", details: err.message });
  }
});

/* -------------------------------------------
   DELETE BOOK (ADMIN ONLY)
------------------------------------------- */
router.delete("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const bookId = req.params.id;
    console.log(`🗑️ DELETE request received for book ID: ${bookId}`);
    
    const deleted = await Book.findByIdAndDelete(bookId);
    console.log(`📚 Book deletion result:`, deleted ? 'Found and deleted' : 'Not found');

    if (!deleted) {
      console.log(`❌ Book with ID ${bookId} not found`);
      return res.status(404).json({ error: "Book not found" });
    }

    console.log(`✅ Book "${deleted.title}" deleted successfully`);
    res.json({ message: "Book deleted successfully", deletedBook: { id: deleted._id, title: deleted.title } });
  } catch (err) {
    console.error("Error deleting book:", err);
    res.status(500).json({ error: "Error deleting book" });
  }
});

/* -------------------------------------------
   PURCHASE CHECK — each user can buy only once
------------------------------------------- */
router.post("/:id/purchase", authenticateToken, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);

    if (!book) return res.status(404).json({ error: "Book not found" });

    const alreadyBought = await Purchase.findOne({
      user_id: req.user.id,
      book_id: book._id
    });

    if (alreadyBought) {
      return res.status(400).json({ error: "Book already purchased" });
    }

    const purchase = await Purchase.create({
      user_id: req.user.id,
      book_id: book._id,
      price_paid: book.price
    });

    res.json({ message: "Purchase successful", purchase });
  } catch (err) {
    console.error("Error processing purchase:", err);
    res.status(500).json({ error: "Error processing purchase" });
  }
});

module.exports = router;
