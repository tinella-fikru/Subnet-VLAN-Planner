import test from 'node:test';
import assert from 'node:assert/strict';
import { subnet, parseIP, parseCIDR, prefixToMask, maskToPrefix, allocateVLSM, findOverlaps, validateVLANs } from '../src/network.js';
import { createProject, importProject, exportProject, exportCSV } from '../src/project.js';

test('calculates a private /24 and normalizes host bits', () => {
  const result = subnet('192.168.10.24', 24);
  assert.equal(result.network, '192.168.10.0');
  assert.equal(result.broadcast, '192.168.10.255');
  assert.equal(result.first, '192.168.10.1');
  assert.equal(result.last, '192.168.10.254');
  assert.equal(result.usable, 254);
  assert.equal(result.total, 256);
  assert.equal(result.wildcard, '0.0.0.255');
  assert.equal(result.scope, 'Private');
  assert.equal(result.ipClass, 'C');
});

test('handles /0, unsigned high addresses, /31 and /32', () => {
  assert.equal(subnet('200.1.2.3', 0).total, 4294967296);
  assert.equal(subnet('200.1.2.3', 0).broadcast, '255.255.255.255');
  assert.equal(subnet('255.255.255.255', 32).usable, 1);
  assert.equal(subnet('10.0.0.1', 31).first, '10.0.0.0');
  assert.equal(subnet('10.0.0.1', 31).usable, 2);
  assert.equal(subnet('224.0.0.1', 24).scope, 'Multicast');
  assert.equal(subnet('127.0.0.1', 8).scope, 'Loopback');
  assert.equal(subnet('8.8.8.8', 32).scope, 'Public');
  assert.equal(subnet('100.64.0.1', 10).scope, 'Shared / CGNAT');
});

test('round-trips all masks and rejects malformed inputs', () => {
  for (let prefix = 0; prefix <= 32; prefix++) assert.equal(maskToPrefix(prefixToMask(prefix)), prefix);
  for (const bad of ['01.2.3.4', '256.1.1.1', '1.2.3', '0x7f.0.0.1', '1e2.0.0.1', '::1']) assert.throws(() => parseIP(bad));
  for (const bad of ['255.0.255.0', '255.255.127.0']) assert.throws(() => maskToPrefix(bad));
  for (const bad of ['10.0.0.1/33', '10.0.0.1/-1', '10.0.0.1/', '10.0.0.1/24/2']) assert.throws(() => parseCIDR(bad));
});

test('VLSM sorts, aligns, fits exactly, and reports exhausted space', () => {
  const requests = [{ name: 'small', hosts: '30' }, { name: 'large', hosts: '100' }, { name: 'medium', hosts: '50' }];
  const result = allocateVLSM('10.0.0.12/24', requests);
  assert.deepEqual(result.allocations.map((row) => row.cidr), ['10.0.0.0/25', '10.0.0.128/26', '10.0.0.192/27']);
  assert.equal(result.remaining, 32);
  assert.equal(allocateVLSM('10.0.0.0/24', [{ hosts: '254' }]).remaining, 0);
  assert.equal(allocateVLSM('0.0.0.0/0', [{ hosts: '4294967294' }]).remaining, 0);
  assert.throws(() => allocateVLSM('10.0.0.0/24', [{ hosts: '255' }]), /do not fit/);
  for (const hosts of ['0', '-1', '1.5', '', '4294967295']) assert.throws(() => allocateVLSM('10.0.0.0/24', [{ hosts }]));
});

test('overlaps include containment and duplicates but exclude adjacent networks', () => {
  const result = findOverlaps(['10.0.0.0/24', '10.0.0.128/25', '10.0.1.0/24', '10.0.0.0/24', 'bad'].map((cidr) => ({ cidr })));
  assert.equal(result.conflicts.length, 3);
  assert.equal(result.conflicts[0].count, 128);
  assert.equal(result.conflicts[1].count, 256);
  assert.ok(result.parsed[4].error);
  assert.equal(findOverlaps([{ cidr: '0.0.0.0/0' }, { cidr: '255.255.255.255/32' }]).conflicts[0].count, 1);
});

test('validates reserved IDs, duplicate IDs, range and subnet', () => {
  const base = createProject().vlans[0];
  for (const vlanId of ['1', '1002', '1003', '1004', '1005', '0', '4095', '1.5']) assert.ok(validateVLANs([{ ...base, vlanId }])[0].vlanId);
  assert.ok(validateVLANs([base, { ...base, vlanId: '010' }]).every((errors) => errors.vlanId));
  assert.ok(validateVLANs([{ ...base, cidr: 'bad' }])[0].cidr);
  assert.deepEqual(validateVLANs([{ ...base, vlanId: '4094' }]), [{}]);
});

test('project JSON round-trips drafts and rejects malformed or oversized imports', () => {
  const project = createProject();
  project.calculator.ip = 'unfinished';
  assert.deepEqual(importProject(exportProject(project)), project);
  for (const value of ['{}', 'null', 'bad', JSON.stringify({ ...project, version: 2 }), JSON.stringify({ ...project, vlans: [project.vlans[0], project.vlans[0]] })]) assert.throws(() => importProject(value));
  assert.throws(() => importProject(' '.repeat(2_000_001)));
});

test('CSV escapes commas, quotes, line breaks and spreadsheet formulas', () => {
  const row = { ...createProject().vlans[0], name: '=1+1', description: 'Room "A", floor 2\nVoice' };
  const csv = exportCSV([row]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"Room ""A"", floor 2\nVoice"'));
  assert.throws(() => exportCSV([{ ...row, vlanId: '1' }]));
});