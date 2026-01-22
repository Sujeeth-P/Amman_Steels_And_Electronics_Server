import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Verify JWT token
export const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId || decoded.id).select('+password');

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'User not found.'
                });
            }

            if (!user.isActive) {
                return res.status(401).json({
                    success: false,
                    message: 'Account has been deactivated.'
                });
            }

            req.user = user;
            next();
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token.'
            });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during authentication.'
        });
    }
};

// Role-based authorization
export const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required.'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. This action requires one of the following roles: ${allowedRoles.join(', ')}`
            });
        }

        next();
    };
};

// Role constants for easy reference
export const ROLES = {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    STAFF: 'staff',
    CUSTOMER: 'customer'
};

// Permission levels
export const PERMISSIONS = {
    // User management - super_admin only
    MANAGE_USERS: [ROLES.SUPER_ADMIN],

    // Product management - super_admin and admin
    MANAGE_PRODUCTS: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    VIEW_PRODUCTS: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF],

    // Stock management - super_admin and admin
    MANAGE_STOCK: [ROLES.SUPER_ADMIN, ROLES.ADMIN],

    // Order/Billing - all admin roles
    CREATE_ORDERS: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF],
    VIEW_ORDERS: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.STAFF],

    // Reports - super_admin and admin
    VIEW_REPORTS: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    VIEW_ALL_REPORTS: [ROLES.SUPER_ADMIN],

    // Sales - super_admin and admin
    VIEW_SALES: [ROLES.SUPER_ADMIN, ROLES.ADMIN],

    // Full access
    FULL_ACCESS: [ROLES.SUPER_ADMIN]
};
