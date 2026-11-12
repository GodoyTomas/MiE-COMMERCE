// miecommerce/server.js
require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./src/config/db');
const { initSocket } = require('./src/config/socket');
const { startStockRecoveryCron } = require('./src/services/stockCronService');
const apiRoutes = require('./src/routes/api.routes');

const app = express();
const server = http.createServer(app);

// Inicializar WebSockets (Socket.io)
initSocket(server);

// Middlewares
app.use(cors());
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Cabeceras de seguridad HTTP (ajustado para permitir imágenes externas y QR)
app.use(helmet({ contentSecurityPolicy: false }));

// Limitador contra fuerza bruta: máximo 120 peticiones cada 15 minutos por IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { error: 'Demasiadas peticiones desde esta IP. Intenta nuevamente en 15 minutos.' }
});
app.use('/api', apiLimiter);
app.use(express.json());

// Servir archivos estáticos del Frontend (carpeta public)
app.use(express.static(path.join(__dirname, 'public')));

// Rutas de la API REST
app.use('/api', apiRoutes);

// Conectar a Filess.io e iniciar el servidor
connectDB().then(() => {
  startStockRecoveryCron();

  const PORT = process.env.PORT || 4000;
  server.listen(PORT, () => {
    console.log(`[miecommerce] Servidor corriendo en http://localhost:${PORT}`);
  });
});