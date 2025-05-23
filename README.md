# dealo-add-data

A Node.js application for handling file uploads and data processing, specifically designed for offers data management.

## Prerequisites

- Node.js (version 16.0.0 or higher)
- MongoDB (for database storage)
- npm (Node Package Manager)

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd dealo-add-data
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
MONGODB_URI=your_mongodb_connection_string
PORT=3000
```

## Dependencies

### Main Dependencies
- express: ^4.18.2 - Web framework
- mongoose: ^7.0.0 - MongoDB object modeling
- multer: ^1.4.5-lts.1 - File upload handling
- exceljs: ^4.4.0 - Excel file processing
- csv-parser: ^3.0.0 - CSV file parsing
- cors: ^2.8.5 - Cross-origin resource sharing
- dotenv: ^16.0.3 - Environment variable management
- rimraf: ^5.0.5 - File system utilities
- glob: ^10.3.10 - File pattern matching

### Development Dependencies
- nodemon: ^3.0.3 - Development server with auto-reload

## Usage

1. Start the development server:
```bash
npm run dev
```

2. Start the production server:
```bash
npm start
```

The server will start on the port specified in your `.env` file (default: 3000).

## Project Structure

```
dealo-add-data/
├── public/           # Static files
├── server.js         # Main application file
├── offer.model.js    # Offer data model
├── brand.model.js    # Brand data model
├── category.model.js # Category data model
├── package.json      # Project configuration
└── .env             # Environment variables (create this)
```

## Features

- File upload handling
- CSV and Excel file processing
- Data model management for offers, brands, and categories
- RESTful API endpoints
- Cross-origin resource sharing support

## License

[Add your license information here]

## Contributing

[Add contribution guidelines here]
