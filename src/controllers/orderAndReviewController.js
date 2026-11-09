// miecommerce/src/controllers/orderAndReviewController.js
const { createCheckoutOrder, VALID_COUPONS } = require('../services/checkoutService');
const { holdFundsInEscrow, releaseEscrowFunds, refundDisputedOrder } = require('../services/escrowService');
const { pushNotification } = require('../services/notificationService');
const Order = require('../models/Order');
const Review = require('../models/Review');
const User = require('../models/User');
const { getIO } = require('../config/socket');

// Validar un cupón promocional desde el modal de Checkout
exports.validateCoupon = (req, res) => {
  const code = (req.params.code || '').trim().toUpperCase();
  const discountPercent = VALID_COUPONS[code];
  if (!discountPercent) {
    return res.status(404).json({ error: 'Cupón inválido o expirado. Prueba MIE10, CYBER20 o ENVIO5' });
  }
  res.json({ code, discountPercent });
};

// 1. Iniciar compra con soporte para Cupones y Ofertas Relámpago
exports.checkout = async (req, res) => {
  try {
    const { items, paymentMethod, shipping, couponCode } = req.body;
    const result = await createCheckoutOrder(req.user.id, items, paymentMethod, shipping, couponCode);

    if (paymentMethod === 'wallet') {
      const order = await Order.findById(result.orderId);
      const updatedBuyer = await User.findOneAndUpdate(
        { _id: req.user.id, 'wallet.availableBalance': { $gte: order.totalAmount } },
        { $inc: { 'wallet.availableBalance': -order.totalAmount } },
        { new: true }
      );

      if (!updatedBuyer) {
        return res.status(400).json({
          error: 'Tu saldo disponible en billetera no alcanza para cubrir esta compra. Elige QR o Tarjeta.'
        });
      }

      await holdFundsInEscrow(order._id, `WALLET-${Date.now()}`);
      await Order.findByIdAndUpdate(order._id, {
        $set: { 'shipping.shippingStatus': 'etiqueta_lista' },
        $push: {
          'shipping.history': {
            stage: 'Pago con Saldo de Billetera acreditado',
            description: 'Fondos retenidos en Escrow. Etiqueta de correo lista para el vendedor.',
            updatedAt: new Date()
          }
        }
      });

      return res.status(201).json({ ...result, paidWithWallet: true });
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 2. Webhook de pasarela de pagos
exports.paymentWebhook = async (req, res) => {
  try {
    const orderId = req.body.external_reference || req.body.orderId;
    const paymentId = req.body.data?.id || req.body.paymentId || `PAY-${Date.now()}`;

    if (orderId) {
      await holdFundsInEscrow(orderId, paymentId);
      await Order.findByIdAndUpdate(orderId, {
        $set: { 'shipping.shippingStatus': 'etiqueta_lista' },
        $push: {
          'shipping.history': {
            stage: 'Pago acreditado - Etiqueta lista',
            description: 'El vendedor ya puede imprimir la etiqueta y despachar en el correo.',
            updatedAt: new Date()
          }
        }
      });
    }
    res.status(200).json({ received: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 3. Vendedor despacha el paquete
exports.dispatchOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { trackingCode, carrier } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      'items.seller': req.user.id,
      status: { $in: ['pagado_en_escrow', 'en_camino'] }
    });

    if (!order) {
      return res.status(404).json({ error: 'Orden no encontrada o aún no está paga.' });
    }

    const selectedCarrier = carrier || order.shipping.carrier || 'Correo Argentino';
    const prefix = selectedCarrier === 'Andreani' ? 'AND' : selectedCarrier === 'OCA' ? 'OCA' : 'CA';
    const finalTracking = (trackingCode && trackingCode.trim())
      ? trackingCode.trim().toUpperCase()
      : `${prefix}-${Math.floor(10000000 + Math.random() * 90000000)}-AR`;

    order.status = 'en_camino';
    order.shipping.carrier = selectedCarrier;
    order.shipping.trackingCode = finalTracking;
    order.shipping.shippingStatus = 'despachado';
    order.shipping.dispatchedAt = new Date();
    order.shipping.history.push({
      stage: 'Despachado en sucursal',
      description: `Paquete ingresado en ${selectedCarrier}. Código de seguimiento asignado: ${finalTracking}`,
      updatedAt: new Date()
    });

    await order.save();

    getIO().to(`user_${order.buyer}`).emit('envio_actualizado', {
      orderId: order._id,
      carrier: selectedCarrier,
      trackingCode: finalTracking,
      stage: 'Despachado en sucursal'
    });

    await pushNotification(
      order.buyer,
      `🚚 Tu compra fue despachada por ${selectedCarrier}. Código de seguimiento: ${finalTracking}`,
      'shipping'
    );

    res.json({ message: 'Envío despachado y código enviado al comprador', order });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar el despacho del envío' });
  }
};

// 4. Vendedor actualiza el avance del correo
exports.updateShippingStage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { shippingStatus, description } = req.body;

    const stageLabels = {
      en_transito: 'En tránsito hacia centro logístico de destino',
      en_distribucion: 'En manos del distribuidor (Sale a domicilio hoy)'
    };

    const order = await Order.findOneAndUpdate(
      { _id: orderId, 'items.seller': req.user.id },
      {
        $set: { 'shipping.shippingStatus': shippingStatus },
        $push: {
          'shipping.history': {
            stage: stageLabels[shippingStatus] || shippingStatus,
            description: description || `Actualización de ${shippingStatus}`,
            updatedAt: new Date()
          }
        }
      },
      { new: true }
    );

    if (!order) return res.status(404).json({ error: 'No se pudo actualizar el estado del envío' });

    getIO().to(`user_${order.buyer}`).emit('envio_actualizado', {
      orderId: order._id,
      carrier: order.shipping.carrier,
      trackingCode: order.shipping.trackingCode,
      stage: stageLabels[shippingStatus] || shippingStatus
    });

    await pushNotification(
      order.buyer,
      `📦 Actualización de envío (${order.shipping.trackingCode}): ${stageLabels[shippingStatus] || shippingStatus}`,
      'shipping'
    );

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el seguimiento' });
  }
};

// 5. Chat privado post-venta
exports.sendOrderMessage = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Mensaje vacío' });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada' });

    const isBuyer = order.buyer.toString() === req.user.id;
    const isSeller = order.items.some(i => i.seller.toString() === req.user.id);
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ error: 'No tienes permiso en esta orden' });
    }

    const newMsg = {
      sender: req.user.id,
      senderName: req.user.name,
      text: text.trim(),
      createdAt: new Date()
    };

    order.messages.push(newMsg);
    await order.save();

    if (isBuyer) {
      const sellerIds = [...new Set(order.items.map(i => i.seller.toString()))];
      for (const sId of sellerIds) {
        getIO().to(`user_${sId}`).emit('nuevo_mensaje_orden', { orderId: order._id, message: newMsg });
        await pushNotification(sId, `📩 Mensaje de ${req.user.name} en Orden #${order._id.toString().slice(-6)}: "${text.trim()}"`, 'chat');
      }
    } else {
      getIO().to(`user_${order.buyer}`).emit('nuevo_mensaje_orden', { orderId: order._id, message: newMsg });
      await pushNotification(order.buyer, `📩 Mensaje del vendedor en Orden #${order._id.toString().slice(-6)}: "${text.trim()}"`, 'chat');
    }

    res.status(201).json({ messages: order.messages });
  } catch (error) {
    res.status(500).json({ error: 'Error enviando mensaje en la orden' });
  }
};

