const express = require('express');
const router = express.Router();
const ReceiptSettings = require('../models/ReceiptSettings');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// Get receipt settings
router.get('/admin/receipt-settings', authenticateToken, isAdmin, async (req, res) => {
    try {
        let settings = await ReceiptSettings.findOne({ settingType: 'receipt' });
        
        // Create default settings if none exist
        if (!settings) {
            settings = new ReceiptSettings({ settingType: 'receipt' });
            await settings.save();
        }
        
        res.json({
            success: true,
            settings: settings
        });
    } catch (error) {
        console.error('Error fetching receipt settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch receipt settings'
        });
    }
});

// Update receipt settings
router.put('/admin/receipt-settings', authenticateToken, isAdmin, async (req, res) => {
    try {
        const {
            companyName,
            companyTagline,
            phone,
            email,
            address,
            homeAddress1,
            homeAddress2,
            streetName,
            landmark,
            village,
            taluk,
            district,
            state,
            pincode,
            gstin,
            footerMessage,
            contactFooter,
            website,
            disclaimer
        } = req.body;

        // Validation
        if (!companyName || !phone || !email) {
            return res.status(400).json({
                success: false,
                message: 'Company name, phone, and email are required'
            });
        }

        let settings = await ReceiptSettings.findOne({ settingType: 'receipt' });
        
        if (!settings) {
            settings = new ReceiptSettings({ settingType: 'receipt' });
        }

        // Update settings
        settings.companyName = companyName;
        settings.companyTagline = companyTagline;
        settings.phone = phone;
        settings.email = email;
        settings.address = address;
        settings.homeAddress1 = homeAddress1;
        settings.homeAddress2 = homeAddress2;
        settings.streetName = streetName;
        settings.landmark = landmark;
        settings.village = village;
        settings.taluk = taluk;
        settings.district = district;
        settings.state = state;
        settings.pincode = pincode;
        settings.gstin = gstin;
        settings.footerMessage = footerMessage;
        settings.contactFooter = contactFooter;
        settings.website = website;
        settings.disclaimer = disclaimer;

        await settings.save();

        res.json({
            success: true,
            message: 'Receipt settings updated successfully',
            settings: settings
        });
    } catch (error) {
        console.error('Error updating receipt settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update receipt settings'
        });
    }
});

// Get receipt settings for public use (for generating receipts)
router.get('/receipt-settings', async (req, res) => {
    try {
        let settings = await ReceiptSettings.findOne({ settingType: 'receipt' });
        
        // Create default settings if none exist
        if (!settings) {
            settings = new ReceiptSettings({ settingType: 'receipt' });
            await settings.save();
        }
        
        res.json({
            success: true,
            settings: settings
        });
    } catch (error) {
        console.error('Error fetching receipt settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch receipt settings'
        });
    }
});

module.exports = router;