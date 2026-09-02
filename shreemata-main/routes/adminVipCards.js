// routes/adminVipCards.js
const express = require("express");
const router = express.Router();
const VipCard = require("../models/VipCard");
const User = require("../models/User");
const { authenticateToken, isAdmin } = require("../middleware/auth");

// Helper to generate unique 12-digit alphanumeric card number
async function generateUniqueCardNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let cardNumber = '';
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    cardNumber = '';
    for (let i = 0; i < 12; i++) {
      cardNumber += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await VipCard.findOne({ cardNumber });
    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }
  return cardNumber;
}

/* -------------------------------------------
   GET /api/admin/vip-cards
   Fetch all VIP cards with populated user details
--------------------------------------------*/
router.get("/vip-cards", authenticateToken, isAdmin, async (req, res) => {
  try {
    const cards = await VipCard.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 });
    res.json({ cards });
  } catch (err) {
    console.error("Error fetching VIP cards:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   POST /api/admin/vip-cards/issue
   Issue a new VIP card to a user
--------------------------------------------*/
router.post("/vip-cards/issue", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { userId, cardTier, expiryMonths } = req.body;

    if (!userId || !cardTier) {
      return res.status(400).json({ error: "userId and cardTier are required." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const cardNumber = await generateUniqueCardNumber();
    
    // Set default expiry to 1 year (12 months) if not specified
    const months = parseInt(expiryMonths) || 12;
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + months);

    const vipCard = new VipCard({
      cardNumber,
      userId,
      cardTier,
      status: "Active",
      issueDate: new Date(),
      expiryDate
    });

    await vipCard.save();
    
    // Populate user before returning
    await vipCard.populate("userId", "name email");

    res.status(201).json({
      message: "VIP Card issued successfully",
      vipCard
    });
  } catch (err) {
    console.error("Error issuing VIP card:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* -------------------------------------------
   PUT /api/admin/vip-cards/:id/status
   Update the status of a VIP card (e.g. Revoked)
--------------------------------------------*/
router.put("/vip-cards/:id/status", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Active', 'Revoked', 'Expired'].includes(status)) {
      return res.status(400).json({ error: "Invalid status value." });
    }

    const card = await VipCard.findById(id);
    if (!card) {
      return res.status(404).json({ error: "VIP Card not found." });
    }

    card.status = status;
    await card.save();
    await card.populate("userId", "name email");

    res.json({
      message: `VIP Card status updated to ${status}`,
      vipCard: card
    });
  } catch (err) {
    console.error("Error updating VIP card status:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
