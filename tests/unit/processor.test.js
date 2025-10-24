/**
 * Unit tests for HighPerformanceProcessor
 */

const HighPerformanceProcessor = require('../../src/core/processor');
const fs = require('fs');
const path = require('path');

describe('HighPerformanceProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new HighPerformanceProcessor();
  });

  describe('parseCSV', () => {
    it('should parse CSV data correctly', async () => {
      const csvData = '_id,email,user_id,user_type,active_sub,total_sub_count,weekly_sub_count,monthly_sub_count,daily_sub_count\n1,test@example.com,TEST_USER,MP,TRUE,5,2,2,1';
      
      const result = await processor.parseCSV(csvData);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        _id: '1',
        email: 'test@example.com',
        user_id: 'TEST_USER',
        user_type: 'MP',
        active_sub: 'TRUE',
        total_sub_count: '5',
        weekly_sub_count: '2',
        monthly_sub_count: '2',
        daily_sub_count: '1'
      });
    });

    it('should handle empty CSV data', async () => {
      const csvData = '_id,email,user_id,user_type,active_sub,total_sub_count,weekly_sub_count,monthly_sub_count,daily_sub_count\n';
      
      const result = await processor.parseCSV(csvData);
      
      expect(result).toHaveLength(0);
    });
  });

  describe('mapAccountType', () => {
    it('should map MP to MP', () => {
      expect(processor.mapAccountType('MP')).toBe('MP');
    });

    it('should map WIX to USAMPS', () => {
      expect(processor.mapAccountType('WIX')).toBe('USAMPS');
    });

    it('should return unknown types as-is', () => {
      expect(processor.mapAccountType('UNKNOWN')).toBe('UNKNOWN');
    });
  });

  describe('validateEmail', () => {
    it('should validate correct emails', () => {
      expect(processor.validateEmail('test@example.com')).toBe(true);
      expect(processor.validateEmail('user.name+tag@domain.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(processor.validateEmail('invalid-email')).toBe(false);
      expect(processor.validateEmail('@domain.com')).toBe(false);
      expect(processor.validateEmail('user@')).toBe(false);
      expect(processor.validateEmail('')).toBe(false);
    });
  });

  describe('processDataForAccounts', () => {
    it('should convert CSV data to HubSpot account format', () => {
      const csvData = [{
        user_id: 'TEST_USER',
        user_type: 'WIX',
        active_sub: 'TRUE',
        weekly_sub_count: '2',
        monthly_sub_count: '1',
        daily_sub_count: '1'
      }];

      const result = processor.processDataForAccounts(csvData);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'TEST_USER',
        account_type: 'USAMPS',
        active_subscription: true,
        weekly_subscriptions: 2,
        monthly_subscriptions: 1,
        daily_subscriptions: 1
      });
    });

    it('should handle boolean conversion for active_sub', () => {
      const csvData = [
        { user_id: 'USER1', user_type: 'MP', active_sub: 'TRUE', weekly_sub_count: '0', monthly_sub_count: '0', daily_sub_count: '0' },
        { user_id: 'USER2', user_type: 'MP', active_sub: 'FALSE', weekly_sub_count: '0', monthly_sub_count: '0', daily_sub_count: '0' },
        { user_id: 'USER3', user_type: 'MP', active_sub: 'true', weekly_sub_count: '0', monthly_sub_count: '0', daily_sub_count: '0' }
      ];

      const result = processor.processDataForAccounts(csvData);

      expect(result[0].active_subscription).toBe(true);
      expect(result[1].active_subscription).toBe(false);
      expect(result[2].active_subscription).toBe(true);
    });
  });

  describe('processDataForContacts', () => {
    it('should convert CSV data to HubSpot contact format', () => {
      const csvData = [{
        email: 'test@example.com',
        user_type: 'WIX'
      }];

      const result = processor.processDataForContacts(csvData);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        email: 'test@example.com',
        user_type: 'USAMPS'
      });
    });

    it('should filter out invalid emails', () => {
      const csvData = [
        { email: 'valid@example.com', user_type: 'MP' },
        { email: 'invalid-email', user_type: 'MP' },
        { email: 'another@valid.com', user_type: 'WIX' }
      ];

      const result = processor.processDataForContacts(csvData);

      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('valid@example.com');
      expect(result[1].email).toBe('another@valid.com');
    });
  });

  describe('categorizeRecordsByExistence', () => {
    it('should categorize records into create and update groups', () => {
      const csvData = [
        { user_id: 'USER1', email: 'user1@example.com', active_sub: 'TRUE' },
        { user_id: 'USER2', email: 'user2@example.com', active_sub: 'FALSE' },
        { user_id: 'USER3', email: 'user3@example.com', active_sub: 'TRUE' }
      ];

      const existingAccountIds = new Set(['USER2']);
      const existingContactEmails = new Set(['user2@example.com']);

      const result = processor.categorizeRecordsByExistence(
        csvData,
        existingAccountIds,
        existingContactEmails
      );

      expect(result.toCreate).toHaveLength(2);
      expect(result.toUpdate).toHaveLength(1);
      expect(result.toCreate.map(r => r.user_id)).toEqual(['USER1', 'USER3']);
      expect(result.toUpdate.map(r => r.user_id)).toEqual(['USER2']);
    });
  });

  describe('groupForBatchProcessing', () => {
    it('should group records into batches with accounts, contacts, and associations', () => {
      const records = [
        { user_id: 'USER1', email: 'user1@example.com', user_type: 'MP' },
        { user_id: 'USER2', email: 'user2@example.com', user_type: 'WIX' }
      ];

      const result = processor.groupForBatchProcessing(records);

      expect(result).toHaveLength(1); // Should be one batch for small dataset
      expect(result[0]).toHaveProperty('accounts');
      expect(result[0]).toHaveProperty('contacts');
      expect(result[0]).toHaveProperty('associations');
      expect(result[0].accounts).toHaveLength(2);
      expect(result[0].contacts).toHaveLength(2);
      expect(result[0].associations).toHaveLength(2);
    });
  });
});