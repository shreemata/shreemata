// models/Book.js
const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  description: { type: String, default: '' },
  cover_image: { type: String, default: '' },
  preview_images: { type: [String], default: [] },
  category: { type: String, default: 'uncategorized' }, // store category slug
  weight: { type: Number, default: 0.5 }, // weight in kg, default 0.5kg
  ratings_average: { type: Number, default: 0 }, // will be used later
  ratings_count: { type: Number, default: 0 },
  
  // Points System
  rewardPoints: {
    type: Number,
    default: 0,
    min: 0
  }
}, { timestamps: true });

module.exports = mongoose.model('Book', bookSchema);
