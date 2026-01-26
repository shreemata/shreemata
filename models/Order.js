// models/Order.js
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({

    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    items: [{
        id: { type: String, required: true },
        title: { type: String, required: true },
        author: { type: String, default: "Unknown" },
        price: { type: Number, required: true },
        quantity: { type: Number, default: 1 },
        coverImage: { type: String, default: "" },
        type: { type: String, default: "book" }
    }],

    totalAmount: Number,

    // Courier Charges
    courierCharge: { type: Number, default: 0 },
    totalWeight: { type: Number, default: 0 },
    
    // Delivery Method
    deliveryMethod: { 
        type: String, 
        enum: ["home", "pickup", "courier"], 
        default: "home" 
    },

    // Applied Offer Details
    appliedOffer: {
        offerId: { type: mongoose.Schema.Types.ObjectId, ref: "Notification" },
        offerTitle: String,
        discountType: String, // "percentage" or "fixed"
        discountValue: Number, // percentage or fixed amount
        originalAmount: Number,
        discountedAmount: Number,
        savings: Number
    },

    // Delivery Address
    deliveryAddress: {
        street: String,
        taluk: String,
        district: String,
        state: String,
        pincode: String,
        phone: String
    },

    // ORIGINAL STATUS (PAYMENT + ORDER)
    status: {
        type: String,
        enum: ["pending", "completed", "cancelled", "failed", "pending_payment_verification"],
        default: "pending"
    },

    // Delivery Tracking
    deliveryStatus: {
        type: String,
        enum: ["pending", "processing", "shipped", "delivered"],
        default: "pending"
    },
    trackingInfo: {
        trackingWebsite: { type: String, default: "" },
        trackingId: { type: String, default: "" },
        trackingUrl: { type: String, default: "" }, // Full tracking URL
        updatedAt: { type: Date, default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    },

    razorpay_order_id: { type: String },
    razorpay_payment_id: { type: String },

    // Payment Type and Details (for cheque/bank transfer)
    paymentType: { 
        type: String, 
        enum: ["online", "check", "cheque", "transfer"], 
        default: "online" 
    },
    paymentDetails: {
        type: { type: String }, // 'check', 'cheque' or 'transfer'
        status: { 
            type: String, 
            enum: ["awaiting_upload", "awaiting_utr", "pending_verification", "verified", "rejected"],
            default: "awaiting_upload"
        },
        utrNumber: { type: String, default: "" },
        checkNumber: { type: String, default: "" },
        transferNumber: { type: String, default: "" }, // For bank transfers
        bankName: { type: String, default: "" },
        checkDate: { type: Date },
        transferDate: { type: Date },
        accountNumber: { type: String, default: "" }, // For bank transfers
        ifscCode: { type: String, default: "" }, // For bank transfers
        googleFormSubmissionId: { type: String, default: "" },
        
        // Image fields for check/transfer uploads
        checkImageUrl: { type: String, default: "" },
        checkImageDriveId: { type: String, default: "" },
        transferReceiptUrl: { type: String, default: "" }, // For bank transfer receipts
        transferReceiptDriveId: { type: String, default: "" }, // For bank transfer receipts
        driveFileIds: [{ type: String }], // Array of Google Drive file IDs
        
        adminNotes: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
    },

    // Prevent duplicate referral rewards
    rewardApplied: { type: Boolean, default: false },

    // Google Form submission data (for check/transfer payments)
    allResponses: { type: mongoose.Schema.Types.Mixed, default: {} }

}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);
