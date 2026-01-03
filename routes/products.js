import express from 'express';
import Product from '../models/Product.js';

const router = express.Router();

// @route   GET /api/products
// @desc    Get all products (with optional category filter)
// @access  Public
router.get('/', async (req, res) => {
    try {
        const { category, inStock, search } = req.query;

        let query = {};

        // Filter by category
        if (category) {
            query.category = category.toLowerCase();
        }

        // Filter by stock status
        if (inStock !== undefined) {
            query.inStock = inStock === 'true';
        }

        // Search in name and description
        if (search) {
            query.$text = { $search: search };
        }

        const products = await Product.find(query).sort({ createdAt: -1 });

        res.json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (error) {
        console.error('Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching products',
            error: error.message
        });
    }
});

// @route   GET /api/products/:id
// @desc    Get single product by ID
// @access  Public
router.get('/:id', async (req, res) => {
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
            message: 'Server error while fetching product',
            error: error.message
        });
    }
});

// @route   POST /api/products
// @desc    Create a new product (Admin only - add auth middleware later)
// @access  Private/Admin
router.post('/', async (req, res) => {
    try {
        const product = new Product(req.body);
        await product.save();

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });
    } catch (error) {
        console.error('Create product error:', error);

        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Product with this ID already exists'
            });
        }

        res.status(400).json({
            success: false,
            message: 'Failed to create product',
            error: error.message
        });
    }
});

// @route   PUT /api/products/:id
// @desc    Update a product (Admin only - add auth middleware later)
// @access  Private/Admin
router.put('/:id', async (req, res) => {
    try {
        const product = await Product.findOneAndUpdate(
            { id: req.params.id },
            req.body,
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
        res.status(400).json({
            success: false,
            message: 'Failed to update product',
            error: error.message
        });
    }
});

// @route   DELETE /api/products/:id
// @desc    Delete a product (Admin only - add auth middleware later)
// @access  Private/Admin
router.delete('/:id', async (req, res) => {
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
            message: 'Failed to delete product',
            error: error.message
        });
    }
});

// @route   GET /api/products/categories/list
// @desc    Get all unique categories
// @access  Public
router.get('/categories/list', async (req, res) => {
    try {
        const categories = await Product.distinct('category');

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching categories',
            error: error.message
        });
    }
});

export default router;
