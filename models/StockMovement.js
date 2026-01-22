import mongoose from 'mongoose';

const stockMovementSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: [true, 'Product is required']
    },
    type: {
        type: String,
        enum: ['stock_in', 'stock_out', 'adjustment', 'return', 'damage'],
        required: [true, 'Movement type is required']
    },
    quantity: {
        type: Number,
        required: [true, 'Quantity is required'],
        min: [1, 'Quantity must be at least 1']
    },
    previousStock: {
        type: Number,
        required: true
    },
    newStock: {
        type: Number,
        required: true
    },
    reference: {
        type: { type: String, enum: ['purchase', 'sale', 'manual', 'order'] },
        id: { type: mongoose.Schema.Types.ObjectId }
    },
    unitPrice: {
        type: Number,
        min: 0
    },
    totalValue: {
        type: Number,
        min: 0
    },
    supplier: {
        name: { type: String },
        invoiceNo: { type: String }
    },
    notes: {
        type: String,
        maxlength: [500, 'Notes cannot exceed 500 characters']
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Indexes
stockMovementSchema.index({ product: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1 });
stockMovementSchema.index({ createdAt: -1 });

const StockMovement = mongoose.model('StockMovement', stockMovementSchema);

export default StockMovement;
