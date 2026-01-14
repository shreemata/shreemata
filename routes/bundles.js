// routes/bundles.js
const express = require("express");
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const Bundle = require("../models/Bundle");
const Book = require("../models/Book");
const { authenticateToken, isAdmin } = require("../middleware/auth");

const router = express.Router();

// Multer setup for image uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB per file
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Helper function to upload buffer to Cloudinary
async function uploadToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
    try {
      const { v2: cloudinaryFresh } = require('cloudinary');
      
      cloudinaryFresh.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME_NEW || process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY_NEW || process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET_NEW || process.env.CLOUDINARY_API_SECRET,
        secure: true
      });

      const uploadStream = cloudinaryFresh.uploader.upload_stream(
        {
          resource_type: "image",
          folder: "bundles",
          public_id: `bundle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          transformation: [
            { width: 800, height: 600, crop: "limit" },
            { quality: "auto:good" },
            { format: "auto" }
          ]
        },
        (error, result) => {
          if (error) {
            console.error('Cloudinary upload error:', error);
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      );

      uploadStream.end(buffer);
    } catch (error) {
      console.error('Upload setup error:', error);
      reject(error);
    }
  });
}

// =====================================================
// PUBLIC ROUTES
// =====================================================

/**
 * GET ALL ACTIVE BUNDLES (for users)
 */
router.get("/", async (req, res) => {
    try {
        const bundles = await Bundle.find({ 
            isActive: true,
            $or: [
                { validUntil: { $gte: new Date() } },
                { validUntil: null }
            ]
        })
        .populate("books", "title author cover_image price weight")
        .sort({ createdAt: -1 });

        res.json({ bundles });
    } catch (err) {
        console.error("Fetch bundles error:", err);
        res.status(500).json({ error: "Error fetching bundles" });
    }
});

/**
 * GET SINGLE BUNDLE BY ID
 */
router.get("/:id", async (req, res) => {
    try {
        const bundle = await Bundle.findById(req.params.id)
            .populate("books", "title author cover_image price description weight");

        if (!bundle) {
            return res.status(404).json({ error: "Bundle not found" });
        }

        res.json({ bundle });
    } catch (err) {
        console.error("Fetch bundle error:", err);
        res.status(500).json({ error: "Error fetching bundle" });
    }
});

// =====================================================
// IMAGE UPLOAD ROUTE
// =====================================================

/**
 * TEST ENDPOINT - Check if bundles admin routes are working
 */
router.get("/admin/test", authenticateToken, isAdmin, (req, res) => {
    console.log('🔍 Bundle admin test endpoint hit!');
    res.json({ message: "Bundle admin routes are working!" });
});

/**
 * UPLOAD BUNDLE IMAGE (Admin only)
 */
router.post("/admin/upload-image", authenticateToken, isAdmin, upload.single('image'), async (req, res) => {
    console.log('🔍 Bundle image upload endpoint hit!');
    console.log('📁 Request file:', req.file ? 'File received' : 'No file');
    
    try {
        if (!req.file) {
            console.log('❌ No file provided in request');
            return res.status(400).json({ error: "No image file provided" });
        }

        console.log('📤 Uploading bundle image to Cloudinary...');
        console.log('📄 File details:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size
        });
        
        const imageUrl = await uploadToCloudinary(req.file.buffer, req.file.originalname);
        console.log('✅ Bundle image uploaded:', imageUrl);

        res.json({ 
            message: "Image uploaded successfully",
            url: imageUrl 
        });

    } catch (err) {
        console.error("Bundle image upload error:", err);
        res.status(500).json({ error: "Error uploading image: " + err.message });
    }
});

// =====================================================
// ADMIN ROUTES
// =====================================================

/**
 * CREATE NEW BUNDLE (Admin only)
 */
router.post("/admin/create", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { name, description, bookIds, bundlePrice, courierCharge, image, validUntil, rewardPoints, cashbackAmount, cashbackPercentage } = req.body;

        if (!name || !bookIds || bookIds.length < 1) {
            return res.status(400).json({ 
                error: "Bundle must have a name and at least 1 book" 
            });
        }

        // Fetch books to calculate original price and weight
        const books = await Book.find({ _id: { $in: bookIds } });
        
        if (books.length !== bookIds.length) {
            return res.status(400).json({ error: "Some books not found" });
        }

        console.log("=== Bundle Creation - Weight Calculation ===");
        console.log("Number of books:", books.length);
        books.forEach((book, index) => {
            console.log(`Book ${index + 1}: ${book.title} - Weight: ${book.weight || 0.5} kg`);
        });

        const originalPrice = books.reduce((sum, book) => sum + book.price, 0);
        const totalWeight = books.reduce((sum, book) => sum + (book.weight || 0.5), 0);

        console.log("Total Weight Calculated:", totalWeight, "kg");
        console.log("==========================================");

        if (bundlePrice >= originalPrice) {
            return res.status(400).json({ 
                error: "Bundle price must be less than original price" 
            });
        }

        const bundle = await Bundle.create({
            name,
            description,
            books: bookIds,
            originalPrice,
            bundlePrice,
            weight: totalWeight,
            courierCharge: courierCharge || 0,
            image,
            validUntil: validUntil || null,
            rewardPoints: rewardPoints || 0,
            cashbackAmount: cashbackAmount || 0,
            cashbackPercentage: cashbackPercentage || 0
        });

        const populatedBundle = await Bundle.findById(bundle._id)
            .populate("books", "title author cover_image price weight");

        res.json({ 
            message: "Bundle created successfully", 
            bundle: populatedBundle 
        });

    } catch (err) {
        console.error("Create bundle error:", err);
        res.status(500).json({ error: "Error creating bundle" });
    }
});

/**
 * GET ALL BUNDLES (Admin - including inactive)
 */
router.get("/admin/all", authenticateToken, isAdmin, async (req, res) => {
    try {
        const bundles = await Bundle.find()
            .populate("books", "title author cover_image price weight")
            .sort({ createdAt: -1 });

        res.json({ bundles });
    } catch (err) {
        console.error("Fetch all bundles error:", err);
        res.status(500).json({ error: "Error fetching bundles" });
    }
});

/**
 * UPDATE BUNDLE (Admin only)
 */
router.put("/admin/update/:id", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { name, description, bookIds, bundlePrice, courierCharge, image, validUntil, isActive, rewardPoints, cashbackAmount, cashbackPercentage } = req.body;

        const bundle = await Bundle.findById(req.params.id);
        if (!bundle) {
            return res.status(404).json({ error: "Bundle not found" });
        }

        // Update fields
        if (name) bundle.name = name;
        if (description !== undefined) bundle.description = description;
        if (image) bundle.image = image;
        if (courierCharge !== undefined) bundle.courierCharge = courierCharge;
        if (validUntil !== undefined) bundle.validUntil = validUntil;
        if (isActive !== undefined) bundle.isActive = isActive;
        if (rewardPoints !== undefined) bundle.rewardPoints = rewardPoints;
        if (cashbackAmount !== undefined) bundle.cashbackAmount = cashbackAmount;
        if (cashbackPercentage !== undefined) bundle.cashbackPercentage = cashbackPercentage;

        // If books changed, recalculate original price and weight
        if (bookIds && bookIds.length >= 1) {
            const books = await Book.find({ _id: { $in: bookIds } });
            if (books.length !== bookIds.length) {
                return res.status(400).json({ error: "Some books not found" });
            }
            bundle.books = bookIds;
            bundle.originalPrice = books.reduce((sum, book) => sum + book.price, 0);
            bundle.weight = books.reduce((sum, book) => sum + (book.weight || 0.5), 0);
        }

        // Update bundle price
        if (bundlePrice) {
            if (bundlePrice >= bundle.originalPrice) {
                return res.status(400).json({ 
                    error: "Bundle price must be less than original price" 
                });
            }
            bundle.bundlePrice = bundlePrice;
        }

        await bundle.save();

        const updatedBundle = await Bundle.findById(bundle._id)
            .populate("books", "title author cover_image price weight");

        res.json({ 
            message: "Bundle updated successfully", 
            bundle: updatedBundle 
        });

    } catch (err) {
        console.error("Update bundle error:", err);
        res.status(500).json({ error: "Error updating bundle" });
    }
});

/**
 * DELETE BUNDLE (Admin only)
 */
router.delete("/admin/delete/:id", authenticateToken, isAdmin, async (req, res) => {
    try {
        const bundle = await Bundle.findByIdAndDelete(req.params.id);

        if (!bundle) {
            return res.status(404).json({ error: "Bundle not found" });
        }

        res.json({ message: "Bundle deleted successfully" });

    } catch (err) {
        console.error("Delete bundle error:", err);
        res.status(500).json({ error: "Error deleting bundle" });
    }
});

/**
 * TOGGLE BUNDLE ACTIVE STATUS (Admin only)
 */
router.patch("/admin/toggle/:id", authenticateToken, isAdmin, async (req, res) => {
    try {
        const bundle = await Bundle.findById(req.params.id);

        if (!bundle) {
            return res.status(404).json({ error: "Bundle not found" });
        }

        bundle.isActive = !bundle.isActive;
        await bundle.save();

        res.json({ 
            message: `Bundle ${bundle.isActive ? 'activated' : 'deactivated'}`,
            bundle 
        });

    } catch (err) {
        console.error("Toggle bundle error:", err);
        res.status(500).json({ error: "Error toggling bundle status" });
    }
});

module.exports = router;
