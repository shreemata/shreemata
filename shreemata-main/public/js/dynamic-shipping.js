/**
 * Dynamic Shipping Calculator
 * Fetches shipping rates from admin settings and calculates charges
 */

class DynamicShippingCalculator {
    constructor() {
        this.shippingRates = null;
        this.lastFetch = 0;
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
    }

    /**
     * Fetch shipping settings from server
     */
    async fetchShippingSettings() {
        const now = Date.now();
        
        // Use cache if available and not expired
        if (this.shippingRates && (now - this.lastFetch) < this.cacheTimeout) {
            return this.shippingRates;
        }

        try {
            const API_URL = window.API_URL || '';
            const response = await fetch(`${API_URL}/shipping-settings`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch shipping settings');
            }
            
            const data = await response.json();
            this.shippingRates = data.shippingSettings.shippingRates;
            this.lastFetch = now;
            
            console.log('📦 Shipping rates loaded:', this.shippingRates);
            return this.shippingRates;
            
        } catch (error) {
            console.error('Error fetching shipping settings:', error);
            
            // Fallback to default rates
            this.shippingRates = [
                { minWeight: 0, maxWeight: 0.99, rate: 25 },
                { minWeight: 1, maxWeight: 1.99, rate: 35 },
                { minWeight: 2, maxWeight: 2.99, rate: 45 },
                { minWeight: 3, maxWeight: 4.99, rate: 55 },
                { minWeight: 5, maxWeight: 9.99, rate: 75 }
            ];
            
            return this.shippingRates;
        }
    }

    /**
     * Calculate shipping charge for given weight
     * Rule: ₹25 per started kg of total order weight, minimum ₹25
     * @param {number} weight - Total weight in kg
     * @returns {Promise<number>} - Shipping charge in rupees
     */
    async calculateShippingCharge(weight) {
        if (!weight || weight <= 0) return 0;
        const normalizedWeight = Math.round(Number(weight) * 1000) / 1000;
        return 25 * Math.max(1, Math.ceil(normalizedWeight));
    }

    /**
     * Calculate shipping for cart items
     * @param {Array} cartItems - Array of cart items with weight
     * @returns {Promise<Object>} - Shipping calculation result
     */
    async calculateCartShipping(cartItems) {
        const totalWeight = cartItems.reduce((sum, item) => {
            const itemWeight = item.weight || 0.5; // Default 0.5kg per item
            return sum + (itemWeight * item.quantity);
        }, 0);

        const shippingCost = await this.calculateShippingCharge(totalWeight);

        return {
            totalWeight: totalWeight,
            shippingCost: shippingCost,
            breakdown: `${totalWeight.toFixed(2)}kg = ₹${shippingCost.toFixed(2)}`
        };
    }

    /**
     * Get shipping rates for display (admin interface)
     * @returns {Promise<Array>} - Array of shipping rate objects
     */
    async getShippingRates() {
        return await this.fetchShippingSettings();
    }
}

// Create global instance
window.dynamicShipping = new DynamicShippingCalculator();

// Global function for backward compatibility
window.calculateCourierCharge = async function(weight) {
    return await window.dynamicShipping.calculateShippingCharge(weight);
};

console.log('📦 Dynamic Shipping Calculator loaded');