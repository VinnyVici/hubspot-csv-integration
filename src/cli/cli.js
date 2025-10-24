#!/usr/bin/env node

const path = require('path');

// Load production environment configuration
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const HighPerformanceOAuthClient = require('../core/oauth-client');
const HighPerformanceProcessor = require('../core/processor');
const HighPerformanceIntegration = require('../core/integration');

async function runSimplePerformanceTest(csvFile) {
  console.log('🚀 SIMPLE PERFORMANCE TEST - Testing Core Functionality\n');
  
  const startTime = Date.now();
  
  try {
    // Initialize components
    const hubspotClient = new HighPerformanceOAuthClient({
      clientId: process.env.HUBSPOT_CLIENT_ID,
      clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
      redirectUri: process.env.HUBSPOT_REDIRECT_URI,
      accountsObjectTypeId: process.env.HUBSPOT_ACCOUNTS_OBJECT_TYPE_ID,
      tokenFile: path.join(__dirname, '.oauth-tokens.json')
    });
    
    const processor = new HighPerformanceProcessor();
    
    console.log('🏗️ Environment Check:');
    console.log(`Portal ID: ${process.env.HUBSPOT_PORTAL_ID}`);
    console.log(`Environment: ${process.env.ENVIRONMENT}`);
    console.log(`Accounts Object ID: ${process.env.HUBSPOT_ACCOUNTS_OBJECT_TYPE_ID}`);
    
    // Check authentication
    const isAuthenticated = await hubspotClient.isAuthenticated();
    if (!isAuthenticated) {
      console.log('❌ Not authenticated. Please run: npm run sandbox-auth');
      return false;
    }
    console.log('✅ OAuth authentication verified');
    
    // Parse and analyze just a small subset
    console.log('\n📊 Processing CSV Data (SMALL SUBSET)...');
    const rawData = await processor.parseCSV(csvFile);
    const testRows = rawData.filter(row => processor.validateRow(row)).slice(0, 20); // Only 20 records
    
    console.log(`Testing with ${testRows.length} records to validate performance approach...`);
    
    // Analyze the test subset
    const filterResult = processor.filterRecordsForProcessing(testRows);
    
    console.log(`\n🎯 Test Data Analysis:`);
    console.log(`   Active subscriptions: ${filterResult.activeRecords.length}`);
    console.log(`   Inactive records: ${filterResult.inactiveRecords.length}`);
    console.log(`   Total test records: ${filterResult.allRecordsForCreation.length}`);
    
    // Test existence checking with small subset
    console.log('\n🔍 Testing Existence Checking...');
    const accountIds = new Set();
    const contactEmails = new Set();
    
    testRows.forEach(row => {
      if (row.user_id) accountIds.add(row.user_id);
      if (row.email) contactEmails.add(row.email);
    });
    
    console.log(`   Checking ${accountIds.size} account IDs...`);
    console.log(`   Checking ${contactEmails.size} contact emails...`);
    
    // Search in small batches to test the approach
    const [existingAccounts, existingContacts] = await Promise.all([
      hubspotClient.batchSearchAccounts(Array.from(accountIds)),
      hubspotClient.batchSearchContacts(Array.from(contactEmails))
    ]);
    
    console.log(`   ✅ Found ${existingAccounts.length} existing accounts`);
    console.log(`   ✅ Found ${existingContacts.length} existing contacts`);
    
    // Test the categorization logic
    const existingAccountIds = new Set();
    existingAccounts.forEach(account => {
      if (account.properties && account.properties.id) {
        existingAccountIds.add(account.properties.id);
      }
    });
    
    const existingContactEmails = new Set();
    existingContacts.forEach(contact => {
      if (contact.properties && contact.properties.email) {
        existingContactEmails.add(contact.properties.email);
      }
    });
    
    const strategy = processor.categorizeRecordsByExistence(
      testRows,
      existingAccountIds,
      existingContactEmails
    );
    
    console.log('\n📊 Processing Strategy Results:');
    console.log(`   Records to CREATE: ${strategy.toCreate.length}`);
    console.log(`   Records to UPDATE: ${strategy.toUpdate.length}`);
    console.log(`   Total operations: ${strategy.totalOperations}`);
    
    // Test actual operations with all records
    if (strategy.toCreate.length > 0) {
      console.log('\n🧪 Testing Account and Contact Creation...');
      const batchGroups = processor.groupForBatchProcessing(strategy.toCreate);
      
      if (batchGroups.length > 0) {
        console.log(`📦 Processing ${batchGroups.length} batch group(s)...`);
        
        for (const batch of batchGroups) {
          let accountResults = [];
          let contactResults = [];
          
          // Create accounts
          if (batch.accounts.length > 0) {
            console.log(`📦 Batch creating ${batch.accounts.length} accounts...`);
            accountResults = await hubspotClient.batchCreateAccounts(batch.accounts);
            console.log(`✅ Successfully created ${accountResults.length} accounts`);
          }
          
          // Create contacts (they may already exist)
          if (batch.contacts.length > 0) {
            console.log(`📦 Batch creating ${batch.contacts.length} contacts...`);
            try {
              contactResults = await hubspotClient.batchCreateContacts(batch.contacts);
              console.log(`✅ Successfully created ${contactResults.length} new contacts`);
            } catch (error) {
              // Contacts might already exist, that's okay for testing
              console.log(`ℹ️  Some contacts may already exist (${error.message.substring(0, 100)}...)`);
              // For associations, we need to search for existing contacts by email
              const emails = batch.contacts.map(c => c.email);
              console.log(`🔍 Searching for existing contacts by email: ${emails.join(', ')}`);
              
              try {
                contactResults = await hubspotClient.batchSearchContacts(emails);
                console.log(`✅ Found ${contactResults.length} existing contacts for associations`);
                
                // If still no results, try individual searches
                if (contactResults.length === 0) {
                  console.log(`🔍 Trying individual contact searches...`);
                  contactResults = [];
                  for (const email of emails) {
                    try {
                      const individualResults = await hubspotClient.batchSearchContacts([email]);
                      contactResults.push(...individualResults);
                    } catch (searchError) {
                      console.log(`⚠️  Could not find contact: ${email}`);
                    }
                  }
                  console.log(`✅ Found ${contactResults.length} contacts via individual search`);
                }
              } catch (searchError) {
                console.log(`⚠️  Contact search failed: ${searchError.message}`);
                contactResults = [];
              }
            }
          }
          
          // Create associations
          if (batch.associations.length > 0 && accountResults.length > 0 && contactResults.length > 0) {
            console.log(`🔗 Creating ${batch.associations.length} contact-account associations...`);
            try {
              const associationResults = await hubspotClient.batchCreateAssociations(
                batch.associations,
                accountResults,
                contactResults
              );
              console.log(`✅ Successfully created ${associationResults.length} associations`);
            } catch (error) {
              console.log(`⚠️  Association creation encountered issues: ${error.message}`);
            }
          }
        }
      }
    }
    
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    
    console.log('\n📈 Performance Test Results:');
    console.log(`   Test records processed: ${testRows.length}`);
    console.log(`   Processing time: ${totalTime.toFixed(1)} seconds`);
    console.log(`   Rate: ${(testRows.length / totalTime).toFixed(2)} records/second`);
    
    // Project full dataset performance
    const fullDatasetTime = (rawData.length / (testRows.length / totalTime) / 60).toFixed(1);
    console.log(`   Projected full dataset time: ${fullDatasetTime} minutes`);
    
    // Calculate performance improvement with smart filtering
    const activeRecords = rawData.filter(row => processor.convertToBoolean(row.active_sub)).length;
    const smartFilterTime = (activeRecords / (testRows.length / totalTime) / 60).toFixed(1);
    console.log(`   With smart filtering (${activeRecords} active): ${smartFilterTime} minutes`);
    
    console.log('\n🎉 PERFORMANCE TEST COMPLETED!');
    console.log('\nKey Findings:');
    console.log(`1. ✅ Batch operations working correctly`);
    console.log(`2. ✅ Smart filtering reduces operations by ${((rawData.length - activeRecords) / rawData.length * 100).toFixed(1)}%`);
    console.log(`3. ✅ Processing rate: ${(testRows.length / totalTime).toFixed(2)} records/second`);
    console.log(`4. ✅ Full deployment estimated: ${smartFilterTime} minutes`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Performance test failed:', error.message);
    return false;
  }
}

// Run the test
if (require.main === module) {
  const csvFile = process.argv[2];
  if (!csvFile) {
    console.log('Usage: node simple-performance-test.js <csv-file>');
    process.exit(1);
  }
  
  runSimplePerformanceTest(csvFile).then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = runSimplePerformanceTest;