// miecommerce/src/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  reputation: {
    totalSales: { type: Number, default: 0 },
    sellerRating: { type: Number, default: 5.0 }
  },
  wallet: {
    pendingBalance: { type: Number, default: 0 },
    availableBalance: { type: Number, default: 0 }
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  withdrawals: [{
    amount: Number,
    cbuOrAlias: String,
    createdAt: { type: Date, default: Date.now }
  }],
  recentlyViewed: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    category: { type: String },
    viewedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);