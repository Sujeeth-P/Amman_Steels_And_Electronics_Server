import nodemailer from 'nodemailer';
import User from '../models/User.js';

// Create reusable transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD
        }
    });
};

/**
 * Send low stock alert email to all admins
 * @param {Object} product - The product that is low on stock
 * @param {Number} currentStock - Current stock quantity
 */
export const sendLowStockAlert = async (product, currentStock) => {
    try {
        // Get all admin and super_admin users
        const admins = await User.find({
            role: { $in: ['admin', 'super_admin'] },
            isActive: true
        }).select('email name');

        if (!admins.length) {
            console.log('⚠️ No admin users found to send low stock alert');
            return;
        }

        const adminEmails = admins.map(a => a.email).filter(Boolean);

        if (!adminEmails.length) {
            console.log('⚠️ No admin emails found');
            return;
        }

        if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
            console.log('⚠️ SMTP credentials not configured. Skipping email alert.');
            console.log(`📦 LOW STOCK ALERT: ${product.name} - Only ${currentStock} left (threshold: ${product.lowStockThreshold})`);
            return;
        }

        const transporter = createTransporter();

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
            <div style="max-width:600px;margin:0 auto;padding:20px;">
                <!-- Header -->
                <div style="background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%);border-radius:16px 16px 0 0;padding:30px;text-align:center;">
                    <div style="font-size:48px;margin-bottom:10px;">⚠️</div>
                    <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Low Stock Alert</h1>
                    <p style="color:#fef3c7;margin:8px 0 0;font-size:14px;">Immediate attention required</p>
                </div>
                
                <!-- Body -->
                <div style="background:#ffffff;padding:30px;border-radius:0 0 16px 16px;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                    <p style="color:#334155;font-size:16px;margin:0 0 20px;line-height:1.6;">
                        The following product has fallen below the minimum stock threshold and needs to be restocked:
                    </p>
                    
                    <!-- Product Card -->
                    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:20px;margin:0 0 20px;">
                        <table style="width:100%;border-collapse:collapse;">
                            <tr>
                                <td style="padding:8px 0;color:#92400e;font-weight:600;width:140px;">Product Name</td>
                                <td style="padding:8px 0;color:#1e293b;font-weight:700;">${product.name}</td>
                            </tr>
                            <tr>
                                <td style="padding:8px 0;color:#92400e;font-weight:600;">Product ID</td>
                                <td style="padding:8px 0;color:#1e293b;">${product.id}</td>
                            </tr>
                            <tr>
                                <td style="padding:8px 0;color:#92400e;font-weight:600;">Category</td>
                                <td style="padding:8px 0;color:#1e293b;text-transform:capitalize;">${product.category}</td>
                            </tr>
                            <tr>
                                <td style="padding:8px 0;color:#92400e;font-weight:600;">Current Stock</td>
                                <td style="padding:8px 0;">
                                    <span style="background:#dc2626;color:#ffffff;padding:4px 12px;border-radius:20px;font-weight:700;font-size:14px;">
                                        ${currentStock} ${product.unit}
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:8px 0;color:#92400e;font-weight:600;">Alert Threshold</td>
                                <td style="padding:8px 0;">
                                    <span style="background:#f59e0b;color:#ffffff;padding:4px 12px;border-radius:20px;font-weight:700;font-size:14px;">
                                        ${product.lowStockThreshold} ${product.unit}
                                    </span>
                                </td>
                            </tr>
                        </table>
                    </div>
                    
                    <!-- Action -->
                    <div style="text-align:center;margin:25px 0 10px;">
                        <a href="${process.env.ADMIN_FRONTEND_URL || 'http://localhost:5174'}/stock" 
                           style="display:inline-block;background:linear-gradient(135deg, #f59e0b 0%, #d97706 100%);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">
                            📦 Manage Stock Now
                        </a>
                    </div>
                    
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">
                    
                    <p style="color:#94a3b8;font-size:12px;margin:0;text-align:center;line-height:1.5;">
                        This is an automated alert from Sri Amman Steels & Hardware inventory system.<br>
                        Sent on ${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
            </div>
        </body>
        </html>
        `;

        const mailOptions = {
            from: `"Sri Amman Steels - Inventory" <${process.env.SMTP_EMAIL}>`,
            to: adminEmails.join(', '),
            subject: `⚠️ Low Stock Alert: ${product.name} - Only ${currentStock} left`,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Low stock alert sent to ${adminEmails.length} admin(s): ${info.messageId}`);
        return info;
    } catch (error) {
        console.error('❌ Failed to send low stock alert email:', error.message);
        // Don't throw - email failure shouldn't break stock operations
    }
};

/**
 * Check stock level and send alert if needed
 * @param {Object} product - The product to check
 * @param {Number} newStock - The new stock quantity
 */
export const checkAndAlertLowStock = async (product, newStock) => {
    if (newStock <= product.lowStockThreshold) {
        await sendLowStockAlert(product, newStock);
    }
};
