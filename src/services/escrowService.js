// miecommerce/src/services/escrowService.js
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const { getIO } = require('../config/socket');
const { pushNotification } = require('./notificationService');

exports.holdFundsInEscrow = async (orderId, paymentExternalId) => {
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

    await pushNotification(
      item.seller,
      `🎉 Nueva venta: ${item.quantity}x "${item.title}" ($${subtotal.toLocaleString('es-AR')} en Escrow).`,
      'sale'
    );
  }

  return order;
};

exports.releaseEscrowFunds = async (orderId, buyerId) => {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, buyer: buyerId, status: { $in: ['pagado_en_escrow', 'en_camino', 'en_reclamo'] } },
    {
      status: 'entregado_fondos_liberados',
      canReview: true,
      'dispute.isOpen': false,
      'dispute.resolution': 'El comprador confirmó la recepción y cerró la orden.',
      'dispute.resolvedAt': new Date()
    },
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

    await pushNotification(
      item.seller,
      `💰 Se liberaron $${subtotal.toLocaleString('es-AR')} a tu saldo disponible por la Orden #${order._id.toString().slice(-6)}.`,
      'wallet'
    );
  }

  return order;
};

// Reembolsar al comprador desde Escrow (Resolución de Reclamo)
exports.refundDisputedOrder = async (orderId, sellerId) => {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, 'items.seller': sellerId, status: 'en_reclamo' },
    {
      status: 'reembolsada',
      'dispute.isOpen': false,
      'dispute.resolution': 'Dinero reembolsado a la billetera del comprador por el vendedor.',
      'dispute.resolvedAt': new Date()
    },
    { new: true }
  );

  if (!order) throw new Error('No se encontró un reclamo activo para reembolsar');

  for (const item of order.items) {
    const subtotal = item.unitPrice * item.quantity;
    // Descontar del saldo retenido del vendedor
    await User.findByIdAndUpdate(item.seller, {
      $inc: { 'wallet.pendingBalance': -subtotal }
    });
    // Devolver el stock al producto
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity, soldCount: -item.quantity },
      $set: { status: 'activa' }
    });
  }

  // Acreditar el total reembolsado en la billetera disponible del comprador
  await User.findByIdAndUpdate(order.buyer, {
    $inc: { 'wallet.availableBalance': order.totalAmount }
  });

  await pushNotification(
    order.buyer,
    `⚖️ Reclamo resuelto: Se reembolsaron $${order.totalAmount.toLocaleString('es-AR')} a tu Saldo Disponible en miecommerce.`,
    'dispute'
  );

  return order;
};