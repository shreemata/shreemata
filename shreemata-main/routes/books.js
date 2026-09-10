// routes/books.js
const express = require("express");
const multer = require("multer");
const cloudinary = require("../config/cloudinary");

const Book = require("../models/Book");
const Purchase = require("../models/Purchase");
const { authenticateToken, isAdmin } = require("../middleware/auth");

const router = express.Router();
const fs = require('fs');
const path = require('path');

// Helper function to safely delete local image files
function safeDeleteLocalImage(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return;
  if (!imageUrl.startsWith('/uploads/') && !imageUrl.startsWith('uploads/')) return;

  try {
    const relativePath = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
    const uploadsDir = path.resolve(__dirname, '../public/uploads');
    const absolutePath = path.resolve(__dirname, '../public', relativePath);

    // Prevent path traversal
    if (!absolutePath.startsWith(uploadsDir)) {
      console.warn('⚠️ Path traversal attempt blocked for image deletion:', imageUrl);
      return;
    }

    if (absolutePath.includes('default') || absolutePath.includes('placeholder')) {
      return;
    }

    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      console.log('🗑️ Deleted local image file:', absolutePath);
    }
  } catch (err) {
    console.error('⚠️ Error deleting local image file:', err.message);
  }
}

/* -------------------------------------------
   CLOUDINARY STORAGE SETUP WITH RENDER OPTIMIZATIONS
------------------------------------------- */
// Use memory storage and upload directly to Cloudinary
const storage = multer.memoryStorage();

const upload = multer({ 
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // Reduced to 2MB per file for Render stability
    files: 6, // Reduced total files
    fieldSize: 1 * 1024 * 1024, // 1MB field size limit
    fieldNameSize: 100, // Field name size limit
    fields: 50, // Increased to allow all book form fields
    parts: 60 // Increased to allow fields + file parts
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
  { name: "previewImages", maxCount: 4 } // Reduced to 4 for Render stability
]);

// Helper function to destroy orphan Cloudinary assets on upload failure
async function destroyCloudinaryAsset(publicId) {
  if (!publicId) return;
  try {
    const { v2: cloudinaryFresh } = require('cloudinary');
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME_NEW;
    const apiKey = process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY_NEW;
    const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET_NEW;

    cloudinaryFresh.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });

    await cloudinaryFresh.uploader.destroy(publicId);
    console.log(`🗑️ Cleaned up orphan Cloudinary asset: ${publicId}`);
  } catch (err) {
    console.warn(`⚠️ Failed to clean up orphan Cloudinary asset (${publicId}):`, err.message || err);
  }
}

// Helper function to upload buffer to Cloudinary with Render/AWS optimizations
async function uploadToCloudinary(buffer, filename) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME_NEW;
  const apiKey = process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY_NEW;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET_NEW;

  const missingVars = [];
  if (!cloudName) missingVars.push('CLOUDINARY_CLOUD_NAME');
  if (!apiKey) missingVars.push('CLOUDINARY_API_KEY');
  if (!apiSecret) missingVars.push('CLOUDINARY_API_SECRET');

  if (missingVars.length > 0) {
    const safeErrorMsg = `Cloudinary configuration incomplete: ${missingVars.join(', ')} is missing in environment (.env).`;
    console.error(`❌ ${safeErrorMsg}`);
    throw new Error('Image upload service is temporarily unavailable. Please contact the administrator.');
  }

  return new Promise((resolve, reject) => {
    try {
      const { v2: cloudinaryFresh } = require('cloudinary');
      
      cloudinaryFresh.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true
      });

      console.log('🔧 Cloudinary upload attempt:', {
        cloud_name: cloudName,
        api_key: apiKey ? '***' + apiKey.slice(-4) : 'NOT SET',
        filename: filename,
        bufferSize: buffer.length
      });

      const uploadStream = cloudinaryFresh.uploader.upload_stream(
        {
          resource_type: "auto",
          timeout: 20000,
          quality: "auto",
          fetch_format: "auto",
          flags: "progressive",
          transformation: [
            { width: 1000, height: 1500, crop: "limit" }
          ]
        },
        (error, result) => {
          if (error) {
            const errDetail = (error && error.message) ? error.message : (typeof error === 'string' ? error : 'Upload failure');
            console.error('❌ Cloudinary stream callback error:', errDetail);
            return reject(new Error(`Cloudinary upload failed: ${errDetail}`));
          }
          if (!result || !result.secure_url) {
            console.error('❌ Cloudinary upload returned empty secure_url');
            return reject(new Error('Cloudinary upload returned invalid response'));
          }
          console.log('✅ Cloudinary upload success:', result.secure_url);
          resolve({
            url: result.secure_url,
            public_id: result.public_id
          });
        }
      );

      uploadStream.on('error', (streamErr) => {
        const errDetail = (streamErr && streamErr.message) ? streamErr.message : 'Stream failure';
        console.error('❌ Cloudinary stream event error:', errDetail);
        reject(new Error(`Cloudinary stream error: ${errDetail}`));
      });

      uploadStream.end(buffer);
    } catch (error) {
      const errDetail = (error && error.message) ? error.message : 'Cloudinary setup exception';
      console.error('❌ Cloudinary setup error:', errDetail);
      reject(new Error(`Cloudinary setup failed: ${errDetail}`));
    }
  });
}

