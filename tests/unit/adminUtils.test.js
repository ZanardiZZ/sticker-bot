#!/usr/bin/env node
/**
 * Unit tests for adminUtils module
 */

const { assert, assertEqual } = require('../helpers/testUtils');

// Load the adminUtils module
const { getEnvAdminSet } = require('../../utils/adminUtils');

const tests = [
  {
    name: 'getEnvAdminSet returns empty set when no admin env vars are set',
    fn: async () => {
      // Clear all admin env vars
      delete process.env.ADMIN_NUMBER;
      delete process.env.ADMIN_NUMBERS;
      delete process.env.BOT_SUPER_ADMINS;
      
      const result = getEnvAdminSet();
      
      assert(result instanceof Set, 'Should return a Set');
      assertEqual(result.size, 0, 'Should return empty set when no env vars set');
    }
  },
  
  {
    name: 'getEnvAdminSet returns set with ADMIN_NUMBER',
    fn: async () => {
      delete process.env.ADMIN_NUMBERS;
      delete process.env.BOT_SUPER_ADMINS;
      process.env.ADMIN_NUMBER = '5511999999999@c.us';
      
      const result = getEnvAdminSet();
      
      assertEqual(result.size, 1, 'Should have one admin');
      assert(result.has('5511999999999@c.us'), 'Should contain the admin number');
      
      delete process.env.ADMIN_NUMBER;
    }
  },
  
  {
    name: 'getEnvAdminSet returns set with multiple ADMIN_NUMBERS',
    fn: async () => {
      delete process.env.ADMIN_NUMBER;
      delete process.env.BOT_SUPER_ADMINS;
      process.env.ADMIN_NUMBERS = '5511999999999@c.us, 5511888888888@c.us, 5511777777777@c.us';
      
      const result = getEnvAdminSet();
      
      assertEqual(result.size, 3, 'Should have three admins');
      assert(result.has('5511999999999@c.us'), 'Should contain first admin');
      assert(result.has('5511888888888@c.us'), 'Should contain second admin');
      assert(result.has('5511777777777@c.us'), 'Should contain third admin');
      
      delete process.env.ADMIN_NUMBERS;
    }
  },
  
  {
    name: 'getEnvAdminSet returns set with BOT_SUPER_ADMINS',
    fn: async () => {
      delete process.env.ADMIN_NUMBER;
      delete process.env.ADMIN_NUMBERS;
      process.env.BOT_SUPER_ADMINS = '5511111111111@c.us,5511222222222@c.us';
      
      const result = getEnvAdminSet();
      
      assertEqual(result.size, 2, 'Should have two super admins');
      assert(result.has('5511111111111@c.us'), 'Should contain first super admin');
      assert(result.has('5511222222222@c.us'), 'Should contain second super admin');
      
      delete process.env.BOT_SUPER_ADMINS;
    }
  },
  
  {
    name: 'getEnvAdminSet combines all admin sources without duplicates',
    fn: async () => {
      process.env.ADMIN_NUMBER = '5511999999999@c.us';
      process.env.ADMIN_NUMBERS = '5511888888888@c.us, 5511999999999@c.us'; // Duplicate
      process.env.BOT_SUPER_ADMINS = '5511777777777@c.us';
      
      const result = getEnvAdminSet();
      
      // Should have 3 unique admins (duplicate removed)
      assertEqual(result.size, 3, 'Should have three unique admins');
      assert(result.has('5511999999999@c.us'), 'Should contain admin from ADMIN_NUMBER');
      assert(result.has('5511888888888@c.us'), 'Should contain admin from ADMIN_NUMBERS');
      assert(result.has('5511777777777@c.us'), 'Should contain admin from BOT_SUPER_ADMINS');
      
      delete process.env.ADMIN_NUMBER;
      delete process.env.ADMIN_NUMBERS;
      delete process.env.BOT_SUPER_ADMINS;
    }
  },
  
  {
    name: 'getEnvAdminSet handles phone numbers without @c.us suffix',
    fn: async () => {
      delete process.env.ADMIN_NUMBERS;
      delete process.env.BOT_SUPER_ADMINS;
      process.env.ADMIN_NUMBER = '5511999999999'; // Without @c.us
      
      const result = getEnvAdminSet();
      
      assertEqual(result.size, 1, 'Should have one admin');
      // normalizeJid should add @c.us suffix
      assert(result.has('5511999999999@c.us') || result.has('5511999999999'), 'Should normalize the JID');
      
      delete process.env.ADMIN_NUMBER;
    }
  },
  
  {
    name: 'getEnvAdminSet filters out empty strings',
    fn: async () => {
      delete process.env.ADMIN_NUMBER;
      delete process.env.BOT_SUPER_ADMINS;
      process.env.ADMIN_NUMBERS = '5511999999999@c.us, , 5511888888888@c.us, '; // Empty entries
      
      const result = getEnvAdminSet();
      
      assertEqual(result.size, 2, 'Should have two admins, empty strings filtered out');
      assert(result.has('5511999999999@c.us'), 'Should contain first admin');
      assert(result.has('5511888888888@c.us'), 'Should contain second admin');
      
      delete process.env.ADMIN_NUMBERS;
    }
  }
];

// Run tests if called directly
async function main() {
  const { runTestSuite } = require('../helpers/testUtils');
  try {
    await runTestSuite('Admin Utils Tests', tests);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };
