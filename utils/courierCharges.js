// utils/courierCharges.js
// Courier charge calculation utility

/**
 * Calculate courier charges based on total weight
 * Rules:
 * - 0 to 1 kg = ₹25
 * - 1.1 to 2 kg = ₹50
 * - 2.1 to 3 kg = ₹75
 * - Pattern continues (+₹25 per kg)
 * - Max ₹100 per order
 * 
 * @param {number} totalWeight - Total weight in kg
 * @returns {number} - Courier charge in rupees
 */
function calculateCourierCharge(totalWeight) {
    if (totalWeight <= 0) return 0;
    
    // Calculate charge: ₹25 per kg (rounded up)
    const charge = Math.ceil(totalWeight) * 25;
    
    // Cap at ₹100
    return Math.min(charge, 100);
}

/**
 * Calculate total weight from cart items
 * @param {Array} items - Cart items with book/bundle data
 * @returns {number} - Total weight in kg
 */
function calculateTotalWeight(items) {
    return items.reduce((total, item) => {
        const weight = item.weight || 0.5; // Default 0.5kg if not specified
        return total + (weight * item.quantity);
    }, 0);
}

/**
 * Split order if courier charge exceeds ₹100
 * @param {Array} items - Cart items
 * @returns {Array} - Array of order groups
 */
function splitOrderByWeight(items) {
    const MAX_CHARGE = 100;
    const MAX_WEIGHT = 4; // 4kg = ₹100
    
    const orders = [];
    let currentOrder = [];
    let currentWeight = 0;
    
    for (const item of items) {
        const itemWeight = (item.weight || 0.5) * item.quantity;
        
        // If adding this item exceeds max weight, start new order
        if (currentWeight + itemWeight > MAX_WEIGHT && currentOrder.length > 0) {
            orders.push({
                items: currentOrder,
                weight: currentWeight,
                courierCharge: calculateCourierCharge(currentWeight)
            });
            currentOrder = [];
            currentWeight = 0;
        }
        
        // If single item exceeds max weight, split quantity
        if (itemWeight > MAX_WEIGHT) {
            const maxQtyPerOrder = Math.floor(MAX_WEIGHT / (item.weight || 0.5));
            let remainingQty = item.quantity;
            
            while (remainingQty > 0) {
                const qtyForThisOrder = Math.min(remainingQty, maxQtyPerOrder);
                const weightForThisOrder = (item.weight || 0.5) * qtyForThisOrder;
                
                orders.push({
                    items: [{ ...item, quantity: qtyForThisOrder }],
                    weight: weightForThisOrder,
                    courierCharge: calculateCourierCharge(weightForThisOrder)
                });
                
                remainingQty -= qtyForThisOrder;
            }
        } else {
            currentOrder.push(item);
            currentWeight += itemWeight;
        }
    }
    
    // Add remaining items
    if (currentOrder.length > 0) {
        orders.push({
            items: currentOrder,
            weight: currentWeight,
            courierCharge: calculateCourierCharge(currentWeight)
        });
    }
    
    return orders;
}

module.exports = {
    calculateCourierCharge,
    calculateTotalWeight,
    splitOrderByWeight
};
