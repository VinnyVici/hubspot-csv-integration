/**
 * Integration tests for API endpoints
 */

const request = require('supertest');
const path = require('path');

// Mock the core modules before importing the server
jest.mock('../../src/core/oauth-client');
jest.mock('../../src/core/processor');
jest.mock('../../src/core/integration');

const app = require('../../src/api/server');

describe('API Endpoints', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        service: 'HubSpot CSV Integration API'
      });
    });
  });

  describe('GET /api/docs', () => {
    it('should return API documentation', async () => {
      const response = await request(app)
        .get('/api/docs')
        .expect(200);

      expect(response.body).toHaveProperty('title', 'HubSpot CSV Integration API');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
    });
  });

  describe('POST /api/process-csv', () => {
    it('should process CSV data successfully', async () => {
      // Mock the integration modules
      const HighPerformanceIntegration = require('../../src/core/integration');
      const mockProcessCsv = jest.fn().mockResolvedValue({
        success: true,
        processed: 2,
        created: 1,
        updated: 1,
        errors: 0
      });
      
      HighPerformanceIntegration.mockImplementation(() => ({
        processCsv: mockProcessCsv
      }));

      const csvData = 'user_id,email,user_type,active_sub,weekly_sub_count,monthly_sub_count,daily_sub_count\\nTEST1,test1@example.com,MP,TRUE,1,1,1';

      const response = await request(app)
        .post('/api/process-csv')
        .send({ csvData })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'CSV processed successfully',
        stats: {
          success: true,
          processed: 2,
          created: 1,
          updated: 1,
          errors: 0
        }
      });

      expect(mockProcessCsv).toHaveBeenCalledWith(csvData);
    });

    it('should handle missing csvData', async () => {
      const response = await request(app)
        .post('/api/process-csv')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'CSV data is required'
      });
    });

    it('should handle processing errors', async () => {
      const HighPerformanceIntegration = require('../../src/core/integration');
      const mockProcessCsv = jest.fn().mockRejectedValue(new Error('Processing failed'));
      
      HighPerformanceIntegration.mockImplementation(() => ({
        processCsv: mockProcessCsv
      }));

      const response = await request(app)
        .post('/api/process-csv')
        .send({ csvData: 'invalid,csv,data' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Processing failed'
      });
    });
  });

  describe('POST /api/upload-csv', () => {
    it('should handle file upload and processing', async () => {
      const HighPerformanceIntegration = require('../../src/core/integration');
      const mockProcessCsv = jest.fn().mockResolvedValue({
        success: true,
        processed: 1
      });
      
      HighPerformanceIntegration.mockImplementation(() => ({
        processCsv: mockProcessCsv
      }));

      const response = await request(app)
        .post('/api/upload-csv')
        .attach('csvFile', Buffer.from('user_id,email\\nTEST,test@example.com'), 'test.csv')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'File uploaded and processed successfully');
    });

    it('should handle missing file', async () => {
      const response = await request(app)
        .post('/api/upload-csv')
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: 'No CSV file uploaded'
      });
    });
  });

  describe('Error handling middleware', () => {
    it('should handle 404 errors', async () => {
      const response = await request(app)
        .get('/nonexistent-endpoint')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Endpoint not found'
      });
    });
  });
});