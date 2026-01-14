// models/HomeSettings.js
const mongoose = require("mongoose");

const homeSettingsSchema = new mongoose.Schema({
    // Section visibility settings
    showBundles: { 
        type: Boolean, 
        default: true 
    },
    showFeaturedBooks: { 
        type: Boolean, 
        default: true 
    },
    
    // Section order (1 = first, 2 = second)
    bundlesOrder: {
        type: Number,
        default: 1
    },
    featuredBooksOrder: {
        type: Number,
        default: 2
    },
    
    // Last updated
    updatedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User" 
    }
}, { timestamps: true });

// Ensure only one settings document exists
homeSettingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({
            showBundles: true,
            showFeaturedBooks: true,
            bundlesOrder: 1,
            featuredBooksOrder: 2
        });
    }
    return settings;
};

module.exports = mongoose.model("HomeSettings", homeSettingsSchema);
