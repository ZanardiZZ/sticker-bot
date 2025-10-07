/**
 * Unit tests for permissionEvaluator service
 */

const { createPermissionEvaluator } = require('../../services/permissionEvaluator');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function buildEvaluator({ groupPermissions = {}, groupUsers = {} } = {}) {
  const listGroupCommandPermissions = async (groupId) => {
    return groupPermissions[groupId] || [];
  };

  const getGroupUser = async (groupId, userId) => {
    return groupUsers[`${groupId}:${userId}`] || null;
  };

  return createPermissionEvaluator({ listGroupCommandPermissions, getGroupUser });
}

const tests = [
  {
    name: 'Allows command when no rules exist',
    fn: async () => {
      const evaluator = buildEvaluator();
      const result = await evaluator.evaluateGroupCommandPermission({
        groupId: '123@g.us',
        userId: 'user@s.whatsapp.net',
        command: '#random'
      });
      assert(result.allowed, 'Command should be allowed by default');
      assertEqual(result.reasonCode, 'allowed', 'Reason code should be allowed');
      const summary = await evaluator.getGroupPermissionSummary('123@g.us');
      assertEqual(summary.defaultBehavior, 'allow', 'Default behavior should be allow');
    }
  },
  {
    name: 'Blocks command explicitly denied for group',
    fn: async () => {
      const evaluator = buildEvaluator({
        groupPermissions: {
          'abc@g.us': [{ command: '#random', allowed: 0 }]
        }
      });
      const result = await evaluator.evaluateGroupCommandPermission({
        groupId: 'abc@g.us',
        userId: 'user@s.whatsapp.net',
        command: '#random'
      });
      assert(!result.allowed, 'Command should be blocked');
      assertEqual(result.reasonCode, 'group_command_blocked', 'Should detect group block');
      assert(result.userMessage && result.userMessage.includes('desativado'), 'User message should explain block');
    }
  },
  {
    name: 'Default block rule requires explicit allow',
    fn: async () => {
      const evaluator = buildEvaluator({
        groupPermissions: {
          'grp@g.us': [
            { command: '*', allowed: 0 },
            { command: '#count', allowed: 1 }
          ]
        }
      });
      const allowed = await evaluator.evaluateGroupCommandPermission({
        groupId: 'grp@g.us',
        userId: 'someone@s.whatsapp.net',
        command: '#count'
      });
      assert(allowed.allowed, 'Explicit allow should override default block');
      const denied = await evaluator.evaluateGroupCommandPermission({
        groupId: 'grp@g.us',
        userId: 'someone@s.whatsapp.net',
        command: '#random'
      });
      assert(!denied.allowed, 'Default block should deny other commands');
      assertEqual(denied.reasonCode, 'group_default_block', 'Should reference default block rule');
      const summary = await evaluator.getGroupPermissionSummary('grp@g.us');
      assertEqual(summary.defaultBehavior, 'deny', 'Summary should indicate default deny');
    }
  },
  {
    name: 'User block overrides group allow',
    fn: async () => {
      const evaluator = buildEvaluator({
        groupPermissions: {
          'lock@g.us': [{ command: '#random', allowed: 1 }]
        },
        groupUsers: {
          'lock@g.us:user@s.whatsapp.net': { blocked: 1 }
        }
      });
      const result = await evaluator.evaluateGroupCommandPermission({
        groupId: 'lock@g.us',
        userId: 'user@s.whatsapp.net',
        command: '#random'
      });
      assert(!result.allowed, 'Blocked user should not bypass rules');
      assertEqual(result.reasonCode, 'user_blocked', 'Should detect user block');
    }
  },
  {
    name: 'User allowlist only permits configured commands',
    fn: async () => {
      const evaluator = buildEvaluator({
        groupUsers: {
          'grp2@g.us:vip@s.whatsapp.net': { allowed_commands: JSON.stringify(['#count']) }
        }
      });
      const allowed = await evaluator.evaluateGroupCommandPermission({
        groupId: 'grp2@g.us',
        userId: 'vip@s.whatsapp.net',
        command: '#count'
      });
      assert(allowed.allowed, 'Allowed command should pass');
      const denied = await evaluator.evaluateGroupCommandPermission({
        groupId: 'grp2@g.us',
        userId: 'vip@s.whatsapp.net',
        command: '#random'
      });
      assert(!denied.allowed, 'Command not in allowlist should be denied');
      assertEqual(denied.reasonCode, 'user_allowlist_miss', 'Should indicate allowlist miss');
    }
  },
  {
    name: 'Normalizes commands without hash prefix',
    fn: async () => {
      const evaluator = buildEvaluator({
        groupPermissions: {
          'norm@g.us': [{ command: 'random', allowed: 0 }]
        }
      });
      const result = await evaluator.evaluateGroupCommandPermission({
        groupId: 'norm@g.us',
        userId: 'member@s.whatsapp.net',
        command: '#random'
      });
      assert(!result.allowed, 'Command should match even without hash in rule');
      assertEqual(result.reasonCode, 'group_command_blocked', 'Should use group rule');
    }
  }
];

async function main() {
  console.log('\n=== Permission Evaluator Tests ===');
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${test.name} -> ${err.message}`);
      failed++;
    }
  }

  console.log(`\nPermission evaluator results: ${passed}/${passed + failed} passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { tests };
