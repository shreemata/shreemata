// Email service using nodemailer with Gmail SMTP
const nodemailer = require('nodemailer');

const emailUser = process.env.GMAIL_USER || process.env.SMTP_USER || process.env.EMAIL_FROM;
const emailPass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
const emailHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const emailPort = parseInt(process.env.SMTP_PORT) || 587;
const fromEmail = process.env.EMAIL_FROM || emailUser;

// Create transporter for Gmail / SMTP
const transporter = (emailUser && emailPass)
    ? nodemailer.createTransport({
        service: 'gmail',
        host: emailHost,
        port: emailPort,
        secure: false,
        auth: {
            user: emailUser,
            pass: emailPass
        }
    })
    : null;

// Verify transporter configuration if configured
if (transporter) {
    transporter.verify((error, success) => {
        if (error) {
            console.error('❌ Gmail transporter error:', error.message || error);
        } else {
            console.log('✅ Gmail server is ready to send messages (authenticated as ' + emailUser + ')');
        }
    });
} else {
    console.log('⚠️ Gmail / SMTP credentials not set in environment variables (email service idle)');
}

async function sendEmailSafely(mailOptions) {
    if (!transporter) {
        console.log('⚠️ (Email skipped - SMTP credentials not set):', mailOptions.subject);
        return { messageId: 'skipped_no_smtp', accepted: [mailOptions.to], rejected: [], response: 'skipped' };
    }
    // Ensure 'from' header is populated
    if (!mailOptions.from) {
        mailOptions.from = `"Shree Mata" <${fromEmail}>`;
    }
    return transporter.sendMail(mailOptions);
}

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
                    <p style="margin: 5px 0; color: #666;">${order.deliveryAddress.taluk}, ${order.deliveryAddress.district}, ${order.deliveryAddress.state}</p>
                    <p style="margin: 5px 0; color: #666;">Pincode: ${order.deliveryAddress.pincode}</p>
                    <p style="margin: 5px 0; color: #666;">Phone: ${order.deliveryAddress.phone}</p>
                </div>
            `;
        }

        const mailOptions = {
            from: `"Shree Mata" <${fromEmail}>`,
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
                        <h1 style="color: white; margin: 0;">📚 Shree Mata</h1>
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
                            If you have any questions, please contact us at shashistudy2125@gmail.com
                        </p>
                    </div>

                    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                        <p>© ${new Date().getFullYear()} Shree Mata. All rights reserved.</p>
                    </div>
                </body>
                </html>
            `
        };

        const info = await sendEmailSafely(mailOptions);
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
            from: `"Shree Mata" <${fromEmail}>`,
            to: "shashistudy2125@gmail.com", // Send to admin email
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
                        ${order.deliveryAddress.taluk}, ${order.deliveryAddress.district}, ${order.deliveryAddress.state}<br>
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

        const info = await sendEmailSafely(mailOptions);
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
            from: `"Shree Mata" <${fromEmail}>`,
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
                        <h1 style="color: white; margin: 0;">📚 Shree Mata</h1>
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
                                <p style="margin: 5px 0; color: #666;">${order.deliveryAddress.taluk}, ${order.deliveryAddress.district}, ${order.deliveryAddress.state}</p>
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
                            If you have any questions, please contact us at shashistudy2125@gmail.com
                        </p>
                    </div>

                    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                        <p>© ${new Date().getFullYear()} Shree Mata. All rights reserved.</p>
                    </div>
                </body>
                </html>
            `
        };

        const info = await sendEmailSafely(mailOptions);
        console.log('✅ Delivery status email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending delivery status email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send email OTP for verification
 */
async function sendEmailOTP(email, otp) {
    try {
        const mailOptions = {
            from: `"Shree Mata" <${fromEmail}>`,
            to: email,
            subject: 'Email Verification Code - Shree Mata',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">📚 Shree Mata</h1>
                        <p style="color: white; margin: 10px 0 0 0;">Email Verification</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #667eea; margin-top: 0;">Verify Your Email Address</h2>
                        
                        <p>Thank you for signing up with Shree Mata! To complete your registration, please verify your email address.</p>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                            <p style="margin: 0 0 10px 0; font-size: 16px; color: #666;">Your verification code is:</p>
                            <div style="font-size: 32px; font-weight: 700; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</div>
                            <p style="margin: 10px 0 0 0; font-size: 14px; color: #999;">This code will expire in 10 minutes</p>
                        </div>

                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                            <p style="margin: 0; color: #856404; font-size: 14px;">
                                <strong>⚠️ Security Notice:</strong><br>
                                • Do not share this code with anyone<br>
                                • We will never ask for this code over phone or email<br>
                                • If you didn't request this verification, please ignore this email
                            </p>
                        </div>

                        <p style="color: #666; font-size: 14px; margin-top: 30px;">
                            If you have any questions, please contact us at shashistudy2125@gmail.com
                        </p>
                    </div>

                    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                        <p>© ${new Date().getFullYear()} Shree Mata. All rights reserved.</p>
                    </div>
                </body>
                </html>
            `
        };

        const info = await sendEmailSafely(mailOptions);
        console.log('✅ Email OTP sent:', info.messageId);
        console.log('📧 Email details:', {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject,
            accepted: info.accepted,
            rejected: info.rejected,
            response: info.response
        });
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending email OTP:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send password reset OTP to email
 */
async function sendPasswordResetOTP(email, otp) {
    try {
        const mailOptions = {
            from: `"Shree Mata" <${fromEmail}>`,
            to: email,
            subject: 'Password Reset Code - Shree Mata',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">📚 Shree Mata</h1>
                        <p style="color: white; margin: 10px 0 0 0;">Password Reset Request</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #667eea; margin-top: 0;">🔐 Reset Your Password</h2>
                        
                        <p>We received a request to reset your password. To proceed with the password reset, please use the verification code below:</p>
                        
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                            <p style="margin: 0 0 10px 0; font-size: 16px; color: #666;">Your password reset code is:</p>
                            <div style="font-size: 32px; font-weight: 700; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</div>
                            <p style="margin: 10px 0 0 0; font-size: 14px; color: #999;">This code will expire in 10 minutes</p>
                        </div>

                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                            <p style="margin: 0; color: #856404; font-size: 14px;">
                                <strong>⚠️ Security Notice:</strong><br>
                                • Do not share this code with anyone<br>
                                • We will never ask for this code over phone or email<br>
                                • If you didn't request this password reset, please ignore this email and your password will remain unchanged
                            </p>
                        </div>

                        <p style="color: #666; font-size: 14px; margin-top: 30px;">
                            If you have any questions, please contact us at shashistudy2125@gmail.com
                        </p>
                    </div>

                    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                        <p>© ${new Date().getFullYear()} Shree Mata. All rights reserved.</p>
                    </div>
                </body>
                </html>
            `
        };

        const info = await sendEmailSafely(mailOptions);
        console.log('✅ Password reset OTP sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending password reset OTP:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send employee verification email
 */
async function sendEmployeeVerificationEmail(employee, verificationToken) {
    try {
        // Use the actual domain from environment variable, fallback to shreemata.com
        const baseUrl = process.env.FRONTEND_URL || 'https://shreemata.com';
        const directVerificationUrl = `${baseUrl}/api/employees/verify-email/${verificationToken}`;
        const fallbackVerificationUrl = `${baseUrl}/employee-verify.html?token=${verificationToken}`;
        
        console.log('📧 Sending employee verification email to:', employee.email);
        console.log('🔗 Direct verification URL:', directVerificationUrl);
        console.log('🔗 Fallback verification URL:', fallbackVerificationUrl);
        
        const mailOptions = {
            from: `"Shree Mata HR" <${fromEmail}>`,
            to: employee.email,
            subject: 'Employee Account Verification - Shree Mata',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">🏢 Shree Mata</h1>
                        <p style="color: white; margin: 10px 0 0 0;">Employee Account Verification</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #667eea; margin-top: 0;">Welcome to Shree Mata! 🎉</h2>
                        
                        <p>Dear ${employee.name},</p>
                        <p>Welcome to the Shree Mata team! Your employee account has been created and we need to verify your email address to complete the setup.</p>
                        
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Employee ID:</strong> ${employee.employeeId}</p>
                            <p style="margin: 5px 0;"><strong>Name:</strong> ${employee.name}</p>
                            <p style="margin: 5px 0;"><strong>Designation:</strong> ${employee.designation}</p>
                            <p style="margin: 5px 0;"><strong>Department:</strong> ${employee.department}</p>
                            <p style="margin: 5px 0;"><strong>Joining Date:</strong> ${new Date(employee.joiningDate).toLocaleDateString()}</p>
                        </div>

                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${directVerificationUrl}" 
                               style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin-bottom: 15px;">
                                ✅ Verify Email Address (One-Click)
                            </a>
                            <br>
                            <a href="${fallbackVerificationUrl}" 
                               style="display: inline-block; background: #6c757d; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 14px;">
                                🔗 Alternative Verification Link
                            </a>
                        </div>

                        <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196F3;">
                            <p style="margin: 0; color: #1976D2; font-size: 14px;">
                                <strong>📱 Quick Verification:</strong><br>
                                Simply click the blue "Verify Email Address" button above for instant verification. 
                                If that doesn't work, use the alternative link below it.
                            </p>
                        </div>

                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                            <p style="margin: 0; color: #856404; font-size: 14px;">
                                <strong>⚠️ Important:</strong><br>
                                • This verification link will expire in 24 hours<br>
                                • You must verify your email to receive salary notifications<br>
                                • If you didn't expect this email, please contact HR immediately<br>
                                • If the links don't work, please contact HR with your Employee ID: <strong>${employee.employeeId}</strong>
                            </p>
                        </div>

                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
                            <p style="margin: 0; color: #666; font-size: 14px;">
                                <strong>Need Help?</strong><br>
                                Contact HR at <a href="mailto:shashistudy2125@gmail.com" style="color: #667eea;">shashistudy2125@gmail.com</a><br>
                                Include your Employee ID: <strong>${employee.employeeId}</strong>
                            </p>
                        </div>
                    </div>

                    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                        <p>© ${new Date().getFullYear()} Shree Mata. All rights reserved.</p>
                        <p>This email was sent to ${employee.email}</p>
                    </div>
                </body>
                </html>
            `
        };

        const info = await sendEmailSafely(mailOptions);
        console.log('✅ Employee verification email sent successfully:', info.messageId);
        console.log('📧 Email sent to:', employee.email);
        console.log('🔗 Verification URLs included in email');
        
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending employee verification email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send salary notification email to employee
 */
async function sendSalaryNotificationEmail(employee, salaryRecord) {
    try {
        const mailOptions = {
            from: `"Shree Mata HR" <${fromEmail}>`,
            to: employee.email,
            subject: `Salary Processed - ${salaryRecord.month} | Shree Mata`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">💰 Shree Mata</h1>
                        <p style="color: white; margin: 10px 0 0 0;">Salary Processed</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #28a745; margin-top: 0;">💸 Salary Processed Successfully!</h2>
                        
                        <p>Dear ${employee.name},</p>
                        <p>Your salary for <strong>${salaryRecord.month}</strong> has been processed and credited to your account.</p>
                        
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Employee ID:</strong> ${employee.employeeId}</p>
                            <p style="margin: 5px 0;"><strong>Month/Year:</strong> ${salaryRecord.month}</p>
                            <p style="margin: 5px 0;"><strong>Payment Date:</strong> ${new Date(salaryRecord.paymentDate).toLocaleDateString()}</p>
                            <p style="margin: 5px 0;"><strong>Payment Method:</strong> ${salaryRecord.paymentMethod.replace('_', ' ').toUpperCase()}</p>
                        </div>

                        <h3 style="color: #333; margin-top: 30px;">💰 Salary Breakdown</h3>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8f9fa; border-radius: 8px; overflow: hidden;">
                            <tbody>
                                <tr>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; font-weight: 600;">Basic Salary</td>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: right;">₹${salaryRecord.basicSalary.toFixed(2)}</td>
                                </tr>
                                ${salaryRecord.allowances > 0 ? `
                                <tr>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; color: #28a745;">Allowances</td>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: right; color: #28a745;">+₹${salaryRecord.allowances.toFixed(2)}</td>
                                </tr>
                                ` : ''}
                                ${salaryRecord.bonus > 0 ? `
                                <tr>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; color: #28a745;">Bonus</td>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: right; color: #28a745;">+₹${salaryRecord.bonus.toFixed(2)}</td>
                                </tr>
                                ` : ''}
                                ${salaryRecord.overtime > 0 ? `
                                <tr>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; color: #28a745;">Overtime</td>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: right; color: #28a745;">+₹${salaryRecord.overtime.toFixed(2)}</td>
                                </tr>
                                ` : ''}
                                ${salaryRecord.deductions > 0 ? `
                                <tr>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; color: #dc3545;">Deductions</td>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: right; color: #dc3545;">-₹${salaryRecord.deductions.toFixed(2)}</td>
                                </tr>
                                ` : ''}
                                <tr style="background: #28a745; color: white;">
                                    <td style="padding: 15px; font-weight: 700; font-size: 18px;">Net Salary</td>
                                    <td style="padding: 15px; text-align: right; font-weight: 700; font-size: 18px;">₹${salaryRecord.totalSalary.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>

                        ${salaryRecord.notes ? `
                            <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196F3;">
                                <h3 style="margin: 0 0 10px 0; color: #1976D2;">📝 Notes</h3>
                                <p style="margin: 0; color: #1976D2; font-size: 14px;">${salaryRecord.notes}</p>
                            </div>
                        ` : ''}

                        <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                            <p style="margin: 0; color: #155724; font-size: 14px;">
                                <strong>💳 Payment Information:</strong><br>
                                Your salary has been credited to your registered bank account. Please check your bank statement for confirmation.
                            </p>
                        </div>

                        <p style="color: #666; font-size: 14px; margin-top: 30px;">
                            If you have any questions about your salary or notice any discrepancies, please contact HR at shashistudy2125@gmail.com
                        </p>
                    </div>

                    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                        <p>© ${new Date().getFullYear()} Shree Mata. All rights reserved.</p>
                    </div>
                </body>
                </html>
            `
        };

        const info = await sendEmailSafely(mailOptions);
        console.log('✅ Salary notification email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending salary notification email:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send salary update OTP to employee for verification
 */
async function sendSalaryUpdateOTP(employee, otp, salaryDetails) {
    try {
        const mailOptions = {
            from: `"Shree Mata HR" <${fromEmail}>`,
            to: employee.email,
            subject: 'Salary Update Verification - Shree Mata',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">🏢 Shree Mata</h1>
                        <p style="color: white; margin: 10px 0 0 0;">Salary Update Verification</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #667eea; margin-top: 0;">🔐 Verify Salary Update</h2>
                        
                        <p>Dear ${employee.name},</p>
                        <p>A salary update has been initiated for your account. Please verify this action using the OTP below:</p>
                        
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Employee ID:</strong> ${employee.employeeId}</p>
                            <p style="margin: 5px 0;"><strong>Period:</strong> ${salaryDetails.periodDescription || salaryDetails.period}</p>
                            <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${salaryDetails.totalSalary}</p>
                            <p style="margin: 5px 0;"><strong>Status:</strong> ${salaryDetails.paymentStatus.toUpperCase()}</p>
                        </div>

                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                            <p style="margin: 0 0 10px 0; font-size: 16px; color: #666;">Your verification code is:</p>
                            <div style="font-size: 32px; font-weight: 700; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</div>
                            <p style="margin: 10px 0 0 0; font-size: 14px; color: #999;">This code will expire in 10 minutes</p>
                        </div>

                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                            <p style="margin: 0; color: #856404; font-size: 14px;">
                                <strong>⚠️ Security Notice:</strong><br>
                                • Do not share this code with anyone<br>
                                • Only authorized HR personnel should request this verification<br>
                                • If you didn't expect this salary update, please contact HR immediately
                            </p>
                        </div>

                        <p style="color: #666; font-size: 14px; margin-top: 30px;">
                            If you have any questions, please contact HR at shashistudy2125@gmail.com
                        </p>
                    </div>

                    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                        <p>© ${new Date().getFullYear()} Shree Mata. All rights reserved.</p>
                    </div>
                </body>
                </html>
            `
        };

        const info = await sendEmailSafely(mailOptions);
        console.log('✅ Salary update OTP sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending salary update OTP:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Send salary payment status update notification to employee
 */
async function sendSalaryPaymentStatusUpdateEmail(employee, salaryRecord, oldStatus, newStatus, adminNotes = '') {
    try {
        const statusMessages = {
            'pending': {
                title: 'Payment Pending',
                message: 'Your salary payment is currently being processed.',
                icon: '⏳',
                color: '#ffc107'
            },
            'paid': {
                title: 'Payment Completed',
                message: 'Great news! Your salary has been successfully paid.',
                icon: '✅',
                color: '#28a745'
            },
            'cancelled': {
                title: 'Payment Cancelled',
                message: 'Your salary payment has been cancelled. Please contact HR for details.',
                icon: '❌',
                color: '#dc3545'
            }
        };

        const statusInfo = statusMessages[newStatus] || statusMessages['pending'];

        const mailOptions = {
            from: `"Shree Mata HR" <${fromEmail}>`,
            to: employee.email,
            subject: `${statusInfo.icon} Salary Payment Status Update - ${salaryRecord.periodDescription || salaryRecord.period}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, ${statusInfo.color} 0%, ${statusInfo.color}dd 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">🏢 Shree Mata</h1>
                        <p style="color: white; margin: 10px 0 0 0;">Salary Payment Status Update</p>
                    </div>
                    
                    <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                        <div style="background: ${statusInfo.color}; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                            <h2 style="margin: 0; font-size: 24px;">${statusInfo.icon} ${statusInfo.title}</h2>
                            <p style="margin: 10px 0 0 0; font-size: 16px;">${statusInfo.message}</p>
                        </div>

                        <p>Dear ${employee.name},</p>
                        <p>Your salary payment status has been updated by the admin.</p>
                        
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Employee ID:</strong> ${employee.employeeId}</p>
                            <p style="margin: 5px 0;"><strong>Period:</strong> ${salaryRecord.periodDescription || salaryRecord.period}</p>
                            <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${salaryRecord.totalSalary.toLocaleString()}</p>
                            <p style="margin: 5px 0;"><strong>Previous Status:</strong> <span style="color: #666; text-transform: uppercase;">${oldStatus}</span></p>
                            <p style="margin: 5px 0;"><strong>Current Status:</strong> <span style="color: ${statusInfo.color}; font-weight: 600; text-transform: uppercase;">${newStatus}</span></p>
                            ${salaryRecord.paymentMethod ? `<p style="margin: 5px 0;"><strong>Payment Method:</strong> ${salaryRecord.paymentMethod.replace('_', ' ').toUpperCase()}</p>` : ''}
                            ${salaryRecord.paymentDate ? `<p style="margin: 5px 0;"><strong>Payment Date:</strong> ${new Date(salaryRecord.paymentDate).toLocaleDateString()}</p>` : ''}
                        </div>

                        ${adminNotes ? `
                            <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196F3;">
                                <h3 style="margin: 0 0 10px 0; color: #1976D2;">📝 Admin Notes</h3>
                                <p style="margin: 0; color: #1976D2; font-size: 14px;">${adminNotes}</p>
                            </div>
                        ` : ''}

                        <h3 style="color: #333; margin-top: 30px;">💰 Salary Breakdown</h3>
                        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8f9fa; border-radius: 8px; overflow: hidden;">
                            <tbody>
                                <tr>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; font-weight: 600;">Basic Salary</td>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: right;">₹${salaryRecord.basicSalary.toFixed(2)}</td>
                                </tr>
                                ${salaryRecord.allowances > 0 ? `
                                <tr>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; color: #28a745;">Allowances</td>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: right; color: #28a745;">+₹${salaryRecord.allowances.toFixed(2)}</td>
                                </tr>
                                ` : ''}
                                ${salaryRecord.bonus > 0 ? `
                                <tr>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; color: #28a745;">Bonus</td>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: right; color: #28a745;">+₹${salaryRecord.bonus.toFixed(2)}</td>
                                </tr>
                                ` : ''}
                                ${salaryRecord.overtime > 0 ? `
                                <tr>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; color: #28a745;">Overtime</td>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: right; color: #28a745;">+₹${salaryRecord.overtime.toFixed(2)}</td>
                                </tr>
                                ` : ''}
                                ${salaryRecord.deductions > 0 ? `
                                <tr>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; color: #dc3545;">Deductions</td>
                                    <td style="padding: 12px 15px; border-bottom: 1px solid #dee2e6; text-align: right; color: #dc3545;">-₹${salaryRecord.deductions.toFixed(2)}</td>
                                </tr>
                                ` : ''}
                                <tr style="background: ${statusInfo.color}; color: white;">
                                    <td style="padding: 15px; font-weight: 700; font-size: 18px;">Net Salary</td>
                                    <td style="padding: 15px; text-align: right; font-weight: 700; font-size: 18px;">₹${salaryRecord.totalSalary.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>

                        ${newStatus === 'paid' ? `
                            <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                                <p style="margin: 0; color: #155724; font-size: 14px;">
                                    <strong>💳 Payment Confirmation:</strong><br>
                                    Your salary has been successfully processed and credited to your registered bank account. Please check your bank statement for confirmation.
                                </p>
                            </div>
                        ` : ''}

                        <p style="color: #666; font-size: 14px; margin-top: 30px;">
                            If you have any questions about this update or notice any discrepancies, please contact HR at shashistudy2125@gmail.com
                        </p>
                    </div>

                    <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                        <p>© ${new Date().getFullYear()} Shree Mata. All rights reserved.</p>
                    </div>
                </body>
                </html>
            `
        };

        const info = await sendEmailSafely(mailOptions);
        console.log('✅ Salary payment status update email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending salary payment status update email:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    sendOrderConfirmationEmail,
    sendAdminNotification,
    sendDeliveryStatusEmail,
    sendEmailOTP,
    sendPasswordResetOTP,
    sendEmployeeVerificationEmail,
    sendSalaryNotificationEmail,
    sendSalaryUpdateOTP,
    sendSalaryPaymentStatusUpdateEmail
};
