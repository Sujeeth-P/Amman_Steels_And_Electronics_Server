import mongoose from 'mongoose';
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

const updateEmails = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        // Update super_admin email
        const superAdmin = await User.findOneAndUpdate(
            { role: 'super_admin' },
            { email: 'sriammansteels.official@gmail.com' },
            { new: true }
        );
        if (superAdmin) {
            console.log(`✅ Super Admin email updated to: sriammansteels.official@gmail.com`);
        }

        // Update admin email - use same email since it's the only real one
        const admin = await User.findOneAndUpdate(
            { role: 'admin' },
            { email: 'sriammansteels.official+admin@gmail.com' },
            { new: true }
        );
        if (admin) {
            console.log(`✅ Admin email updated to: sriammansteels.official+admin@gmail.com`);
        }

        console.log('\n📧 Both admin accounts will now receive stock alert emails.');
        console.log('   (Gmail treats user+tag@gmail.com as the same inbox)\n');

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

updateEmails();
