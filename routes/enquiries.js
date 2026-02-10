import express from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Enquiry from '../models/Enquiry.js';
import Product from '../models/Product.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// POST /api/enquiries - Submit new enquiry (auth optional)
router.post('/', [
    body('customer.name').trim().notEmpty().withMessage('Name is required'),
    body('customer.email').optional().isEmail().withMessage('Invalid email'),
    body('customer.phone').optional().trim(),
    body('items').optional().isArray(),
    body('message').optional().trim().isLength({ max: 2000 }),
    body('source').optional().isIn(['cart', 'contact_form', 'product_page'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { customer, items, message, source } = req.body;

        // Try to get authenticated user from token (optional)
        let userId = null;
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const jwt = await import('jsonwebtoken');
                const token = authHeader.split(' ')[1];
                const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
                userId = decoded.userId || decoded.id;
            } catch (err) {
                // Token invalid, proceed without user
            }
        }

        // Generate enquiry number
        const enquiryNumber = await Enquiry.generateEnquiryNumber();

        // Process items if provided (from cart)
        let processedItems = [];
        let estimatedTotal = 0;

        if (items && items.length > 0) {
            for (const item of items) {
                // Ensure productId is set - use id, productId, or generate one
                const itemProductId = item.id || item.productId || `PROD-${Date.now()}`;

                // Build product data with required fields
                let productData = {
                    productId: itemProductId,
                    productName: item.name || item.productName || 'Unknown Product',
                    quantity: item.quantity || 1,
                    unit: item.unit || 'unit',
                    unitPrice: item.price || item.unitPrice || 0,
                    image: item.image || ''
                };

                // Try to match with database product for enriched data
                if (itemProductId) {
                    try {
                        const product = await Product.findOne({
                            $or: [
                                { id: itemProductId },
                                { _id: mongoose.Types.ObjectId.isValid(itemProductId) ? itemProductId : null }
                            ].filter(q => q !== null && Object.values(q)[0] !== null)
                        });
                        if (product) {
                            productData.product = product._id;
                            productData.productName = product.name;
                            productData.unit = product.unit;
                            productData.unitPrice = product.price;
                            productData.image = product.image;
                        }
                    } catch (dbErr) {
                        // Continue with provided data if product lookup fails
                        console.log('Product lookup skipped:', itemProductId);
                    }
                }

                processedItems.push(productData);
                estimatedTotal += (productData.unitPrice * productData.quantity);
            }
        }

        // Priority based on source: contact_form gets LOW, others get HIGH
        let priority = source === 'contact_form' ? 'low' : 'high';

        // Create enquiry
        const enquiry = new Enquiry({
            enquiryNumber,
            customer: {
                name: customer.name,
                email: customer.email || '',
                phone: customer.phone || '',
                userId: userId
            },
            items: processedItems,
            message: message || '',
            estimatedTotal,
            source: source || 'cart',
            priority,
            status: 'pending'
        });

        await enquiry.save();

        res.status(201).json({
            success: true,
            message: 'Enquiry submitted successfully. Our team will contact you shortly.',
            data: {
                enquiryNumber: enquiry.enquiryNumber,
                estimatedTotal: enquiry.estimatedTotal
            }
        });

    } catch (error) {
        console.error('Error creating enquiry:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit enquiry. Please try again.'
        });
    }
});

// GET /api/enquiries/my - Get user's own enquiries (requires auth)
router.get('/my', authenticate, async (req, res) => {
    try {
        const enquiries = await Enquiry.find({
            'customer.userId': req.user._id
        })
            .sort({ createdAt: -1 })
            .select('enquiryNumber status estimatedTotal items createdAt source');

        res.json({
            success: true,
            data: enquiries
        });

    } catch (error) {
        console.error('Error fetching enquiries:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch enquiries'
        });
    }
});

export default router;
