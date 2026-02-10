import mongoose from 'mongoose';

const enquiryItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    },
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity must be at least 1']
    },
    unit: { type: String },
    unitPrice: { type: Number, min: 0 },
    image: { type: String }
});

const enquirySchema = new mongoose.Schema({
    enquiryNumber: {
        type: String,
        required: true,
        unique: true
    },
    customer: {
        name: { type: String, required: [true, 'Customer name is required'] },
        email: { type: String },
        phone: { type: String },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    items: [enquiryItemSchema],
    message: {
        type: String,
        maxlength: 2000
    },
    estimatedTotal: {
        type: Number,
        default: 0,
        min: 0
    },
    status: {
        type: String,
        enum: ['pending', 'contacted', 'quoted', 'converted', 'closed'],
        default: 'pending'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    source: {
        type: String,
        enum: ['cart', 'contact_form', 'product_page'],
        default: 'cart'
    },
    adminNotes: {
        type: String,
        maxlength: 2000
    },
    quotedAmount: {
        type: Number,
        min: 0
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    contactedAt: { type: Date },
    quotedAt: { type: Date },
    convertedAt: { type: Date },
    closedAt: { type: Date }
}, {
    timestamps: true
});

// Indexes
enquirySchema.index({ enquiryNumber: 1 });
enquirySchema.index({ status: 1, createdAt: -1 });
enquirySchema.index({ 'customer.name': 'text', 'customer.phone': 'text', 'customer.email': 'text' });
enquirySchema.index({ 'customer.userId': 1 });
enquirySchema.index({ priority: 1 });
enquirySchema.index({ source: 1 });

// Generate enquiry number
enquirySchema.statics.generateEnquiryNumber = async function () {
    const today = new Date();
    const prefix = `ENQ${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.countDocuments({
        enquiryNumber: { $regex: `^${prefix}` }
    });
    return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

// Update status timestamps
enquirySchema.pre('save', function (next) {
    if (this.isModified('status')) {
        const now = new Date();
        switch (this.status) {
            case 'contacted':
                if (!this.contactedAt) this.contactedAt = now;
                break;
            case 'quoted':
                if (!this.quotedAt) this.quotedAt = now;
                break;
            case 'converted':
                if (!this.convertedAt) this.convertedAt = now;
                break;
            case 'closed':
                if (!this.closedAt) this.closedAt = now;
                break;
        }
    }
    next();
});

const Enquiry = mongoose.model('Enquiry', enquirySchema);

export default Enquiry;
