const csv = require('csv-parser');
const fs = require('fs');

class HighPerformanceProcessor {
  constructor() {
    this.results = [];
  }

  async parseCSV(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => {
          const cleanedData = {};
          Object.keys(data).forEach(key => {
            const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_').replace(/"/g, '');
            cleanedData[cleanKey] = data[key].trim().replace(/"/g, '');
          });
          results.push(cleanedData);
        })
        .on('end', () => {
          console.log(`Parsed ${results.length} rows from CSV`);
          resolve(results);
        })
        .on('error', (error) => {
          console.error('Error parsing CSV:', error);
          reject(error);
        });
    });
  }

  // Smart filtering: Only process records that need updates
  filterRecordsForProcessing(rows) {
    const activeRecords = [];
    const inactiveRecords = [];
    const allRecordsForCreation = [];
    
    rows.forEach(row => {
      if (this.validateRow(row)) {
        const activeSub = this.convertToBoolean(row.active_sub);
        
        if (activeSub) {
          // Always process active subscriptions
          activeRecords.push(row);
        } else {
          // Track inactive for deactivation checking AND potential creation
          inactiveRecords.push(row);
        }
        // Keep all records for creation workflow (in case they don't exist in HubSpot)
        allRecordsForCreation.push(row);
      }
    });

    console.log(`🎯 Smart Filtering Results:`);
    console.log(`   Active subscriptions to process: ${activeRecords.length}`);
    console.log(`   Inactive records for deactivation/creation check: ${inactiveRecords.length}`);
    console.log(`   Total records available for creation workflow: ${allRecordsForCreation.length}`);

    return {
      activeRecords,
      inactiveRecords,
      allRecordsForCreation,
      totalReduction: 0 // Updated logic processes based on existence, not just activity
    };
  }

  // Create deactivation map for efficient lookup
  createDeactivationMap(inactiveRecords) {
    const deactivationMap = new Map();
    
    inactiveRecords.forEach(row => {
      if (row.user_id) {
        deactivationMap.set(row.user_id, {
          user_id: row.user_id,
          active_subscription: false,
          weekly_subscriptions: parseInt(row.weekly_sub_count) || 0,
          monthly_subscriptions: parseInt(row.monthly_sub_count) || 0,
          daily_subscriptions: parseInt(row.daily_sub_count) || 0
        });
      }
    });

    return deactivationMap;
  }

  validateRow(row, requiredFields = ['email', 'user_id']) {
    const missingFields = requiredFields.filter(field => !row[field] || row[field].trim() === '');
    
    if (missingFields.length > 0) {
      return false;
    }

    if (row.email && !this.isValidEmail(row.email)) {
      return false;
    }

    return true;
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  convertToBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return Boolean(value);
  }

  mapContactFields(row) {
    // CSV to Contacts mapping per user specifications
    const contactMapping = {
      email: row.email, // email : email (primary id)
      // Ignore names as specified
      // user_type : user_type (multiselect field with same mapping as accounts: WIX→USAMPS)
      user_type: this.mapAccountType(row.user_type) // Use same mapping as accounts
    };

    const cleanedContact = {};
    Object.keys(contactMapping).forEach(key => {
      if (contactMapping[key] !== undefined && contactMapping[key] !== null && contactMapping[key] !== '') {
        cleanedContact[key] = typeof contactMapping[key] === 'string' ? contactMapping[key].trim() : contactMapping[key];
      }
    });

    return cleanedContact;
  }

  mapAccountFields(row) {
    // CSV to Accounts mapping for PRODUCTION portal 243898732
    const accountMapping = {
      // user_id : id (primary id)
      id: row.user_id,
      // user_type : account_type (enumeration: MP→MP, WIX→USAMPS)
      account_type: this.mapAccountType(row.user_type),
      // active_sub : active_subscription (enumeration: true/false)
      active_subscription: this.convertToBoolean(row.active_sub) ? 'true' : 'false',
      // weekly_sub_count : weekly_subscriptions (number)
      weekly_subscriptions: parseInt(row.weekly_sub_count) || 0,
      // monthly_sub_count : monthly_subscriptions (number)
      monthly_subscriptions: parseInt(row.monthly_sub_count) || 0,
      // daily_sub_count : daily_subscriptions (number)
      daily_subscriptions: parseInt(row.daily_sub_count) || 0,
      // Set other subscription-related fields
      ever_had_subscription: this.convertToBoolean(row.active_sub) ? 'true' : 'false'
      // Note: total_subscriptions is a calculated property and cannot be set
      // Ignore email, _id (as specified)
    };

    const cleanedAccount = {};
    Object.keys(accountMapping).forEach(key => {
      const value = accountMapping[key];
      if (value !== undefined && value !== null && value !== '') {
        cleanedAccount[key] = typeof value === 'string' ? value.trim() : value;
      }
    });

    // Return account object if it has the required id field
    return cleanedAccount.id ? cleanedAccount : null;
  }

  mapAccountType(userType) {
    // MP maps to MP and WIX maps to USAMPS (using actual HubSpot property options)
    const accountTypeMapping = {
      'MP': 'MP',
      'WIX': 'USAMPS'
    };
    return accountTypeMapping[userType] || userType;
  }

  // Group records for batch processing
  groupForBatchProcessing(activeRecords) {
    const batchGroups = [];
    const batchSize = 100; // HubSpot batch API limit

    // Group accounts by batches
    for (let i = 0; i < activeRecords.length; i += batchSize) {
      const batch = activeRecords.slice(i, i + batchSize);
      const accountBatch = [];
      const contactBatch = [];
      const associationPairs = [];

      batch.forEach(row => {
        const accountData = this.mapAccountFields(row);
        const contactData = this.mapContactFields(row);

        if (accountData) {
          accountBatch.push(accountData);
        }
        if (contactData) {
          contactBatch.push(contactData);
        }
        if (accountData && contactData) {
          associationPairs.push({
            accountId: accountData.id,
            contactEmail: contactData.email
          });
        }
      });

      batchGroups.push({
        accounts: accountBatch,
        contacts: contactBatch,
        associations: associationPairs,
        batchNumber: Math.floor(i / batchSize) + 1,
        totalBatches: Math.ceil(activeRecords.length / batchSize)
      });
    }

    console.log(`📦 Created ${batchGroups.length} batch groups for processing`);
    return batchGroups;
  }

  // Determine processing strategy based on existence in HubSpot
  categorizeRecordsByExistence(allRecords, existingAccountIds, existingContactEmails) {
    const recordsToCreate = [];
    const recordsToUpdate = [];
    const recordsToSkip = [];
    
    allRecords.forEach(row => {
      const accountData = this.mapAccountFields(row);
      const contactData = this.mapContactFields(row);
      const activeSub = this.convertToBoolean(row.active_sub);
      
      if (!accountData || !contactData) return;
      
      const accountExists = existingAccountIds.has(accountData.id);
      const contactExists = existingContactEmails.has(contactData.email);
      
      if (!accountExists || !contactExists) {
        // If account or contact doesn't exist, create them (regardless of active_sub status)
        recordsToCreate.push(row);
      } else if (activeSub) {
        // Both exist and subscription is active - update
        recordsToUpdate.push(row);
      } else {
        // Both exist and subscription is inactive - check if needs deactivation
        recordsToUpdate.push(row); // Still update to sync the inactive status
      }
    });

    console.log(`📊 Processing Strategy:`);
    console.log(`   Records to CREATE: ${recordsToCreate.length} (new accounts/contacts)`);
    console.log(`   Records to UPDATE: ${recordsToUpdate.length} (existing accounts/contacts)`);
    console.log(`   Total operations: ${recordsToCreate.length + recordsToUpdate.length}`);

    return {
      toCreate: recordsToCreate,
      toUpdate: recordsToUpdate,
      totalOperations: recordsToCreate.length + recordsToUpdate.length
    };
  }

  // Generate performance report
  generatePerformanceReport(originalCount, operationsCount, estimatedTimeReduction) {
    console.log('\n🚀 HIGH-PERFORMANCE PROCESSING REPORT');
    console.log('=======================================');
    console.log(`Original dataset: ${originalCount.toLocaleString()} records`);
    console.log(`Actual operations needed: ${operationsCount.toLocaleString()} records`);
    console.log(`Operations eliminated: ${(originalCount - operationsCount).toLocaleString()} (${((originalCount - operationsCount) / originalCount * 100).toFixed(1)}%)`);
    console.log(`Estimated time reduction: ${estimatedTimeReduction.toFixed(1)} minutes`);
    console.log(`Performance improvement: ${(originalCount / Math.max(operationsCount, 1)).toFixed(1)}x faster`);
    console.log('=======================================\n');
  }

  // Validate production data with performance metrics
  validateHighPerformanceData(rows) {
    const filterResult = this.filterRecordsForProcessing(rows);
    const batchGroups = this.groupForBatchProcessing(filterResult.activeRecords);
    
    const stats = {
      totalRows: rows.length,
      activeRecords: filterResult.activeRecords.length,
      inactiveRecords: filterResult.inactiveRecords.length,
      batchCount: batchGroups.length,
      performanceImprovement: rows.length / Math.max(filterResult.activeRecords.length, 1),
      estimatedTimeOriginal: Math.ceil(rows.length / 100), // 100 records per minute original
      estimatedTimeOptimized: Math.ceil(filterResult.activeRecords.length / 1000) // 1000 records per minute with batching
    };

    return {
      stats,
      filterResult,
      batchGroups
    };
  }
}

module.exports = HighPerformanceProcessor;