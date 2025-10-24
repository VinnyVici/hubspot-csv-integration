/**
 * Mock HubSpot API responses for testing
 */

module.exports = {
  // Mock OAuth token response
  mockTokenResponse: {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    token_type: 'Bearer',
    hub_id: 12345678
  },

  // Mock account search response
  mockAccountSearchResponse: {
    results: [
      {
        id: '123456789',
        properties: {
          id: 'TEST_USER_1',
          account_type: 'MP',
          active_subscription: 'true',
          weekly_subscriptions: '2',
          monthly_subscriptions: '2',
          daily_subscriptions: '1'
        }
      }
    ],
    paging: {
      next: null
    }
  },

  // Mock contact search response
  mockContactSearchResponse: {
    results: [
      {
        id: '987654321',
        properties: {
          email: 'test1@example.com',
          user_type: 'MP'
        }
      }
    ],
    paging: {
      next: null
    }
  },

  // Mock batch create response
  mockBatchCreateResponse: {
    status: 'COMPLETE',
    results: [
      {
        id: '123456789',
        properties: {
          id: 'TEST_USER_1',
          account_type: 'MP'
        }
      }
    ]
  },

  // Mock association definitions response
  mockAssociationDefinitionsResponse: {
    results: [
      {
        typeId: 24,
        label: 'Account',
        category: 'USER_DEFINED'
      },
      {
        typeId: 26,
        label: 'User',
        category: 'USER_DEFINED'
      }
    ]
  },

  // Mock association creation response
  mockAssociationResponse: {
    fromObjectTypeId: 'contacts',
    fromObjectId: '987654321',
    toObjectTypeId: '2-123456',
    toObjectId: '123456789',
    associationTypeId: 24
  }
};