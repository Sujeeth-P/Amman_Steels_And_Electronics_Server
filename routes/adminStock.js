import express from 'express';
import { body, validationResult, query } from 'express-validator';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import { authenticate, authorize, PERMISSIONS } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// @route   GET /api/admin/stock/movements
// @desc    Get stock movements with pagination
// @access  Private (admin, super_admin)
router.get('/movements', authorize(...PERMISSIONS.MANAGE_STOCK), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Build filter
        const filter = {};
        if (req.query.type) filter.type = req.query.type;
        if (req.query.product) filter.product = req.query.product;
        if (req.query.startDate || req.query.endDate) {
            filter.createdAt = {};
            if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
            if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate);
        }

        const [movements, total] = await Promise.all([
            StockMovement.find(filter)
                .populate('product', 'name id category')
                .populate('createdBy', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            StockMovement.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: {
                movements,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get stock movements error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/admin/stock/summary
// @desc    Get stock summary
// @access  Private (admin, super_admin)
router.get('/summary', authorize(...PERMISSIONS.MANAGE_STOCK), async (req, res) => {
    try {
        const [
            totalProducts,
            inStockProducts,
            lowStockProducts,
            recentMovements
        ] = await Promise.all([
            Product.countDocuments(),
            Product.countDocuments({ inStock: true }),
            Product.countDocuments({ inStock: true }), // Simplified - would need stock quantity field
            StockMovement.aggregate([
                { $group: { _id: '$type', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' } } }
            ])
        ]);

        const movementStats = {};
        recentMovements.forEach(m => {
            movementStats[m._id] = {
                count: m.count,
                totalQuantity: m.totalQuantity
            };
        });

        res.json({
            success: true,
            data: {
                totalProducts,
                inStock: inStockProducts,
                outOfStock: totalProducts - inStockProducts,
                lowStock: lowStockProducts,
                movements: movementStats
            }
        });
    } catch (error) {
        console.error('Get stock summary error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/admin/stock/in
// @desc    Record stock in
// @access  Private (admin, super_admin)
router.post('/in', authorize(...PERMISSIONS.MANAGE_STOCK), [
    body('productId').notEmpty().withMessage('Product ID is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('unitPrice').optional().isFloat({ min: 0 }).withMessage('Unit price must be positive')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { productId, quantity, unitPrice, supplierName, invoiceNo, notes } = req.body;

        // Find product
        const product = await Product.findOne({ id: productId });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Calculate previous and new stock (simplified - using inStock boolean)
        const previousStock = product.inStock ? 1 : 0;
        const newStock = previousStock + quantity;

        // Create stock movement
        const movement = new StockMovement({
            product: product._id,
            type: 'stock_in',
            quantity,
            previousStock,
            newStock,
            unitPrice: unitPrice || product.price,
            totalValue: (unitPrice || product.price) * quantity,
            supplier: {
                name: supplierName,
                invoiceNo
            },
            notes,
            createdBy: req.user._id
        });

        await movement.save();

        // Update product stock
        product.inStock = true;
        await product.save();

        res.status(201).json({
            success: true,
            message: 'Stock in recorded successfully',
            data: movement
        });
    } catch (error) {
        console.error('Stock in error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/admin/stock/out
// @desc    Record stock out
// @access  Private (admin, super_admin)
router.post('/out', authorize(...PERMISSIONS.MANAGE_STOCK), [
    body('productId').notEmpty().withMessage('Product ID is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { productId, quantity, reason, notes } = req.body;

        // Find product
        const product = await Product.findOne({ id: productId });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Calculate previous and new stock
        const previousStock = product.inStock ? quantity : 0;
        const newStock = Math.max(0, previousStock - quantity);

        // Create stock movement
        const movement = new StockMovement({
            product: product._id,
            type: 'stock_out',
            quantity,
            previousStock,
            newStock,
            unitPrice: product.price,
            totalValue: product.price * quantity,
            notes: notes || reason,
            createdBy: req.user._id
        });

        await movement.save();

        // Update product stock if depleted
        if (newStock <= 0) {
            product.inStock = false;
            await product.save();
        }

        res.status(201).json({
            success: true,
            message: 'Stock out recorded successfully',
            data: movement
        });
    } catch (error) {
        console.error('Stock out error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/admin/stock/adjustment
// @desc    Record stock adjustment
// @access  Private (admin, super_admin)
router.post('/adjustment', authorize(...PERMISSIONS.MANAGE_STOCK), [
    body('productId').notEmpty().withMessage('Product ID is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('type').isIn(['adjustment', 'return', 'damage']).withMessage('Invalid adjustment type')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { productId, quantity, type, notes } = req.body;

        // Find product
        const product = await Product.findOne({ id: productId });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Calculate stock
        const previousStock = product.inStock ? 1 : 0;
        const newStock = type === 'return' ? previousStock + quantity : Math.max(0, previousStock - quantity);

        // Create stock movement
        const movement = new StockMovement({
            product: product._id,
            type,
            quantity,
            previousStock,
            newStock,
            notes,
            createdBy: req.user._id
        });

        await movement.save();

        // Update product stock
        product.inStock = newStock > 0;
        await product.save();

        res.status(201).json({
            success: true,
            message: 'Stock adjustment recorded successfully',
            data: movement
        });
    } catch (error) {
        console.error('Stock adjustment error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

export default router;
