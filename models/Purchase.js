const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  book_id: { type: mongoose.Schema.Types.ObjectId, ref: "Book" },
  price_paid: Number,
  purchase_date: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Purchase", purchaseSchema);
