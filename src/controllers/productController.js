// miecommerce/src/controllers/productController.js
const Product = require('../models/Product');
const User = require('../models/User');
const Question = require('../models/Question');
const Review = require('../models/Review');
const { trackProductView } = require('./carouselController');

exports.searchProducts = async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, condition, sellerId, sort = '-soldCount', page = 1, limit = 20 } = req.query;
    const filter = { status: 'activa', stock: { $gt: 0 } };

    if (q) filter.$text = { $search: q };
    if (category) filter.category = category;
    if (condition) filter.condition = condition;
    if (sellerId) filter.seller = sellerId;
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
        .populate('seller', 'name reputation'),
      Product.countDocuments(filter)
    ]);

    res.json({ total, pages: Math.ceil(total / limit), currentPage: Number(page), products });
  } catch (error) {
    res.status(500).json({ error: 'Error en la búsqueda de artículos' });
  }
};

// Autocompletado instantáneo en la barra de búsqueda
exports.getSearchSuggestions = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const suggestions = await Product.find({
      status: 'activa',
      stock: { $gt: 0 },
      $or: [{ title: regex }, { category: regex }]
    })
      .select('_id title category price discountPercent images')
      .limit(6);

    res.json(suggestions);
  } catch (error) {
    res.json([]);
  }
};

// Página de Tienda Oficial / Perfil Público del Vendedor
exports.getSellerPublicStore = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const [seller, products] = await Promise.all([
      User.findById(sellerId).select('name reputation createdAt'),
      Product.find({ seller: sellerId, status: 'activa', stock: { $gt: 0 } }).sort('-soldCount')
    ]);

    if (!seller) return res.status(404).json({ error: 'Tienda o vendedor no encontrado' });

    res.json({ seller, products });
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar la tienda del vendedor' });
  }
};

exports.getProductDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const [product, questions, reviews] = await Promise.all([
      Product.findById(id).populate('seller', 'name reputation createdAt'),
      Question.find({ product: id }).sort('-createdAt').limit(15).populate('buyer', 'name'),
      Review.find({ product: id }).sort('-createdAt').limit(10).populate('buyer', 'name')
    ]);

    if (!product) return res.status(404).json({ error: 'Artículo no encontrado' });

    if (req.user) {
      await trackProductView(req.user.id, product);
    }

    res.json({ product, questions, reviews });
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar el artículo' });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { title, description, category, price, discountPercent, stock, variants, imageUrl, images, condition } = req.body;

    let finalImages = [];
    if (req.files && req.files.length > 0) {
      finalImages = req.files.map(f => `/uploads/${f.filename}`);
    }
    if (imageUrl && imageUrl.trim() !== '') {
      finalImages.push(imageUrl.trim());
    } else if (Array.isArray(images)) {
      finalImages.push(...images);
    }
    if (finalImages.length === 0) {
      finalImages.push('https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600');
    }

    let parsedVariants = [];
    if (typeof variants === 'string' && variants.trim() !== '') {
      parsedVariants = variants.split(',').map(v => v.trim()).filter(Boolean);
    } else if (Array.isArray(variants)) {
      parsedVariants = variants;
    }

    const product = await Product.create({
      seller: req.user.id,
      title,
      description,
      category,
      price: Number(price),
      discountPercent: Math.min(90, Math.max(0, Number(discountPercent || 0))),
      stock: Number(stock),
      images: finalImages,
      variants: parsedVariants,
      condition: condition || 'nuevo',
      status: Number(stock) > 0 ? 'activa' : 'sin_stock'
    });
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: 'Error al publicar el artículo' });
  }
};

exports.updateProductStockOrStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock, price, discountPercent, status } = req.body;

    const product = await Product.findOne({ _id: id, seller: req.user.id });
    if (!product) return res.status(404).json({ error: 'Publicación no encontrada o no eres el vendedor' });

    if (stock !== undefined) {
      product.stock = Number(stock);
      if (product.stock > 0 && product.status === 'sin_stock') product.status = 'activa';
      if (product.stock === 0) product.status = 'sin_stock';
    }
    if (price !== undefined) product.price = Number(price);
    if (discountPercent !== undefined) {
      product.discountPercent = Math.min(90, Math.max(0, Number(discountPercent)));
    }
    if (status !== undefined) product.status = status;

    await product.save();
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el artículo' });
  }
};