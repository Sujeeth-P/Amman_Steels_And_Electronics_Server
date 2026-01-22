import express from 'express';
import { body, validationResult, query } from 'express-validator';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import { authenticate, authorize, ROLES, PERMISSIONS } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// @route   GET /api/admin/products
// @desc    Get all products with pagination (Admin view with more details)
// @access  Private (all admin roles)
router.get('/', authorize(...PERMISSIONS.VIEW_PRODUCTS), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Build filter
        const filter = {};
        if (req.query.category) filter.category = req.query.category;
        if (req.query.inStock !== undefined) filter.inStock = req.query.inStock === 'true';
        if (req.query.search) {
            filter.$or = [
                { name: { $regex: req.query.search, $options: 'i' } },
                { id: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        const [products, total] = await Promise.all([
            Product.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Product.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: {
                products,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/admin/products/stats
// @desc    Get product statistics
// @access  Private (admin, super_admin)
router.get('/stats', authorize(...PERMISSIONS.MANAGE_PRODUCTS), async (req, res) => {
    try {
        const [
            totalProducts,
            inStockProducts,
            categoryStats
        ] = await Promise.all([
            Product.countDocuments(),
            Product.countDocuments({ inStock: true }),
            Product.aggregate([
                { $group: { _id: '$category', count: { $sum: 1 } } }
            ])
        ]);

        const categories = {};
        categoryStats.forEach(c => {
            categories[c._id] = c.count;
        });

        res.json({
            success: true,
            data: {
                total: totalProducts,
                inStock: inStockProducts,
                outOfStock: totalProducts - inStockProducts,
                byCategory: categories
            }
        });
    } catch (error) {
        console.error('Get product stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/admin/products/:id
// @desc    Get single product
// @access  Private (all admin roles)
router.get('/:id', authorize(...PERMISSIONS.VIEW_PRODUCTS), async (req, res) => {
    try {
        const product = await Product.findOne({ id: req.params.id });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            data: product
        });
    } catch (error) {
        console.error('Get product error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   POST /api/admin/products
// @desc    Create new product
// @access  Private (admin, super_admin)
router.post('/', authorize(...PERMISSIONS.MANAGE_PRODUCTS), [
    body('name').trim().notEmpty().withMessage('Product name is required'),
    body('category').isIn(['steel', 'cement', 'electronics', 'paints']).withMessage('Invalid category'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
    body('unit').trim().notEmpty().withMessage('Unit is required'),
    body('description').trim().notEmpty().withMessage('Description is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { name, category, price, unit, description, longDescription, specs, image, inStock } = req.body;

        // Generate unique ID
        const prefix = category.substring(0, 3).toUpperCase();
        const count = await Product.countDocuments({ category });
        const id = `${prefix}${String(count + 1).padStart(3, '0')}`;

        const product = new Product({
            id,
            name,
            category,
            price,
            unit,
            description,
            longDescription,
            specs,
            image: image || 'https://via.placeholder.com/300',
            inStock: inStock !== undefined ? inStock : true
        });

        await product.save();

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });
    } catch (error) {
        console.error('Create product error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/admin/products/:id
// @desc    Update product
// @access  Private (admin, super_admin)
router.put('/:id', authorize(...PERMISSIONS.MANAGE_PRODUCTS), async (req, res) => {
    try {
        const { name, category, price, unit, description, longDescription, specs, image, inStock } = req.body;

        const updateData = {};
        if (name) updateData.name = name;
        if (category) updateData.category = category;
        if (price !== undefined) updateData.price = price;
        if (unit) updateData.unit = unit;
        if (description) updateData.description = description;
        if (longDescription !== undefined) updateData.longDescription = longDescription;
        if (specs) updateData.specs = specs;
        if (image) updateData.image = image;
        if (inStock !== undefined) updateData.inStock = inStock;

        const product = await Product.findOneAndUpdate(
            { id: req.params.id },
            updateData,
            { new: true, runValidators: true }
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product updated successfully',
            data: product
        });
    } catch (error) {
        console.error('Update product error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   DELETE /api/admin/products/:id
// @desc    Delete product
// @access  Private (admin, super_admin)
router.delete('/:id', authorize(...PERMISSIONS.MANAGE_PRODUCTS), async (req, res) => {
    try {
        const product = await Product.findOneAndDelete({ id: req.params.id });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

export default router;
