import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    user: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    date: {
        type: Date,
        default: Date.now
    },
    comment: {
        type: String,
        required: true
    }
});

const productSchema = new mongoose.Schema({
    id: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: ['steel', 'cement', 'electronics', 'paints'],
        lowercase: true
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: 0
    },
    unit: {
        type: String,
        required: [true, 'Unit is required'],
        trim: true
    },
    image: {
        type: String,
        required: [true, 'Image URL is required']
    },
    description: {
        type: String,
        required: [true, 'Description is required']
    },
    longDescription: {
        type: String
    },
    specs: {
        type: Map,
        of: String
    },
    inStock: {
        type: Boolean,
        default: true
    },
    reviews: [reviewSchema],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
productSchema.index({ category: 1, inStock: 1 });
productSchema.index({ name: 'text', description: 'text' });

const Product = mongoose.model('Product', productSchema);

export default Product;
