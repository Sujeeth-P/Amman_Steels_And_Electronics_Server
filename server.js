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

// Load environment variables
dotenv.config();

const app = express();

// CORS Configuration - Allow both public site and admin dashboard
const allowedOrigins = [
    'http://localhost:5173',  // Public frontend
    'http://localhost:3000',
    'http://localhost:5174',  // Admin frontend
    process.env.ADMIN_FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
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
    });
});

