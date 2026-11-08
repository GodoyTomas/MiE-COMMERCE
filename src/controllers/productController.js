// src/controllers/productController.js
const Product = require('../models/Product');
const Question = require('../models/Question');
const Review = require('../models/Review');

exports.searchProducts = async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, condition, sort = '-soldCount', page = 1, limit = 20 } = req.query;
    const filter = { status: 'activa', stock: { $gt: 0 } };

    if (q) {
      filter.$text = { $search: q };
    }
    if (category) {
      filter.category = category;
    }
    if (condition) {
      filter.condition = condition;
    }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .sort(q ? { score: { $meta: 'textScore' } } : sort)
        .skip(skip)
        .limit(Number(limit))
        .populate('seller', 'name reputation.sellerRating'),
      Product.countDocuments(filter)
    ]);

    res.json({
      total,
      pages: Math.ceil(total / limit),
      currentPage: Number(page),
      products
    });
  } catch (error) {
    res.status(500).json({ error: 'Error en la búsqueda de artículos' });
  }
};

// Vista completa del artículo (incluye Preguntas y Valoraciones)
exports.getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const [product, questions, reviews] = await Promise.all([
      Product.findById(id).populate('seller', 'name reputation'),
      Question.find({ product: id }).sort('-createdAt').limit(15).populate('buyer', 'name'),
      Review.find({ product: id }).sort('-createdAt').limit(10).populate('buyer', 'name')
    ]);

    if (!product) return res.status(404).json({ error: 'Artículo no encontrado' });

    res.json({ product, questions, reviews });
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar el artículo' });
  }
};

// Agregar a miecommerce/src/controllers/productController.js
const { trackProductView } = require('./carouselController');

// Publicar un nuevo artículo con unidades de stock
exports.createProduct = async (req, res) => {
  try {
    const { title, description, category, price, stock, images, condition } = req.body;
    const product = await Product.create({
      seller: req.user.id,
      title,
      description,
      category,
      price: Number(price),
      stock: Number(stock),
      images: images || [],
      condition: condition || 'nuevo',
      status: Number(stock) > 0 ? 'activa' : 'sin_stock'
    });
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: 'Error al publicar el artículo' });
  }
};

// Actualizar unidades de stock, precio o pausar publicación desde el panel
exports.updateProductStockOrStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock, price, status } = req.body;

    const product = await Product.findOne({ _id: id, seller: req.user.id });
    if (!product) return res.status(404).json({ error: 'Publicación no encontrada o no eres el vendedor' });

    if (stock !== undefined) {
      product.stock = Number(stock);
      if (product.stock > 0 && product.status === 'sin_stock') product.status = 'activa';
      if (product.stock === 0) product.status = 'sin_stock';
    }
    if (price !== undefined) product.price = Number(price);
    if (status !== undefined) product.status = status;

    await product.save();
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el artículo' });
  }
};