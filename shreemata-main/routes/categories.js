// routes/categories.js
const express = require("express");
const router = express.Router();
const Category = require("../models/Category");
const { authenticateToken, isAdmin } = require("../middleware/auth");

// Get all categories
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json({ categories });
  } catch (error) {
    res.status(500).json({ error: "Error loading categories" });
  }
});

// Add new category
router.post("/", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) return res.status(400).json({ error: "Category name required" });

    const slug = name.toLowerCase().replace(/\s+/g, "-");

    const exists = await Category.findOne({ slug });
    if (exists) return res.status(400).json({ error: "Category already exists" });

    const category = await Category.create({ name, slug });

    res.json({ message: "Category added", category });
  } catch (err) {
    res.status(500).json({ error: "Error adding category" });
  }
});

module.exports = router;
