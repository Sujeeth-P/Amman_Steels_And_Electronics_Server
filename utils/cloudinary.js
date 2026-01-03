import cloudinary from '../config/cloudinary.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Upload a single image to Cloudinary
 * @param {string} filePath - Path to the image file
 * @param {string} folder - Cloudinary folder name
 * @returns {Promise<Object>} Upload result
 */
export const uploadImage = async (filePath, folder = 'sriamman') => {
    try {
        const result = await cloudinary.uploader.upload(filePath, {
            folder: folder,
            resource_type: 'auto',
            use_filename: true,
            unique_filename: false
        });

        return {
            success: true,
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format
        };
    } catch (error) {
        console.error('Error uploading to Cloudinary:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Upload multiple images from a directory
 * @param {string} directoryPath - Path to directory containing images
 * @param {string} folder - Cloudinary folder name
 * @returns {Promise<Array>} Array of upload results
 */
export const uploadDirectory = async (directoryPath, folder = 'sriamman') => {
    try {
        const files = fs.readdirSync(directoryPath);
        const imageFiles = files.filter(file =>
            /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
        );

        console.log(`Found ${imageFiles.length} images to upload...`);

        const results = [];

        for (const file of imageFiles) {
            const filePath = path.join(directoryPath, file);
            console.log(`Uploading: ${file}...`);

            const result = await uploadImage(filePath, folder);
            results.push({
                filename: file,
                ...result
            });

            if (result.success) {
                console.log(`✓ Uploaded: ${file}`);
            } else {
                console.log(`✗ Failed: ${file} - ${result.error}`);
            }
        }

        return results;
    } catch (error) {
        console.error('Error uploading directory:', error);
        throw error;
    }
};

/**
 * Delete an image from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteImage = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        return {
            success: result.result === 'ok',
            result: result.result
        };
    } catch (error) {
        console.error('Error deleting from Cloudinary:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Get optimized image URL with transformations
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} options - Transformation options
 * @returns {string} Optimized image URL
 */
export const getOptimizedImageUrl = (publicId, options = {}) => {
    const {
        width,
        height,
        crop = 'fill',
        quality = 'auto',
        format = 'auto'
    } = options;

    return cloudinary.url(publicId, {
        width,
        height,
        crop,
        quality,
        fetch_format: format,
        secure: true
    });
};
