const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
    categoryName: {
        type: String,
        required: true
    },
    categoryType: {
        type: String
    },
    subCategory: {
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model("Category", categorySchema);