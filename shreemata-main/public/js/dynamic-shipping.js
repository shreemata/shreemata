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
     * @param {number} weight - Total weight in kg
     * @returns {Promise<number>} - Shipping charge in rupees
     */
    async calculateShippingCharge(weight) {
        if (weight <= 0) return 0;

        const rates = await this.fetchShippingSettings();
        
        // Find matching weight range
        for (const rate of rates) {
            if (weight >= rate.minWeight && weight <= rate.maxWeight) {
                console.log(`📦 Weight ${weight}kg matches range ${rate.minWeight}-${rate.maxWeight}kg = ₹${rate.rate}`);
                return rate.rate;
            }
        }
        
        // If no exact match, find the highest range that the weight exceeds
        const applicableRates = rates.filter(rate => weight > rate.maxWeight);
        if (applicableRates.length > 0) {
            const highestRate = applicableRates[applicableRates.length - 1];
            console.log(`📦 Weight ${weight}kg exceeds all ranges, using highest rate: ₹${highestRate.rate}`);
            return highestRate.rate;
        }
        
        // Fallback to first rate if weight is below all ranges
        const fallbackRate = rates[0]?.rate || 25;
        console.log(`📦 Weight ${weight}kg below all ranges, using fallback rate: ₹${fallbackRate}`);
        return fallbackRate;
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