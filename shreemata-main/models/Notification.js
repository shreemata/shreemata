const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
        type: String, 
        enum: ["offer", "discount", "announcement", "update"],
        default: "announcement"
    },
    isActive: { type: Boolean, default: true },
    validUntil: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Offer details for threshold-based discounts
    offerDetails: {
        minAmount: { type: Number }, // e.g., 550
        discountType: { 
            type: String, 
            enum: ["fixed", "percentage"],
            default: "percentage"
        },
        discountValue: { type: Number } // percentage (e.g., 20) or fixed amount (e.g., 100)
    }
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
