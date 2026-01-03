import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    productId: {
        type: String,
        required: [true, 'Product ID is required'],
        trim: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required']
    },
    userName: {
        type: String,
        required: [true, 'User name is required'],
        trim: true
    },
    userEmail: {
        type: String,
        required: [true, 'User email is required'],
        trim: true,
        lowercase: true
    },
    rating: {
        type: Number,
        required: [true, 'Rating is required'],
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot exceed 5']
    },
    title: {
        type: String,
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    comment: {
        type: String,
        required: [true, 'Review comment is required'],
        trim: true,
        minlength: [10, 'Review must be at least 10 characters'],
        maxlength: [1000, 'Review cannot exceed 1000 characters']
    },
    isVerifiedPurchase: {
        type: Boolean,
        default: false
    },
    helpfulVotes: {
        type: Number,
        default: 0
    },
    helpfulVoters: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    isApproved: {
        type: Boolean,
        default: true // Auto-approve reviews, can be changed to false for moderation
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field on save
reviewSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Compound index to ensure one review per user per product
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

// Index for efficient queries
reviewSchema.index({ productId: 1, createdAt: -1 });
reviewSchema.index({ productId: 1, rating: -1 });

// Static method to get average rating for a product
reviewSchema.statics.getAverageRating = async function (productId) {
    const result = await this.aggregate([
        { $match: { productId: productId, isApproved: true } },
        {
            $group: {
                _id: '$productId',
                averageRating: { $avg: '$rating' },
                totalReviews: { $sum: 1 },
                ratingDistribution: {
                    $push: '$rating'
                }
            }
        }
    ]);

    if (result.length > 0) {
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        result[0].ratingDistribution.forEach(rating => {
            distribution[rating]++;
        });

        return {
            averageRating: Math.round(result[0].averageRating * 10) / 10,
            totalReviews: result[0].totalReviews,
            ratingDistribution: distribution
        };
    }

    return {
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };
};

// Instance method to format review for API response
reviewSchema.methods.toJSON = function () {
    const reviewObject = this.toObject();
    reviewObject.id = reviewObject._id;
    delete reviewObject._id;
    delete reviewObject.__v;
    delete reviewObject.helpfulVoters;
    return reviewObject;
};

const Review = mongoose.model('Review', reviewSchema);

export default Review;
