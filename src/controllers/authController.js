// miecommerce/src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Question = require('../models/Question');

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: 'El correo ya está registrado' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });

    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, wallet: user.wallet } });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: 'Credenciales inválidas' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, wallet: user.wallet } });
  } catch (error) {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// Panel de Usuario Completo (Compra / Venta / Billetera Escrow / Preguntas)
exports.getUserDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const [profile, myProducts, myPurchases, mySales, pendingQuestions] = await Promise.all([
      User.findById(userId).select('-passwordHash'),
      Product.find({ seller: userId }).sort('-createdAt'),
      Order.find({ buyer: userId }).sort('-createdAt').populate('items.product', 'title images'),
      Order.find({ 'items.seller': userId }).sort('-createdAt').populate('buyer', 'name email'),
      Question.find({ seller: userId, status: 'pendiente' }).populate('product', 'title images')
    ]);

    res.json({ profile, myProducts, myPurchases, mySales, pendingQuestions });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener datos del panel de usuario' });
  }
};