'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { summarizeUsage } = require('../src/core/rate-limits');

test('summarizeUsage picks five-hour and weekly windows', () => {
  const result = summarizeUsage({
    account_id: 'acct_123',
    email: 'user@example.com',
    plan_type: 'plus',
    rate_limit: {
      primary_window: {
        used_percent: 42,
        limit_window_seconds: 5 * 60 * 60,
        reset_at: 1770000000
      },
      secondary_window: {
        used_percent: 18,
        limit_window_seconds: 7 * 24 * 60 * 60,
        reset_at: 1770600000
      }
    }
  });

  assert.equal(result.accountId, 'acct_123');
  assert.equal(result.fiveHour.usedPercent, 42);
  assert.equal(result.fiveHour.remainingPercent, 58);
  assert.equal(result.weekly.usedPercent, 18);
  assert.equal(result.weekly.windowMinutes, 10080);
});

test('summarizeUsage can read windows from additional rate limits', () => {
  const result = summarizeUsage({
    additional_rate_limits: [
      {
        limit_name: 'gpt-5.5',
        rate_limit: {
          primary_window: {
            used_percent: 90,
            limit_window_seconds: 4.8 * 60 * 60,
            reset_at: 1770100000
          },
          secondary_window: {
            used_percent: 55,
            limit_window_seconds: 6.9 * 24 * 60 * 60,
            reset_at: 1770700000
          }
        }
      }
    ]
  });

  assert.equal(result.fiveHour.limitName, 'gpt-5.5');
  assert.equal(result.weekly.limitName, 'gpt-5.5');
});
