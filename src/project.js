import { z } from 'zod';
import { validateVLANs } from './network.js';

const text = z.string().max(2000);
const rowKey = z.string().min(1).max(100);
const uniqueRows = (schema, max) => z.array(schema).max(max).refine(
  (rows) => new Set(rows.map((row) => row.key)).size === rows.length,
  'Row keys must be unique.',
);

export const projectSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(100),
  calculator: z.object({ ip: text, prefix: text, mask: text, mode: z.enum(['cidr', 'mask']) }),
  vlsm: z.object({ parent: text, requests: uniqueRows(z.object({ key: rowKey, name: text, hosts: text }), 256) }),
  overlaps: uniqueRows(z.object({ key: rowKey, name: text, cidr: text }), 256),
  vlans: uniqueRows(z.object({ key: rowKey, vlanId: text, name: text, cidr: text, description: text, active: z.boolean() }), 512),
});

export function createProject() {
  return {
    version: 1, name: 'Office network',
    calculator: { ip: '192.168.10.24', prefix: '24', mask: '255.255.255.0', mode: 'cidr' },
    vlsm: { parent: '10.10.0.0/24', requests: [
      { key: 'req-1', name: 'Workstations', hosts: '100' },
      { key: 'req-2', name: 'Voice', hosts: '50' },
      { key: 'req-3', name: 'Management', hosts: '20' },
    ] },
    overlaps: [
      { key: 'net-1', name: 'Workstations', cidr: '10.10.0.0/25' },
      { key: 'net-2', name: 'Voice', cidr: '10.10.0.128/26' },
      { key: 'net-3', name: 'Management', cidr: '10.10.0.192/27' },
    ],
    vlans: [
      { key: 'vlan-1', vlanId: '10', name: 'Workstations', cidr: '10.10.0.0/25', description: 'Employee devices', active: true },
      { key: 'vlan-2', vlanId: '20', name: 'Voice', cidr: '10.10.0.128/26', description: 'IP telephony', active: true },
      { key: 'vlan-3', vlanId: '99', name: 'Management', cidr: '10.10.0.192/27', description: 'Network infrastructure', active: false },
    ],
  };
}

export function importProject(contents) {
  if (contents.length > 2_000_000) throw new Error('Project file exceeds the 2 MB limit.');
  let parsed;
  try { parsed = JSON.parse(contents); } catch { throw new Error('This file is not valid JSON.'); }
  const result = projectSchema.safeParse(parsed);
  if (!result.success) throw new Error('This is not a supported planner project (version 1). Existing work has not been changed.');
  return result.data;
}

export function exportProject(project) {
  return JSON.stringify(projectSchema.parse(project), null, 2);
}

export function exportCSV(rows) {
  if (validateVLANs(rows).some((errors) => Object.keys(errors).length)) throw new Error('Resolve the VLAN validation errors before exporting CSV.');
  const cell = (value) => {
    let text = String(value);
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const records = [
    ['VLAN ID', 'Name', 'Subnet', 'Description', 'Status'],
    ...rows.map((row) => [row.vlanId, row.name, row.cidr, row.description, row.active ? 'Active' : 'Inactive']),
  ];
  return '\uFEFF' + records.map((record) => record.map(cell).join(',')).join('\r\n');
}