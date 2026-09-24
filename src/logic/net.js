// Pure networking helpers used by the game content. No Three.js here so
// they can be unit tested with `node --test`.

export function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function parseCidr(cidr) {
  const [ip, bits] = cidr.split('/');
  const prefix = Number(bits);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Invalid prefix length: ${cidr}`);
  }
  return { network: ipToInt(ip), prefix };
}

export function maskFor(prefix) {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function cidrContains(cidr, ip) {
  const { network, prefix } = parseCidr(cidr);
  const mask = maskFor(prefix);
  return ((ipToInt(ip) & mask) >>> 0) === ((network & mask) >>> 0);
}

// Returns the index of the routing table row that wins for `ip`
// (the matching row with the longest prefix), or -1 when nothing matches.
export function longestPrefixMatch(table, ip) {
  let best = -1;
  let bestPrefix = -1;
  table.forEach((row, i) => {
    if (cidrContains(row.dest, ip)) {
      const { prefix } = parseCidr(row.dest);
      if (prefix > bestPrefix) {
        best = i;
        bestPrefix = prefix;
      }
    }
  });
  return best;
}

export function sameSubnet(ipA, ipB, prefix) {
  const mask = maskFor(prefix);
  return ((ipToInt(ipA) & mask) >>> 0) === ((ipToInt(ipB) & mask) >>> 0);
}

export function segmentCount(bytes, mss) {
  return Math.ceil(bytes / mss);
}

// TCP sequence numbers for splitting `bytes` into MSS sized segments,
// starting at `isn + 1` (the SYN consumes one sequence number).
export function segmentSeqNumbers(isn, bytes, mss) {
  const seqs = [];
  for (let off = 0; off < bytes; off += mss) seqs.push(isn + 1 + off);
  return seqs;
}

export const HANDSHAKE = ['SYN', 'SYN-ACK', 'ACK'];

export function ttlAfterHops(ttl, hops) {
  return Math.max(0, ttl - hops);
}
