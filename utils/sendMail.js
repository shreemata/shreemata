const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

async function sendMail(to, subject, html) {
    try {
        await transporter.sendMail({
            from: `"Shree Mata" <${process.env.GMAIL_USER}>`,
            to,
            subject,
            html
        });

        console.log("📧 Email sent via Gmail to:", to);
    } catch (err) {
        console.error("❌ Gmail Email error:", err);
    }
}

module.exports = sendMail;
