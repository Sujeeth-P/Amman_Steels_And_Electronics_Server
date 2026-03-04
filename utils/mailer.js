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
 * Get valid admin email addresses (filters out placeholder domains)
 */
const getAdminEmails = async () => {
    const admins = await User.find({
        role: { $in: ['admin', 'super_admin'] },
        isActive: true
    }).select('email name');

    const invalidDomains = ['sriamman.com', 'example.com', 'test.com', 'localhost'];
    return admins
        .map(a => a.email)
        .filter(email => {
            if (!email) return false;
            const domain = email.split('@')[1]?.toLowerCase();
            return domain && !invalidDomains.includes(domain);
        });
};

/**
 * Send a single consolidated low stock alert email with ALL low/out-of-stock items
 * @param {Array} lowStockProducts - Products below threshold but > 0
 * @param {Array} outOfStockProducts - Products with 0 stock
 */
export const sendLowStockBatchAlert = async (lowStockProducts = [], outOfStockProducts = []) => {
    try {
        const totalAlerts = lowStockProducts.length + outOfStockProducts.length;
        if (totalAlerts === 0) {
            console.log('✅ All products are well-stocked. No alerts to send.');
            return;
        }

        const adminEmails = await getAdminEmails();

        if (!adminEmails.length) {
            console.log('⚠️ No valid admin email addresses found. Skipping email alert.');
            console.log(`📦 LOW STOCK SUMMARY: ${lowStockProducts.length} low stock, ${outOfStockProducts.length} out of stock`);
            return;
        }

        if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
            console.log('⚠️ SMTP credentials not configured. Skipping email alert.');
            return;
        }

        const transporter = createTransporter();
        const alertDate = new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const buildProductRows = (products, color) => {
            if (!products.length) return '';
            return products.map((p, i) => `
                <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                    <td style="padding:10px 16px;font-size:13px;color:#0f172a;font-weight:500;border-bottom:1px solid #f1f5f9;">${p.name}</td>
                    <td style="padding:10px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;text-transform:capitalize;">${p.category}</td>
                    <td style="padding:10px 16px;font-size:13px;font-weight:700;color:${color};border-bottom:1px solid #f1f5f9;text-align:center;">${p.stockQuantity || 0} ${p.unit || 'pcs'}</td>
                    <td style="padding:10px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;text-align:center;">${p.lowStockThreshold || 10} ${p.unit || 'pcs'}</td>
                </tr>
            `).join('');
        };

        const tableHeader = `
            <tr style="background:#f1f5f9;">
                <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Product</td>
                <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Category</td>
                <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;text-align:center;">Stock</td>
                <td style="padding:10px 16px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;text-align:center;">Threshold</td>
            </tr>
        `;

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
            <div style="max-width:620px;margin:0 auto;padding:32px 16px;">
                
                <!-- Main Card -->
                <div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
                    
                    <!-- Top Accent -->
                    <div style="height:4px;background:linear-gradient(90deg, ${outOfStockProducts.length > 0 ? '#dc2626' : '#d97706'} 0%, #0f172a 100%);"></div>
                    
                    <!-- Header -->
                    <div style="padding:28px 32px 0;">
                        <table style="width:100%;" cellpadding="0" cellspacing="0">
                            <tr>
                                <td>
                                    <span style="font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">Sri Amman Steels</span>
                                    <span style="display:block;font-size:12px;color:#94a3b8;margin-top:2px;">Stock Alert Report</span>
                                </td>
                                <td style="text-align:right;">
                                    <span style="display:inline-block;background:${outOfStockProducts.length > 0 ? '#dc2626' : '#d97706'};color:#ffffff;font-size:11px;font-weight:700;padding:5px 12px;border-radius:4px;letter-spacing:0.5px;">
                                        ${totalAlerts} ALERT${totalAlerts > 1 ? 'S' : ''}
                                    </span>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <div style="padding:0 32px;"><hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"></div>

                    <!-- Summary Cards -->
                    <div style="padding:0 32px;">
                        <table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">
                            <tr>
                                <td style="width:50%;padding:0 4px 0 0;">
                                    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;text-align:center;">
                                        <div style="font-size:22px;font-weight:800;color:#d97706;">${lowStockProducts.length}</div>
                                        <div style="font-size:11px;color:#d97706;margin-top:4px;text-transform:uppercase;letter-spacing:0.3px;">Low Stock</div>
                                    </div>
                                </td>
                                <td style="width:50%;padding:0 0 0 4px;">
                                    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;text-align:center;">
                                        <div style="font-size:22px;font-weight:800;color:#dc2626;">${outOfStockProducts.length}</div>
                                        <div style="font-size:11px;color:#dc2626;margin-top:4px;text-transform:uppercase;letter-spacing:0.3px;">Out of Stock</div>
                                    </div>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <!-- Alert Message -->
                    <div style="padding:20px 32px 0;">
                        <p style="color:#334155;font-size:14px;line-height:1.7;margin:0;">
                            The following products need attention — ${totalAlerts} product${totalAlerts > 1 ? 's have' : ' has'} fallen below the minimum stock threshold.
                        </p>
                    </div>

                    ${outOfStockProducts.length > 0 ? `
                    <!-- Out of Stock Section -->
                    <div style="padding:24px 32px 0;">
                        <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#dc2626;">
                            <span style="display:inline-block;width:8px;height:8px;background:#dc2626;border-radius:50%;margin-right:8px;vertical-align:middle;"></span>
                            Out of Stock (${outOfStockProducts.length})
                        </h3>
                        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                            ${tableHeader}
                            ${buildProductRows(outOfStockProducts, '#dc2626')}
                        </table>
                    </div>
                    ` : ''}

                    ${lowStockProducts.length > 0 ? `
                    <!-- Low Stock Section -->
                    <div style="padding:24px 32px 0;">
                        <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#d97706;">
                            <span style="display:inline-block;width:8px;height:8px;background:#d97706;border-radius:50%;margin-right:8px;vertical-align:middle;"></span>
                            Low Stock (${lowStockProducts.length})
                        </h3>
                        <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                            ${tableHeader}
                            ${buildProductRows(lowStockProducts, '#d97706')}
                        </table>
                    </div>
                    ` : ''}

                    <!-- CTA Button -->
                    <div style="padding:28px 32px;text-align:center;">
                        <a href="${process.env.ADMIN_FRONTEND_URL || 'http://localhost:5174'}/admin/stock" 
                           style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:13px;letter-spacing:0.3px;">
                            Open Stock Dashboard
                        </a>
                    </div>

                    <!-- Footer -->
                    <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
                        <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.6;text-align:center;">
                            Automated notification &bull; Sri Amman Steels &amp; Hardware<br>
                            ${alertDate}
                        </p>
                    </div>

                </div>
            </div>
        </body>
        </html>
        `;

        const subjectParts = [];
        if (outOfStockProducts.length > 0) subjectParts.push(`${outOfStockProducts.length} out of stock`);
        if (lowStockProducts.length > 0) subjectParts.push(`${lowStockProducts.length} low stock`);

        const mailOptions = {
            from: `"Sri Amman Steels - Inventory" <${process.env.SMTP_EMAIL}>`,
            to: adminEmails.join(', '),
            subject: `Stock Alert — ${subjectParts.join(', ')}`,
            html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Stock alert sent to ${adminEmails.length} admin(s): ${info.messageId}`);
        return info;
    } catch (error) {
        console.error('❌ Failed to send stock alert email:', error.message);
    }
};

/**
 * Check stock level after a stock operation and send batch alert if needed
 * Fetches ALL low stock and out-of-stock products so the email gives a complete picture
 * @param {Object} product - The product to check
 * @param {Number} newStock - The new stock quantity
 */
export const checkAndAlertLowStock = async (product, newStock) => {
    if (newStock <= product.lowStockThreshold) {
        // Dynamically import Product model to avoid circular dependency
        const Product = (await import('../models/Product.js')).default;

        // Fetch ALL low stock and out-of-stock products from DB
        const [lowStockProducts, outOfStockProducts] = await Promise.all([
            Product.find({
                stockQuantity: { $gt: 0 },
                $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] }
            }),
            Product.find({ stockQuantity: 0 })
        ]);

        await sendLowStockBatchAlert(lowStockProducts, outOfStockProducts);
    }
};
