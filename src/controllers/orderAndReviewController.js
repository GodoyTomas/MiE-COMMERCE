// miecommerce/src/controllers/orderAndReviewController.js
const { createCheckoutOrder } = require('../services/checkoutService');
const { holdFundsInEscrow, releaseEscrowFunds } = require('../services/escrowService');
const Order = require('../models/Order');
const Review = require('../models/Review');

// 1. Iniciar compra (Reserva stock y devuelve link/QR de pago)
exports.checkout = async (req, res) => {
  try {
    const { items, paymentMethod } = req.body; // paymentMethod: 'qr', 'credit_card', 'debit_card'
    const result = await createCheckoutOrder(req.user.id, items, paymentMethod);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 2. Webhook de pasarela de pagos (o simulador en entorno de desarrollo)
exports.paymentWebhook = async (req, res) => {
  try {
    // Soporta tanto el formato de webhook de Mercado Pago como confirmación directa en pruebas
    const orderId = req.body.external_reference || req.body.orderId;
    const paymentId = req.body.data?.id || req.body.paymentId || `PAY-${Date.now()}`;

    if (orderId) {
      await holdFundsInEscrow(orderId, paymentId);
    }
    res.status(200).json({ received: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 3. Confirmar recepción del producto (Libera dinero al vendedor y habilita reseña)
exports.confirmDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await releaseEscrowFunds(orderId, req.user.id);
    res.json({ message: 'Recepción confirmada. Fondos liberados al vendedor.', order });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 4. Calificar satisfacción del artículo (1 a 5 estrellas)
exports.createReview = async (req, res) => {
  try {
    const { orderId, productId, rating, comment } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      buyer: req.user.id,
      status: 'entregado_fondos_liberados',
      canReview: true,
      'items.product': productId
    });

    if (!order) {
      return res.status(403).json({
        error: 'Solo puedes valorar artículos de compras recibidas y confirmadas.'
      });
    }

    const review = await Review.create({
      product: productId,
      order: orderId,
      buyer: req.user.id,
      rating: Number(rating),
      comment
    });

    res.status(201).json(review);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Ya calificaste este artículo en esta compra.' });
    }
    res.status(500).json({ error: 'Error al guardar la valoración' });
  }
};