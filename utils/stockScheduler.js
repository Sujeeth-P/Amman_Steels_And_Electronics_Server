import cron from 'node-cron';
import nodemailer from 'nodemailer';
import Product from '../models/Product.js';
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
        .map(a => ({ email: a.email, name: a.name }))
        .filter(a => {
            if (!a.email) return false;
            const domain = a.email.split('@')[1]?.toLowerCase();
            return domain && !invalidDomains.includes(domain);
        });
};

/**
 * Build the daily stock summary email HTML
 */
const buildDailyStockEmail = (lowStockProducts, outOfStockProducts, healthyCount, totalCount) => {
    const reportDate = new Date().toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const buildProductRows = (products, color) => {
        if (!products.length) return '<tr><td colspan="4" style="padding:12px 16px;text-align:center;color:#94a3b8;font-size:13px;">None</td></tr>';
        return products.map((p, i) => `
            <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="padding:10px 16px;font-size:13px;color:#0f172a;font-weight:500;border-bottom:1px solid #f1f5f9;">${p.name}</td>
                <td style="padding:10px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;text-transform:capitalize;">${p.category}</td>
                <td style="padding:10px 16px;font-size:13px;font-weight:700;color:${color};border-bottom:1px solid #f1f5f9;text-align:center;">${p.stockQuantity} ${p.unit}</td>
                <td style="padding:10px 16px;font-size:12px;color:#64748b;border-bottom:1px solid #f1f5f9;text-align:center;">${p.lowStockThreshold} ${p.unit}</td>
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

    return `
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
                <div style="height:4px;background:linear-gradient(90deg, #0f172a 0%, #334155 100%);"></div>
                
                <!-- Header -->
                <div style="padding:28px 32px 0;">
                    <table style="width:100%;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td>
                                <span style="font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">Sri Amman Steels</span>
                                <span style="display:block;font-size:12px;color:#94a3b8;margin-top:2px;">Daily Stock Report</span>
                            </td>
                            <td style="text-align:right;">
                                <span style="font-size:12px;color:#64748b;">${reportDate}</span>
                            </td>
                        </tr>
                    </table>
                </div>

                <div style="padding:0 32px;"><hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"></div>

                <!-- Summary Cards -->
                <div style="padding:0 32px;">
                    <table style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="width:25%;padding:0 4px 0 0;">
                                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;text-align:center;">
                                    <div style="font-size:22px;font-weight:800;color:#0f172a;">${totalCount}</div>
                                    <div style="font-size:11px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:0.3px;">Total</div>
                                </div>
                            </td>
                            <td style="width:25%;padding:0 4px;">
                                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:center;">
                                    <div style="font-size:22px;font-weight:800;color:#16a34a;">${healthyCount}</div>
                                    <div style="font-size:11px;color:#16a34a;margin-top:4px;text-transform:uppercase;letter-spacing:0.3px;">Healthy</div>
                                </div>
                            </td>
                            <td style="width:25%;padding:0 4px;">
                                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;text-align:center;">
                                    <div style="font-size:22px;font-weight:800;color:#d97706;">${lowStockProducts.length}</div>
                                    <div style="font-size:11px;color:#d97706;margin-top:4px;text-transform:uppercase;letter-spacing:0.3px;">Low Stock</div>
                                </div>
                            </td>
                            <td style="width:25%;padding:0 0 0 4px;">
                                <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;text-align:center;">
                                    <div style="font-size:22px;font-weight:800;color:#dc2626;">${outOfStockProducts.length}</div>
                                    <div style="font-size:11px;color:#dc2626;margin-top:4px;text-transform:uppercase;letter-spacing:0.3px;">Out of Stock</div>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>

                ${outOfStockProducts.length > 0 ? `
                <!-- Out of Stock Section -->
                <div style="padding:24px 32px 0;">
                    <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#dc2626;display:flex;align-items:center;">
                        <span style="display:inline-block;width:8px;height:8px;background:#dc2626;border-radius:50%;margin-right:8px;"></span>
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
                    <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#d97706;display:flex;align-items:center;">
                        <span style="display:inline-block;width:8px;height:8px;background:#d97706;border-radius:50%;margin-right:8px;"></span>
                        Low Stock (${lowStockProducts.length})
                    </h3>
                    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                        ${tableHeader}
                        ${buildProductRows(lowStockProducts, '#d97706')}
                    </table>
                </div>
                ` : ''}

                ${outOfStockProducts.length === 0 && lowStockProducts.length === 0 ? `
                <!-- All Good -->
                <div style="padding:24px 32px;text-align:center;">
                    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:24px;">
                        <div style="font-size:16px;font-weight:700;color:#16a34a;">All products are well-stocked</div>
                        <div style="font-size:13px;color:#64748b;margin-top:6px;">No action required at this time.</div>
                    </div>
                </div>
                ` : ''}

                <!-- CTA -->
                <div style="padding:24px 32px;text-align:center;">
                    <a href="${process.env.ADMIN_FRONTEND_URL || 'http://localhost:5174'}/admin/stock" 
                       style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:13px;letter-spacing:0.3px;">
                        Open Stock Dashboard
                    </a>
                </div>

                <!-- Footer -->
                <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
                    <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.6;text-align:center;">
                        Daily report &bull; Sri Amman Steels &amp; Hardware<br>
                        Sent automatically at 9:00 PM IST
                    </p>
                </div>

            </div>
        </div>
    </body>
    </html>
    `;
};

/**
 * Run the daily stock check and send summary email
 */
export const runDailyStockReport = async () => {
    try {
        console.log('📊 Running daily stock report...');

        // Get all products
        const products = await Product.find({}).lean();
        const totalCount = products.length;

        // Categorize products
        const outOfStockProducts = products.filter(p => (p.stockQuantity || 0) === 0);
        const lowStockProducts = products.filter(p => {
            const qty = p.stockQuantity || 0;
            const threshold = p.lowStockThreshold || 10;
            return qty > 0 && qty <= threshold;
        });
        const healthyCount = totalCount - outOfStockProducts.length - lowStockProducts.length;

        // Get valid admin emails
        const adminRecipients = await getAdminEmails();

        if (!adminRecipients.length) {
            console.log('⚠️ No valid admin email addresses found. Skipping daily stock report.');
            console.log(`📊 Summary — Total: ${totalCount}, Healthy: ${healthyCount}, Low: ${lowStockProducts.length}, Out: ${outOfStockProducts.length}`);
            return;
        }

        if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
            console.log('⚠️ SMTP credentials not configured. Skipping daily stock report.');
            return;
        }

        const transporter = createTransporter();
        const emails = adminRecipients.map(a => a.email);

        const alertCount = outOfStockProducts.length + lowStockProducts.length;
        const subjectSuffix = alertCount > 0
            ? `${alertCount} product${alertCount > 1 ? 's' : ''} need attention`
            : 'All products well-stocked';

        const mailOptions = {
            from: `"Sri Amman Steels - Inventory" <${process.env.SMTP_EMAIL}>`,
            to: emails.join(', '),
            subject: `Daily Stock Report — ${subjectSuffix}`,
            html: buildDailyStockEmail(lowStockProducts, outOfStockProducts, healthyCount, totalCount)
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 Daily stock report sent to ${emails.length} admin(s): ${info.messageId}`);
        return info;
    } catch (error) {
        console.error('❌ Failed to send daily stock report:', error.message);
    }
};

/**
 * Initialize the daily stock report scheduler
 * Runs every day at 9:00 PM IST (15:30 UTC)
 */
export const initStockScheduler = () => {
    // 9:00 PM IST = 15:30 UTC
    // Cron: minute hour day month weekday
    cron.schedule('0 21 * * *', async () => {
        console.log('⏰ 9:00 PM — Triggering daily stock report');
        await runDailyStockReport();
    }, {
        timezone: 'Asia/Kolkata'
    });

    console.log('📅 Stock report scheduler initialized — Daily at 9:00 PM IST');
};
