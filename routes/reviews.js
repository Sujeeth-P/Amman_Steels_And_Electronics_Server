import express from 'express';
import jwt from 'jsonwebtoken';
import Review from '../models/Review.js';
import User from '../models/User.js';

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
};

// Optional auth - doesn't fail if no token, just sets req.user if valid
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);
            if (user) {
                req.user = user;
            }
        }
        next();
    } catch (error) {
        // Token invalid, continue without user
        next();
    }
};

// GET /api/reviews/:productId - Get all reviews for a product
router.get('/:productId', optionalAuth, async (req, res) => {
    try {
        const { productId } = req.params;
        const { sort = 'newest', page = 1, limit = 10 } = req.query;

        // Determine sort order
        let sortOption = { createdAt: -1 }; // Default: newest first
        if (sort === 'oldest') sortOption = { createdAt: 1 };
        if (sort === 'highest') sortOption = { rating: -1, createdAt: -1 };
        if (sort === 'lowest') sortOption = { rating: 1, createdAt: -1 };
        if (sort === 'helpful') sortOption = { helpfulVotes: -1, createdAt: -1 };

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get reviews
        const reviews = await Review.find({
            productId,
            isApproved: true
        })
            .sort(sortOption)
            .skip(skip)
            .limit(parseInt(limit));

        // Get total count
        const totalReviews = await Review.countDocuments({
            productId,
            isApproved: true
        });

        // Get rating statistics
        const stats = await Review.getAverageRating(productId);

        // Check if current user has reviewed this product
        let userReview = null;
        if (req.user) {
            userReview = await Review.findOne({
                productId,
                userId: req.user._id
            });
        }

        res.json({
            success: true,
            reviews,
            stats,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalReviews / parseInt(limit)),
                totalReviews,
                hasMore: skip + reviews.length < totalReviews
            },
            userHasReviewed: !!userReview,
            userReview
        });

    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch reviews'
        });
    }
});

// POST /api/reviews/:productId - Create a new review
router.post('/:productId', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.params;
        const { rating, title, comment } = req.body;
        const user = req.user;

        // Validate rating
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        // Validate comment
        if (!comment || comment.trim().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Review must be at least 10 characters'
            });
        }

        // Check if user already reviewed this product
        const existingReview = await Review.findOne({
            productId,
            userId: user._id
        });

        if (existingReview) {
            return res.status(400).json({
                success: false,
                message: 'You have already reviewed this product. You can edit your existing review.'
            });
        }

        // Create review
        const review = new Review({
            productId,
            userId: user._id,
            userName: user.name,
            userEmail: user.email,
            rating,
            title: title?.trim() || '',
            comment: comment.trim()
        });

        await review.save();

        // Get updated stats
        const stats = await Review.getAverageRating(productId);

        res.status(201).json({
            success: true,
            message: 'Review submitted successfully',
            review,
            stats
        });

    } catch (error) {
        console.error('Create review error:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'You have already reviewed this product'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to submit review'
        });
    }
});

// PUT /api/reviews/:reviewId - Update a review
router.put('/:reviewId', authenticateToken, async (req, res) => {
    try {
        const { reviewId } = req.params;
        const { rating, title, comment } = req.body;
        const user = req.user;

        // Find the review
        const review = await Review.findById(reviewId);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        // Check if user owns this review
        if (review.userId.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only edit your own reviews'
            });
        }

        // Validate rating
        if (rating && (rating < 1 || rating > 5)) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        // Validate comment
        if (comment && comment.trim().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Review must be at least 10 characters'
            });
        }

        // Update fields
        if (rating) review.rating = rating;
        if (title !== undefined) review.title = title.trim();
        if (comment) review.comment = comment.trim();

        await review.save();

        // Get updated stats
        const stats = await Review.getAverageRating(review.productId);

        res.json({
            success: true,
            message: 'Review updated successfully',
            review,
            stats
        });

    } catch (error) {
        console.error('Update review error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update review'
        });
    }
});

// DELETE /api/reviews/:reviewId - Delete a review
router.delete('/:reviewId', authenticateToken, async (req, res) => {
    try {
        const { reviewId } = req.params;
        const user = req.user;

        // Find the review
        const review = await Review.findById(reviewId);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        // Check if user owns this review or is admin
        if (review.userId.toString() !== user._id.toString() && user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own reviews'
            });
        }

        const productId = review.productId;
        await Review.findByIdAndDelete(reviewId);

        // Get updated stats
        const stats = await Review.getAverageRating(productId);

        res.json({
            success: true,
            message: 'Review deleted successfully',
            stats
        });

    } catch (error) {
        console.error('Delete review error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete review'
        });
    }
});

// POST /api/reviews/:reviewId/helpful - Mark a review as helpful
router.post('/:reviewId/helpful', authenticateToken, async (req, res) => {
    try {
        const { reviewId } = req.params;
        const user = req.user;

        const review = await Review.findById(reviewId);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        // Check if user already voted
        const alreadyVoted = review.helpfulVoters.includes(user._id);

        if (alreadyVoted) {
            // Remove vote
            review.helpfulVoters = review.helpfulVoters.filter(
                id => id.toString() !== user._id.toString()
            );
            review.helpfulVotes = Math.max(0, review.helpfulVotes - 1);
        } else {
            // Add vote
            review.helpfulVoters.push(user._id);
            review.helpfulVotes += 1;
        }

        await review.save();

        res.json({
            success: true,
            message: alreadyVoted ? 'Vote removed' : 'Review marked as helpful',
            helpfulVotes: review.helpfulVotes,
            userVoted: !alreadyVoted
        });

    } catch (error) {
        console.error('Helpful vote error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update vote'
        });
    }
});

export default router;