// 6. CENTRO DE RECLAMOS Y MEDIACIÓN: Comprador abre un reclamo (Congela Escrow)
exports.openDispute = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Debes indicar el motivo del reclamo.' });
    }

    const order = await Order.findOneAndUpdate(
      { _id: orderId, buyer: req.user.id, status: { $in: ['pagado_en_escrow', 'en_camino'] } },
      {
        status: 'en_reclamo',
        dispute: {
          isOpen: true,
          reason: reason.trim(),
          resolution: null,
          openedAt: new Date()
        },
        $push: {
          'shipping.history': {
            stage: '⚠️ Reclamo / Mediación abierta',
            description: `Motivo del comprador: ${reason.trim()}. Fondos congelados en Escrow.`,
            updatedAt: new Date()
          }
        }
      },
      { new: true }
    );

    if (!order) return res.status(400).json({ error: 'No se puede abrir reclamo en esta orden.' });

    const sellerIds = [...new Set(order.items.map(i => i.seller.toString()))];
    for (const sId of sellerIds) {
      await pushNotification(
        sId,
        `⚠️ Reclamo abierto en Orden #${order._id.toString().slice(-6)}: "${reason.trim()}". Fondos retenidos en mediación.`,
        'dispute'
      );
    }

    res.json({ message: 'Reclamo abierto. Tus fondos siguen protegidos en Escrow.', order });
  } catch (error) {
    res.status(500).json({ error: 'Error al abrir el reclamo' });
  }
};

// 7. Vendedor reembolsa el dinero al comprador desde el Centro de Mediación
exports.resolveDisputeWithRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await refundDisputedOrder(orderId, req.user.id);
    res.json({ message: 'Orden reembolsada al comprador y stock recuperado.', order });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 8. Confirmar recepción del producto
exports.confirmDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await releaseEscrowFunds(orderId, req.user.id);

    await Order.findByIdAndUpdate(orderId, {
      $set: { 'shipping.shippingStatus': 'entregado' },
      $push: {
        'shipping.history': {
          stage: 'Entregado al comprador',
          description: 'El comprador confirmó la recepción conforme del paquete.',
          updatedAt: new Date()
        }
      }
    });

    res.json({ message: 'Recepción confirmada. Fondos liberados al vendedor.', order });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// 9. Calificar satisfacción del artículo (1 a 5 estrellas)
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