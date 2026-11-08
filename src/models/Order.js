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
  paymentMethod: {
    type: String,
    enum: ['qr', 'credit_card', 'debit_card', 'wallet'],
    required: true
  },
  paymentExternalId: { type: String, default: null },
  status: {
    type: String,
    enum: ['pendiente_pago', 'pagado_en_escrow', 'en_camino', 'entregado_fondos_liberados', 'cancelada'],
    default: 'pendiente_pago',
    index: true
  },
  shipping: {
    carrier: {
      type: String,
      enum: ['Correo Argentino', 'Andreani', 'OCA'],
      default: 'Correo Argentino'
    },
    address: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: true },
      notes: { type: String, default: '' }
    },
    trackingCode: { type: String, default: null },
    shippingStatus: {
      type: String,
      enum: ['pendiente_despacho', 'etiqueta_lista', 'despachado', 'en_transito', 'en_distribucion', 'entregado'],
      default: 'pendiente_despacho'
    },
    dispatchedAt: { type: Date, default: null },
    history: [{
      stage: String,
      description: String,
      updatedAt: { type: Date, default: Date.now }
    }]
  },
  // CHAT PRIVADO POST-VENTA (COMPRADOR <-> VENDEDOR)
  messages: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderName: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
  }],
  canReview: { type: Boolean, default: false },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 60 * 1000)
  }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);