import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * This script generates the images.js constants file from cloudinary-uploads.json
 * Run this after uploading images to Cloudinary
 */

console.log('🎨 Generating images constants file from Cloudinary uploads...\n');

// Read the upload results
const uploadsPath = path.join(__dirname, 'cloudinary-uploads.json');

if (!fs.existsSync(uploadsPath)) {
  console.error('❌ Error: cloudinary-uploads.json not found!');
  console.log('Please run "npm run upload-assets" first to upload images to Cloudinary.\n');
  process.exit(1);
}

const uploads = JSON.parse(fs.readFileSync(uploadsPath, 'utf-8'));

// Extract cloud name from the first URL
const firstSuccessful = uploads.find(u => u.success);
if (!firstSuccessful) {
  console.error('❌ No successful uploads found!');
  process.exit(1);
}

const urlMatch = firstSuccessful.url.match(/https:\/\/res\.cloudinary\.com\/([^\/]+)\//);
if (!urlMatch) {
  console.error('❌ Could not extract cloud name from URL');
  process.exit(1);
}

const cloudName = urlMatch[1];
console.log(`✅ Found Cloudinary cloud name: ${cloudName}\n`);

// Create file content
let fileContent = `// Cloudinary Image URLs - Auto-generated
// Generated on: ${new Date().toISOString()}
// Cloud Name: ${cloudName}

const CLOUD_NAME = '${cloudName}';
const BASE_URL = \`https://res.cloudinary.com/\${CLOUD_NAME}/image/upload\`;

// Helper function to generate Cloudinary URL
const getImageUrl = (path, transformations = '') => {
  return \`\${BASE_URL}\${transformations}/sriamman/assets/\${path}\`;
};

// All uploaded images
export const IMAGES = {
`;

// Add each image
uploads.forEach(upload => {
  if (upload.success) {
    // Convert filename to camelCase key
    const key = upload.filename
      .replace(/\.(jpg|jpeg|png|gif|webp)$/i, '')
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/^(.)/, (_, chr) => chr.toLowerCase());

    const filename = upload.filename.replace(/ /g, '_');

    // Wrap key in quotes if it starts with a number
    const quotedKey = /^[0-9]/.test(key) ? `'${key}'` : key;

    fileContent += `  ${quotedKey}: getImageUrl('${filename}'),\n`;
  }
});

fileContent += `};

// Brand Logos
export const BRAND_LOGOS = {
  havells: IMAGES.havells || '',
  anchor: IMAGES.anchor || '',
  polycab: IMAGES.polycab || '',
  philips: IMAGES.philips || '',
  schneider: IMAGES.schneider || '',
  legrand: IMAGES.legrand || '',
  goldmedal: IMAGES.goldmedal || '',
  syska: IMAGES.syska || '',
  wipro: IMAGES.wipro || '',
  crompton: IMAGES.cromptonfan || '',
};

// Product Images
export const PRODUCT_IMAGES = {
  tmtBar: IMAGES.tmtBarGrade550d || IMAGES.tmt || '',
  ultratech: IMAGES.ultratechOpc53Grade || '',
  whiteCement: IMAGES.whiteCement || '',
  copperWiring: IMAGES.copperWiring25Mm || '',
  msSquarePipes: IMAGES.msSquarePipes || '',
  modularSwitches: IMAGES.modularSwitchesSet || '',
  threePole: IMAGES['3pole'] || IMAGES.pole || '',
  board: IMAGES.board || '',
  gsb: IMAGES.gsb || '',
  hat: IMAGES.hat || '',
  motor: IMAGES.motor || '',
  switch: IMAGES.switch || '',
};

// Hero/Banner Images
export const HERO_IMAGES = {
  main: IMAGES.photo1 || '',
  construction: IMAGES.co3 || '',
};

// Optimized versions with transformations (for better performance)
export const getOptimized = (imageKey, options = {}) => {
  const {
    width = 'auto',
    height = 'auto',
    crop = 'fill',
    quality = 'auto',
    format = 'auto'
  } = options;
  
  const image = IMAGES[imageKey];
  if (!image) return '';
  
  const transformation = \`/c_\${crop},w_\${width},h_\${height},q_\${quality},f_\${format}\`;
  return image.replace('/sriamman/assets/', \`\${transformation}/sriamman/assets/\`);
};

export default IMAGES;
`;

// Write to file
const outputPath = path.join(__dirname, '../Frontend/src/constants/images.js');
fs.writeFileSync(outputPath, fileContent);

console.log('✅ Successfully generated images.js!\n');
console.log(`📁 Output: ${outputPath}\n`);
console.log('📊 Summary:');
console.log(`   Total images: ${uploads.length}`);
console.log(`   Successful: ${uploads.filter(u => u.success).length}`);
console.log(`   Failed: ${uploads.filter(u => !u.success).length}\n`);

console.log('🎉 You can now import images in your React components:');
console.log('   import { IMAGES, BRAND_LOGOS, PRODUCT_IMAGES } from "../constants/images";\n');
