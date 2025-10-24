/**
 * End-to-end integration tests
 */

const HighPerformanceIntegration = require('../../src/core/integration');
const HighPerformanceOAuthClient = require('../../src/core/oauth-client');
const HighPerformanceProcessor = require('../../src/core/processor');
const { mockTokenResponse, mockBatchCreateResponse, mockAccountSearchResponse } = require('../fixtures/mock-responses');

describe('End-to-End Integration Tests', () => {
  let integration;
  let mockClient;
  let mockProcessor;

  beforeEach(() => {
    // Create mock OAuth client
    mockClient = {
      ensureValidToken: jest.fn().mockResolvedValue(),
      batchSearchAccounts: jest.fn().mockResolvedValue([]),
      batchSearchContacts: jest.fn().mockResolvedValue([]),
      batchCreateAccounts: jest.fn().mockResolvedValue(mockBatchCreateResponse.results),
      batchCreateContacts: jest.fn().mockResolvedValue(mockBatchCreateResponse.results),
      batchCreateAssociations: jest.fn().mockResolvedValue([]),
      identifyDeactivations: jest.fn().mockResolvedValue([]),
      batchUpdateAccounts: jest.fn().mockResolvedValue([])
    };

    // Create real processor (unit tested separately)
    mockProcessor = new HighPerformanceProcessor();

    // Create integration with mocked dependencies
    integration = new HighPerformanceIntegration(mockClient, mockProcessor);
  });

  describe('processCsv', () => {
    it('should process complete CSV workflow successfully', async () => {
      const csvData = '_id,email,user_id,user_type,active_sub,total_sub_count,weekly_sub_count,monthly_sub_count,daily_sub_count\\n1,test@example.com,TEST_USER,MP,TRUE,5,2,2,1';

      const result = await integration.processCsv(csvData);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('processed', 1);
      expect(result).toHaveProperty('created', 1);
      expect(result).toHaveProperty('updated', 0);
      expect(result).toHaveProperty('errors', 0);

      // Verify the workflow steps were called
      expect(mockClient.ensureValidToken).toHaveBeenCalled();
      expect(mockClient.batchSearchAccounts).toHaveBeenCalledWith(['TEST_USER']);
      expect(mockClient.batchSearchContacts).toHaveBeenCalledWith(['test@example.com']);
      expect(mockClient.batchCreateAccounts).toHaveBeenCalled();
      expect(mockClient.batchCreateContacts).toHaveBeenCalled();
    });

    it('should handle mixed create and update scenarios', async () => {
      // Mock existing records
      mockClient.batchSearchAccounts.mockResolvedValue([
        { id: 'existing123', properties: { id: 'EXISTING_USER' } }
      ]);
      mockClient.batchSearchContacts.mockResolvedValue([
        { id: 'contact123', properties: { email: 'existing@example.com' } }
      ]);

      const csvData = '_id,email,user_id,user_type,active_sub,total_sub_count,weekly_sub_count,monthly_sub_count,daily_sub_count\\n1,new@example.com,NEW_USER,MP,TRUE,5,2,2,1\\n2,existing@example.com,EXISTING_USER,WIX,FALSE,0,0,0,0';

      const result = await integration.processCsv(csvData);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('processed', 2);
      // Should have mixed results based on existing records
    });

    it('should handle processing errors gracefully', async () => {
      mockClient.batchSearchAccounts.mockRejectedValue(new Error('HubSpot API error'));

      const csvData = '_id,email,user_id,user_type,active_sub,total_sub_count,weekly_sub_count,monthly_sub_count,daily_sub_count\\n1,test@example.com,TEST_USER,MP,TRUE,5,2,2,1';

      const result = await integration.processCsv(csvData);

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error', 'HubSpot API error');
    });

    it('should validate CSV format', async () => {
      const invalidCsvData = 'invalid,csv,format\\nno,proper,headers';

      const result = await integration.processCsv(invalidCsvData);

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
    });

    it('should handle empty CSV data', async () => {
      const emptyCsvData = '_id,email,user_id,user_type,active_sub,total_sub_count,weekly_sub_count,monthly_sub_count,daily_sub_count\\n';

      const result = await integration.processCsv(emptyCsvData);

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('processed', 0);
    });
  });

  describe('Performance characteristics', () => {
    it('should process large datasets efficiently', async () => {
      // Generate large CSV dataset
      const headers = '_id,email,user_id,user_type,active_sub,total_sub_count,weekly_sub_count,monthly_sub_count,daily_sub_count';
      const rows = [];
      for (let i = 1; i <= 1000; i++) {
        rows.push(`${i},user${i}@example.com,USER_${i},MP,TRUE,5,2,2,1`);
      }
      const largeCsvData = headers + '\\n' + rows.join('\\n');

      const startTime = Date.now();
      const result = await integration.processCsv(largeCsvData);
      const duration = Date.now() - startTime;

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('processed', 1000);
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    }, 35000); // Extend timeout for this test
  });

  describe('Data integrity', () => {
    it('should maintain data accuracy through transformation', async () => {
      const csvData = '_id,email,user_id,user_type,active_sub,total_sub_count,weekly_sub_count,monthly_sub_count,daily_sub_count\\n1,test@example.com,TEST_USER,WIX,TRUE,5,2,2,1';

      await integration.processCsv(csvData);

      // Verify account data transformation
      expect(mockClient.batchCreateAccounts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'TEST_USER',
            account_type: 'USAMPS', // WIX should be mapped to USAMPS
            active_subscription: true,
            weekly_subscriptions: 2,
            monthly_subscriptions: 2,
            daily_subscriptions: 1
          })
        ])
      );

      // Verify contact data transformation
      expect(mockClient.batchCreateContacts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            email: 'test@example.com',
            user_type: 'USAMPS' // WIX should be mapped to USAMPS
          })
        ])
      );
    });
  });
});