const express = require('express');
const multer = require('multer');
const HighPerformanceOAuthClient = require('../core/oauth-client');
const HighPerformanceProcessor = require('../core/processor');
const HighPerformanceIntegration = require('../core/integration');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'HubSpot CSV Integration API'
  });
});

// OAuth callback endpoint
app.get('/oauth/callback', (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    return res.status(400).send(`
      <html>
        <body>
          <h2>❌ OAuth Authorization Failed</h2>
          <p>Error: ${error}</p>
          <p>Please try the authorization process again.</p>
        </body>
      </html>
    `);
  }
  
  if (!code) {
    return res.status(400).send(`
      <html>
        <body>
          <h2>❌ No Authorization Code</h2>
          <p>Authorization code not found in callback.</p>
        </body>
      </html>
    `);
  }
  
  res.send(`
    <html>
      <body>
        <h2>✅ OAuth Authorization Successful!</h2>
        <p><strong>Authorization Code:</strong></p>
        <code style="background: #f5f5f5; padding: 10px; display: block; margin: 10px 0; word-break: break-all;">${code}</code>
        <p><strong>Next step:</strong> Run this command in your terminal:</p>
        <code style="background: #e8f4f8; padding: 10px; display: block; margin: 10px 0;">node oauth-process.js ${code}</code>
        <p>This will exchange the authorization code for access tokens.</p>
      </body>
    </html>
  `);
});

// Process CSV data endpoint
app.post('/api/process-csv', async (req, res) => {
  try {
    const { csvData } = req.body;
    
    if (!csvData) {
      return res.status(400).json({
        success: false,
        error: 'No CSV data provided',
        usage: 'Send CSV data in the request body as: {"csvData": "user_id,email,user_type,active_sub,weekly_sub_count,monthly_sub_count,daily_sub_count\\n12345,test@example.com,MP,true,5,2,1"}'
      });
    }

    // Check environment variables for OAuth
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI;
    const accountsObjectTypeId = process.env.HUBSPOT_ACCOUNTS_OBJECT_TYPE_ID;

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        success: false,
        error: 'HubSpot OAuth credentials not configured'
      });
    }

    // Initialize the high-performance integration
    const hubspotClient = new HighPerformanceOAuthClient({
      clientId,
      clientSecret,
      redirectUri,
      accountsObjectTypeId
    });
    
    // Check authentication
    const isAuthenticated = await hubspotClient.isAuthenticated();
    if (!isAuthenticated) {
      return res.status(401).json({
        success: false,
        error: 'HubSpot authentication required. Please authenticate first.'
      });
    }
    
    const processor = new HighPerformanceProcessor();
    const integration = new HighPerformanceIntegration(hubspotClient, processor);

    // Process the CSV data with high-performance method
    const results = await integration.processCSVHighPerformance(csvData);

    res.json({
      success: true,
      message: 'CSV processed successfully',
      results: results
    });

  } catch (error) {
    console.error('Error processing CSV:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to process CSV',
      message: error.message
    });
  }
});

// Process CSV file upload endpoint
app.post('/api/upload-csv', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No CSV file uploaded'
      });
    }

    const csvData = req.file.buffer.toString('utf8');
    
    // Check environment variables for OAuth
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI;
    const accountsObjectTypeId = process.env.HUBSPOT_ACCOUNTS_OBJECT_TYPE_ID;

    if (!clientId || !clientSecret) {
      return res.status(500).json({
        success: false,
        error: 'HubSpot OAuth credentials not configured'
      });
    }

    // Initialize the high-performance integration
    const hubspotClient = new HighPerformanceOAuthClient({
      clientId,
      clientSecret,
      redirectUri,
      accountsObjectTypeId
    });
    
    // Check authentication
    const isAuthenticated = await hubspotClient.isAuthenticated();
    if (!isAuthenticated) {
      return res.status(401).json({
        success: false,
        error: 'HubSpot authentication required. Please authenticate first.'
      });
    }
    
    const processor = new HighPerformanceProcessor();
    const integration = new HighPerformanceIntegration(hubspotClient, processor);

    // Process the CSV data with high-performance method
    const results = await integration.processCSVHighPerformance(csvData);

    res.json({
      success: true,
      message: 'CSV file processed successfully',
      filename: req.file.originalname,
      results: results
    });

  } catch (error) {
    console.error('Error processing CSV file:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to process CSV file',
      message: error.message
    });
  }
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.json({
    service: 'HubSpot CSV Integration API',
    version: '1.0.0',
    endpoints: {
      'POST /api/process-csv': {
        description: 'Process CSV data directly',
        body: {
          csvData: 'string - CSV data with headers and rows'
        },
        example: {
          csvData: 'user_id,email,user_type,active_sub,weekly_sub_count,monthly_sub_count,daily_sub_count\\n12345,test@example.com,MP,true,5,2,1'
        }
      },
      'POST /api/upload-csv': {
        description: 'Upload and process CSV file',
        contentType: 'multipart/form-data',
        field: 'csvFile - CSV file upload'
      },
      'GET /health': {
        description: 'Health check endpoint'
      },
      'GET /api/docs': {
        description: 'API documentation'
      }
    },
    environment: {
      required: [
        'HUBSPOT_CLIENT_ID',
        'HUBSPOT_CLIENT_SECRET',
        'HUBSPOT_REDIRECT_URI',
        'HUBSPOT_ACCOUNTS_OBJECT_TYPE_ID'
      ]
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 50MB.'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'GET /api/docs',
      'POST /api/process-csv',
      'POST /api/upload-csv'
    ]
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 HubSpot CSV Integration API running on port ${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
  console.log(`❤️  Health Check: http://localhost:${port}/health`);
});

module.exports = app;