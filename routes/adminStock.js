import express from 'express';
import { body, validationResult, query } from 'express-validator';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import { authenticate, authorize, PERMISSIONS } from '../middleware/auth.js';
import { checkAndAlertLowStock, sendLowStockBatchAlert } from '../utils/mailer.js';

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
        const allProducts = await Product.find().select('name id category stockQuantity lowStockThreshold inStock unit');

        const totalProducts = allProducts.length;
        const inStockProducts = allProducts.filter(p => p.stockQuantity > 0).length;
        const outOfStockProducts = allProducts.filter(p => p.stockQuantity <= 0).length;
        const lowStockProducts = allProducts.filter(p => p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold).length;

        const recentMovements = await StockMovement.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 }, totalQuantity: { $sum: '$quantity' } } }
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
                outOfStock: outOfStockProducts,
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

// @route   GET /api/admin/stock/levels
// @desc    Get all products with stock levels for visualization
// @access  Private (admin, super_admin)
router.get('/levels', authorize(...PERMISSIONS.MANAGE_STOCK), async (req, res) => {
    try {
        const { category, status, search } = req.query;

        let query = {};
        if (category) query.category = category.toLowerCase();
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { id: { $regex: search, $options: 'i' } }
            ];
        }

        let products = await Product.find(query)
            .select('name id category stockQuantity lowStockThreshold inStock unit price image')
            .sort({ stockQuantity: 1 });

        // Filter by status after fetching
        if (status === 'low') {
            products = products.filter(p => p.stockQuantity > 0 && p.stockQuantity <= p.lowStockThreshold);
        } else if (status === 'out') {
            products = products.filter(p => p.stockQuantity <= 0);
        } else if (status === 'healthy') {
            products = products.filter(p => p.stockQuantity > p.lowStockThreshold);
        }

        res.json({
            success: true,
            data: {
                products,
                count: products.length
            }
        });
    } catch (error) {
        console.error('Get stock levels error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/admin/stock/update-quantity/:productId
// @desc    Directly update stock quantity for a product
// @access  Private (admin, super_admin)
router.put('/update-quantity/:productId', authorize(...PERMISSIONS.MANAGE_STOCK), [
    body('stockQuantity').isInt({ min: 0 }).withMessage('Stock quantity must be 0 or greater'),
    body('lowStockThreshold').optional().isInt({ min: 0 }).withMessage('Threshold must be 0 or greater')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const product = await Product.findOne({ id: req.params.productId });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const previousStock = product.stockQuantity || 0;
        const newStock = parseInt(req.body.stockQuantity);
        const diff = newStock - previousStock;

        // Update product
        product.stockQuantity = newStock;
        product.inStock = newStock > 0;
        if (req.body.lowStockThreshold !== undefined) {
            product.lowStockThreshold = parseInt(req.body.lowStockThreshold);
        }
        await product.save();

        // Create stock movement record
        if (diff !== 0) {
            const movement = new StockMovement({
                product: product._id,
                type: diff > 0 ? 'stock_in' : 'stock_out',
                quantity: Math.abs(diff),
                previousStock,
                newStock,
                notes: `Direct stock update: ${previousStock} → ${newStock}`,
                createdBy: req.user._id
            });
            await movement.save();
        }

        // Check and send low stock alert if needed
        await checkAndAlertLowStock(product, newStock);

        res.json({
            success: true,
            message: 'Stock quantity updated successfully',
            data: {
                product: {
                    id: product.id,
                    name: product.name,
                    stockQuantity: product.stockQuantity,
                    lowStockThreshold: product.lowStockThreshold,
                    inStock: product.inStock
                }
            }
        });
    } catch (error) {
        console.error('Update stock quantity error:', error);
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

        const previousStock = product.stockQuantity || 0;
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

        // Update product stock quantity
        product.stockQuantity = newStock;
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

        const previousStock = product.stockQuantity || 0;

        if (previousStock < quantity) {
            return res.status(400).json({
                success: false,
                message: `Insufficient stock. Available: ${previousStock}, Requested: ${quantity}`
            });
        }

        const newStock = previousStock - quantity;

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

        // Update product stock
        product.stockQuantity = newStock;
        product.inStock = newStock > 0;
        await product.save();

        // Check and send low stock alert if needed
        await checkAndAlertLowStock(product, newStock);

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

        const previousStock = product.stockQuantity || 0;
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
        product.stockQuantity = newStock;
        product.inStock = newStock > 0;
        await product.save();

        // Check and send low stock alert if needed
        await checkAndAlertLowStock(product, newStock);

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

// @route   POST /api/admin/stock/check-alerts
// @desc    Manually trigger low stock check for all products
// @access  Private (admin, super_admin)
router.post('/check-alerts', authorize(...PERMISSIONS.MANAGE_STOCK), async (req, res) => {
    try {
        const lowStockProducts = await Product.find({
            stockQuantity: { $gt: 0 },
            $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] }
        });

        const outOfStockProducts = await Product.find({ stockQuantity: 0 });

        // Send ONE consolidated email with all low stock items
        await sendLowStockBatchAlert(lowStockProducts, outOfStockProducts);

        res.json({
            success: true,
            message: `Found ${lowStockProducts.length} low stock and ${outOfStockProducts.length} out of stock products. Alert email sent.`,
            data: {
                lowStock: lowStockProducts.map(p => ({ id: p.id, name: p.name, stockQuantity: p.stockQuantity, threshold: p.lowStockThreshold })),
                outOfStock: outOfStockProducts.map(p => ({ id: p.id, name: p.name }))
            }
        });
    } catch (error) {
        console.error('Check alerts error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

export default router;
