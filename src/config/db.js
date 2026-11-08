// miecommerce/src/config/db.js
const mongoose = require('mongoose');

exports.connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 5, // Importante en Filess.io gratuito para no superar el límite de conexiones simultáneas
      serverSelectionTimeoutMS: 5000
    });
    console.log('[miecommerce] Conectado exitosamente a MongoDB en Filess.io');
  } catch (error) {
    console.error('[miecommerce] Error conectando a Filess.io:', error.message);
    process.exit(1);
  }
};