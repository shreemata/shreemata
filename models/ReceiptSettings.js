const mongoose = require('mongoose');

const receiptSettingsSchema = new mongoose.Schema({
    settingType: {
        type: String,
        default: 'receipt',
        unique: true
    },
    companyName: {
        type: String,
        default: 'SHREE MATA'
    },
    companyTagline: {
        type: String,
        default: '📚 Premium Educational Store'
    },
    phone: {
        type: String,
        default: '+91-9876543210'
    },
    email: {
        type: String,
        default: 'info@shreemata.com'
    },
    address: {
        type: String,
        default: '123 Book Street, Knowledge City\nDelhi - 110001'
    },
    homeAddress1: {
        type: String,
        default: '123 Book Street'
    },
    homeAddress2: {
        type: String,
        default: ''
    },
    streetName: {
        type: String,
        default: 'Knowledge City'
    },
    landmark: {
        type: String,
        default: ''
    },
    village: {
        type: String,
        default: ''
    },
    taluk: {
        type: String,
        default: ''
    },
    district: {
        type: String,
        default: 'Delhi'
    },
    state: {
        type: String,
        default: 'Delhi'
    },
    pincode: {
        type: String,
        default: '110001'
    },
    gstin: {
        type: String,
        default: '07AAACH7409R1ZZ'
    },
    footerMessage: {
        type: String,
        default: '⭐ Thank you for shopping with us! ⭐'
    },
    contactFooter: {
        type: String,
        default: 'For any queries, contact us at:\n📞 +91-9876543210 | 📧 support@shreemata.com'
    },
    website: {
        type: String,
        default: 'www.shreemata.com'
    },
    disclaimer: {
        type: String,
        default: 'This is a computer generated receipt'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ReceiptSettings', receiptSettingsSchema);