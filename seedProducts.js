import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

// Cloudinary base URL - replace with your cloud name
const CLOUD_NAME = 'drbevmnbm';
const getCloudinaryUrl = (filename, width = 500, height = 400) => {
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_fill,w_${width},h_${height},q_auto,f_auto/sriamman/assets/${filename}`;
};

const products = [
    // Steel Products
    {
        id: 's1',
        name: 'TMT Bar - Grade 550D',
        category: 'steel',
        price: 65000,
        unit: 'Ton',
        image: getCloudinaryUrl('TMT_bar-Grade_550D.jpg'),
        description: 'High-strength TMT bars suitable for heavy construction. Earthquake resistant.',
        longDescription: 'Our Grade 550D TMT bars are manufactured using the latest Tempcore technology. They offer superior ductility, high strength, and excellent bendability, making them ideal for critical infrastructure projects, high-rise buildings, and bridges in seismic zones.',
        specs: {
            'Grade': 'Fe 550D',
            'Diameter': '8mm - 32mm',
            'Elongation': 'Min 14.5%',
            'Corrosion Resistance': 'High',
            'Standard': 'IS 1786:2008'
        },
        inStock: true,
        reviews: [
            {
                user: "Rajesh Kumar",
                rating: 5,
                date: new Date("2024-02-15"),
                comment: "Excellent quality TMT bars. The bendability is exactly as described. Delivered on time to my site in Tambaram."
            },
            {
                user: "Civil Tech Constructions",
                rating: 4,
                date: new Date("2024-01-20"),
                comment: "Good pricing for bulk orders. We ordered 50 tons and the quality was consistent throughout the lot."
            }
        ]
    },
    {
        id: 's2',
        name: 'MS Square Pipes',
        category: 'steel',
        price: 58,
        unit: 'Kg',
        image: getCloudinaryUrl('MS_Square_pipes.jpg'),
        description: 'Mild Steel square pipes for structural fabrication.',
        longDescription: 'Premium quality Mild Steel (MS) square pipes known for their durability and high tensile strength. Widely used in furniture, bus bodies, fencing, and general structural fabrication.',
        specs: {
            'Material': 'Mild Steel',
            'Thickness': '1.2mm - 6.0mm',
            'Length': '6 Meters',
            'Finish': 'Black / Galvanized',
            'Shape': 'Square'
        },
        inStock: true,
        reviews: []
    },

    // Cement Products
    {
        id: 'c1',
        name: 'UltraTech OPC 53 Grade',
        category: 'cement',
        price: 420,
        unit: 'Bag',
        image: getCloudinaryUrl('Ultratech_OPC_53_Grade.jpg'),
        description: 'Ordinary Portland Cement for general construction purposes.',
        longDescription: 'OPC 53 Grade cement is a high-strength cement used for general civil engineering construction work, RCC works, pre-cast items such as blocks, tiles, pipes, and non-structural works such as plastering and flooring.',
        specs: {
            'Grade': 'OPC 53',
            'Packaging': '50kg HDPE Bag',
            'Compressive Strength': '53 MPa (28 Days)',
            'Setting Time': 'Initial: 30 min, Final: 600 min',
            'Color': 'Grey'
        },
        inStock: true,
        reviews: [
            {
                user: "Muthu Vel",
                rating: 5,
                date: new Date("2024-03-01"),
                comment: "Fresh stock received. No lumps in the bags. Very satisfied with the service."
            }
        ]
    },
    {
        id: 'c2',
        name: 'White Cement',
        category: 'cement',
        price: 850,
        unit: 'Bag',
        image: getCloudinaryUrl('White_Cement.jpg'),
        description: 'Premium white cement for decorative finishing.',
        longDescription: 'Superior quality white cement that provides a pristine white canvas for your walls. Ideal for terrazzo flooring, architectural concrete, and decorative cement paints.',
        specs: {
            'Whiteness': '> 89%',
            'Packaging': '50kg / 25kg',
            'Type': 'White Portland Cement',
            'Usage': 'Decorative / Finishing',
            'Curing Time': 'Standard'
        },
        inStock: true,
        reviews: []
    },

    // Electronics Products
    {
        id: 'e1',
        name: 'Modular Switches Set',
        category: 'electronics',
        price: 1200,
        unit: 'Box',
        image: getCloudinaryUrl('Modular_Switches_Set.jpg'),
        description: 'Elegant modular switches, fire resistant.',
        longDescription: 'State-of-the-art modular switches designed for modern homes. Features soft-touch operation, flame-retardant polycarbonate material, and a sleek finish that complements any interior.',
        specs: {
            'Material': 'Polycarbonate',
            'Voltage': '240V',
            'Current Rating': '6A / 16A',
            'Life Cycle': '100,000 Clicks',
            'Certification': 'ISI Marked'
        },
        inStock: true,
        reviews: []
    },
    {
        id: 'e2',
        name: 'Copper Wiring 2.5mm',
        category: 'electronics',
        price: 1800,
        unit: 'Coil',
        image: getCloudinaryUrl('Copper_Wiring_2.5mm.jpg'),
        description: 'Pure copper wiring for domestic and industrial use.',
        longDescription: 'High-conductivity electrolytic copper conductor with multi-strand flexibility. Insulated with advanced PVC compound for superior fire resistance and longevity.',
        specs: {
            'Conductor': 'Electrolytic Copper',
            'Insulation': 'FR PVC',
            'Size': '2.5 sq mm',
            'Length': '90m Coil',
            'Voltage Grade': '1100V'
        },
        inStock: true,
        reviews: []
    }
];

const seedProducts = async () => {
    try {
        console.log('🌱 Starting product seeding...\n');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Clear existing products
        await Product.deleteMany({});
        console.log('🗑️  Cleared existing products\n');

        // Insert new products
        const insertedProducts = await Product.insertMany(products);
        console.log(`✅ Successfully inserted ${insertedProducts.length} products\n`);

        // Display inserted products
        console.log('📦 Inserted Products:');
        console.log('===================');
        insertedProducts.forEach(product => {
            console.log(`\n✓ ${product.name}`);
            console.log(`  Category: ${product.category}`);
            console.log(`  Price: ₹${product.price}/${product.unit}`);
            console.log(`  Image: ${product.image}`);
        });

        console.log('\n🎉 Product seeding completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding products:', error);
        process.exit(1);
    }
};

// Run the seed function
seedProducts();
