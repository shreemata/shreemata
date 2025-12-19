const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: false,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
});

async function sendMail(to, subject, html) {
    try {
        await transporter.sendMail({
            from: `"BookStore Support" <${process.env.MAIL_USER}>`,
            to,
            subject,
            html
        });

        console.log("📧 Email sent to:", to);
    } catch (err) {
        console.error("❌ Email error:", err);
    }
}

module.exports = sendMail;
