import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ipToInt, cidrContains, longestPrefixMatch, sameSubnet, segmentCount, segmentSeqNumbers, ttlAfterHops, firstMatchingRule, parseCidr,
} from '../src/logic/net.js';

test('ipToInt converts dotted quads', () => {
  assert.equal(ipToInt('0.0.0.0'), 0);
  assert.equal(ipToInt('255.255.255.255'), 0xffffffff);
  assert.equal(ipToInt('203.0.113.80'), (203 * 2 ** 24) + (113 << 8) + 80);
  assert.throws(() => ipToInt('300.1.1.1'));
  assert.throws(() => ipToInt('1.2.3'));
});

test('cidrContains', () => {
  assert.ok(cidrContains('203.0.113.0/24', '203.0.113.80'));
  assert.ok(cidrContains('203.0.113.0/25', '203.0.113.80'));
  assert.ok(!cidrContains('203.0.113.128/25', '203.0.113.80'));
  assert.ok(cidrContains('0.0.0.0/0', '8.8.8.8'));
  assert.ok(!cidrContains('10.0.0.0/8', '203.0.113.80'));
});

test('longestPrefixMatch picks the most specific route', () => {
  const table = [{ dest: '0.0.0.0/0' }, { dest: '203.0.0.0/8' }, { dest: '203.0.113.0/24' }, { dest: '10.0.0.0/8' }];
  assert.equal(longestPrefixMatch(table, '203.0.113.80'), 2);
  assert.equal(longestPrefixMatch(table, '203.9.9.9'), 1);
  assert.equal(longestPrefixMatch(table, '1.1.1.1'), 0);
  assert.equal(longestPrefixMatch([{ dest: '10.0.0.0/8' }], '1.1.1.1'), -1);
});

test('sameSubnet', () => {
  assert.ok(sameSubnet('192.168.1.20', '192.168.1.1', 24));
  assert.ok(!sameSubnet('192.168.1.20', '203.0.113.80', 24));
});

test('segmentation and TTL', () => {
  assert.equal(segmentCount(4000, 1460), 3);
  assert.deepEqual(segmentSeqNumbers(1000, 4000, 1460), [1001, 2461, 3921]);
  assert.equal(ttlAfterHops(64, 3), 61);
  assert.equal(ttlAfterHops(1, 3), 0);
});

test('firstMatchingRule returns the first rule that matches', () => {
  const rules = [
    { action: 'allow', proto: 'tcp', port: 22, from: '10.0.0.0/8' },
    { action: 'allow', proto: 'tcp', port: 443, from: '0.0.0.0/0' },
    { action: 'deny', proto: 'any', port: 'any', from: '0.0.0.0/0' },
  ];
  assert.equal(firstMatchingRule(rules, { proto: 'tcp', port: 443, src: '198.51.100.7' }), 1);
  assert.equal(firstMatchingRule(rules, { proto: 'tcp', port: 22, src: '10.1.2.3' }), 0);
  assert.equal(firstMatchingRule(rules, { proto: 'tcp', port: 22, src: '8.8.8.8' }), 2);
  assert.equal(firstMatchingRule(rules, { proto: 'udp', port: 53, src: '8.8.8.8' }), 2);
});
