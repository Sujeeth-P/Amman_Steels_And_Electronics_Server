import express from 'express';
import { body, validationResult, query } from 'express-validator';
import User from '../models/User.js';
import { authenticate, authorize, ROLES } from '../middleware/auth.js';

const router = express.Router();

// All routes require super_admin authentication
router.use(authenticate, authorize(ROLES.SUPER_ADMIN));

// @route   GET /api/admin/users
// @desc    Get all admin users with pagination
// @access  Private (super_admin)
router.get('/', [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('role').optional().isIn(['super_admin', 'admin', 'staff']),
    query('status').optional().isIn(['active', 'inactive'])
], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Build filter - only get admin users
        const filter = {
            role: { $in: ['super_admin', 'admin', 'staff'] }
        };

        if (req.query.role) filter.role = req.query.role;
        if (req.query.status) filter.isActive = req.query.status === 'active';
        if (req.query.search) {
            filter.$or = [
                { name: { $regex: req.query.search, $options: 'i' } },
                { email: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        const [users, total] = await Promise.all([
            User.find(filter)
                .populate('createdBy', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            User.countDocuments(filter)
        ]);

        res.json({
            success: true,
            data: {
                users: users.map(u => ({
                    id: u._id,
                    name: u.name,
                    email: u.email,
                    phone: u.phone,
                    role: u.role,
                    isActive: u.isActive,
                    lastLogin: u.lastLogin,
                    createdBy: u.createdBy,
                    createdAt: u.createdAt
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/admin/users/stats
// @desc    Get user statistics
// @access  Private (super_admin)
router.get('/stats', async (req, res) => {
    try {
        const filter = { role: { $in: ['super_admin', 'admin', 'staff'] } };

        const [totalUsers, activeUsers, usersByRole] = await Promise.all([
            User.countDocuments(filter),
            User.countDocuments({ ...filter, isActive: true }),
            User.aggregate([
                { $match: filter },
                { $group: { _id: '$role', count: { $sum: 1 } } }
            ])
        ]);

        const roleStats = {};
        usersByRole.forEach(r => {
            roleStats[r._id] = r.count;
        });

        res.json({
            success: true,
            data: {
                total: totalUsers,
                active: activeUsers,
                inactive: totalUsers - activeUsers,
                byRole: roleStats
            }
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   GET /api/admin/users/:id
// @desc    Get single user
// @access  Private (super_admin)
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .populate('createdBy', 'name email');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isActive: user.isActive,
                lastLogin: user.lastLogin,
                createdBy: user.createdBy,
                createdAt: user.createdAt
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/admin/users/:id
// @desc    Update user
// @access  Private (super_admin)
router.put('/:id', [
    body('name').optional().trim().isLength({ min: 2, max: 50 }),
    body('email').optional().isEmail(),
    body('role').optional().isIn(['super_admin', 'admin', 'staff']),
    body('phone').optional().matches(/^[6-9]\d{9}$/),
    body('isActive').optional().isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { name, email, role, phone, isActive } = req.body;

        // Check if updating self
        if (req.params.id === req.user._id.toString()) {
            // Cannot change own role or deactivate self
            if (role && role !== req.user.role) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot change your own role'
                });
            }
            if (isActive === false) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot deactivate your own account'
                });
            }
        }

        // Check if email is already taken by another user
        if (email) {
            const existingUser = await User.findOne({
                email,
                _id: { $ne: req.params.id }
            });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is already in use'
                });
            }
        }

        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (phone !== undefined) updateData.phone = phone;
        if (isActive !== undefined) updateData.isActive = isActive;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User updated successfully',
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                isActive: user.isActive
            }
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   PUT /api/admin/users/:id/reset-password
// @desc    Reset user password
// @access  Private (super_admin)
router.put('/:id/reset-password', [
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        user.password = req.body.newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete user (soft delete by deactivating)
// @access  Private (super_admin)
router.delete('/:id', async (req, res) => {
    try {
        // Cannot delete self
        if (req.params.id === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete your own account'
            });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'User deactivated successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

export default router;
