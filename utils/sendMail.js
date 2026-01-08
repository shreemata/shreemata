const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.SES_HOST,
    port: process.env.SES_PORT,
    secure: false,
    auth: {
        user: process.env.SES_USER,
        pass: process.env.SES_PASS
    }
});

async function sendMail(to, subject, html) {
    try {
        await transporter.sendMail({
            from: `"Shree Mata" <${process.env.SES_FROM_EMAIL || 'no-reply@shreemata.com'}>`,
            to,
            subject,
            html
        });

        console.log("📧 Email sent via SES to:", to);
    } catch (err) {
        console.error("❌ SES Email error:", err);
    }
}

module.exports = sendMail;
