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
    
    // Create modal overlay
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        background: rgba(0, 0, 0, 0.8) !important;
        z-index: 999999 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 20px !important;
        animation: fadeIn 0.3s ease !important;
        visibility: visible !important;
        opacity: 1 !important;
    `;

    // Create success card
    const card = document.createElement('div');
    card.style.cssText = `
        background: white !important;
        border-radius: 20px !important;
        padding: 40px 30px !important;
        max-width: 500px !important;
        width: 100% !important;
        text-align: center !important;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5) !important;
        animation: slideUp 0.4s ease !important;
        position: relative !important;
        z-index: 1000000 !important;
        visibility: visible !important;
        opacity: 1 !important;
        display: block !important;
    `;

    // Success animation styles
    const style = document.createElement('style');
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
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: linear-gradient(135deg, #28a745, #20c997);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            animation: checkmark 0.6s ease 0.2s both;
        }
        .success-checkmark::before {
            content: '✓';
            color: white;
            font-size: 40px;
            font-weight: bold;
        }
        .success-title {
            font-size: 28px;
            font-weight: 700;
            color: #28a745;
            margin: 0 0 10px 0;
            font-family: 'Poppins', sans-serif;
        }
        .success-subtitle {
            font-size: 16px;
            color: #666;
            margin: 0 0 25px 0;
            line-height: 1.5;
        }
        .order-details {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
            margin: 25px 0;
            text-align: left;
        }
        .order-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 8px 0;
            font-size: 14px;
        }
        .order-row.total {
            border-top: 2px solid #dee2e6;
            padding-top: 12px;
            margin-top: 15px;
            font-weight: 700;
            font-size: 16px;
            color: #28a745;
        }
        .success-buttons {
            display: flex;
            gap: 12px;
            margin-top: 30px;
        }
        .btn-success {
            flex: 1;
            padding: 12px 20px;
            border: none;
            border-radius: 10px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 14px;
        }
        .btn-primary-success {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
        }
        .btn-primary-success:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
        }
        .btn-secondary-success {
            background: #f8f9fa;
            color: #666;
            border: 2px solid #e9ecef;
        }
        .btn-secondary-success:hover {
            background: #e9ecef;
            transform: translateY(-1px);
        }
        @media (max-width: 600px) {
            .success-buttons {
                flex-direction: column;
            }
        }
    `;
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
    console.log("Modal computed style:", window.getComputedStyle(modal));
    console.log("Modal position in DOM:", modal.parentNode);
    
    // Force a reflow to ensure the element is rendered
    modal.offsetHeight;
    
    // Add a temporary red border for debugging
    modal.style.border = "5px solid red";
    card.style.border = "3px solid blue";
    
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

    // Auto-close after 10 seconds
    setTimeout(() => {
        if (window.currentSuccessModal) {
            console.log("⏰ Auto-closing success popup after 10 seconds");
            closeSuccessPopup();
        }
    }, 10000);
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

// Add fadeOut animation
const fadeOutStyle = document.createElement('style');
fadeOutStyle.textContent = `
    @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }
`;
document.head.appendChild(fadeOutStyle);