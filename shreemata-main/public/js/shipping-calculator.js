/**
 * Shipping Calculator Utility
 * Calculates shipping costs based on weight and order value
 */

class ShippingCalculator {
    constructor() {
        this.settings = {
            baseShippingCharge: 50,
            shippingRatePerKg: 25,
            freeShippingThreshold: 500
        };
        this.loadShippingSettings();
    }

    /**
     * Load shipping settings from API
     */
    async loadShippingSettings() {
        try {
            const response = await fetch(`${API_URL}/shipping-settings`);
            if (response.ok) {
                const data = await response.json();
                if (data.shippingSettings) {
                    this.settings = {
                        baseShippingCharge: data.shippingSettings.baseShippingCharge !== undefined ? data.shippingSettings.baseShippingCharge : 50,
                        shippingRatePerKg: data.shippingSettings.shippingRatePerKg !== undefined ? data.shippingSettings.shippingRatePerKg : 25,
                        freeShippingThreshold: data.shippingSettings.freeShippingThreshold !== undefined ? data.shippingSettings.freeShippingThreshold : 500
                    };
                    console.log('📦 Shipping settings loaded:', this.settings);
                }
            }
        } catch (error) {
            console.error('Error loading shipping settings:', error);
            // Use default settings if API fails
        }
    }

    /**
     * Calculate shipping cost for an order
     * @param {number} totalWeight - Total weight in kg
     * @param {number} orderValue - Total order value in rupees
     * @returns {Object} Shipping calculation details
     */
    calculateShipping(totalWeight, orderValue) {
        if (!totalWeight || totalWeight <= 0) {
            return {
                cost: 0,
                isFree: false,
                breakdown: { baseCharge: 0, weightCharge: 0, totalWeight: 0, ratePerKg: 25, calculation: '₹0' }
            };
        }
        const normalizedWeight = Math.round(Number(totalWeight) * 1000) / 1000;
        const cost = 25 * Math.max(1, Math.ceil(normalizedWeight));
        return {
            cost: cost,
            isFree: false,
            breakdown: {
                baseCharge: 25,
                weightCharge: cost,
                totalWeight: totalWeight,
                ratePerKg: 25,
                calculation: `₹25 per started kg = ₹${cost}`
            }
        };
    }

    /**
     * Calculate shipping for cart items
     * @param {Array} cartItems - Array of cart items with weight and price
     * @returns {Object} Shipping calculation for entire cart
     */
    calculateCartShipping(cartItems) {
        if (!cartItems || cartItems.length === 0) {
            return { cost: 0, isFree: false, breakdown: { reason: 'No items in cart' } };
        }

        let totalWeight = 0;
        let totalValue = 0;

        cartItems.forEach(item => {
            const weight = parseFloat(item.weight || 0.5); // Default 0.5kg if not specified
            const price = parseFloat(item.price || 0);
            const quantity = parseInt(item.quantity || 1);

            totalWeight += weight * quantity;
            totalValue += price * quantity;
        });

        return this.calculateShipping(totalWeight, totalValue);
    }

    /**
     * Get shipping settings for display
     * @returns {Object} Current shipping settings
     */
    getSettings() {
        return { ...this.settings };
    }

    /**
     * Format shipping cost for display
     * @param {number} cost - Shipping cost
     * @returns {string} Formatted cost string
     */
    formatCost(cost) {
        if (cost === 0) return 'FREE';
        return `₹${cost.toFixed(2)}`;
    }

    /**
     * Get shipping info text for display
     * @param {Object} shippingResult - Result from calculateShipping
     * @returns {string} Human-readable shipping info
     */
    getShippingInfo(shippingResult) {
        if (shippingResult.isFree) {
            return `🚚 FREE Shipping - ${shippingResult.breakdown.reason}`;
        }

        const { breakdown } = shippingResult;
        return `🚚 Shipping: ${this.formatCost(shippingResult.cost)} (${breakdown.calculation})`;
    }
}

// Create global instance
window.shippingCalculator = new ShippingCalculator();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShippingCalculator;
}