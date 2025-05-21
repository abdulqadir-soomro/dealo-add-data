const mongoose = require("mongoose");

const dealSchema = new mongoose.Schema({
    brandId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Brand",
        required: true
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    title: {
        type: String,
        required: true,
        index: true,
    },
    description: {
        type: String
    },
    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
    },
    discountPercentage: {
        type: Number,
        required: true
    },
    startDate: {
        type: Date
    },
    endDate: {
        type: Date
    },
    imageUrl: {
        type: [String],
        required: true,
        validate: {
            validator: function(v) {
                return v.length > 0;
            },
            message: 'At least one image URL is required'
        }
    },
    imageUrl2: {
        type: String
    },
    imageUrl3: {
        type: String
    },
    imageUrl4: {
        type: String
    },
    imageUrl5: {
        type: String
    },
    imageUrl6: {
        type: String
    },
    actualPrice: {
        type: Number,
        required: true
    },
    hasWebsite: {
        type: Boolean,
        default: false
    },
    isPhysical: {
        type: Boolean,
        default: false
    },
    promoCode: {
        type: String
    },
    discountedPrice: {
        type: Number,
        required: true
    },
    link: {
        type: [String],
        required: true,
        validate: {
            validator: function(v) {
                return v.length > 0;
            },
            message: 'At least one link is required'
        }
    },
    tags: {
        type: [String]
    },
    badge: {
        type: String
    },
    brand: {
        type: String
    },
    discount: {
        type: String
    },
    variants: [
        {
            size: { type: String },
            color: { type: String }
        }
    ]
}, { timestamps: true });

