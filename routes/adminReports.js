import express from 'express';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import User from '../models/User.js';
import { authenticate, authorize, PERMISSIONS } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// GET /api/admin/reports/dashboard
router.get('/dashboard', authorize(...PERMISSIONS.VIEW_REPORTS), async (req, res) => {
    try {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const [totalProducts, totalOrders, todayOrders, monthRevenue, recentOrders] = await Promise.all([
            Product.countDocuments(),
            Order.countDocuments({ status: { $ne: 'cancelled' } }),
            Order.countDocuments({ createdAt: { $gte: today }, status: { $ne: 'cancelled' } }),
            Order.aggregate([
                { $match: { createdAt: { $gte: startOfMonth }, status: { $ne: 'cancelled' } } },
                { $group: { _id: null, total: { $sum: '$grandTotal' } } }
            ]),
            Order.find({ status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).limit(5).populate('createdBy', 'name')
        ]);

        res.json({
            success: true,
            data: {
                totalProducts,
                totalOrders,
                todayOrders,
                monthRevenue: monthRevenue[0]?.total || 0,
                recentOrders
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/reports/sales
router.get('/sales', authorize(...PERMISSIONS.VIEW_SALES), async (req, res) => {
    try {
        const { startDate, endDate, groupBy = 'day' } = req.query;
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const dateFormat = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%Y-W%V' : '%Y-%m-%d';

        const salesData = await Order.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
            { $group: { _id: { $dateToString: { format: dateFormat, date: '$createdAt' } }, orders: { $sum: 1 }, revenue: { $sum: '$grandTotal' }, paid: { $sum: '$amountPaid' } } },
            { $sort: { _id: 1 } }
        ]);

        const totals = await Order.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end }, status: { $ne: 'cancelled' } } },
            { $group: { _id: null, totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$grandTotal' }, totalPaid: { $sum: '$amountPaid' } } }
        ]);

        res.json({
            success: true,
            data: {
                chart: salesData,
                summary: totals[0] || { totalOrders: 0, totalRevenue: 0, totalPaid: 0 }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/reports/products
router.get('/products', authorize(...PERMISSIONS.VIEW_REPORTS), async (req, res) => {
    try {
        const topProducts = await Order.aggregate([
            { $match: { status: { $ne: 'cancelled' } } },
            { $unwind: '$items' },
            { $group: { _id: '$items.productName', totalSold: { $sum: '$items.quantity' }, revenue: { $sum: '$items.totalAmount' } } },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]);

        const categoryStats = await Product.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            data: { topProducts, categoryStats }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/admin/reports/analytics (super_admin only)
router.get('/analytics', authorize(...PERMISSIONS.VIEW_ALL_REPORTS), async (req, res) => {
    try {
        const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [userStats, orderTrend, stockMovements] = await Promise.all([
            User.aggregate([
                { $match: { role: { $in: ['super_admin', 'admin', 'staff'] } } },
                { $group: { _id: '$role', count: { $sum: 1 } } }
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: last30Days } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: '$grandTotal' } } },
                { $sort: { _id: 1 } }
            ]),
            StockMovement.aggregate([
                { $match: { createdAt: { $gte: last30Days } } },
                { $group: { _id: '$type', count: { $sum: 1 }, totalQty: { $sum: '$quantity' } } }
            ])
        ]);

        res.json({
            success: true,
            data: { userStats, orderTrend, stockMovements }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
