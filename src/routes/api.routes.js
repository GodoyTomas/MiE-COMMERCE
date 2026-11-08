// miecommerce/src/routes/api.routes.js
const express = require('express');
const router = express.Router();

const { verifyToken, optionalAuth } = require('../middlewares/authMiddleware');
const authController = require('../controllers/authController');
const productController = require('../controllers/productController');
const carouselController = require('../controllers/carouselController');
const questionController = require('../controllers/questionController');
const orderAndReviewController = require('../controllers/orderAndReviewController');

// ==========================================
// 1. AUTENTICACIÓN Y PANEL DE USUARIO
// ==========================================
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/panel/dashboard', verifyToken, authController.getUserDashboard);

// ==========================================
// 2. EXPLORADOR, CARRUSEL Y ARTÍCULOS
// ==========================================
// Carrusel dinámico ("Inspirado en lo último que viste" o mejores valorados)
router.get('/products/carousel', optionalAuth, carouselController.getDynamicCarousel);

// Buscador por nombre, categoría, condición y rango de precios
router.get('/products/search', productController.searchProducts);

// Vista detalle del artículo (incluye stock, barra de satisfacción, preguntas y reseñas)
router.get('/products/:id', optionalAuth, productController.getProductDetails);

// Publicar artículo y administrar unidades de stock
router.post('/products', verifyToken, productController.createProduct);
router.patch('/products/:id', verifyToken, productController.updateProductStockOrStatus);

// ==========================================
// 3. PREGUNTAS Y RESPUESTAS (con Socket.io)
// ==========================================
router.post('/questions', verifyToken, questionController.askQuestion);
router.patch('/questions/:questionId/answer', verifyToken, questionController.answerQuestion);

// ==========================================
// 4. CHECKOUT (QR / TARJETA), ESCROW Y RESEÑAS
// ==========================================
// Crear orden y descontar stock atómicamente
router.post('/orders/checkout', verifyToken, orderAndReviewController.checkout);

// Webhook de confirmación de pago (Mercado Pago / Simulador QR y Tarjeta)
router.post('/webhooks/mercadopago', orderAndReviewController.paymentWebhook);

// Comprador confirma que recibió el paquete -> Libera fondos Escrow al vendedor
router.patch('/orders/:orderId/confirm-delivery', verifyToken, orderAndReviewController.confirmDelivery);

// Comprador valora la satisfacción (1-5 estrellas) -> Recalcula promedio del artículo
router.post('/reviews', verifyToken, orderAndReviewController.createReview);

module.exports = router;