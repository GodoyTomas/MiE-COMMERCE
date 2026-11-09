// miecommerce/src/services/checkoutService.js
const Product = require('../models/Product');
const Order = require('../models/Order');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

const VALID_COUPONS = {
  'MIE10': 10,
  'CYBER20': 20,
  'ENVIO5': 5
};

exports.VALID_COUPONS = VALID_COUPONS;

exports.createCheckoutOrder = async (buyerId, items, paymentMethodType, shippingData, couponCode) => {
  const reservedItems = [];

  try {
    let subtotalAmount = 0;
    const mpItems = [];
    const orderItems = [];

    const normalizedCoupon = couponCode ? couponCode.trim().toUpperCase() : null;
    const couponPercent = (normalizedCoupon && VALID_COUPONS[normalizedCoupon]) ? VALID_COUPONS[normalizedCoupon] : 0;

    for (const item of items) {
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: item.productId, stock: { $gte: item.quantity }, status: 'activa' },
        { $inc: { stock: -item.quantity, soldCount: item.quantity } },
        { new: true }
      );

      if (!updatedProduct) {
        throw new Error(`Stock insuficiente o artículo no disponible: ${item.productId}`);
      }

      reservedItems.push({ productId: updatedProduct._id, quantity: item.quantity });

      if (updatedProduct.stock === 0) {
        await Product.findByIdAndUpdate(updatedProduct._id, { status: 'sin_stock' });
      }

      // Aplicar descuento de Oferta Relámpago del producto + Cupón si existe
      const prodDisc = updatedProduct.discountPercent || 0;
      const priceAfterOffer = Math.round(updatedProduct.price * (1 - prodDisc / 100));
      const finalUnitPrice = Math.round(priceAfterOffer * (1 - couponPercent / 100));

      subtotalAmount += priceAfterOffer * item.quantity;

      orderItems.push({
        product: updatedProduct._id,
        seller: updatedProduct.seller,
        title: updatedProduct.title,
        category: updatedProduct.category || 'General',
        quantity: Number(item.quantity),
        unitPrice: finalUnitPrice
      });

      mpItems.push({
        id: updatedProduct._id.toString(),
        title: updatedProduct.title,
        quantity: Number(item.quantity),
        unit_price: finalUnitPrice,
        currency_id: 'ARS'
      });
    }

    const totalAmount = orderItems.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
    const discountAmount = Math.max(0, subtotalAmount - totalAmount);

    const order = await Order.create({
      buyer: buyerId,
      items: orderItems,
      subtotalAmount,
      couponCode: couponPercent > 0 ? normalizedCoupon : null,
      discountAmount,
      totalAmount,
      paymentMethod: paymentMethodType,
      status: 'pendiente_pago',
      shipping: {
        carrier: shippingData?.carrier || 'Correo Argentino',
        address: {
          street: shippingData?.street || 'Dirección a coordinar',
          city: shippingData?.city || 'Ciudad',
          state: shippingData?.state || 'Provincia',
          zipCode: shippingData?.zipCode || '0000',
          notes: shippingData?.notes || ''
        },
        shippingStatus: 'pendiente_despacho',
        history: [{
          stage: 'Orden generada',
          description: `Envío solicitado por ${shippingData?.carrier || 'Correo Argentino'}`,
          updatedAt: new Date()
        }]
      }
    });

    let initPoint = null;
    let preferenceId = `PREF-LOCAL-${order._id}`;

    if (process.env.MP_ACCESS_TOKEN && !process.env.MP_ACCESS_TOKEN.startsWith('TEST-0000')) {
      try {
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
        initPoint = mpResponse.init_point;
        preferenceId = mpResponse.id;
      } catch (mpErr) {
        console.warn('[miecommerce] Usando pasarela QR/Tarjeta local:', mpErr.message);
      }
    }

    return {
      orderId: order._id,
      initPoint,
      preferenceId
    };
  } catch (error) {
    for (const reserved of reservedItems) {
      await Product.findByIdAndUpdate(reserved.productId, {
        $inc: { stock: reserved.quantity, soldCount: -reserved.quantity },
        $set: { status: 'activa' }
      });
    }
    throw error;
  }
};