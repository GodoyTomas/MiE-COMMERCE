// miecommerce/src/services/escrowService.js
const Order = require('../models/Order');
const User = require('../models/User');
const { getIO } = require('../config/socket');

exports.holdFundsInEscrow = async (orderId, paymentExternalId) => {
  // Candado atómico: solo actualiza si sigue en 'pendiente_pago'
  const order = await Order.findOneAndUpdate(
    { _id: orderId, status: 'pendiente_pago' },
    { status: 'pagado_en_escrow', paymentExternalId },
    { new: true }
  );

  if (!order) throw new Error('Orden no encontrada o pago ya acreditado previamente');

  for (const item of order.items) {
    const subtotal = item.unitPrice * item.quantity;
    await User.findByIdAndUpdate(item.seller, {
      $inc: { 'wallet.pendingBalance': subtotal }
    });

    getIO().to(`user_${item.seller}`).emit('nueva_venta', {
      orderId: order._id,
      title: item.title,
      quantity: item.quantity,
      subtotal
    });
  }

  return order;
};

exports.releaseEscrowFunds = async (orderId, buyerId) => {
  // Candado atómico: solo libera fondos si estaba en escrow o en camino
  const order = await Order.findOneAndUpdate(
    { _id: orderId, buyer: buyerId, status: { $in: ['pagado_en_escrow', 'en_camino'] } },
    { status: 'entregado_fondos_liberados', canReview: true },
    { new: true }
  );

  if (!order) throw new Error('Orden inválida o fondos ya liberados');

  for (const item of order.items) {
    const subtotal = item.unitPrice * item.quantity;
    await User.findByIdAndUpdate(item.seller, {
      $inc: {
        'wallet.pendingBalance': -subtotal,
        'wallet.availableBalance': subtotal,
        'reputation.totalSales': item.quantity
      }
    });

    getIO().to(`user_${item.seller}`).emit('fondos_liberados', {
      orderId: order._id,
      amountReleased: subtotal
    });
  }

  return order;
};