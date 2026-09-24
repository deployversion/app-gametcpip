// Treasure chests hidden off the paved path. Walk up to one to open it and
// read a networking fun fact. Positions are in the explore zone
// (PATH_HALF_WIDTH < |z| <= EXPLORE_HALF_WIDTH), before each plateau's gate.

export const SECRETS = [
  {
    id: 'lo', x: -117, z: 21, title: 'The first message',
    text: 'The very first message on the ARPANET, in October 1969, was meant to be "LOGIN". The receiving computer crashed after two letters, so the first word ever sent over the network was "LO".',
  },
  {
    id: 'flagday', x: -93, z: -17, title: 'Flag day',
    text: 'On 1 January 1983 the whole ARPANET switched to TCP/IP on a single day. Computers that did not speak TCP/IP were simply cut off.',
  },
  {
    id: 'ports', x: -66, z: 22, title: '65,535 ports',
    text: 'Port numbers stop at 65,535 because the port field in a TCP or UDP header is 16 bits wide. Ports below 1024 are "well known": 80 for HTTP, 443 for HTTPS, 53 for DNS.',
  },
  {
    id: 'ttl-seconds', x: -40, z: -18, title: 'TTL was meant as seconds',
    text: 'The IPv4 standard (RFC 791) defines TTL in seconds. In practice every router just subtracts 1, so TTL really counts hops. IPv6 made that honest and renamed it "Hop Limit".',
  },
  {
    id: 'cables', x: -14, z: 17, title: 'Cables under the sea',
    text: 'Almost all traffic between continents travels through fiber-optic cables on the ocean floor, not satellites. Some are thinner than a garden hose.',
  },
  {
    id: 'localhost', x: 80, z: 22, title: 'There is no place like 127.0.0.1',
    text: '127.0.0.1 is "localhost": your own computer. Packets sent there go down and back up your own stack without ever touching a network card.',
  },
  {
    id: 'light', x: 106, z: -17, title: 'The speed of light is slow',
    text: 'Light in glass fiber travels about 200,000 km per second. A reply from the other side of the world (20,000 km each way) therefore takes at least 0.2 seconds, however fast the routers are.',
  },
  {
    id: 'oui', x: 138, z: 20, title: 'Who made your network card?',
    text: 'A MAC address is 48 bits long. The first 24 bits (the OUI) identify the manufacturer, so f0:9f:c2 tells you which company built the card.',
  },
];