// Helper function to parse price string
function parsePrice(priceStr) {
    if (!priceStr) return 0;
    // Remove quotes, commas, spaces and convert to number
    const cleanedStr = priceStr.replace(/[",\s]/g, '').trim();
    // Handle empty strings after cleaning
    if (!cleanedStr) return 0;
    // Convert to number and handle NaN
    const num = Number(cleanedStr);
    return isNaN(num) ? 0 : num;
}

// Static method to import CSV data
dealSchema.statics.importFromCSV = async function(csvData) {
    const rows = csvData.split('\n').filter(row => row.trim());
    
    // Get headers from first row
    const headers = rows[0].split(',').map(h => h.trim());
    
    // Skip the header row
    const dataRows = rows.slice(1);
    const offers = [];
    let processedCount = 0;
    let errorCount = 0;
    const errors = [];
    
    for (const [index, row] of dataRows.entries()) {
        try {
            // Split by comma but handle quoted values
            const values = row.split(',').map(v => {
                v = v.trim();
                // Remove quotes if present
                if (v.startsWith('"') && v.endsWith('"')) {
                    v = v.slice(1, -1);
                }
                return v;
            });

            // Skip empty rows
            if (values.length === 0 || values.every(v => !v)) {
                errorCount++;
                errors.push({
                    row: index + 2,
                    error: 'Empty row'
                });
                continue;
            }

            // Extract and validate required fields
            const title = values[1]?.trim();
            const link = values[2]?.trim();
            
            // Process all six image URLs
            const imageUrls = [];
            for (let i = 3; i <= 8; i++) {
                const url = values[i]?.trim();
                if (url && url !== '') {
                    imageUrls.push(url);
                }
            }

            // Validate required fields
            const missingFields = [];
            if (!title) missingFields.push('title');
            if (!link) missingFields.push('link');
            if (imageUrls.length === 0) missingFields.push('imageUrl');

            if (missingFields.length > 0) {
                errorCount++;
                errors.push({
                    row: index + 2,
                    error: `Missing required fields: ${missingFields.join(', ')}`,
                    data: {
                        title,
                        link,
                        imageUrlCount: imageUrls.length
                    }
                });
                continue;
            }

            // Add debug logging for image URLs
            console.log('Processing image URLs:', {
                row: index + 2,
                imageUrls: imageUrls
            });

            // Create offer object with proper mapping and type conversion
            const offer = {
                title,
                description: values[2]?.trim() || "",
                link: [link],
                imageUrl: imageUrls,  // Use the processed imageUrls array
                discountPercentage: parsePrice(values[9]),  // Use parsePrice for consistency
                discountedPrice: parsePrice(values[10]),
                actualPrice: parsePrice(values[11]),
                badge: values[12]?.trim(),
                brand: values[13]?.trim(),
                discount: parsePrice(values[14]),
                promoCode: values[15]?.trim() || "",
                variants: [],
                status: 'active',
                hasWebsite: false,
                isPhysical: false,
                categoryId: global.defaultCategoryId,
                brandId: global.defaultBrandId,
                tags: []
            };

            // Process variants (6 pairs of size and color)
            for (let i = 0; i < 6; i++) {
                const sizeIndex = 16 + (i * 2);  // variants(size) columns
                const colorIndex = 17 + (i * 2); // variants(color) columns
                
                if (values[sizeIndex] && values[colorIndex] && 
                    values[sizeIndex] !== '' && values[colorIndex] !== '') {
                    offer.variants.push({
                        size: values[sizeIndex].trim(),
                        color: values[colorIndex].trim()
                    });
                }
            }

            // Create and validate the offer
            const newOffer = new this(offer);
            await newOffer.validate();
            offers.push(newOffer);
            processedCount++;

            // Log progress every 100 records
            if (processedCount % 100 === 0) {
                console.log(`Processed ${processedCount} records...`);
            }
        } catch (error) {
            errorCount++;
            errors.push({
                row: index + 2,
                error: error.message,
                data: values
            });
            console.error(`Error processing row ${index + 2}:`, error.message);
            continue;
        }
    }

    try {
        if (offers.length === 0) {
            throw new Error('No valid offers found in CSV data');
        }

        const result = await this.insertMany(offers);
        return {
            success: true,
            totalProcessed: processedCount,
            totalErrors: errorCount,
            insertedCount: result.length,
            offers: result,
            errors: errors.length > 0 ? errors : undefined
        };
    } catch (error) {
        console.error('Error importing CSV data:', error);
        throw error;
    }
};

// Static method to import from JSON data
dealSchema.statics.importFromJSON = async function(jsonData) {
    const offers = [];
    let processedCount = 0;
    let errorCount = 0;

    try {
        // Handle both single object and array of objects
        const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];

        for (const data of dataArray) {
            try {
                // Extract variants from the data
                const variants = [];
                for (let i = 1; i <= 6; i++) {
                    const sizeKey = `variants-${i}`;
                    const colorKey = i === 1 ? '' : `__${i-1}`;
                    
                    if (data[sizeKey] && data[colorKey]) {
                        variants.push({
                            size: data[sizeKey].trim(),
                            color: data[colorKey].trim()
                        });
                    }
                }

                // Create offer object
                const offer = {
                    title: data.title?.trim() || '',
                    link: [data.link?.trim()].filter(Boolean),
                    imageUrl: [
                        data.imageUrl,
                        data.imageUrl2,
                        data.imageUrl3,
                        data.imageUrl4,
                        data.imageUrl5,
                        data.imageUrl6
                    ].filter(url => url && url !== ''),
                    discountPercentage: Number(data.discountedPercentage) || 0,
                    discountedPrice: Number(data.discountedPrice) || 0,
                    actualPrice: Number(data.actualPrice) || 0,
                    badge: data['badge 5']?.trim(),
                    brand: data.brand?.trim(),
                    discount: data.discount?.trim(),
                    variants: variants,
                    status: 'active',
                    hasWebsite: false,
                    isPhysical: false,
                    categoryId: global.defaultCategoryId,
                    brandId: global.defaultBrandId
                };

                // Validate required fields
                if (!offer.title || !offer.link[0] || offer.imageUrl.length === 0) {
                    errorCount++;
                    continue;
                }

                // Create and validate the offer
                const newOffer = new this(offer);
                await newOffer.validate();
                offers.push(newOffer);
                processedCount++;

            } catch (error) {
                errorCount++;
                console.error('Error processing record:', error);
                continue;
            }
        }

        if (offers.length === 0) {
            throw new Error('No valid offers found in JSON data');
        }

        const result = await this.insertMany(offers);
        return {
            success: true,
            totalProcessed: processedCount,
            totalErrors: errorCount,
            insertedCount: result.length,
            offers: result
        };

    } catch (error) {
        console.error('Error importing JSON data:', error);
        throw error;
    }
};

module.exports = mongoose.model("Offer", dealSchema);
