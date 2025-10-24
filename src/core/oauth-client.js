const { Client } = require('@hubspot/api-client');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class HighPerformanceOAuthClient {
  constructor(options = {}) {
    this.clientId = options.clientId || process.env.HUBSPOT_CLIENT_ID;
    this.clientSecret = options.clientSecret || process.env.HUBSPOT_CLIENT_SECRET;
    this.redirectUri = options.redirectUri || process.env.HUBSPOT_REDIRECT_URI || 'http://localhost:3000/oauth/callback';
    this.accountsObjectTypeId = options.accountsObjectTypeId || process.env.HUBSPOT_ACCOUNTS_OBJECT_TYPE_ID || '2-123456';
    this.tokenFile = options.tokenFile || path.join(__dirname, '.oauth-tokens.json');
    
    this.client = null;
    this.tokens = null;
    this.associationTypeId = null;
  }

  // Initialize with existing token methods from oauth-hubspot-client.js
  async loadTokens() {
    try {
      const tokenData = await fs.readFile(this.tokenFile, 'utf8');
      this.tokens = JSON.parse(tokenData);
      return this.tokens;
    } catch (error) {
      logger.debug('No existing tokens found');
      return null;
    }
  }

  async saveTokens(tokens) {
    this.tokens = tokens;
    await fs.writeFile(this.tokenFile, JSON.stringify(tokens, null, 2));
  }

  async isAuthenticated() {
    await this.loadTokens();
    if (!this.tokens || !this.tokens.access_token) {
      return false;
    }
    
    try {
      await this.initializeClient();
      // Test the token with a simple API call
      await this.client.crm.contacts.basicApi.getPage(1);
      return true;
    } catch (error) {
      if (error.code === 401) {
        try {
          await this.refreshAccessToken();
          return true;
        } catch (refreshError) {
          return false;
        }
      }
      return false;
    }
  }

  async initializeClient() {
    if (!this.tokens || !this.tokens.access_token) {
      throw new Error('No access token available');
    }
    
    this.client = new Client({
      accessToken: this.tokens.access_token
    });
  }

  async refreshAccessToken() {
    if (!this.tokens || !this.tokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    const tokenUrl = 'https://api.hubapi.com/oauth/v1/token';
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.tokens.refresh_token
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
    }

    const newTokens = await response.json();
    await this.saveTokens({
      ...this.tokens,
      access_token: newTokens.access_token,
      expires_in: newTokens.expires_in
    });
    
    await this.initializeClient();
  }

  async ensureValidToken() {
    if (!this.client) {
      await this.initializeClient();
    }
  }

  // HIGH-PERFORMANCE: Search for active accounts in HubSpot
  async searchActiveAccounts() {
    await this.ensureValidToken();
    
    try {
      const searchRequest = {
        filterGroups: [{
          filters: [{
            propertyName: 'active_subscription',
            operator: 'EQ',
            value: 'true'
          }]
        }],
        properties: ['id', 'active_subscription', 'weekly_subscriptions', 'monthly_subscriptions', 'daily_subscriptions'],
        limit: 100
      };
      
      let allActiveAccounts = [];
      let hasMore = true;
      let after = undefined;

      logger.operation('Searching for active accounts in HubSpot');
      
      while (hasMore) {
        if (after) {
          searchRequest.after = after;
        }
        
        const response = await this.client.crm.objects.searchApi.doSearch(
          this.accountsObjectTypeId, 
          searchRequest
        );
        
        allActiveAccounts = allActiveAccounts.concat(response.results);
        
        if (response.paging && response.paging.next) {
          after = response.paging.next.after;
        } else {
          hasMore = false;
        }
      }

      console.log(`✅ Found ${allActiveAccounts.length} active accounts in HubSpot`);
      return allActiveAccounts;
      
    } catch (error) {
      if (error.code === 401) {
        console.log('Unauthorized error, refreshing token and retrying...');
        await this.refreshAccessToken();
        return await this.searchActiveAccounts();
      }
      console.error('Error searching active accounts:', error);
      throw error;
    }
  }

  // HIGH-PERFORMANCE: Identify accounts that need deactivation
  async identifyDeactivations(deactivationMap) {
    const activeAccounts = await this.searchActiveAccounts();
    const accountsToDeactivate = [];

    activeAccounts.forEach(account => {
      const accountId = account.properties.id;
      if (deactivationMap.has(accountId)) {
        // Account is active in HubSpot but inactive in CSV
        accountsToDeactivate.push({
          hubspotId: account.id,
          accountId: accountId,
          updateData: deactivationMap.get(accountId)
        });
      }
    });

    console.log(`🔄 Identified ${accountsToDeactivate.length} accounts for deactivation`);
    return accountsToDeactivate;
  }

  // HIGH-PERFORMANCE: Batch create accounts
  async batchCreateAccounts(accountsData) {
    await this.ensureValidToken();
    
    if (accountsData.length === 0) return [];

    try {
      const inputs = accountsData.map(account => ({
        properties: account
      }));

      console.log(`📦 Batch creating ${accountsData.length} accounts...`);
      
      const response = await this.client.crm.objects.batchApi.create(
        this.accountsObjectTypeId,
        { inputs }
      );
      
      console.log(`✅ Successfully created ${response.results.length} accounts`);
      return response.results;
      
    } catch (error) {
      if (error.code === 401) {
        console.log('Unauthorized error, refreshing token and retrying...');
        await this.refreshAccessToken();
        return await this.batchCreateAccounts(accountsData);
      }
      console.error('Error in batch create accounts:', error);
      throw error;
    }
  }

  // HIGH-PERFORMANCE: Batch update accounts
  async batchUpdateAccounts(updateData) {
    await this.ensureValidToken();
    
    if (updateData.length === 0) return [];

    try {
      const inputs = updateData.map(update => ({
        id: update.hubspotId,
        properties: update.updateData
      }));

      console.log(`📦 Batch updating ${updateData.length} accounts...`);
      
      const response = await this.client.crm.objects.batchApi.update(
        this.accountsObjectTypeId,
        { inputs }
      );
      
      console.log(`✅ Successfully updated ${response.results.length} accounts`);
      return response.results;
      
    } catch (error) {
      if (error.code === 401) {
        console.log('Unauthorized error, refreshing token and retrying...');
        await this.refreshAccessToken();
        return await this.batchUpdateAccounts(updateData);
      }
      console.error('Error in batch update accounts:', error);
      throw error;
    }
  }

  // HIGH-PERFORMANCE: Batch search existing accounts (chunked for HubSpot 100-item limit)
  async batchSearchAccounts(accountIds) {
    await this.ensureValidToken();
    
    if (accountIds.length === 0) return [];

    try {
      console.log(`🔍 Batch searching for ${accountIds.length} accounts...`);
      
      let allResults = [];
      const chunkSize = 100; // HubSpot's IN operator limit
      
      for (let i = 0; i < accountIds.length; i += chunkSize) {
        const chunk = accountIds.slice(i, i + chunkSize);
        
        const searchRequest = {
          filterGroups: [{
            filters: [{
              propertyName: 'id',
              operator: 'IN',
              values: chunk
            }]
          }],
          properties: ['id'],
          limit: 100
        };
        
        const response = await this.client.crm.objects.searchApi.doSearch(
          this.accountsObjectTypeId, 
          searchRequest
        );
        
        allResults = allResults.concat(response.results);
        
        // Small delay between chunks to respect rate limits
        if (i + chunkSize < accountIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`✅ Found ${allResults.length} existing accounts (searched ${Math.ceil(accountIds.length / chunkSize)} chunks)`);
      return allResults;
      
    } catch (error) {
      if (error.code === 401) {
        console.log('Unauthorized error, refreshing token and retrying...');
        await this.refreshAccessToken();
        return await this.batchSearchAccounts(accountIds);
      }
      console.error('Error in batch search accounts:', error);
      throw error;
    }
  }

  // HIGH-PERFORMANCE: Batch create contacts
  async batchCreateContacts(contactsData) {
    await this.ensureValidToken();
    
    if (contactsData.length === 0) return [];

    try {
      const inputs = contactsData.map(contact => ({
        properties: contact
      }));

      console.log(`📦 Batch creating ${contactsData.length} contacts...`);
      
      const response = await this.client.crm.contacts.batchApi.create({ inputs });
      
      console.log(`✅ Successfully created ${response.results.length} contacts`);
      return response.results;
      
    } catch (error) {
      if (error.code === 401) {
        console.log('Unauthorized error, refreshing token and retrying...');
        await this.refreshAccessToken();
        return await this.batchCreateContacts(contactsData);
      }
      console.error('Error in batch create contacts:', error);
      throw error;
    }
  }

  // HIGH-PERFORMANCE: Batch search existing contacts (chunked for HubSpot 100-item limit)
  async batchSearchContacts(emails) {
    await this.ensureValidToken();
    
    if (emails.length === 0) return [];

    try {
      console.log(`🔍 Batch searching for ${emails.length} contacts...`);
      
      let allResults = [];
      const chunkSize = 100; // HubSpot's IN operator limit
      
      for (let i = 0; i < emails.length; i += chunkSize) {
        const chunk = emails.slice(i, i + chunkSize);
        
        const searchRequest = {
          filterGroups: [{
            filters: [{
              propertyName: 'email',
              operator: 'IN',
              values: chunk
            }]
          }],
          properties: ['email', 'user_type'],
          limit: 100
        };
        
        const response = await this.client.crm.contacts.searchApi.doSearch(searchRequest);
        
        allResults = allResults.concat(response.results);
        
        // Small delay between chunks to respect rate limits
        if (i + chunkSize < emails.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`✅ Found ${allResults.length} existing contacts (searched ${Math.ceil(emails.length / chunkSize)} chunks)`);
      return allResults;
      
    } catch (error) {
      if (error.code === 401) {
        console.log('Unauthorized error, refreshing token and retrying...');
        await this.refreshAccessToken();
        return await this.batchSearchContacts(emails);
      }
      console.error('Error in batch search contacts:', error);
      throw error;
    }
  }

  // Get association type ID dynamically
  async getAssociationTypeId() {
    if (this.associationTypeId) {
      return this.associationTypeId;
    }

    await this.ensureValidToken();
    
    try {
      console.log('🔗 Discovering association type ID...');
      
      // Try to discover the numeric association type ID for "User" label
      console.log('ℹ️  Attempting to discover association type ID for custom labels...');
      
      try {
        // Try to get association types for custom objects
        const response = await this.client.crm.associations.v4.schema.definitionsApi.getAll('contacts', this.accountsObjectTypeId);
        console.log('🔍 Found association definitions:', JSON.stringify(response, null, 2));
        
        // Look for any custom association type with a label
        const customAssociation = response.results?.find(def => 
          def.label && def.category === 'USER_DEFINED'
        );
        
        if (customAssociation) {
          console.log(`✅ Found custom association "${customAssociation.label}" with ID: ${customAssociation.typeId}`);
          this.associationTypeId = customAssociation.typeId;
          return this.associationTypeId;
        }
      } catch (error) {
        console.log('⚠️  Could not fetch association definitions:', error.message);
      }
      
      // Fallback to commonly used association type for custom objects
      console.log('ℹ️  Using fallback association type ID for custom objects');
      this.associationTypeId = 1;  // Standard "primary" association
      return this.associationTypeId;
      
      // Find the association type for contacts to our custom object
      const contactToCustomObject = response.results.find(schema => 
        schema.fromObjectTypeId === 'contacts' && 
        schema.toObjectTypeId === this.accountsObjectTypeId
      );
      
      if (contactToCustomObject && contactToCustomObject.associationTypeId) {
        this.associationTypeId = contactToCustomObject.associationTypeId;
        console.log(`✅ Found association type ID: ${this.associationTypeId}`);
        return this.associationTypeId;
      }
      
      // Fallback to a commonly used association type
      console.log('⚠️ Using fallback association type ID: 1');
      this.associationTypeId = 1;
      return this.associationTypeId;
      
    } catch (error) {
      console.error('Error getting association type ID:', error);
      // Use fallback
      this.associationTypeId = 1;
      return this.associationTypeId;
    }
  }

  // HIGH-PERFORMANCE: Batch create associations
  async batchCreateAssociations(associationPairs, accountResults, contactResults) {
    await this.ensureValidToken();
    
    if (associationPairs.length === 0) return [];

    try {
      const associationTypeId = await this.getAssociationTypeId();
      
      // Create lookup maps
      const accountMap = new Map();
      accountResults.forEach(account => {
        if (account.properties && account.properties.id) {
          accountMap.set(account.properties.id, account.id);
        }
      });
      
      const contactMap = new Map();
      contactResults.forEach(contact => {
        if (contact.properties && contact.properties.email) {
          contactMap.set(contact.properties.email, contact.id);
        }
      });

      logger.debug(`Account mapping: ${Array.from(accountMap.entries()).map(([k,v]) => `${k}→${v}`).join(', ')}`);
      logger.debug(`Contact mapping: ${Array.from(contactMap.entries()).map(([k,v]) => `${k}→${v}`).join(', ')}`);
      logger.debug(`Association pairs: ${associationPairs.map(p => `${p.accountId}↔${p.contactEmail}`).join(', ')}`);

      const inputs = [];
      
      associationPairs.forEach(pair => {
        const accountHubSpotId = accountMap.get(pair.accountId);
        const contactHubSpotId = contactMap.get(pair.contactEmail);
        
        logger.debug(`Pair ${pair.accountId}↔${pair.contactEmail}: account=${accountHubSpotId}, contact=${contactHubSpotId}`);
        
        if (accountHubSpotId && contactHubSpotId) {
          inputs.push({
            _from: { id: contactHubSpotId },
            to: { id: accountHubSpotId },
            type: associationTypeId
          });
        } else {
          logger.warn(`Skipping association - missing IDs: account=${accountHubSpotId}, contact=${contactHubSpotId}`);
        }
      });

      if (inputs.length === 0) {
        logger.warn('No valid associations to create');
        return [];
      }

      logger.operation(`Creating ${inputs.length} associations using v4 API`);
      logger.debug('Association inputs:', JSON.stringify(inputs, null, 2));
      
      const results = [];
      for (const input of inputs) {
        try {
          console.log(`🔗 Creating association: ${input._from.id} → ${input.to.id}`);
          const response = await this.client.crm.associations.v4.basicApi.create(
            'contacts',
            input._from.id,
            this.accountsObjectTypeId,
            input.to.id,
            [{ 
              associationCategory: 'USER_DEFINED', 
              associationTypeId: input.type 
            }]
          );
          results.push(response);
          console.log(`✅ Successfully created association: ${input._from.id} → ${input.to.id}`);
        } catch (error) {
          console.log(`⚠️  Failed to create association ${input._from.id} → ${input.to.id}: ${error.message}`);
        }
      }
      
      console.log(`✅ Successfully created ${results.length} of ${inputs.length} associations`);
      return results;
      
    } catch (error) {
      if (error.code === 401) {
        console.log('Unauthorized error, refreshing token and retrying...');
        await this.refreshAccessToken();
        return await this.batchCreateAssociations(associationPairs, accountResults, contactResults);
      }
      console.error('Error in batch create associations:', error);
      // Don't throw - associations are not critical for the core functionality
      console.log('⚠️ Continuing without associations...');
      return [];
    }
  }
}

module.exports = HighPerformanceOAuthClient;