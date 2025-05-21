const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
    categoryName: {
        type: String,
        required: true,
        trim: true
    },
    categoryType: {
        type: String,
        trim: true
    },
    subCategory: {
        type: String,
        trim: true
    }
}, { 
    timestamps: true,
    // Disable automatic index creation
    autoIndex: false 
});

// Remove all indexes
categorySchema.indexes().forEach(index => {
    categorySchema.index(index[0], { ...index[1], unique: false });
});

// Drop all indexes when model is created
const Category = mongoose.model("Category", categorySchema);
Category.collection.dropIndexes().catch(err => console.log('No indexes to drop'));

module.exports = Category;