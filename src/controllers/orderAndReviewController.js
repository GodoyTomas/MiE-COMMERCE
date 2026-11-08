// miecommerce/src/controllers/orderAndReviewController.js
const { createCheckoutOrder } = require('../services/checkoutService');
const { holdFundsInEscrow, releaseEscrowFunds } = require('../services/escrowService');
const Order = require('../models/Order');
const Review = require('../models/Review');
const User = require('../models/User');
const { getIO } = require('../config/socket');

// 1. Iniciar compra (Soporta QR, Tarjetas o Saldo de Billetera 'wallet')
exports.checkout = async (req, res) => {
  try {
    const { items, paymentMethod, shipping } = req.body;
    const result = await createCheckoutOrder(req.user.id, items, paymentMethod, shipping);

    // Si el usuario eligió pagar con su Saldo Disponible de Billetera
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

// 2. Webhook de pasarela de pagos (QR / Tarjeta)
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

// 3. Vendedor despacha el paquete y asigna código de seguimiento
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

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el seguimiento' });
  }
};

// 5. CHAT PRIVADO POST-VENTA EN TIEMPO REAL (COMPRADOR <-> VENDEDOR)
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

    // Notificar en tiempo real a la contraparte
    if (isBuyer) {
      const sellerIds = [...new Set(order.items.map(i => i.seller.toString()))];
      sellerIds.forEach(sId => {
        getIO().to(`user_${sId}`).emit('nuevo_mensaje_orden', { orderId: order._id, message: newMsg });
      });
    } else {
      getIO().to(`user_${order.buyer}`).emit('nuevo_mensaje_orden', { orderId: order._id, message: newMsg });
    }

    res.status(201).json({ messages: order.messages });
  } catch (error) {
    res.status(500).json({ error: 'Error enviando mensaje en la orden' });
  }
};

// 6. Confirmar recepción del producto
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

// 7. Calificar satisfacción del artículo (1 a 5 estrellas)
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