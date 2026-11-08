// src/models/Question.js
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questionText: { type: String, required: true, maxlength: 500 },
  answerText: { type: String, maxlength: 1000, default: null },
  answeredAt: { type: Date, default: null },
  status: { type: String, enum: ['pendiente', 'respondida'], default: 'pendiente' }
}, { timestamps: true });

module.exports = mongoose.model('Question', questionSchema);