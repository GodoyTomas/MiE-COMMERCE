// miecommerce/src/models/Product.js
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  category: { type: String, required: true, index: true },
  price: { type: Number, required: true, min: 0 },
  discountPercent: { type: Number, default: 0, min: 0, max: 90 },
  stock: { type: Number, required: true, min: 0 },
  soldCount: { type: Number, default: 0 },
  images: [{ type: String }],
  variants: [{ type: String, trim: true }], // Ej: ["Color: Negro", "Color: Plata"] o ["Talle M", "Talle L"]
  condition: { type: String, enum: ['nuevo', 'usado', 'reacondicionado'], default: 'nuevo' },
  status: { type: String, enum: ['activa', 'pausada', 'sin_stock'], default: 'activa' },
  ratingSummary: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 },
    distribution: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 }
    }
  }
}, { timestamps: true });

productSchema.index({ title: 'text', description: 'text', category: 'text' });

module.exports = mongoose.model('Product', productSchema);