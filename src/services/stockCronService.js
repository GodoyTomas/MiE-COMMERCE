// miecommerce/src/services/stockCronService.js
const cron = require('node-cron');
const Order = require('../models/Order');
const Product = require('../models/Product');

exports.startStockRecoveryCron = () => {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const expiredOrders = await Order.find({
        status: 'pendiente_pago',
        expiresAt: { $lte: new Date() }
      });

      let recoveredCount = 0;

      for (const order of expiredOrders) {
        // Cambio de estado atómico para evitar doble restitución
        const lockedOrder = await Order.findOneAndUpdate(
          { _id: order._id, status: 'pendiente_pago' },
          { status: 'cancelada' }
        );

        if (lockedOrder) {
          recoveredCount++;
          for (const item of lockedOrder.items) {
            await Product.findByIdAndUpdate(item.product, {
              $inc: { stock: item.quantity, soldCount: -item.quantity },
              $set: { status: 'activa' }
            });
          }
        }
      }

      if (recoveredCount > 0) {
        console.log(`[miecommerce Cron] ${recoveredCount} órdenes expiradas; stock restituido.`);
      }
    } catch (error) {
      console.error('[miecommerce Cron Error]:', error.message);
    }
  });
};