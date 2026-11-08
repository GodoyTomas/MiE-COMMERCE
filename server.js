// miecommerce/server.js
require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { initSocket } = require('./src/config/socket');
const { startStockRecoveryCron } = require('./src/services/stockCronService');
const apiRoutes = require('./src/routes/api.routes');

const app = express();
const server = http.createServer(app);

// Inicializar Socket.io para notificaciones en tiempo real
initSocket(server);

app.use(cors());
app.use(express.json());
app.use('/api', apiRoutes);

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('[miecommerce] Conectado a MongoDB');
    // Iniciar el Cron Job que devuelve el stock de pagos abandonados
    startStockRecoveryCron();

    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => {
      console.log(`[miecommerce] Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((err) => console.error('Error conectando a MongoDB:', err));