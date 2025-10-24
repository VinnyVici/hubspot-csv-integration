/**
 * Unit tests for HighPerformanceOAuthClient
 */

const HighPerformanceOAuthClient = require('../../src/core/oauth-client');
const { mockTokenResponse, mockAccountSearchResponse, mockContactSearchResponse, mockBatchCreateResponse } = require('../fixtures/mock-responses');

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn()
  }
}));

describe('HighPerformanceOAuthClient', () => {
  let client;

  beforeEach(() => {
    client = new HighPerformanceOAuthClient({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      accountsObjectTypeId: '2-123456'
    });
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const defaultClient = new HighPerformanceOAuthClient();
      
      expect(defaultClient.clientId).toBe('test-client-id'); // From env mock
      expect(defaultClient.clientSecret).toBe('test-client-secret');
      expect(defaultClient.accountsObjectTypeId).toBe('2-123456');
    });

    it('should use provided options', () => {
      const customClient = new HighPerformanceOAuthClient({
        clientId: 'custom-id',
        clientSecret: 'custom-secret',
        accountsObjectTypeId: '2-999999'
      });

      expect(customClient.clientId).toBe('custom-id');
      expect(customClient.clientSecret).toBe('custom-secret');
      expect(customClient.accountsObjectTypeId).toBe('2-999999');
    });
  });

  describe('loadTokens', () => {
    it('should load tokens from file successfully', async () => {
      const fs = require('fs');
      fs.promises.readFile.mockResolvedValue(JSON.stringify(mockTokenResponse));

      const tokens = await client.loadTokens();

      expect(tokens).toEqual(mockTokenResponse);
      expect(fs.promises.readFile).toHaveBeenCalledWith(
        expect.stringContaining('.oauth-tokens.json'),
        'utf8'
      );
    });

    it('should return null when token file does not exist', async () => {
      const fs = require('fs');
      fs.promises.readFile.mockRejectedValue(new Error('File not found'));

      const tokens = await client.loadTokens();

      expect(tokens).toBeNull();
    });
  });

  describe('saveTokens', () => {
    it('should save tokens to file', async () => {
      const fs = require('fs');
      fs.promises.writeFile.mockResolvedValue();

      await client.saveTokens(mockTokenResponse);

      expect(client.tokens).toEqual(mockTokenResponse);
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.oauth-tokens.json'),
        JSON.stringify(mockTokenResponse, null, 2),
        'utf8'
      );
    });
  });

  describe('mapAccountType', () => {
    it('should map MP to MP', () => {
      expect(client.mapAccountType('MP')).toBe('MP');
    });

    it('should map WIX to USAMPS', () => {
      expect(client.mapAccountType('WIX')).toBe('USAMPS');
    });

    it('should return original value for unknown types', () => {
      expect(client.mapAccountType('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  describe('batchCreateAccounts', () => {
    it('should create accounts in batches', async () => {
      // Mock the HubSpot client
      client.client = {
        crm: {
          objects: {
            batchApi: {
              create: jest.fn().mockResolvedValue(mockBatchCreateResponse)
            }
          }
        }
      };

      const accountsData = [
        { id: 'TEST_USER_1', account_type: 'MP' },
        { id: 'TEST_USER_2', account_type: 'USAMPS' }
      ];

      const result = await client.batchCreateAccounts(accountsData);

      expect(result).toEqual(mockBatchCreateResponse.results);
      expect(client.client.crm.objects.batchApi.create).toHaveBeenCalledWith(
        '123456',
        {
          inputs: accountsData.map(account => ({
            properties: account
          }))
        }
      );
    });

    it('should handle empty input gracefully', async () => {
      const result = await client.batchCreateAccounts([]);
      expect(result).toEqual([]);
    });
  });

  describe('batchCreateContacts', () => {
    it('should create contacts in batches', async () => {
      client.client = {
        crm: {
          contacts: {
            batchApi: {
              create: jest.fn().mockResolvedValue(mockBatchCreateResponse)
            }
          }
        }
      };

      const contactsData = [
        { email: 'test1@example.com', user_type: 'MP' },
        { email: 'test2@example.com', user_type: 'USAMPS' }
      ];

      const result = await client.batchCreateContacts(contactsData);

      expect(result).toEqual(mockBatchCreateResponse.results);
      expect(client.client.crm.contacts.batchApi.create).toHaveBeenCalledWith({
        inputs: contactsData.map(contact => ({
          properties: contact
        }))
      });
    });
  });

  describe('batchSearchAccounts', () => {
    it('should search for accounts by IDs', async () => {
      client.client = {
        crm: {
          objects: {
            searchApi: {
              doSearch: jest.fn().mockResolvedValue(mockAccountSearchResponse)
            }
          }
        }
      };

      const accountIds = ['TEST_USER_1', 'TEST_USER_2'];
      const result = await client.batchSearchAccounts(accountIds);

      expect(result).toEqual(mockAccountSearchResponse.results);
      expect(client.client.crm.objects.searchApi.doSearch).toHaveBeenCalledWith(
        '123456',
        expect.objectContaining({
          filterGroups: expect.arrayContaining([
            expect.objectContaining({
              filters: expect.arrayContaining([
                expect.objectContaining({
                  propertyName: 'id',
                  operator: 'IN',
                  values: accountIds
                })
              ])
            })
          ])
        })
      );
    });
  });

  describe('batchSearchContacts', () => {
    it('should search for contacts by emails', async () => {
      client.client = {
        crm: {
          contacts: {
            searchApi: {
              doSearch: jest.fn().mockResolvedValue(mockContactSearchResponse)
            }
          }
        }
      };

      const emails = ['test1@example.com', 'test2@example.com'];
      const result = await client.batchSearchContacts(emails);

      expect(result).toEqual(mockContactSearchResponse.results);
      expect(client.client.crm.contacts.searchApi.doSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          filterGroups: expect.arrayContaining([
            expect.objectContaining({
              filters: expect.arrayContaining([
                expect.objectContaining({
                  propertyName: 'email',
                  operator: 'IN',
                  values: emails
                })
              ])
            })
          ])
        })
      );
    });
  });
});