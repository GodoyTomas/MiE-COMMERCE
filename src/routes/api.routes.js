// miecommerce/src/routes/api.routes.js
const express = require('express');
const router = express.Router();

const { verifyToken, optionalAuth } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const authController = require('../controllers/authController');
const productController = require('../controllers/productController');
const carouselController = require('../controllers/carouselController');
const questionController = require('../controllers/questionController');
const orderAndReviewController = require('../controllers/orderAndReviewController');

// 1. AUTENTICACIÓN, BILLETERA Y FAVORITOS
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/panel/dashboard', verifyToken, authController.getUserDashboard);
router.post('/users/favorites/:productId', verifyToken, authController.toggleFavorite);
router.post('/wallet/withdraw', verifyToken, authController.withdrawFunds);

// 2. EXPLORADOR, CARRUSEL Y ARTÍCULOS (con subida Multer de hasta 5 fotos)
router.get('/products/carousel', optionalAuth, carouselController.getDynamicCarousel);
router.get('/products/search', productController.searchProducts);
router.get('/products/:id', optionalAuth, productController.getProductDetails);
router.post('/products', verifyToken, upload.array('photos', 5), productController.createProduct);
router.patch('/products/:id', verifyToken, productController.updateProductStockOrStatus);

// 3. PREGUNTAS Y RESPUESTAS
router.post('/questions', verifyToken, questionController.askQuestion);
router.patch('/questions/:questionId/answer', verifyToken, questionController.answerQuestion);

// 4. CHECKOUT, ENVÍOS, CHAT POST-VENTA Y RESEÑAS
router.post('/orders/checkout', verifyToken, orderAndReviewController.checkout);
router.post('/webhooks/mercadopago', orderAndReviewController.paymentWebhook);
router.patch('/orders/:orderId/dispatch', verifyToken, orderAndReviewController.dispatchOrder);
router.patch('/orders/:orderId/shipping-stage', verifyToken, orderAndReviewController.updateShippingStage);
router.post('/orders/:orderId/messages', verifyToken, orderAndReviewController.sendOrderMessage);
router.patch('/orders/:orderId/confirm-delivery', verifyToken, orderAndReviewController.confirmDelivery);
router.post('/reviews', verifyToken, orderAndReviewController.createReview);

module.exports = router;