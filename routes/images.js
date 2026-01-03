import express from 'express';
import multer from 'multer';
import { uploadImage, deleteImage, getOptimizedImageUrl } from '../utils/cloudinary.js';
import fs from 'fs';

const router = express.Router();

// Configure Multer for temporary file storage
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept images only
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed!'), false);
        }
        cb(null, true);
    }
});

// @route   POST /api/images/upload
// @desc    Upload a single image to Cloudinary
// @access  Public (you can add authentication middleware)
router.post('/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        const folder = req.body.folder || 'sriamman';
        const result = await uploadImage(req.file.path, folder);

        // Delete temporary file
        fs.unlinkSync(req.file.path);

        if (result.success) {
            res.json({
                success: true,
                message: 'Image uploaded successfully',
                data: {
                    url: result.url,
                    publicId: result.publicId,
                    format: result.format
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to upload image',
                error: result.error
            });
        }
    } catch (error) {
        // Clean up temporary file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during upload',
            error: error.message
        });
    }
});

// @route   POST /api/images/upload-multiple
// @desc    Upload multiple images to Cloudinary
// @access  Public
router.post('/upload-multiple', upload.array('images', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No image files provided'
            });
        }

        const folder = req.body.folder || 'sriamman';
        const results = [];

        for (const file of req.files) {
            const result = await uploadImage(file.path, folder);
            results.push({
                filename: file.originalname,
                ...result
            });
            // Delete temporary file
            fs.unlinkSync(file.path);
        }

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        res.json({
            success: true,
            message: `Uploaded ${successful.length} of ${results.length} images`,
            data: {
                successful,
                failed,
                total: results.length
            }
        });
    } catch (error) {
        // Clean up temporary files
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }

        console.error('Multiple upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during upload',
            error: error.message
        });
    }
});

// @route   DELETE /api/images/:publicId
// @desc    Delete an image from Cloudinary
// @access  Public
router.delete('/:publicId(*)', async (req, res) => {
    try {
        const publicId = req.params.publicId;

        if (!publicId) {
            return res.status(400).json({
                success: false,
                message: 'Public ID is required'
            });
        }

        const result = await deleteImage(publicId);

        if (result.success) {
            res.json({
                success: true,
                message: 'Image deleted successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to delete image',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during deletion',
            error: error.message
        });
    }
});

// @route   GET /api/images/optimize
// @desc    Get optimized image URL
// @access  Public
router.get('/optimize', (req, res) => {
    try {
        const { publicId, width, height, quality, format } = req.query;

        if (!publicId) {
            return res.status(400).json({
                success: false,
                message: 'Public ID is required'
            });
        }

        const options = {
            width: width ? parseInt(width) : undefined,
            height: height ? parseInt(height) : undefined,
            quality: quality || 'auto',
            format: format || 'auto'
        };

        const url = getOptimizedImageUrl(publicId, options);

        res.json({
            success: true,
            url
        });
    } catch (error) {
        console.error('Optimize error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
});

export default router;
