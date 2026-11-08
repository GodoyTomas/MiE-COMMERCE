// miecommerce/src/models/Order.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: String,
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true }
  }],
  totalAmount: { type: Number, required: true },
  paymentMethod: { type: String, enum: ['qr', 'credit_card', 'debit_card'], required: true },
  paymentExternalId: { type: String, default: null },
  status: {
    type: String,
    enum: ['pendiente_pago', 'pagado_en_escrow', 'en_camino', 'entregado_fondos_liberados', 'cancelada'],
    default: 'pendiente_pago',
    index: true
  },
  canReview: { type: Boolean, default: false }, // Se activa únicamente al confirmar la entrega
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 60 * 1000) // 30 minutos para pagar antes de devolver stock
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);