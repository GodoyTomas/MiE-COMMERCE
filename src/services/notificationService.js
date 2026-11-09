// miecommerce/src/services/notificationService.js
const User = require('../models/User');
const { getIO } = require('../config/socket');

exports.pushNotification = async (userId, text, type = 'info') => {
  try {
    if (!userId) return;
    const notif = { text, type, read: false, createdAt: new Date() };

    await User.findByIdAndUpdate(userId, {
      $push: {
        notifications: {
          $each: [notif],
          $position: 0,
          $slice: 30
        }
      }
    });

    try {
      getIO().to(`user_${userId}`).emit('nueva_notificacion_campana', notif);
    } catch (socketErr) {
      // Si el usuario no tiene socket abierto, queda guardada en MongoDB
    }
  } catch (err) {
    console.error('[Notificación Error]:', err.message);
  }
};