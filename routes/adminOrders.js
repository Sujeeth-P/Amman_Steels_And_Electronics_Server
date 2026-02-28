import express from 'express';
import { body, validationResult } from 'express-validator';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import { authenticate, authorize, PERMISSIONS } from '../middleware/auth.js';
import { checkAndAlertLowStock } from '../utils/mailer.js';

const router = express.Router();
router.use(authenticate);

// GET /api/admin/orders - Get all orders
router.get('/', authorize(...PERMISSIONS.VIEW_ORDERS), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.search) {
            filter.$or = [
                { orderNumber: { $regex: req.query.search, $options: 'i' } },
                { 'customer.name': { $regex: req.query.search, $options: 'i' } }
            ];
        }
        const [orders, total] = await Promise.all([
            Order.find(filter).populate('createdBy', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit),
            Order.countDocuments(filter)
        ]);
        res.json({ success: true, data: { orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/orders/stats
router.get('/stats', authorize(...PERMISSIONS.VIEW_REPORTS), async (req, res) => {
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const [total, todayCount, revenue] = await Promise.all([
            Order.countDocuments(),
            Order.countDocuments({ createdAt: { $gte: today } }),
            Order.aggregate([{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$grandTotal' }, paid: { $sum: '$amountPaid' } } }])
        ]);
        const rev = revenue[0] || { total: 0, paid: 0 };
        res.json({ success: true, data: { total, today: todayCount, revenue: { total: rev.total, paid: rev.paid, due: rev.total - rev.paid } } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/orders/:id
router.get('/:id', authorize(...PERMISSIONS.VIEW_ORDERS), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('createdBy', 'name email');
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/orders - Create order
router.post('/', authorize(...PERMISSIONS.CREATE_ORDERS), [
    body('customer.name').trim().notEmpty(),
    body('items').isArray({ min: 1 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
        const { customer, items, paymentMethod, notes, amountPaid } = req.body;
        const orderNumber = await Order.generateOrderNumber();
        let subtotal = 0, totalGst = 0;
        const processedItems = [];
        // First pass: validate all products exist and have sufficient stock
        const productsToUpdate = [];
        for (const item of items) {
            const product = await Product.findOne({ id: item.productId });
            if (!product) return res.status(400).json({ success: false, message: `Product not found: ${item.productId}` });
            if ((product.stockQuantity || 0) < item.quantity) {
                return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}. Available: ${product.stockQuantity || 0}, Requested: ${item.quantity}` });
            }
            const itemTotal = product.price * item.quantity;
            const gst = Math.round((itemTotal * 18) / 100 * 100) / 100;
            processedItems.push({ product: product._id, productName: product.name, sku: product.id, quantity: item.quantity, unit: product.unit, unitPrice: product.price, discount: 0, gstRate: 18, gstAmount: gst, totalAmount: Math.round((itemTotal + gst) * 100) / 100 });
            subtotal += itemTotal;
            totalGst += gst;
            productsToUpdate.push({ product, quantity: item.quantity });
        }
        const grandTotal = Math.round((subtotal + totalGst) * 100) / 100;
        const paid = amountPaid || 0;
        const amountDue = Math.max(0, Math.round((grandTotal - paid) * 100) / 100);
        const order = new Order({ orderNumber, customer, items: processedItems, subtotal: Math.round(subtotal * 100) / 100, totalDiscount: 0, totalGst: Math.round(totalGst * 100) / 100, grandTotal, paymentMethod: paymentMethod || 'cash', paymentStatus: paid >= grandTotal ? 'paid' : paid > 0 ? 'partial' : 'pending', amountPaid: paid, amountDue, status: 'confirmed', notes, createdBy: req.user._id });
        await order.save();

        // Deduct stock for each item and create stock movements
        for (const { product, quantity } of productsToUpdate) {
            const previousStock = product.stockQuantity || 0;
            product.stockQuantity = previousStock - quantity;
            product.inStock = product.stockQuantity > 0;
            await product.save();

            // Create stock movement record
            await StockMovement.create({
                product: product._id,
                type: 'stock_out',
                quantity: quantity,
                previousStock: previousStock,
                newStock: product.stockQuantity,
                notes: `Sale - Order #${order.orderNumber} - Sold to ${customer.name}`,
                createdBy: req.user._id
            });

            // Check and send low stock alert if needed
            checkAndAlertLowStock(product).catch(err => console.error('Low stock alert error:', err));
        }

        res.status(201).json({ success: true, message: 'Order created', data: order });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ success: false, message: error.message || 'Server error' });
    }
});

// PUT /api/admin/orders/:id
router.put('/:id', authorize(...PERMISSIONS.CREATE_ORDERS), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        const { status, amountPaid, notes } = req.body;
        const previousStatus = order.status;

        if (status) order.status = status;
        if (amountPaid !== undefined) { order.amountPaid = amountPaid; order.amountDue = order.grandTotal - amountPaid; order.paymentStatus = amountPaid >= order.grandTotal ? 'paid' : amountPaid > 0 ? 'partial' : 'pending'; }
        if (notes) order.notes = notes;
        order.processedBy = req.user._id;
        await order.save();

        // If order is cancelled, restore stock
        if (status === 'cancelled' && previousStatus !== 'cancelled') {
            for (const item of order.items) {
                const product = await Product.findById(item.product);
                if (product) {
                    const previousStock = product.stockQuantity || 0;
                    product.stockQuantity = previousStock + item.quantity;
                    product.inStock = product.stockQuantity > 0;
                    await product.save();

                    await StockMovement.create({
                        product: product._id,
                        type: 'stock_in',
                        quantity: item.quantity,
                        previousStock: previousStock,
                        newStock: product.stockQuantity,
                        notes: `Order #${order.orderNumber} cancelled - stock restored`,
                        createdBy: req.user._id
                    });
                }
            }
        }

        res.json({ success: true, message: 'Order updated', data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// POST /api/admin/orders/:id/invoice
router.post('/:id/invoice', authorize(...PERMISSIONS.CREATE_ORDERS), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.invoiceNumber) return res.status(400).json({ success: false, message: 'Invoice exists' });
        order.invoiceNumber = await Order.generateInvoiceNumber();
        order.status = 'completed';
        await order.save();
        res.json({ success: true, message: 'Invoice generated', data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
