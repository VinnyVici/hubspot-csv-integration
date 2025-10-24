/**
 * Jest test setup configuration
 */

// Set environment to test
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Mock environment variables
process.env.HUBSPOT_CLIENT_ID = 'test-client-id';
process.env.HUBSPOT_CLIENT_SECRET = 'test-client-secret';
process.env.HUBSPOT_REDIRECT_URI = 'http://localhost:3000/oauth/callback';
process.env.HUBSPOT_ACCOUNTS_OBJECT_TYPE_ID = '2-123456';
process.env.HUBSPOT_PORTAL_ID = '12345678';

// Global test timeout
jest.setTimeout(30000);

// Mock external dependencies
jest.mock('@hubspot/api-client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    crm: {
      objects: {
        searchApi: {
          doSearch: jest.fn()
        },
        basicApi: {
          create: jest.fn(),
          update: jest.fn(),
          getPage: jest.fn()
        },
        batchApi: {
          create: jest.fn(),
          update: jest.fn()
        }
      },
      contacts: {
        searchApi: {
          doSearch: jest.fn()
        },
        basicApi: {
          create: jest.fn(),
          getPage: jest.fn()
        },
        batchApi: {
          create: jest.fn()
        }
      },
      associations: {
        v4: {
          basicApi: {
            create: jest.fn()
          },
          schema: {
            definitionsApi: {
              getAll: jest.fn()
            }
          }
        }
      }
    },
    oauth: {
      tokensApi: {
        create: jest.fn()
      }
    }
  }))
}));

// Console mock to capture logs in tests
global.consoleMock = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});