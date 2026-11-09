// miecommerce/src/controllers/questionController.js
const Question = require('../models/Question');
const Product = require('../models/Product');
const { getIO } = require('../config/socket');
const { pushNotification } = require('../services/notificationService');

exports.askQuestion = async (req, res) => {
  try {
    const { productId, questionText } = req.body;
    const product = await Product.findById(productId);

    if (!product) return res.status(404).json({ error: 'Artículo no encontrado' });
    if (product.seller.toString() === req.user.id) {
      return res.status(400).json({ error: 'No puedes preguntar en tu propia publicación' });
    }

    const question = await Question.create({
      product: productId,
      buyer: req.user.id,
      seller: product.seller,
      questionText
    });

    getIO().to(`user_${product.seller}`).emit('nueva_pregunta_recibida', {
      productId: product._id,
      productTitle: product.title,
      question
    });

    await pushNotification(
      product.seller,
      `💬 Pregunta en "${product.title}": "${questionText}"`,
      'question'
    );

    getIO().to(`product_${product._id}`).emit('actualizar_preguntas_articulo', question);

    res.status(201).json(question);
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar la pregunta' });
  }
};

exports.answerQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { answerText } = req.body;

    const question = await Question.findOneAndUpdate(
      { _id: questionId, seller: req.user.id, status: 'pendiente' },
      { answerText, status: 'respondida', answeredAt: new Date() },
      { new: true }
    ).populate('product', 'title');

    if (!question) return res.status(404).json({ error: 'Pregunta no encontrada o ya respondida' });

    getIO().to(`user_${question.buyer}`).emit('pregunta_respondida', {
      productId: question.product._id,
      productTitle: question.product.title,
      questionText: question.questionText,
      answerText: question.answerText
    });

    await pushNotification(
      question.buyer,
      `✅ Respondieron tu pregunta en "${question.product.title}": "${answerText}"`,
      'answer'
    );

    getIO().to(`product_${question.product._id}`).emit('actualizar_preguntas_articulo', question);

    res.json(question);
  } catch (error) {
    res.status(500).json({ error: 'Error al responder la pregunta' });
  }
};