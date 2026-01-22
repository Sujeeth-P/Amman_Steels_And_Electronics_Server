import express from 'express';
import { body, validationResult } from 'express-validator';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import { authenticate, authorize, PERMISSIONS } from '../middleware/auth.js';

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
        for (const item of items) {
            const product = await Product.findOne({ id: item.productId });
            if (!product) return res.status(400).json({ success: false, message: `Product not found: ${item.productId}` });
            const itemTotal = product.price * item.quantity;
            const gst = (itemTotal * 18) / 100;
            processedItems.push({ product: product._id, productName: product.name, sku: product.id, quantity: item.quantity, unit: product.unit, unitPrice: product.price, discount: 0, gstRate: 18, gstAmount: gst, totalAmount: itemTotal + gst });
            subtotal += itemTotal;
            totalGst += gst;
        }
        const grandTotal = subtotal + totalGst;
        const paid = amountPaid || 0;
        const order = new Order({ orderNumber, customer, items: processedItems, subtotal, totalDiscount: 0, totalGst, grandTotal, paymentMethod: paymentMethod || 'cash', paymentStatus: paid >= grandTotal ? 'paid' : paid > 0 ? 'partial' : 'pending', amountPaid: paid, amountDue: grandTotal - paid, status: 'confirmed', notes, createdBy: req.user._id });
        await order.save();
        res.status(201).json({ success: true, message: 'Order created', data: order });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/admin/orders/:id
router.put('/:id', authorize(...PERMISSIONS.CREATE_ORDERS), async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        const { status, amountPaid, notes } = req.body;
        if (status) order.status = status;
        if (amountPaid !== undefined) { order.amountPaid = amountPaid; order.amountDue = order.grandTotal - amountPaid; order.paymentStatus = amountPaid >= order.grandTotal ? 'paid' : amountPaid > 0 ? 'partial' : 'pending'; }
        if (notes) order.notes = notes;
        order.processedBy = req.user._id;
        await order.save();
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
