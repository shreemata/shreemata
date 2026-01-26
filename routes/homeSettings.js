// routes/homeSettings.js
const express = require("express");
const HomeSettings = require("../models/HomeSettings");
const { authenticateToken, isAdmin } = require("../middleware/auth");

const router = express.Router();

// Get home settings (public)
router.get("/", async (req, res) => {
    try {
        const settings = await HomeSettings.getSettings();
        res.json({ success: true, settings });
    } catch (err) {
        console.error("Error fetching home settings:", err);
        res.status(500).json({ error: "Error fetching home settings" });
    }
});

// Update home settings (admin only)
router.put("/", authenticateToken, isAdmin, async (req, res) => {
    try {
        const { showBundles, showFeaturedBooks, bundlesOrder, featuredBooksOrder } = req.body;

        let settings = await HomeSettings.findOne();
        
        if (!settings) {
            settings = await HomeSettings.create({
                showBundles,
                showFeaturedBooks,
                bundlesOrder,
                featuredBooksOrder,
                updatedBy: req.user.id
            });
        } else {
            settings.showBundles = showBundles !== undefined ? showBundles : settings.showBundles;
            settings.showFeaturedBooks = showFeaturedBooks !== undefined ? showFeaturedBooks : settings.showFeaturedBooks;
            settings.bundlesOrder = bundlesOrder !== undefined ? bundlesOrder : settings.bundlesOrder;
            settings.featuredBooksOrder = featuredBooksOrder !== undefined ? featuredBooksOrder : settings.featuredBooksOrder;
            settings.updatedBy = req.user.id;
            
            await settings.save();
        }

        console.log("✅ Home settings updated:", settings);
        res.json({ success: true, message: "Settings updated successfully", settings });
    } catch (err) {
        console.error("Error updating home settings:", err);
        res.status(500).json({ error: "Error updating home settings" });
    }
});

module.exports = router;
