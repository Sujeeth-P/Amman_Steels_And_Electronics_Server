import express from 'express';
import { body, validationResult } from 'express-validator';
import Enquiry from '../models/Enquiry.js';
import { authenticate, authorize, PERMISSIONS, ROLES } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// GET /api/admin/enquiries - Get all enquiries
router.get('/', authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const filter = {};

        // Status filter
        if (req.query.status && req.query.status !== 'all') {
            filter.status = req.query.status;
        }

        // Priority filter
        if (req.query.priority && req.query.priority !== 'all') {
            filter.priority = req.query.priority;
        }

        // Source filter
        if (req.query.source && req.query.source !== 'all') {
            filter.source = req.query.source;
        }

        // Search filter
        if (req.query.search) {
            filter.$or = [
                { enquiryNumber: { $regex: req.query.search, $options: 'i' } },
                { 'customer.name': { $regex: req.query.search, $options: 'i' } },
                { 'customer.phone': { $regex: req.query.search, $options: 'i' } },
                { 'customer.email': { $regex: req.query.search, $options: 'i' } }
            ];
        }

        const [enquiries, total] = await Promise.all([
            Enquiry.find(filter)
                .populate('assignedTo', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Enquiry.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: {
                enquiries,
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('Error fetching enquiries:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch enquiries'
        });
    }
});

// GET /api/admin/enquiries/stats - Enquiry statistics
router.get('/stats', authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF), async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [
            total,
            pending,
            contacted,
            quoted,
            converted,
            todayCount,
            highPriority
        ] = await Promise.all([
            Enquiry.countDocuments(),
            Enquiry.countDocuments({ status: 'pending' }),
            Enquiry.countDocuments({ status: 'contacted' }),
            Enquiry.countDocuments({ status: 'quoted' }),
            Enquiry.countDocuments({ status: 'converted' }),
            Enquiry.countDocuments({ createdAt: { $gte: today } }),
            Enquiry.countDocuments({ status: 'pending', priority: 'high' })
        ]);

        res.json({
            success: true,
            data: {
                total,
                pending,
                contacted,
                quoted,
                converted,
                today: todayCount,
                highPriority
            }
        });

    } catch (error) {
        console.error('Error fetching enquiry stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics'
        });
    }
});

// GET /api/admin/enquiries/:id - Get single enquiry
router.get('/:id', authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF), async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id)
            .populate('assignedTo', 'name email')
            .populate('customer.userId', 'name email phone');

        if (!enquiry) {
            return res.status(404).json({
                success: false,
                message: 'Enquiry not found'
            });
        }

        res.json({
            success: true,
            data: enquiry
        });

    } catch (error) {
        console.error('Error fetching enquiry:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch enquiry'
        });
    }
});

// PUT /api/admin/enquiries/:id - Update enquiry
router.put('/:id', authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF), [
    body('status').optional().isIn(['pending', 'contacted', 'quoted', 'converted', 'closed']),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    body('adminNotes').optional().trim().isLength({ max: 2000 }),
    body('quotedAmount').optional().isNumeric()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const enquiry = await Enquiry.findById(req.params.id);

        if (!enquiry) {
            return res.status(404).json({
                success: false,
                message: 'Enquiry not found'
            });
        }

        const { status, priority, adminNotes, quotedAmount, assignedTo } = req.body;

        if (status) enquiry.status = status;
        if (priority) enquiry.priority = priority;
        if (adminNotes !== undefined) enquiry.adminNotes = adminNotes;
        if (quotedAmount !== undefined) enquiry.quotedAmount = quotedAmount;
        if (assignedTo !== undefined) enquiry.assignedTo = assignedTo || null;

        await enquiry.save();

        const updated = await Enquiry.findById(req.params.id)
            .populate('assignedTo', 'name email');

        res.json({
            success: true,
            message: 'Enquiry updated successfully',
            data: updated
        });

    } catch (error) {
        console.error('Error updating enquiry:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update enquiry'
        });
    }
});

// DELETE /api/admin/enquiries/:id - Delete enquiry (super_admin only)
router.delete('/:id', authorize(ROLES.SUPER_ADMIN), async (req, res) => {
    try {
        const enquiry = await Enquiry.findById(req.params.id);

        if (!enquiry) {
            return res.status(404).json({
                success: false,
                message: 'Enquiry not found'
            });
        }

        await Enquiry.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Enquiry deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting enquiry:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete enquiry'
        });
    }
});

export default router;
