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
    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email, wallet: user.wallet, favorites: [] } });
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
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, wallet: user.wallet, favorites: user.favorites || [] } });
  } catch (error) {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

exports.getUserDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const [profile, myProducts, myPurchases, mySales, pendingQuestions] = await Promise.all([
      User.findById(userId).select('-passwordHash').populate('favorites'),
      Product.find({ seller: userId }).sort('-createdAt'),
      Order.find({ buyer: userId }).sort('-createdAt').populate('items.product', 'title images').populate('items.seller', 'name email'),
      Order.find({ 'items.seller': userId }).sort('-createdAt').populate('buyer', 'name email'),
      Question.find({ seller: userId, status: 'pendiente' }).populate('product', 'title images')
    ]);

    res.json({ profile, myProducts, myPurchases, mySales, pendingQuestions });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener datos del panel de usuario' });
  }
};

// Agregar o quitar un artículo de Favoritos
exports.toggleFavorite = async (req, res) => {
  try {
    const { productId } = req.params;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const idx = user.favorites.findIndex(id => id.toString() === productId);
    let isFavorite = false;

    if (idx > -1) {
      user.favorites.splice(idx, 1);
    } else {
      user.favorites.push(productId);
      isFavorite = true;
    }

    await user.save();
    res.json({ isFavorite, favorites: user.favorites });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar favoritos' });
  }
};

// Retirar saldo disponible a CBU / Alias bancario o billetera virtual
exports.withdrawFunds = async (req, res) => {
  try {
    const { amount, cbuOrAlias } = req.body;
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0 || !cbuOrAlias) {
      return res.status(400).json({ error: 'Ingresa un monto válido y tu CBU o Alias' });
    }

    // Descuento atómico: solo descuenta si el saldo disponible alcanza
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, 'wallet.availableBalance': { $gte: numericAmount } },
      {
        $inc: { 'wallet.availableBalance': -numericAmount },
        $push: { withdrawals: { amount: numericAmount, cbuOrAlias: cbuOrAlias.trim() } }
      },
      { new: true }
    );

    if (!user) {
      return res.status(400).json({ error: 'Saldo disponible insuficiente para realizar el retiro.' });
    }

    res.json({
      message: `Transferencia de $${numericAmount.toLocaleString('es-AR')} enviada a ${cbuOrAlias}`,
      wallet: user.wallet,
      withdrawals: user.withdrawals
    });
  } catch (error) {
    res.status(500).json({ error: 'Error procesando el retiro' });
  }
};

// Agregar al final de miecommerce/src/controllers/authController.js
exports.markNotificationsRead = async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user.id },
      { $set: { 'notifications.$[].read': true } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al marcar notificaciones' });
  }
};