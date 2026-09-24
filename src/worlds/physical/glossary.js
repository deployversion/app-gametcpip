// Knowledge orbs hidden around the world. Walking through one unlocks its
// glossary card. Positions are on the walkable path (|z| <= 9), away from
// the station pedestals at z = -5.5.

import { RX } from './layout.js';

export const GLOSSARY = [
  // sender · application
  { id: 'dns', layer: 'app', x: -112, z: 6, term: 'DNS', text: 'The Domain Name System is the internet\'s phone book. It turns names like catpics.example into IP addresses. DNS queries usually travel over UDP port 53.' },
  { id: 'tls', layer: 'app', x: -93, z: -6, term: 'TLS', text: 'Transport Layer Security encrypts application data and proves the server is who it claims to be (with a certificate). HTTPS is simply HTTP inside TLS.' },
  { id: 'latency', layer: 'app', x: -104, z: 9, term: 'Latency', text: 'Nothing beats the speed of light, and in glass fibre light covers about 200 km per millisecond. A server 6,000 km away is at least 60 ms away there and back, before any computer has done any work. That is why big sites keep copies close to their users.' },
  // sender · transport
  { id: 'udp', layer: 'transport', x: -75, z: 6, term: 'UDP', text: 'The other big transport protocol. No handshake, no ACKs, no retransmission: just fire and forget. Great for video calls, games and DNS, where speed beats perfection.' },
  { id: 'window', layer: 'transport', x: -61, z: 6, term: 'Flow control', text: 'Every ACK carries a "window": how many more bytes the receiver can accept right now. That stops a fast sender from drowning a slow receiver.' },
  // sender · internet
  { id: 'ipv6', layer: 'internet', x: -45, z: 6, term: 'IPv6', text: 'IPv4 has about 4 billion addresses, which ran out. IPv6 addresses are 128 bits long (like 2001:db8::1), enough for every grain of sand on Earth to get plenty.' },
  { id: 'icmp', layer: 'internet', x: -31, z: -6, term: 'ICMP', text: 'The internet\'s error and diagnostics messages: "destination unreachable", "time exceeded". The ping tool uses ICMP echo request and echo reply.' },
  // sender · link
  { id: 'switch', layer: 'link', x: -15, z: 6, term: 'Switch', text: 'A switch connects devices on one local network. It learns which MAC address lives behind which port and forwards each frame only where it needs to go.' },
  { id: 'wifi', layer: 'link', x: -5, z: -6, term: 'Wi-Fi', text: 'Wi-Fi is a link layer too (IEEE 802.11). The frames travel as radio waves instead of electrical pulses, but IP above does not care.' },
  // receiver · link
  { id: 'mtu', layer: 'link', x: 50 + RX, z: 6, term: 'MTU', text: 'The Maximum Transmission Unit is the largest packet a link can carry: 1500 bytes on Ethernet. That is why TCP\'s MSS is 1460: 1500 minus 20 bytes of IP header and 20 of TCP header.' },
  { id: 'fibre', layer: 'link', x: 56 + RX, z: -7, term: 'Optical fibre', text: 'A hair-thin strand of glass that carries data as flashes of laser light. Light of different colours carries separate channels in the same fibre, so one fibre pair can carry tens of terabits per second.' },
  { id: 'subsea', layer: 'link', x: 46 + RX, z: 7, term: 'Undersea cables', text: 'More than 500 cables on the ocean floor carry about 99% of the traffic between continents. In deep water they are as thin as a garden hose; near the shore they get steel armour against anchors and fishing nets. Special ships repair them.' },
  // receiver · internet
  { id: 'private', layer: 'internet', x: 74 + RX, z: 6, term: 'Private addresses', text: '10.x.x.x, 172.16–31.x.x and 192.168.x.x are reserved for private networks and never appear on the public internet. NAT lets a whole home share one public address.' },
  { id: 'traceroute', layer: 'internet', x: 84 + RX, z: -6, term: 'Traceroute', text: 'Traceroute sends packets with TTL 1, 2, 3… Each router that drops one answers with ICMP "time exceeded", revealing the path hop by hop.' },
  // receiver · transport
  { id: 'socket', layer: 'transport', x: 99 + RX, z: 6, term: 'Socket', text: 'A connection is identified by four numbers: source IP, source port, destination IP, destination port. Programs talk to the network through sockets.' },
  { id: 'quic', layer: 'transport', x: 110 + RX, z: -6, term: 'QUIC', text: 'QUIC is a newer transport built on UDP. It merges the TCP and TLS handshakes into one round trip and powers HTTP/3.' },
  { id: 'datacentre', layer: 'transport', x: 100 + RX, z: -7, term: 'Data centre', text: 'A building full of servers with backup power (batteries and generators), cooling and several fibre connections to the outside. Big websites run in many data centres around the world, so every user has one nearby.' },
  // receiver · application
  { id: 'status', layer: 'app', x: 127 + RX, z: 6, term: 'HTTP status codes', text: '200 OK, 301 Moved, 404 Not Found, 500 Server Error. The first digit tells the story: 2xx success, 3xx redirect, 4xx your mistake, 5xx the server\'s.' },
];