const jwt = require('jsonwebtoken');

// Helper to check if request is from an authenticated admin
function isAdminRequest(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return false;
    const token = authHeader.split(' ')[1];
    if (!token) return false;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded && decoded.role === 'admin';
  } catch (e) {
    return false;
  }
}

// Helper to recursively strip internal profit/cost fields for public/customer responses
function sanitizeBookForPublic(book, req) {
  if (!book) return book;
  if (isAdminRequest(req)) return book;

  const obj = typeof book.toObject === 'function' ? book.toObject() : { ...book };
  delete obj.profitType;
  delete obj.profitValue;
  delete obj.profitConfigured;
  delete obj.costPrice;
  delete obj.margin;
  delete obj.commissionBase;
  delete obj.unitProfitSnapshot;
  delete obj.lineProfitSnapshot;
  delete obj.orderProfitTotal;
  return obj;
}

/* -------------------------------------------
   GET ALL BOOKS WITH FILTERS + PAGINATION
------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const { category, class: bookClass, subject, author, minPrice, maxPrice, search } = req.query;

    const page = Math.max(1, parseInt(req.query.page || "1"));
    const requestedLimit = req.query.limit ? parseInt(req.query.limit) : null;
    const limit = requestedLimit ? Math.max(1, requestedLimit) : (search ? 50 : 100);
    const skip = (page - 1) * limit;

    const query = {};

    if (category) query.category = category;
    if (bookClass) query.class = bookClass;
    if (subject) query.subject = new RegExp(subject.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
    if (author) query.author = new RegExp(author.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
    if (minPrice) query.price = { ...query.price, $gte: parseFloat(minPrice) };
    if (maxPrice) query.price = { ...query.price, $lte: parseFloat(maxPrice) };

    if (search && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const s = new RegExp(escaped, "i");
      query.$or = [
        { title: s },
        { author: s },
        { description: s },
        { class: s },
        { subject: s },
        { category: s }
      ];
    }

    const [totalCount, books] = await Promise.all([
      Book.countDocuments(query),
      Book.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
    ]);

    const sanitizedBooks = books.map(b => sanitizeBookForPublic(b, req));

    res.json({
      books: sanitizedBooks,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount
    });

  } catch (err) {
    console.error("Error fetching books:", err.message);
    res.json({
      books: [],
      totalPages: 0,
      currentPage: 1,
      totalCount: 0
    });
  }
});

/* -------------------------------------------
   SEARCH BOOKS (DEDICATED SEARCH ENDPOINT)
------------------------------------------- */
router.get("/search", async (req, res) => {
  try {
    const query = (req.query.q || req.query.search || "").trim();
    if (!query) {
      return res.status(400).json({ success: false, error: "Search query is required", count: 0, books: [] });
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");

    // Search title, author, description, subject, class, category
    const books = await Book.find({
      $or: [
        { title: { $regex: regex } },
        { author: { $regex: regex } },
        { description: { $regex: regex } },
        { subject: { $regex: regex } },
        { class: { $regex: regex } },
        { category: { $regex: regex } }
      ]
    }).sort({ createdAt: -1 }).limit(50);

    const sanitizedBooks = books.map(b => sanitizeBookForPublic(b, req));

    res.json({
      success: true,
      count: sanitizedBooks.length,
      totalCount: sanitizedBooks.length,
      books: sanitizedBooks
    });
  } catch (err) {
    console.error("Search API Error:", err);
    res.status(500).json({ success: false, error: "Server error during search", books: [] });
  }
});

/* -------------------------------------------
   GET SINGLE BOOK
------------------------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);

    if (!book) return res.status(404).json({ error: "Book not found" });

    res.json({ book: sanitizeBookForPublic(book, req) });
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
    
    const { title, author, price, description, category, class: bookClass, subject, weight, rewardPoints, cashbackAmount, cashbackPercentage, cover_image, preview_images, trackStock, stockQuantity, lowStockThreshold, stockStatus, profitType, profitValue, profitConfigured } = req.body;

    if (!title || !author || !price) {
      console.log('❌ Missing required fields:', { title: !!title, author: !!author, price: !!price });
      return res.status(400).json({ error: "Missing required fields" });
    }

    const numPrice = Number(price);
    let parsedProfitType = profitType === 'percentage' ? 'percentage' : 'fixed';
    let parsedProfitValue = profitValue !== undefined ? Number(profitValue) : 0;
    let isProfitConfigured = profitConfigured === true || profitConfigured === 'true' || profitValue !== undefined;

    if (isProfitConfigured) {
      if (isNaN(parsedProfitValue) || parsedProfitValue < 0) {
        return res.status(400).json({ error: "Profit value must be a non-negative number" });
      }
      if (parsedProfitType === 'fixed' && parsedProfitValue > numPrice) {
        return res.status(400).json({ error: "Book profit cannot exceed the eligible selling price." });
      }
      if (parsedProfitType === 'percentage' && parsedProfitValue > 100) {
        return res.status(400).json({ error: "Profit percentage must be between 0 and 100." });
      }
    }

    let coverImage = cover_image;
    let previewImages = preview_images || [];
    const newlyUploadedPublicIds = [];

    // Handle file uploads
    if (req.files) {
      console.log('📤 Processing file uploads...');
      
      if (req.files["coverImage"]) {
        console.log('📤 Uploading cover image to Cloudinary...');
        try {
          const resObj = await uploadToCloudinary(
            req.files["coverImage"][0].buffer, 
            req.files["coverImage"][0].originalname
          );
          if (resObj && typeof resObj === 'object' && resObj.url) {
            coverImage = resObj.url;
            if (resObj.public_id) newlyUploadedPublicIds.push(resObj.public_id);
          } else {
            coverImage = resObj;
          }
          console.log('✅ Cover image uploaded:', coverImage);
        } catch (error) {
          const safeMsg = (error && error.message) ? error.message : "Cover image upload failed";
          console.error('❌ Cover image upload failed:', safeMsg);
          return res.status(500).json({ error: "Cover image upload failed", details: safeMsg });
        }
      }
      
      if (req.files["previewImages"]) {
        console.log('📤 Uploading preview images to Cloudinary...');
        try {
          previewImages = [];
          const maxImages = Math.min(req.files["previewImages"].length, 4);
          
          for (let i = 0; i < maxImages; i++) {
            const file = req.files["previewImages"][i];
            console.log(`📤 Uploading preview image ${i + 1}/${maxImages}:`, file.originalname);
            
            try {
              const resObj = await uploadToCloudinary(file.buffer, file.originalname);
              const imgUrl = (resObj && typeof resObj === 'object') ? resObj.url : resObj;
              if (resObj && resObj.public_id) newlyUploadedPublicIds.push(resObj.public_id);
              
              previewImages.push(imgUrl);
              console.log(`✅ Preview image ${i + 1} uploaded:`, imgUrl);
            } catch (imageError) {
              const safeMsg = (imageError && imageError.message) ? imageError.message : `Preview image ${i + 1} upload failed`;
              console.error(`❌ Preview image ${i + 1} upload failed:`, safeMsg);
              for (const pid of newlyUploadedPublicIds) {
                await destroyCloudinaryAsset(pid);
              }
              return res.status(500).json({ error: "Preview image upload failed", details: safeMsg });
            }
          }
          
          console.log('✅ Preview images uploaded:', previewImages.length, 'out of', maxImages);
        } catch (error) {
          const safeMsg = (error && error.message) ? error.message : "Preview images upload failed";
          console.error('❌ Preview images upload failed:', safeMsg);
          for (const pid of newlyUploadedPublicIds) {
            await destroyCloudinaryAsset(pid);
          }
          return res.status(500).json({ error: "Preview images upload failed", details: safeMsg });
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
      rewardPoints: rewardPoints || 0,
      cashbackAmount: cashbackAmount || 0,
      cashbackPercentage: cashbackPercentage || 0,
      trackStock: trackStock === 'true' || trackStock === true,
      stockQuantity: parseInt(stockQuantity) || 10,
      lowStockThreshold: parseInt(lowStockThreshold) || 5,
      stockStatus: stockStatus || 'in_stock',
      profitType: parsedProfitType,
      profitValue: parsedProfitValue,
      profitConfigured: isProfitConfigured
    });

    console.log('✅ Book created successfully:', book._id);
    res.status(201).json({ message: "Book added successfully", book });
  } catch (err) {
    const safeMsg = (err && err.message) ? err.message : "Error adding book";
    console.error("❌ Error adding book:", safeMsg);
    for (const pid of newlyUploadedPublicIds) {
      await destroyCloudinaryAsset(pid);
    }
    res.status(500).json({ error: "Error adding book", details: safeMsg });
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
    book.cashbackAmount = req.body.cashbackAmount !== undefined ? req.body.cashbackAmount : book.cashbackAmount;
    book.cashbackPercentage = req.body.cashbackPercentage !== undefined ? req.body.cashbackPercentage : book.cashbackPercentage;

    // Handle profit fields update & validation
    if (req.body.profitType !== undefined || req.body.profitValue !== undefined || req.body.profitConfigured !== undefined) {
      const targetPrice = req.body.price !== undefined ? Number(req.body.price) : Number(book.price);
      const targetProfitType = req.body.profitType !== undefined ? req.body.profitType : book.profitType;
      const targetProfitValue = req.body.profitValue !== undefined ? Number(req.body.profitValue) : Number(book.profitValue || 0);

      if (isNaN(targetProfitValue) || targetProfitValue < 0) {
        return res.status(400).json({ error: "Profit value must be a non-negative number" });
      }
      if (targetProfitType === 'fixed' && targetProfitValue > targetPrice) {
        return res.status(400).json({ error: "Book profit cannot exceed the eligible selling price." });
      }
      if (targetProfitType === 'percentage' && targetProfitValue > 100) {
        return res.status(400).json({ error: "Profit percentage must be between 0 and 100." });
      }

      book.profitType = targetProfitType === 'percentage' ? 'percentage' : 'fixed';
      book.profitValue = targetProfitValue;
      book.profitConfigured = req.body.profitConfigured !== undefined ? (req.body.profitConfigured === true || req.body.profitConfigured === 'true') : true;
    }

    // Update stock fields
    if (req.body.trackStock !== undefined) {
      console.log('📦 Updating trackStock:', req.body.trackStock);
      book.trackStock = req.body.trackStock === 'true' || req.body.trackStock === true;
    }
    if (req.body.stockQuantity !== undefined) {
      console.log('📦 Updating stockQuantity:', req.body.stockQuantity);
      book.stockQuantity = parseInt(req.body.stockQuantity) || 0;
    }
    if (req.body.lowStockThreshold !== undefined) {
      console.log('📦 Updating lowStockThreshold:', req.body.lowStockThreshold);
      book.lowStockThreshold = parseInt(req.body.lowStockThreshold) || 5;
    }
    if (req.body.stockStatus !== undefined) {
      console.log('📦 Updating stockStatus:', req.body.stockStatus);
      book.stockStatus = req.body.stockStatus;
    }
    
    console.log('📦 Final stock values before save:', {
      trackStock: book.trackStock,
      stockQuantity: book.stockQuantity,
      lowStockThreshold: book.lowStockThreshold,
      stockStatus: book.stockStatus
    });

    const oldCoverImage = book.cover_image;
    const oldPreviewImages = book.preview_images || [];

    const newlyUploadedPublicIds = [];

    // Handle Cover Image update / removal
    if (req.files && req.files["coverImage"]) {
      console.log('📤 Uploading new cover image to Cloudinary...');
      try {
        const resObj = await uploadToCloudinary(
          req.files["coverImage"][0].buffer, 
          req.files["coverImage"][0].originalname
        );
        const newUrl = (resObj && typeof resObj === 'object') ? resObj.url : resObj;
        if (resObj && resObj.public_id) newlyUploadedPublicIds.push(resObj.public_id);

        book.cover_image = newUrl;
        console.log('✅ Cover image updated:', book.cover_image);
        if (oldCoverImage && oldCoverImage !== book.cover_image) {
          safeDeleteLocalImage(oldCoverImage);
        }
      } catch (error) {
        const safeMsg = (error && error.message) ? error.message : "Cover image upload failed";
        console.error('❌ Cover image upload failed:', safeMsg);
        return res.status(500).json({ error: "Cover image upload failed", details: safeMsg });
      }
    } else if (req.body.existingCoverRemoved === 'true' || req.body.existingCoverRemoved === true) {
      console.log('📝 Existing cover image marked for removal');
      book.cover_image = req.body.cover_image || '';
      if (oldCoverImage && oldCoverImage !== book.cover_image) {
        safeDeleteLocalImage(oldCoverImage);
      }
    } else if (req.body.cover_image !== undefined) {
      console.log('📝 Updating cover image from body');
      book.cover_image = req.body.cover_image;
    }

    // Handle Preview Images update / removal
    let retainedPreviewImages = [];
    if (req.body.retainedPreviewImages !== undefined) {
      try {
        retainedPreviewImages = typeof req.body.retainedPreviewImages === 'string'
          ? JSON.parse(req.body.retainedPreviewImages)
          : req.body.retainedPreviewImages;
        if (!Array.isArray(retainedPreviewImages)) retainedPreviewImages = [];
      } catch (e) {
        console.error("Error parsing retainedPreviewImages:", e);
        retainedPreviewImages = book.preview_images || [];
      }
    } else if (req.body.preview_images !== undefined) {
      try {
        retainedPreviewImages = typeof req.body.preview_images === 'string'
          ? JSON.parse(req.body.preview_images)
          : req.body.preview_images;
        if (!Array.isArray(retainedPreviewImages)) retainedPreviewImages = [];
      } catch (e) {
        retainedPreviewImages = book.preview_images || [];
      }
    } else {
      retainedPreviewImages = book.preview_images || [];
    }

    // Identify removed preview images for physical file cleanup if applicable
    const removedPreviewImages = oldPreviewImages.filter(url => !retainedPreviewImages.includes(url));
    removedPreviewImages.forEach(url => safeDeleteLocalImage(url));

    let newlyUploadedPreviewImages = [];
    if (req.files && req.files["previewImages"]) {
      console.log('📤 Uploading new preview images to Cloudinary...');
      try {
        for (let i = 0; i < req.files["previewImages"].length; i++) {
          const file = req.files["previewImages"][i];
          const resObj = await uploadToCloudinary(file.buffer, file.originalname);
          const imgUrl = (resObj && typeof resObj === 'object') ? resObj.url : resObj;
          if (resObj && resObj.public_id) newlyUploadedPublicIds.push(resObj.public_id);
          newlyUploadedPreviewImages.push(imgUrl);
        }
        console.log('✅ New preview images uploaded:', newlyUploadedPreviewImages.length, 'images');
      } catch (error) {
        const safeMsg = (error && error.message) ? error.message : "Preview images upload failed";
        console.error('❌ Preview images upload failed:', safeMsg);
        for (const pid of newlyUploadedPublicIds) {
          await destroyCloudinaryAsset(pid);
        }
        return res.status(500).json({ error: "Preview images upload failed", details: safeMsg });
      }
    }

    book.preview_images = [...retainedPreviewImages, ...newlyUploadedPreviewImages].slice(0, 4);

    console.log('💾 Saving updated book...');
    await book.save();
    console.log('✅ Book updated successfully:', book._id);
    res.json({ message: "Book updated successfully", book });
  } catch (err) {
    const safeMsg = (err && err.message) ? err.message : "Error updating book";
    console.error("❌ Error updating book:", safeMsg);
    res.status(500).json({ error: "Error updating book", details: safeMsg });
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

/* -------------------------------------------
   DIGITAL CONTENT MANAGEMENT ROUTES (ADMIN ONLY) - REMOVED
------------------------------------------- */

// Digital content functionality removed per user request

module.exports = router;
