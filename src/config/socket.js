// miecommerce/src/config/socket.js
const { Server } = require('socket.io');
let io;

exports.initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST'] }
  });

  io.on('connection', (socket) => {
    // El cliente envía su userId al iniciar sesión para recibir alertas en su panel
    socket.on('registrar_usuario', (userId) => {
      socket.join(`user_${userId}`);
    });

    // El cliente entra a la vista de un artículo
    socket.on('viendo_articulo', (productId) => {
      socket.join(`product_${productId}`);
    });

    socket.on('salir_articulo', (productId) => {
      socket.leave(`product_${productId}`);
    });
  });

  return io;
};

exports.getIO = () => {
  if (!io) throw new Error('Socket.io no ha sido inicializado');
  return io;
};