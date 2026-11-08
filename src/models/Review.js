// src/models/Review.js
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true }, // Solo 1 reseña por compra verificada
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, maxlength: 1000 }
}, { timestamps: true });

// Hook post-save para recalcular automáticamente la satisfacción en el Producto
reviewSchema.statics.recalculateProductRating = async function(productId) {
  const stats = await this.aggregate([
    { $match: { product: productId } },
    {
      $group: {
        _id: '$product',
        avgRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
        star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } }
      }
    }
  ]);

  if (stats.length > 0) {
    await mongoose.model('Product').findByIdAndUpdate(productId, {
      ratingSummary: {
        average: Math.round(stats[0].avgRating * 10) / 10,
        count: stats[0].totalReviews,
        distribution: {
          1: stats[0].star1, 2: stats[0].star2, 3: stats[0].star3,
          4: stats[0].star4, 5: stats[0].star5
        }
      }
    });
  }
};

reviewSchema.post('save', function() {
  this.constructor.recalculateProductRating(this.product);
});

module.exports = mongoose.model('Review', reviewSchema);