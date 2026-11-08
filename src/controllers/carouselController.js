// miecommerce/src/controllers/carouselController.js
const User = require('../models/User');
const Product = require('../models/Product');

// Middleware o función llamada dentro de getProductDetails
exports.trackProductView = async (userId, product) => {
  if (!userId) return;
  await User.findByIdAndUpdate(userId, {
    $push: {
      recentlyViewed: {
        $each: [{ product: product._id, category: product.category, viewedAt: new Date() }],
        $position: 0,
        $slice: 10 // Mantiene únicamente los últimos 10 artículos visitados
      }
    }
  });
};

// Endpoint para el Carrusel Principal de miecommerce
exports.getDynamicCarousel = async (req, res) => {
  try {
    let recommendedProducts = [];
    let recentCategories = [];

    if (req.user) {
      const user = await User.findById(req.user.id).select('recentlyViewed');
      if (user && user.recentlyViewed.length > 0) {
        recentCategories = [...new Set(user.recentlyViewed.map(item => item.category))];
        const viewedIds = user.recentlyViewed.map(item => item.product);

        recommendedProducts = await Product.find({
          category: { $in: recentCategories },
          _id: { $nin: viewedIds },
          status: 'activa',
          stock: { $gt: 0 }
        })
          .sort({ 'ratingSummary.average': -1, soldCount: -1 })
          .limit(12);
      }
    }

    // Fallback si el usuario es nuevo o hay pocos artículos en sus categorías vistas
    if (recommendedProducts.length < 6) {
      const fallbackProducts = await Product.find({ status: 'activa', stock: { $gt: 0 } })
        .sort({ 'ratingSummary.average': -1, soldCount: -1 })
        .limit(12);
      recommendedProducts = fallbackProducts;
    }

    res.json({
      carouselTitle: recentCategories.length > 0
        ? `Inspirado en tus visitas a ${recentCategories.slice(0, 2).join(' y ')}`
        : 'Ofertas Destacadas y Mejor Valoradas',
      items: recommendedProducts
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al generar el carrusel dinámico' });
  }
};