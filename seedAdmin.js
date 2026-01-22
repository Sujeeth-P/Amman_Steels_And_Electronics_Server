import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    role: String,
    isActive: { type: Boolean, default: true },
    phone: String
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

const demoUsers = [
    {
        name: 'Super Admin',
        email: 'superadmin@sriamman.com',
        password: 'Admin@123',
        role: 'super_admin',
        phone: '9876543210'
    },
    {
        name: 'Admin User',
        email: 'admin@sriamman.com',
        password: 'Admin@123',
        role: 'admin',
        phone: '9876543211'
    },
    {
        name: 'Staff User',
        email: 'staff@sriamman.com',
        password: 'Staff@123',
        role: 'staff',
        phone: '9876543212'
    }
];

const seedAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        for (const user of demoUsers) {
            const existing = await User.findOne({ email: user.email });
            if (existing) {
                console.log(`⚠️  ${user.role} already exists: ${user.email}`);
                continue;
            }

            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(user.password, salt);

            await User.create({
                ...user,
                password: hashedPassword,
                isActive: true
            });

            console.log(`✅ ${user.role} created successfully!`);
        }

        console.log('\n========================================');
        console.log('       DEMO CREDENTIALS FOR LOGIN       ');
        console.log('========================================\n');

        console.log('🔴 SUPER ADMIN (Full Access)');
        console.log('   Email: superadmin@sriamman.com');
        console.log('   Password: Admin@123');
        console.log('   Access: All pages, user management, reports\n');

        console.log('🟠 ADMIN (Product & Stock Management)');
        console.log('   Email: admin@sriamman.com');
        console.log('   Password: Admin@123');
        console.log('   Access: Products, Stock, Sales, Billing\n');

        console.log('🟢 STAFF (Billing Only)');
        console.log('   Email: staff@sriamman.com');
        console.log('   Password: Staff@123');
        console.log('   Access: Billing, Orders\n');

        console.log('========================================\n');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

seedAdmin();
