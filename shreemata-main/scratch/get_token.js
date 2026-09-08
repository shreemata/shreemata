const jwt = require('jsonwebtoken');
require('dotenv').config();

const user = {
    id: "6a2e71e995ab8626a57076e7",
    _id: "6a2e71e995ab8626a57076e7",
    name: "Shakuntaladevi",
    email: "shakuntala@example.com",
    role: "customer"
};

const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET || 'shreemata_jwt_secret_key_2026', { expiresIn: '7d' });
console.log(JSON.stringify({ token, user }));
