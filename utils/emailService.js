// Email service using nodemailer
const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
});

// Verify transporter configuration
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ Email transporter error:', error);
    } else {
        console.log('✅ Email server is ready to send messages');
    }
});

/**
 * Send order confirmation email to customer
 */
async function sendOrderConfirmationEmail(order, user) {
    try {
        const orderItems = order.items.map(item => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.title}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${item.price.toFixed(2)}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
        `).join('');

        let offerSection = '';
        if (order.appliedOffer && order.appliedOffer.offerTitle && order.appliedOffer.originalAmount) {
            offerSection = `
                <div style="background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                    <h3 style="margin: 0 0 10px 0; color: #155724;">🎉 ${order.appliedOffer.offerTitle}</h3>
                    <p style="margin: 0; color: #155724; font-size: 14px;">
                        ${order.appliedOffer.discountType === 'percentage' 
                            ? `${order.appliedOffer.discountValue}% discount applied` 
                            : `₹${order.appliedOffer.discountValue} discount applied`}
                    </p>
                    <table style="width: 100%; margin-top: 10px; background: white; border-radius: 5px; padding: 10px;">
                        <tr>
                            <td style="padding: 5px;">Original Amount:</td>
                            <td style="padding: 5px; text-align: right; font-weight: 600;">₹${(order.appliedOffer.originalAmount || 0).toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 5px; color: #dc3545;">Discount:</td>
                            <td style="padding: 5px; text-align: right; font-weight: 600; color: #dc3545;">-₹${(order.appliedOffer.savings || 0).toFixed(2)}</td>
                        </tr>
                        <tr style="border-top: 2px solid #28a745;">
                            <td style="padding: 5px; font-weight: 700; color: #28a745;">You Paid:</td>
                            <td style="padding: 5px; text-align: right; font-weight: 700; color: #28a745;">₹${(order.appliedOffer.discountedAmount || order.totalAmount).toFixed(2)}</td>
                        </tr>
                    </table>
                </div>
            `;
        }

        let addressSection = '';
        if (order.deliveryAddress && order.deliveryAddress.street) {
            addressSection = `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin: 0 0 10px 0; color: #333;">📍 Delivery Address</h3>
                    <p style="margin: 5px 0; color: #666;">${order.deliveryAddress.street}</p>
                    <p style="margin: 5px 0; color: #666;">${order.deliveryAddress.city}, ${order.deliveryAddress.state}</p>
                    <p style="margin: 5px 0; color: #666;">Pincode: ${order.deliveryAddress.pincode}</p>
                    <p style="margin: 5px 0; color: #666;">Phone: ${order.deliveryAddress.phone}</p>
                </div>
            `;
        }

        const mailOptions = {
            from: `"BookStore" <${process.env.MAIL_USER}>`,
            to: user.email,
            subject: `Order Confirmation - Order #${order._id}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">📚 BookStore</h1>
                        <p style="color: white; margin: 10px 0 0 0;">Thank you for your order!</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #667eea; margin-top: 0;">Order Confirmed! 🎉</h2>
                        
                        <p>Hi ${user.name},</p>
                        <p>Your order has been successfully placed and payment confirmed.</p>
                        
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Order ID:</strong> ${order._id}</p>
                            <p style="margin: 5px 0;"><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
                            <p style="margin: 5px 0;"><strong>Payment ID:</strong> ${order.razorpay_payment_id}</p>
                        </div>

                        ${offerSection}

                        <h3 style="color: #333; margin-top: 30px;">Order Items</h3>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <thead>
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Item</th>
                                    <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Qty</th>
                                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #dee2e6;">Price</th>
                                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #dee2e6;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${orderItems}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colspan="3" style="padding: 15px 10px; text-align: right; font-weight: 700; font-size: 18px; border-top: 2px solid #dee2e6;">Total Amount:</td>
                                    <td style="padding: 15px 10px; text-align: right; font-weight: 700; font-size: 18px; color: #28a745; border-top: 2px solid #dee2e6;">₹${order.totalAmount.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        </table>

                        ${addressSection}

                        <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196F3;">
                            <p style="margin: 0; color: #1976D2;">
                                <strong>📦 What's Next?</strong><br>
                                Your order is being processed. You can track your order status in your account dashboard.
                            </p>
                        </div>

                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/orders.html" 
                               style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                                View Order Details
                            </a>
                        </div>

                        <p style="color: #666; font-size: 14px; margin-top: 30px;">
                            If you have any questions, please contact us at ${process.env.MAIL_USER}
                        </p>
                    </div>

                    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                        <p>© ${new Date().getFullYear()} BookStore. All rights reserved.</p>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Order confirmation email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending order confirmation email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send payment success notification to admin
 */
async function sendAdminNotification(order, user) {
    try {
        const mailOptions = {
            from: `"BookStore" <${process.env.MAIL_USER}>`,
            to: process.env.MAIL_USER, // Send to admin email
            subject: `New Order Received - Order #${order._id}`,
            html: `
                <!DOCTYPE html>
                <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #667eea;">New Order Received! 🎉</h2>
                    
                    <p><strong>Order ID:</strong> ${order._id}</p>
                    <p><strong>Customer:</strong> ${user.name} (${user.email})</p>
                    <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
                    <p><strong>Total Amount:</strong> ₹${order.totalAmount.toFixed(2)}</p>
                    <p><strong>Payment ID:</strong> ${order.razorpay_payment_id}</p>
                    
                    ${order.appliedOffer && order.appliedOffer.offerTitle && order.appliedOffer.originalAmount ? `
                        <div style="background: #d4edda; padding: 10px; border-radius: 5px; margin: 10px 0;">
                            <p><strong>Offer Applied:</strong> ${order.appliedOffer.offerTitle}</p>
                            <p>Original: ₹${(order.appliedOffer.originalAmount || 0).toFixed(2)} | Discount: ₹${(order.appliedOffer.savings || 0).toFixed(2)}</p>
                        </div>
                    ` : ''}
                    
                    ${order.deliveryAddress && order.deliveryAddress.street ? `
                        <h3>Delivery Address:</h3>
                        <p>${order.deliveryAddress.street}<br>
                        ${order.deliveryAddress.city}, ${order.deliveryAddress.state}<br>
                        Pincode: ${order.deliveryAddress.pincode}<br>
                        Phone: ${order.deliveryAddress.phone}</p>
                    ` : ''}
                    
                    <h3>Order Items:</h3>
                    <ul>
                        ${order.items.map(item => `
                            <li>${item.title} - Qty: ${item.quantity} - ₹${(item.price * item.quantity).toFixed(2)}</li>
                        `).join('')}
                    </ul>
                    
                    <p style="margin-top: 20px;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin-orders.html" 
                           style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                            View in Admin Panel
                        </a>
                    </p>
                </body>
                </html>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Admin notification email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending admin notification:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send delivery status update email to customer
 */
async function sendDeliveryStatusEmail(order, user, newStatus, trackingInfo = '') {
    try {
        const statusMessages = {
            'pending': {
                title: 'Order Received',
                message: 'Your order has been received and is being prepared.',
                icon: '📦',
                color: '#ffc107'
            },
            'processing': {
                title: 'Order Processing',
                message: 'Your order is being processed and will be shipped soon.',
                icon: '⚙️',
                color: '#17a2b8'
            },
            'shipped': {
                title: 'Order Shipped',
                message: 'Great news! Your order has been shipped and is on its way.',
                icon: '🚚',
                color: '#007bff'
            },
            'delivered': {
                title: 'Order Delivered',
                message: 'Your order has been delivered. Thank you for shopping with us!',
                icon: '✅',
                color: '#28a745'
            }
        };

        const statusInfo = statusMessages[newStatus] || statusMessages['pending'];

        const orderItems = order.items.map(item => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.title}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
        `).join('');

        let trackingSection = '';
        if (trackingInfo) {
            trackingSection = `
                <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196F3;">
                    <h3 style="margin: 0 0 10px 0; color: #1976D2;">📍 Tracking Information</h3>
                    <p style="margin: 0; color: #1976D2; font-size: 14px;">${trackingInfo}</p>
                </div>
            `;
        }

        const mailOptions = {
            from: `"BookStore" <${process.env.MAIL_USER}>`,
            to: user.email,
            subject: `${statusInfo.icon} ${statusInfo.title} - Order #${order._id}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">📚 BookStore</h1>
                        <p style="color: white; margin: 10px 0 0 0; font-size: 18px;">${statusInfo.icon} ${statusInfo.title}</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                        <div style="background: ${statusInfo.color}; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                            <h2 style="margin: 0; font-size: 24px;">${statusInfo.icon} ${statusInfo.title}</h2>
                            <p style="margin: 10px 0 0 0; font-size: 16px;">${statusInfo.message}</p>
                        </div>

                        <p>Hi ${user.name},</p>
                        <p>Your order status has been updated.</p>
                        
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Order ID:</strong> ${order._id}</p>
                            <p style="margin: 5px 0;"><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
                            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${statusInfo.color}; font-weight: 600;">${statusInfo.title}</span></p>
                        </div>

                        ${trackingSection}

                        <h3 style="color: #333; margin-top: 30px;">Order Items</h3>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                            <thead>
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Item</th>
                                    <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Qty</th>
                                    <th style="padding: 10px; text-align: right; border-bottom: 2px solid #dee2e6;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${orderItems}
                            </tbody>
                        </table>

                        ${order.deliveryAddress && order.deliveryAddress.street ? `
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="margin: 0 0 10px 0; color: #333;">📍 Delivery Address</h3>
                                <p style="margin: 5px 0; color: #666;">${order.deliveryAddress.street}</p>
                                <p style="margin: 5px 0; color: #666;">${order.deliveryAddress.city}, ${order.deliveryAddress.state}</p>
                                <p style="margin: 5px 0; color: #666;">Pincode: ${order.deliveryAddress.pincode}</p>
                                <p style="margin: 5px 0; color: #666;">Phone: ${order.deliveryAddress.phone}</p>
                            </div>
                        ` : ''}

                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/orders.html" 
                               style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">
                                View Order Details
                            </a>
                        </div>

                        <p style="color: #666; font-size: 14px; margin-top: 30px;">
                            If you have any questions, please contact us at ${process.env.MAIL_USER}
                        </p>
                    </div>

                    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                        <p>© ${new Date().getFullYear()} BookStore. All rights reserved.</p>
                    </div>
                </body>
                </html>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Delivery status email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending delivery status email:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendOrderConfirmationEmail,
    sendAdminNotification,
    sendDeliveryStatusEmail
};
