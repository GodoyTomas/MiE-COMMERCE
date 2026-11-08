// miecommerce/src/services/checkoutService.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

exports.createCheckoutOrder = async (buyerId, items, paymentMethodType) => {
  const reservedItems = []; // Registro para rollback si algo falla a mitad de camino

  try {
    let totalAmount = 0;
    const mpItems = [];
    const orderItems = [];

    for (const item of items) {
      // Operación 100% atómica en MongoDB Standalone
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: item.productId, stock: { $gte: item.quantity }, status: 'activa' },
        { $inc: { stock: -item.quantity, soldCount: item.quantity } },
        { new: true }
      );

      if (!updatedProduct) {
        throw new Error(`Stock insuficiente o artículo no disponible: ${item.productId}`);
      }

      // Guardamos en el historial de reserva por si hay que revertir
      reservedItems.push({ productId: updatedProduct._id, quantity: item.quantity });

      if (updatedProduct.stock === 0) {
        await Product.findByIdAndUpdate(updatedProduct._id, { status: 'sin_stock' });
      }

      totalAmount += updatedProduct.price * item.quantity;

      orderItems.push({
        product: updatedProduct._id,
        seller: updatedProduct.seller,
        title: updatedProduct.title,
        quantity: Number(item.quantity),
        unitPrice: Number(updatedProduct.price)
      });

      mpItems.push({
        id: updatedProduct._id.toString(),
        title: updatedProduct.title,
        quantity: Number(item.quantity),
        unit_price: Number(updatedProduct.price),
        currency_id: 'ARS'
      });
    }

    const order = await Order.create({
      buyer: buyerId,
      items: orderItems,
      totalAmount,
      paymentMethod: paymentMethodType,
      status: 'pendiente_pago'
    });

    const preference = new Preference(mpClient);
    const mpResponse = await preference.create({
      body: {
        items: mpItems,
        external_reference: order._id.toString(),
        notification_url: `${process.env.BACKEND_URL}/api/webhooks/mercadopago`,
        back_urls: {
          success: `${process.env.FRONTEND_URL}/panel/compras`,
          failure: `${process.env.FRONTEND_URL}/checkout/error`
        },
        auto_return: 'approved'
      }
    });

    return {
      orderId: order._id,
      initPoint: mpResponse.init_point,
      preferenceId: mpResponse.id
    };
  } catch (error) {
    // COMPENSACIÓN (Rollback manual): Si falló un ítem o la pasarela, devolvemos el stock descontado
    for (const reserved of reservedItems) {
      await Product.findByIdAndUpdate(reserved.productId, {
        $inc: { stock: reserved.quantity, soldCount: -reserved.quantity },
        $set: { status: 'activa' }
      });
    }
    throw error;
  }
};