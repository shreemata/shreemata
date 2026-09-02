/**
 * AWS SES Email Service using AWS SDK (Alternative to SMTP)
 * This is more reliable and doesn't require SMTP credentials
 * 
 * Setup:
 * 1. npm install @aws-sdk/client-ses
 * 2. Add to .env:
 *    AWS_REGION=ap-south-1
 *    AWS_ACCESS_KEY_ID=your_access_key
 *    AWS_SECRET_ACCESS_KEY=your_secret_key
 *    SES_FROM_EMAIL=no-reply@shreemata.com
 */

const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// Create SES client
const sesClient = new SESClient({
    region: process.env.AWS_REGION || "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

/**
 * Send email using AWS SES SDK
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML email content
 * @returns {Promise<void>}
 */
async function sendMailSES(to, subject, html) {
    const params = {
        Source: `Shree Mata <${process.env.SES_FROM_EMAIL || 'no-reply@shreemata.com'}>`,
        Destination: {
            ToAddresses: [to]
        },
        Message: {
            Subject: {
                Data: subject,
                Charset: 'UTF-8'
            },
            Body: {
                Html: {
                    Data: html,
                    Charset: 'UTF-8'
                }
            }
        }
    };

    try {
        const command = new SendEmailCommand(params);
        const response = await sesClient.send(command);
        
        console.log("📧 Email sent via AWS SES SDK to:", to);
        console.log("   Message ID:", response.MessageId);
        
        return response;
    } catch (error) {
        console.error("❌ AWS SES SDK Email error:", error);
        throw error;
    }
}

module.exports = sendMailSES;
