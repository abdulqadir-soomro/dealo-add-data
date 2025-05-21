require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const csv = require('csv-parser');
const cors = require('cors');
const Offer = require('./offer.model');

// Add Category and Brand models
const Category = require('./category.model');
const Brand = require('./brand.model');

const app = express();
const port = process.env.PORT || 3000;

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
    process.exit(1);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

// Create uploads directory if it doesn't exist
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir);
        console.log('Created uploads directory');
    } catch (error) {
        console.error('Error creating uploads directory:', error);
    }
}

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.json', '.csv', '.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type. Only ${allowedTypes.join(', ')} files are allowed.`));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        success: false,
        error: err.message || 'An unexpected error occurred'
    });
});

// Helper function to validate and transform data
function validateAndTransformData(data) {
    const transformed = {
        title: data.title,
        description: data.description,
        status: data.status || 'active',
        discountPercentage: Number(data.discountPercentage),
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        imageUrl: Array.isArray(data.imageUrl) ? data.imageUrl : [data.imageUrl],
        actualPrice: Number(data.actualPrice),
        hasWebsite: Boolean(data.hasWebsite),
        isPhysical: Boolean(data.isPhysical),
        promoCode: data.promoCode,
        discountedPrice: Number(data.discountedPrice),
        link: Array.isArray(data.link) ? data.link : [data.link],
        tags: Array.isArray(data.tags) ? data.tags : [data.tags],
        variants: Array.isArray(data.variants) ? data.variants : []
    };

    // Validate required fields
    if (!transformed.title || !transformed.discountPercentage || !transformed.imageUrl.length) {
        throw new Error('Missing required fields');
    }

    return transformed;
}

// Helper function to process different file types
async function processFile(filePath) {
    console.log('Processing file at path:', filePath);
    const ext = path.extname(filePath).toLowerCase();
    console.log('File extension:', ext);
    let data = [];

    try {
        if (ext === '.json') {
            console.log('Processing JSON file');
            const fileContent = fs.readFileSync(filePath, 'utf8');
            data = JSON.parse(fileContent);
            if (!Array.isArray(data)) {
                data = [data];
            }
        } else if (ext === '.csv') {
            console.log('Processing CSV file');
            await new Promise((resolve, reject) => {
                const results = [];
                let rowCount = 0;
                const stream = fs.createReadStream(filePath)
                    .pipe(csv({
                        mapHeaders: ({ header }) => header.trim(),
                        mapValues: ({ value }) => value.trim(),
                        skipLines: 0
                    }))
                    .on('data', (row) => {
                        results.push(row);
                        rowCount++;
                        if (rowCount % 1000 === 0) {
                            console.log(`Processed ${rowCount} rows...`);
                        }
                    })
                    .on('end', () => {
                        console.log(`Finished processing ${rowCount} rows`);
                        data = results;
                        resolve();
                    })
                    .on('error', reject);
            });
        } else if (ext === '.xlsx' || ext === '.xls') {
            console.log('Processing Excel file');
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(filePath);
            
            const worksheet = workbook.getWorksheet(1);
            if (!worksheet) {
                throw new Error('No worksheet found in the Excel file');
            }

            const headers = [];
            worksheet.getRow(1).eachCell((cell, colNumber) => {
                headers[colNumber - 1] = cell.value;
            });

            data = [];
            let rowCount = 0;
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return; // Skip header row
                
                const rowData = {};
                row.eachCell((cell, colNumber) => {
                    const header = headers[colNumber - 1];
                    if (header) {
                        rowData[header] = cell.value;
                    }
                });
                data.push(rowData);
                rowCount++;
                if (rowCount % 1000 === 0) {
                    console.log(`Processed ${rowCount} rows...`);
                }
            });
            console.log(`Finished processing ${rowCount} rows`);
        }

        // Clean up empty values and normalize data
        console.log('Cleaning and normalizing data...');
        data = data.map((row, index) => {
            const cleanRow = {};
            Object.entries(row).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '') {
                    cleanRow[key.trim()] = value;
                }
            });
            if (index % 1000 === 0) {
                console.log(`Cleaned ${index} rows...`);
            }
            return cleanRow;
        });

        console.log(`Successfully processed file. Found ${data.length} records`);
        return data;
    } catch (error) {
        console.error('Error in processFile:', error);
        throw error;
    }
}

// Preview route
app.post('/api/upload/preview', upload.single('file'), async (req, res) => {
    try {
        console.log('Received upload request');
        
        if (!req.file) {
            console.log('No file received in request');
            return res.status(400).json({ 
                success: false, 
                error: 'No file uploaded. Please select a file.' 
            });
        }

        // Log file information for debugging
        const fileSize = (req.file.size / (1024 * 1024)).toFixed(2);
        console.log('File details:', {
            filename: req.file.filename,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: `${fileSize} MB`,
            path: req.file.path
        });

        // Process the file
        console.log('Processing file...');
        const data = await processFile(req.file.path);
        
        if (!data || data.length === 0) {
            console.log('No data found in file');
            return res.status(400).json({
                success: false,
                error: 'No data found in the file or file is empty.'
            });
        }

        // Log first record for debugging
        console.log('Successfully processed file. First record:', data[0]);
        
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        console.log('Cleaned up temporary file');

        // Send response with preview data
        res.json({
            success: true,
            data: data,
            stats: {
                totalRecords: data.length,
                fileSize: `${fileSize} MB`
            }
        });

    } catch (error) {
        console.error('Detailed error information:', {
            message: error.message,
            stack: error.stack,
            file: req.file ? {
                filename: req.file.filename,
                originalname: req.file.originalname,
                mimetype: req.file.mimetype,
                path: req.file.path
            } : 'No file'
        });

        // Clean up file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            try {
                fs.unlinkSync(req.file.path);
                console.log('Cleaned up temporary file after error');
            } catch (cleanupError) {
                console.error('Error cleaning up file:', cleanupError);
            }
        }

        res.status(500).json({
            success: false,
            error: `Error processing file: ${error.message}`
        });
    }
});

// Save route
app.post('/api/upload/save', async (req, res) => {
    try {
        const { data, headers } = req.body;

        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid data format' 
            });
        }

        console.log(`Saving ${data.length} records to database...`);

        // Transform and save data
        const savedRecords = [];
        const errors = [];
        let processedCount = 0;

        for (const record of data) {
            try {
                // Transform the data according to the schema
                const transformedData = {
                    title: record.title || '',
                    description: record.description || '',
                    status: record.status || 'active',
                    discountPercentage: Number(record.discountedPercentage) || 0,
                    startDate: record.startDate ? new Date(record.startDate) : undefined,
                    endDate: record.endDate ? new Date(record.endDate) : undefined,
                    imageUrl: [
                        record.imageUrl,
                        record.imageUrl2,
                        record.imageUrl3,
                        record.imageUrl4,
                        record.imageUrl5,
                        record.imageUrl6
                    ].filter(url => url && url.trim() !== ''),
                    actualPrice: Number(String(record.actualPrice).replace(/[^0-9.]/g, '')) || 0,
                    hasWebsite: Boolean(record.hasWebsite),
                    isPhysical: Boolean(record.isPhysical),
                    promoCode: record.promoCode || '',
                    discountedPrice: Number(String(record.discountedPrice).replace(/[^0-9.]/g, '')) || 0,
                    link: Array.isArray(record.link) ? record.link : [record.link].filter(Boolean),
                    tags: Array.isArray(record.tags) ? record.tags : [record.tags].filter(Boolean),
                    variants: [
                        { size: record['variants(size)1'], color: record['variants(color)1'] },
                        { size: record['variants(size)2'], color: record['variants(color)2'] },
                        { size: record['variants(size)3'], color: record['variants(color)3'] },
                        { size: record['variants(size)4'], color: record['variants(color)4'] },
                        { size: record['variants(size)5'], color: record['variants(color)5'] },
                        { size: record['variants(size)6'], color: record['variants(color)6'] }
                    ].filter(variant => variant.size && variant.color),
                    categoryId: record.categoryId || global.defaultCategoryId,
                    brandId: record.brandId || global.defaultBrandId,
                    badge: record['badge 5'] || '',
                    brand: record.brand || ''
                };

                // Validate required fields
                if (!transformedData.title || !transformedData.imageUrl.length) {
                    throw new Error('Missing required fields: title and imageUrl are required');
                }

                // Create and save the offer
                const offer = new Offer(transformedData);
                await offer.save();
                savedRecords.push(offer);

                processedCount++;
                if (processedCount % 100 === 0) {
                    console.log(`Processed ${processedCount} records...`);
                }
            } catch (error) {
                console.error('Error saving record:', error);
                errors.push({
                    row: processedCount,
                    error: error.message,
                    data: record
                });
            }
        }

        console.log(`Finished saving records. Success: ${savedRecords.length}, Errors: ${errors.length}`);

        // Send response
        res.json({
            success: true,
            totalProcessed: processedCount,
            totalErrors: errors.length,
            insertedCount: savedRecords.length,
            offers: savedRecords,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Save error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Brand API endpoints
app.get('/api/brands', async (req, res) => {
    try {
        const brands = await Brand.find().sort({ name: 1 });
        res.json(brands);
    } catch (error) {
        console.error('Error fetching brands:', error);
        res.status(500).json({ success: false, error: 'Error fetching brands' });
    }
});

app.post('/api/brands', async (req, res) => {
    try {
        const { name, description, logo } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, error: 'Brand name is required' });
        }

        const brand = new Brand({
            name,
            description,
            logo
        });

        await brand.save();
        res.status(201).json(brand);
    } catch (error) {
        console.error('Error creating brand:', error);
        res.status(500).json({ success: false, error: 'Error creating brand' });
    }
});

app.get('/api/brands/:id', async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) {
            return res.status(404).json({ success: false, error: 'Brand not found' });
        }
        res.json(brand);
    } catch (error) {
        console.error('Error fetching brand:', error);
        res.status(500).json({ success: false, error: 'Error fetching brand' });
    }
});

app.put('/api/brands/:id', async (req, res) => {
    try {
        const { name, description, logo } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, error: 'Brand name is required' });
        }

        const brand = await Brand.findByIdAndUpdate(
            req.params.id,
            { name, description, logo },
            { new: true, runValidators: true }
        );

        if (!brand) {
            return res.status(404).json({ success: false, error: 'Brand not found' });
        }

        res.json(brand);
    } catch (error) {
        console.error('Error updating brand:', error);
        res.status(500).json({ success: false, error: 'Error updating brand' });
    }
});

app.delete('/api/brands/:id', async (req, res) => {
    try {
        const brand = await Brand.findByIdAndDelete(req.params.id);
        if (!brand) {
            return res.status(404).json({ success: false, error: 'Brand not found' });
        }
        res.json({ success: true, message: 'Brand deleted successfully' });
    } catch (error) {
        console.error('Error deleting brand:', error);
        res.status(500).json({ success: false, error: 'Error deleting brand' });
    }
});

// Category API endpoints
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find().sort({ categoryName: 1 });
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, error: 'Error fetching categories' });
    }
});

app.post('/api/categories', async (req, res) => {
    try {
        const { categoryName, categoryType, subCategory } = req.body;
        
        if (!categoryName) {
            return res.status(400).json({ success: false, error: 'Category name is required' });
        }

        const category = new Category({
            categoryName,
            categoryType,
            subCategory
        });

        await category.save();
        res.status(201).json(category);
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ success: false, error: 'Error creating category' });
    }
});

app.get('/api/categories/:id', async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }
        res.json(category);
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({ success: false, error: 'Error fetching category' });
    }
});

app.put('/api/categories/:id', async (req, res) => {
    try {
        const { categoryName, categoryType, subCategory } = req.body;
        
        if (!categoryName) {
            return res.status(400).json({ success: false, error: 'Category name is required' });
        }

        const category = await Category.findByIdAndUpdate(
            req.params.id,
            { categoryName, categoryType, subCategory },
            { new: true, runValidators: true }
        );

        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }

        res.json(category);
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ success: false, error: 'Error updating category' });
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    try {
        const category = await Category.findByIdAndDelete(req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }
        res.json({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ success: false, error: 'Error deleting category' });
    }
});

// Offer API endpoints
app.get('/api/offers', async (req, res) => {
    try {
        const offers = await Offer.find()
            .populate('brandId', 'name')
            .populate('categoryId', 'categoryName')
            .sort({ createdAt: -1 });
        res.json(offers);
    } catch (error) {
        console.error('Error fetching offers:', error);
        res.status(500).json({ success: false, error: 'Error fetching offers' });
    }
});

app.post('/api/offers', async (req, res) => {
    try {
        const {
            title,
            description,
            discountPercentage,
            actualPrice,
            discountedPrice,
            imageUrl,
            brandId,
            categoryId,
            promoCode,
            link,
            badge,
            hasWebsite,
            isPhysical
        } = req.body;

        if (!title || !imageUrl || !brandId || !categoryId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title, image URL, brand, and category are required' 
            });
        }

        const offer = new Offer({
            title,
            description,
            discountPercentage,
            actualPrice,
            discountedPrice,
            imageUrl: [imageUrl], // Store as array for consistency
            brandId,
            categoryId,
            promoCode,
            link: link ? [link] : [], // Store as array for consistency
            badge,
            hasWebsite,
            isPhysical
        });

        await offer.save();
        res.status(201).json(offer);
    } catch (error) {
        console.error('Error creating offer:', error);
        res.status(500).json({ success: false, error: 'Error creating offer' });
    }
});

app.get('/api/offers/:id', async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id)
            .populate('brandId', 'name')
            .populate('categoryId', 'categoryName');
        if (!offer) {
            return res.status(404).json({ success: false, error: 'Offer not found' });
        }
        res.json(offer);
    } catch (error) {
        console.error('Error fetching offer:', error);
        res.status(500).json({ success: false, error: 'Error fetching offer' });
    }
});

app.put('/api/offers/:id', async (req, res) => {
    try {
        const {
            title,
            description,
            discountPercentage,
            actualPrice,
            discountedPrice,
            imageUrl,
            brandId,
            categoryId,
            promoCode,
            link,
            badge,
            hasWebsite,
            isPhysical
        } = req.body;

        if (!title || !imageUrl || !brandId || !categoryId) {
            return res.status(400).json({ 
                success: false, 
                error: 'Title, image URL, brand, and category are required' 
            });
        }

        const offer = await Offer.findByIdAndUpdate(
            req.params.id,
            {
                title,
                description,
                discountPercentage,
                actualPrice,
                discountedPrice,
                imageUrl: [imageUrl],
                brandId,
                categoryId,
                promoCode,
                link: link ? [link] : [],
                badge,
                hasWebsite,
                isPhysical
            },
            { new: true, runValidators: true }
        );

        if (!offer) {
            return res.status(404).json({ success: false, error: 'Offer not found' });
        }

        res.json(offer);
    } catch (error) {
        console.error('Error updating offer:', error);
        res.status(500).json({ success: false, error: 'Error updating offer' });
    }
});

app.delete('/api/offers/:id', async (req, res) => {
    try {
        const offer = await Offer.findByIdAndDelete(req.params.id);
        if (!offer) {
            return res.status(404).json({ success: false, error: 'Offer not found' });
        }
        res.json({ success: true, message: 'Offer deleted successfully' });
    } catch (error) {
        console.error('Error deleting offer:', error);
        res.status(500).json({ success: false, error: 'Error deleting offer' });
    }
});

// Connect to MongoDB and start server
mongoose.connect('mongodb://localhost:27017/offers', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(async () => {
    console.log('Connected to MongoDB successfully');
    
    // Create default category and brand if they don't exist
    try {
        const defaultCategory = await Category.findOneAndUpdate(
            { categoryName: 'Default Category' },
            { 
                categoryName: 'Default Category',
                categoryType: 'General',
                subCategory: 'Default'
            },
            { upsert: true, new: true }
        );
        
        const defaultBrand = await Brand.findOneAndUpdate(
            { name: 'Default Brand' },
            { name: 'Default Brand', description: 'Default brand for offers' },
            { upsert: true, new: true }
        );
        
        console.log('Default category and brand created/verified');
        
        // Store default IDs for later use
        global.defaultCategoryId = defaultCategory._id;
        global.defaultBrandId = defaultBrand._id;
    } catch (error) {
        console.error('Error creating default category/brand:', error);
    }
    
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
        console.log(`Upload page available at: http://localhost:${port}/upload.html`);
    });
})
.catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
}); 