// routes/books.js
const express = require("express");
const multer = require("multer");
const cloudinary = require("../config/cloudinary");

const Book = require("../models/Book");
const Purchase = require("../models/Purchase");
const { authenticateToken, isAdmin } = require("../middleware/auth");

const router = express.Router();

/* -------------------------------------------
   CLOUDINARY STORAGE SETUP
------------------------------------------- */
// Use memory storage and upload directly to Cloudinary
const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB per file
  }
});

const uploadImages = upload.fields([
  { name: "coverImage", maxCount: 1 },
  { name: "previewImages", maxCount: 4 }
]);

// Helper function to upload buffer to Cloudinary with fresh config
async function uploadToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
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
      api_key: (process.env.CLOUDINARY_API_KEY_NEW || process.env.CLOUDINARY_API_KEY) ? '***' + (process.env.CLOUDINARY_API_KEY_NEW || process.env.CLOUDINARY_API_KEY).slice(-4) : 'NOT SET'
    });

    // Try the simplest possible upload first
    cloudinaryFresh.uploader.upload_stream(
      {
        resource_type: "auto"
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log('✅ Cloudinary upload success:', result.secure_url);
          resolve(result.secure_url);
        }
      }
    ).end(buffer);
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

    const { category, author, minPrice, maxPrice, search } = req.query;

    const query = {};

    if (category) query.category = category;
    if (author) query.author = new RegExp(author, "i");
    if (minPrice) query.price = { ...query.price, $gte: parseFloat(minPrice) };
    if (maxPrice) query.price = { ...query.price, $lte: parseFloat(maxPrice) };

    if (search) {
      const s = new RegExp(search, "i");
      query.$or = [
        { title: s },
        { author: s },
        { description: s }
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
    const { title, author, price, description, category, weight, rewardPoints, cover_image, preview_images } = req.body;

    if (!title || !author || !price) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let coverImage = cover_image;
    let previewImages = preview_images || [];

    // Handle file uploads
    if (req.files) {
      if (req.files["coverImage"]) {
        console.log('📤 Uploading cover image to Cloudinary...');
        coverImage = await uploadToCloudinary(
          req.files["coverImage"][0].buffer, 
          req.files["coverImage"][0].originalname
        );
      }
      if (req.files["previewImages"]) {
        console.log('📤 Uploading preview images to Cloudinary...');
        const uploadPromises = req.files["previewImages"].map(file => 
          uploadToCloudinary(file.buffer, file.originalname)
        );
        previewImages = await Promise.all(uploadPromises);
      }
    }

    if (!coverImage) {
      return res.status(400).json({ error: "Cover image is required" });
    }

    const book = await Book.create({
      title,
      author,
      price,
      description: description || "",
      cover_image: coverImage,
      preview_images: previewImages,
      category: category || "uncategorized",
      weight: weight || 0.5,
      rewardPoints: rewardPoints || 0
    });

    res.status(201).json({ message: "Book added successfully", book });
  } catch (err) {
    console.error("Error adding book:", err);
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
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ error: "Book not found" });

    book.title = req.body.title || book.title;
    book.author = req.body.author || book.author;
    book.price = req.body.price || book.price;
    book.description = req.body.description || book.description;
    book.category = req.body.category || book.category;
    book.weight = req.body.weight !== undefined ? req.body.weight : book.weight;
    book.rewardPoints = req.body.rewardPoints !== undefined ? req.body.rewardPoints : book.rewardPoints;

    if (req.body.cover_image) {
      book.cover_image = req.body.cover_image;
    }
    if (req.body.preview_images) {
      book.preview_images = req.body.preview_images;
    }

    // Handle file uploads for updates
    if (req.files && req.files["coverImage"]) {
      console.log('📤 Uploading new cover image to Cloudinary...');
      book.cover_image = await uploadToCloudinary(
        req.files["coverImage"][0].buffer, 
        req.files["coverImage"][0].originalname
      );
    }
    if (req.files && req.files["previewImages"]) {
      console.log('📤 Uploading new preview images to Cloudinary...');
      const uploadPromises = req.files["previewImages"].map(file => 
        uploadToCloudinary(file.buffer, file.originalname)
      );
      book.preview_images = await Promise.all(uploadPromises);
    }

    await book.save();
    res.json({ message: "Book updated successfully", book });
  } catch (err) {
    console.error("Error updating book:", err);
    res.status(500).json({ error: "Error updating book", details: err.message });
  }
});

/* -------------------------------------------
   DELETE BOOK (ADMIN ONLY)
------------------------------------------- */
router.delete("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const deleted = await Book.findByIdAndDelete(req.params.id);

    if (!deleted) return res.status(404).json({ error: "Book not found" });

    res.json({ message: "Book deleted" });
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
