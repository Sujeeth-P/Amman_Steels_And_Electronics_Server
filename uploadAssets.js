import { uploadDirectory } from './utils/cloudinary.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to your assets folder
const assetsPath = path.join(__dirname, '../Frontend/src/assets');

console.log('🚀 Starting Cloudinary Upload Process...');
console.log(`📁 Assets folder: ${assetsPath}`);

// Check if directory exists
if (!fs.existsSync(assetsPath)) {
    console.error('❌ Assets folder not found!');
    console.log('Please make sure the path is correct.');
    process.exit(1);
}

// Upload all images
uploadDirectory(assetsPath, 'sriamman/assets')
    .then(results => {
        console.log('\n✅ Upload Complete!');
        console.log(`\n📊 Summary:`);
        console.log(`Total files processed: ${results.length}`);

        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        console.log(`Successful uploads: ${successful.length}`);
        console.log(`Failed uploads: ${failed.length}`);

        if (successful.length > 0) {
            console.log('\n✓ Successfully uploaded images:');
            console.log('================================');
            successful.forEach(r => {
                console.log(`📷 ${r.filename}`);
                console.log(`   URL: ${r.url}\n`);
            });
        }

        if (failed.length > 0) {
            console.log('\n✗ Failed uploads:');
            console.log('================');
            failed.forEach(r => {
                console.log(`❌ ${r.filename}: ${r.error}`);
            });
        }

        // Save results to a JSON file for reference
        const outputPath = path.join(__dirname, 'cloudinary-uploads.json');
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
        console.log(`\n💾 Results saved to: ${outputPath}`);
    })
    .catch(error => {
        console.error('❌ Upload process failed:', error);
        process.exit(1);
    });
