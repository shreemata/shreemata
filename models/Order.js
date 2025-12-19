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
        city: String,
        state: String,
        pincode: String,
        phone: String
    },

    // ORIGINAL STATUS (PAYMENT + ORDER)
    status: {
        type: String,
        enum: ["pending", "completed", "cancelled", "failed"],
        default: "pending"
    },

    // Delivery Tracking
    deliveryStatus: {
        type: String,
        enum: ["pending", "processing", "shipped", "delivered"],
        default: "pending"
    },
    trackingInfo: {
        type: String,
        default: ""
    },

    razorpay_order_id: { type: String },
    razorpay_payment_id: { type: String },

    // Prevent duplicate referral rewards
    rewardApplied: { type: Boolean, default: false }

}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);
