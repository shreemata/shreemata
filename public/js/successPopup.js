/**
 * Success Confirmation Popup
 * Shows a beautiful confirmation card after successful payment
 */

/**
 * Success Confirmation Popup
 * Shows a beautiful confirmation card after successful payment
 */

console.log("✅ successPopup.js loaded successfully");

function showSuccessPopup(orderData) {
    console.log("🎉 showSuccessPopup called with data:", orderData);
    
    // Remove any existing popup first
    const existingModal = document.getElementById('successPopupModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'successPopupModal';
    modal.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(0, 0, 0, 0.8) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 20px !important;
        animation: fadeIn 0.3s ease !important;
        visibility: visible !important;
        opacity: 1 !important;
        box-sizing: border-box !important;
    `;

    // Create success card
    const card = document.createElement('div');
    card.style.cssText = `
        background: white !important;
        border-radius: 20px !important;
        padding: 40px 30px !important;
        max-width: 500px !important;
        width: 90% !important;
        text-align: center !important;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5) !important;
        animation: slideUp 0.4s ease !important;
        position: relative !important;
        z-index: 2147483648 !important;
        visibility: visible !important;
        opacity: 1 !important;
        display: block !important;
        box-sizing: border-box !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    `;

    // Success animation styles
    const style = document.createElement('style');
    style.id = 'successPopupStyles';
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateY(30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        @keyframes checkmark {
            0% { transform: scale(0); }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); }
        }
        .success-checkmark {
            width: 80px !important;
            height: 80px !important;
            border-radius: 50% !important;
            background: linear-gradient(135deg, #28a745, #20c997) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 auto 20px !important;
            animation: checkmark 0.6s ease 0.2s both !important;
        }
        .success-checkmark::before {
            content: '✓' !important;
            color: white !important;
            font-size: 40px !important;
            font-weight: bold !important;
        }
        .success-title {
            font-size: 28px !important;
            font-weight: 700 !important;
            color: #28a745 !important;
            margin: 0 0 10px 0 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        }
        .success-subtitle {
            font-size: 16px !important;
            color: #666 !important;
            margin: 0 0 25px 0 !important;
            line-height: 1.5 !important;
        }
        .order-details {
            background: #f8f9fa !important;
            border-radius: 12px !important;
            padding: 20px !important;
            margin: 25px 0 !important;
            text-align: left !important;
        }
        .order-row {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin: 8px 0 !important;
            font-size: 14px !important;
        }
        .order-row.total {
            border-top: 2px solid #dee2e6 !important;
            padding-top: 12px !important;
            margin-top: 15px !important;
            font-weight: 700 !important;
            font-size: 16px !important;
            color: #28a745 !important;
        }
        .success-buttons {
            display: flex !important;
            gap: 12px !important;
            margin-top: 30px !important;
        }
        .btn-success {
            flex: 1 !important;
            padding: 12px 20px !important;
            border: none !important;
            border-radius: 10px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.3s ease !important;
            font-size: 14px !important;
        }
        .btn-primary-success {
            background: linear-gradient(135deg, #667eea, #764ba2) !important;
            color: white !important;
        }
        .btn-primary-success:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4) !important;
        }
        .btn-secondary-success {
            background: #f8f9fa !important;
            color: #666 !important;
            border: 2px solid #e9ecef !important;
        }
        .btn-secondary-success:hover {
            background: #e9ecef !important;
            transform: translateY(-1px) !important;
        }
        @media (max-width: 600px) {
            .success-buttons {
                flex-direction: column !important;
            }
        }
    `;
    
    // Remove existing styles first
    const existingStyles = document.getElementById('successPopupStyles');
    if (existingStyles) {
        existingStyles.remove();
    }
    document.head.appendChild(style);

    // Build order details
    let orderDetailsHTML = '';
    if (orderData) {
        orderDetailsHTML = `
            <div class="order-details">
                <div style="font-weight: 600; color: #333; margin-bottom: 15px; text-align: center;">📋 Order Summary</div>
                ${orderData.orderId ? `<div class="order-row"><span>Order ID:</span><span style="font-family: monospace; font-weight: 600;">#${orderData.orderId.slice(-8)}</span></div>` : ''}
                ${orderData.items ? `<div class="order-row"><span>Items:</span><span>${orderData.items} item${orderData.items > 1 ? 's' : ''}</span></div>` : ''}
                ${orderData.deliveryMethod ? `<div class="order-row"><span>Delivery:</span><span>${orderData.deliveryMethod}</span></div>` : ''}
                ${orderData.paymentMethod ? `<div class="order-row"><span>Payment:</span><span>${orderData.paymentMethod}</span></div>` : ''}
                <div class="order-row total">
                    <span>Total Paid:</span>
                    <span>₹${orderData.amount || '0'}</span>
                </div>
            </div>
        `;
    }

    // Build card content
    card.innerHTML = `
        <div class="success-checkmark"></div>
        <h2 class="success-title">🎉 Order Confirmed!</h2>
        <p class="success-subtitle">Your payment has been processed successfully and your order has been placed. You'll receive a confirmation email shortly.</p>
        
        ${orderDetailsHTML}
        
        <div class="success-buttons">
            <button class="btn-success btn-secondary-success" onclick="closeSuccessPopup()">
                Continue Shopping
            </button>
            <button class="btn-success btn-primary-success" onclick="viewMyOrders()">
                View My Orders
            </button>
        </div>
    `;

    modal.appendChild(card);
    document.body.appendChild(modal);

    // Store modal reference for cleanup
    window.currentSuccessModal = modal;

    console.log("✅ Success popup created and added to DOM");
    console.log("Modal element:", modal);
    console.log("Modal in DOM:", document.getElementById('successPopupModal'));
    
    // Force a reflow to ensure the element is rendered
    modal.offsetHeight;
    
    // Add click handler to close on outside click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeSuccessPopup();
        }
    });
    
    // Add escape key handler
    const escapeHandler = function(e) {
        if (e.key === 'Escape') {
            closeSuccessPopup();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    document.addEventListener('keydown', escapeHandler);

    // Auto-close after 15 seconds
    setTimeout(() => {
        if (window.currentSuccessModal) {
            console.log("⏰ Auto-closing success popup after 15 seconds");
            closeSuccessPopup();
        }
    }, 15000);
}

function closeSuccessPopup() {
    if (window.currentSuccessModal) {
        // Fade out animation
        window.currentSuccessModal.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => {
            if (window.currentSuccessModal && window.currentSuccessModal.parentNode) {
                document.body.removeChild(window.currentSuccessModal);
            }
            window.currentSuccessModal = null;
        }, 300);
    }
}

function viewMyOrders() {
    closeSuccessPopup();
    window.location.href = "/account.html?section=orders";
}

// Make functions globally available
window.showSuccessPopup = showSuccessPopup;
window.closeSuccessPopup = closeSuccessPopup;
window.viewMyOrders = viewMyOrders;

// Add a test function for debugging
window.testSuccessPopup = function() {
    console.log("🧪 Testing success popup...");
    const testData = {
        orderId: 'pay_test123456789',
        items: 2,
        amount: 599,
        deliveryMethod: 'Courier Delivery',
        paymentMethod: 'Online Payment'
    };
    showSuccessPopup(testData);
};

// Add a simple visibility test function
window.testPopupVisibility = function() {
    console.log("🔍 Testing popup visibility...");
    
    // Create a simple test popup
    const testModal = document.createElement('div');
    testModal.id = 'testModal';
    testModal.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(255, 0, 0, 0.8) !important;
        z-index: 999999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        color: white !important;
        font-size: 24px !important;
        font-weight: bold !important;
    `;
    testModal.innerHTML = 'TEST POPUP - Click to close';
    testModal.onclick = () => document.body.removeChild(testModal);
    
    document.body.appendChild(testModal);
    console.log("✅ Test popup created");
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (testModal.parentNode) {
            document.body.removeChild(testModal);
            console.log("🗑️ Test popup auto-removed");
        }
    }, 3000);
};

// Add fadeOut animation
const fadeOutStyle = document.createElement('style');
fadeOutStyle.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(fadeOutStyle);