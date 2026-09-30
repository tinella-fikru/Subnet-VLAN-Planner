import ipaddr from 'ipaddr.js';

export const formatNumber = (value) => value.toLocaleString('en-US');

export function parseIP(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value.trim())) {
    throw new Error('Enter four decimal octets, for example 192.168.10.1.');
  }
  const text = value.trim();
  if (!ipaddr.IPv4.isValid(text)) throw new Error('Each IP octet must be between 0 and 255.');
  return ipaddr.IPv4.parse(text).toByteArray().reduce((total, octet) => total * 256 + octet, 0);
}

export function toIP(value) {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}

export function parsePrefix(value) {
  const text = String(value).trim().replace(/^\//, '');
  if (!/^(0|[1-9]\d?)$/.test(text) || Number(text) > 32) {
    throw new Error('CIDR prefix must be a whole number from 0 to 32.');
  }
  return Number(text);
}

export function prefixToMask(value) {
  const prefix = parsePrefix(value);
  return toIP(2 ** 32 - 2 ** (32 - prefix));
}

export function maskToPrefix(value) {
  const mask = parseIP(value);
  const bits = mask.toString(2).padStart(32, '0');
  if (!/^1*0*$/.test(bits)) throw new Error('Subnet mask must have contiguous 1 bits, for example 255.255.255.0.');
  return bits.replace(/0/g, '').length;
}

export function subnet(ip, prefixValue) {
  const address = parseIP(ip);
  const prefix = parsePrefix(prefixValue);
  const total = 2 ** (32 - prefix);
  const start = Math.floor(address / total) * total;
  const end = start + total - 1;
  const first = prefix >= 31 ? start : start + 1;
  const last = prefix >= 31 ? end : end - 1;
  const parsed = ipaddr.IPv4.parse(ip.trim());
  const range = parsed.range();
  const firstOctet = parsed.octets[0];
  const ipClass = firstOctet < 128 ? 'A' : firstOctet < 192 ? 'B' : firstOctet < 224 ? 'C' : firstOctet < 240 ? 'D' : 'E';
  const specialNames = {
    loopback: 'Loopback', linkLocal: 'Link-local', multicast: 'Multicast',
    carrierGradeNat: 'Shared / CGNAT', reserved: 'Reserved', unspecified: 'Unspecified',
    broadcast: 'Limited broadcast', benchmarking: 'Benchmarking',
  };
  return {
    address, prefix, start, end, total, usable: prefix >= 31 ? total : total - 2,
    network: toIP(start), broadcast: toIP(end), first: toIP(first), last: toIP(last),
    cidr: `${toIP(start)}/${prefix}`, mask: prefixToMask(prefix), wildcard: toIP(total - 1),
    ipClass, scope: range === 'private' ? 'Private' : range === 'unicast' ? 'Public' : specialNames[range] || 'Special-use',
    range, bits: address.toString(2).padStart(32, '0'),
  };
}

export function parseCIDR(value) {
  const parts = String(value).trim().split('/');
  if (parts.length !== 2) throw new Error('Enter an IPv4 network with a prefix, for example 10.0.0.0/24.');
  return subnet(parts[0], parts[1]);
}

export function allocateVLSM(parentValue, requests) {
  const parent = parseCIDR(parentValue);
  if (!requests.length) throw new Error('Add at least one subnet requirement.');
  const sorted = requests.map((request, index) => {
    const text = String(request.hosts).trim();
    if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 4294967294) {
      throw new Error(`Subnet ${index + 1}: host count must be between 1 and 4,294,967,294.`);
    }
    const hosts = Number(text);
    const size = 2 ** Math.max(2, Math.ceil(Math.log2(hosts + 2)));
    return { ...request, hosts, size, index };
  }).sort((left, right) => right.size - left.size || left.index - right.index);
  const used = sorted.reduce((sum, request) => sum + request.size, 0);
  if (used > parent.total) {
    throw new Error(`Subnets do not fit: ${formatNumber(used)} addresses required, but ${parent.cidr} has ${formatNumber(parent.total)}. Short by ${formatNumber(used - parent.total)} addresses.`);
  }
  let cursor = parent.start;
  const allocations = sorted.map((request) => {
    const result = subnet(toIP(cursor), 32 - Math.log2(request.size));
    cursor += request.size;
    return { ...request, ...result };
  });
  return { parent, allocations, used, remaining: parent.total - used };
}

export function findOverlaps(rows) {
  const parsed = rows.map((row, index) => {
    try { return { ...row, index, subnet: parseCIDR(row.cidr) }; }
    catch (error) { return { ...row, index, error: error.message }; }
  });
  const conflicts = [];
  for (let left = 0; left < parsed.length; left++) {
    for (let right = left + 1; right < parsed.length; right++) {
      if (!parsed[left].subnet || !parsed[right].subnet) continue;
      const start = Math.max(parsed[left].subnet.start, parsed[right].subnet.start);
      const end = Math.min(parsed[left].subnet.end, parsed[right].subnet.end);
      if (start <= end) conflicts.push({ left, right, count: end - start + 1, first: toIP(start), last: toIP(end) });
    }
  }
  return { parsed, conflicts };
}

export function validateVLANs(rows) {
  return rows.map((row) => {
    const errors = {};
    const id = Number(row.vlanId);
    if (!/^\d+$/.test(String(row.vlanId)) || id < 1 || id > 4094) errors.vlanId = 'Use a whole number from 1 to 4094.';
    else if (id === 1 || (id >= 1002 && id <= 1005)) errors.vlanId = 'This VLAN ID is reserved.';
    else if (rows.filter((other) => Number(other.vlanId) === id).length > 1) errors.vlanId = 'VLAN ID must be unique.';
    if (!row.name.trim()) errors.name = 'Enter a VLAN name.';
    try { parseCIDR(row.cidr); } catch (error) { errors.cidr = error.message; }
    return errors;
  });
}