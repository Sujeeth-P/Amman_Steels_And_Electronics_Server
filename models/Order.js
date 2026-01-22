import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity must be at least 1']
    },
    unit: { type: String, required: true },
    unitPrice: {
        type: Number,
        required: true,
        min: 0
    },
    discount: {
        type: Number,
        default: 0,
        min: 0
    },
    gstRate: {
        type: Number,
        default: 18
    },
    gstAmount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    }
});

const orderSchema = new mongoose.Schema({
    orderNumber: {
        type: String,
        required: true,
        unique: true
    },
    invoiceNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    customer: {
        name: { type: String, required: [true, 'Customer name is required'] },
        phone: { type: String },
        email: { type: String },
        address: { type: String },
        gstin: { type: String }
    },
    items: [orderItemSchema],
    subtotal: {
        type: Number,
        required: true,
        min: 0
    },
    totalDiscount: {
        type: Number,
        default: 0,
        min: 0
    },
    totalGst: {
        type: Number,
        default: 0,
        min: 0
    },
    grandTotal: {
        type: Number,
        required: true,
        min: 0
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'card', 'upi', 'bank_transfer', 'credit'],
        default: 'cash'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'partial', 'paid'],
        default: 'pending'
    },
    amountPaid: {
        type: Number,
        default: 0,
        min: 0
    },
    amountDue: {
        type: Number,
        default: 0,
        min: 0
    },
    status: {
        type: String,
        enum: ['draft', 'confirmed', 'processing', 'completed', 'cancelled'],
        default: 'draft'
    },
    notes: {
        type: String,
        maxlength: 1000
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Indexes
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ invoiceNumber: 1 });
orderSchema.index({ 'customer.name': 'text', 'customer.phone': 'text' });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });

// Generate order number
orderSchema.statics.generateOrderNumber = async function () {
    const today = new Date();
    const prefix = `ORD${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.countDocuments({
        orderNumber: { $regex: `^${prefix}` }
    });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

// Generate invoice number
orderSchema.statics.generateInvoiceNumber = async function () {
    const today = new Date();
    const prefix = `INV${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.countDocuments({
        invoiceNumber: { $regex: `^${prefix}` }
    });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

const Order = mongoose.model('Order', orderSchema);

export default Order;
