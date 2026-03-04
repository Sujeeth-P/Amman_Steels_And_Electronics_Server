import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import reviewRoutes from './routes/reviews.js';
import imageRoutes from './routes/images.js';
import productRoutes from './routes/products.js';
// Admin Routes
import adminAuthRoutes from './routes/adminAuth.js';
import adminUsersRoutes from './routes/adminUsers.js';
import adminProductsRoutes from './routes/adminProducts.js';
import adminStockRoutes from './routes/adminStock.js';
import adminOrdersRoutes from './routes/adminOrders.js';
import adminReportsRoutes from './routes/adminReports.js';
import enquiriesRoutes from './routes/enquiries.js';
import adminEnquiriesRoutes from './routes/adminEnquiries.js';
import { initStockScheduler } from './utils/stockScheduler.js';

// Load environment variables
dotenv.config();

const app = express();

// CORS Configuration - Allow both public site and admin dashboard
const allowedOrigins = [
    'http://localhost:5173',  // Public frontend (local)
    'http://localhost:3000',
    'http://localhost:5174',  // Admin frontend (local)
    'https://amman-admin.vercel.app',  // Admin frontend (production)
    'https://sriamman.vercel.app',     // Public frontend (production)
    process.env.ADMIN_FRONTEND_URL
].filter(Boolean);
app.use(cors({
    origin: function (origin, callback) {
        console.log('📌 Incoming request from origin:', origin || 'No origin (server-to-server)');
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.log('❌ Blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json());

// Public Routes
app.use('/api/auth', authRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/products', productRoutes);

// Admin Routes
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/products', adminProductsRoutes);
app.use('/api/admin/stock', adminStockRoutes);
app.use('/api/admin/orders', adminOrdersRoutes);
app.use('/api/admin/reports', adminReportsRoutes);
app.use('/api/enquiries', enquiriesRoutes);
app.use('/api/admin/enquiries', adminEnquiriesRoutes);

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Sri Amman Steels & Hardware API is running' });
});

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        process.exit(1);
    }
};

// Start server
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📡 API endpoint: http://localhost:${PORT}/api`);
        console.log(`🔐 Admin API: http://localhost:${PORT}/api/admin`);

        // Initialize daily stock report scheduler (9:00 PM IST)
        initStockScheduler();
    });
});

