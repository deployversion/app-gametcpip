// Game content: the mission, the network, and every station's steps.
// Steps are data; the game engine (src/game.js + src/ui.js) renders them.
//
// Step types
//   info   { text, button?, onEnter?(g) }
//   choice { text, options: [{ label, correct?, why }], table?, onSolve?(g) }
//   order  { text, items: [label, ...] (in the correct order), onSolve?(g) }
//
// Hooks receive the game API `g` (see Game#api in src/game.js).

import { longestPrefixMatch, segmentSeqNumbers, segmentCount, ttlAfterHops } from './logic/net.js';

export const LAYERS = {
  app: { name: 'Application', num: 4, color: '#b56cff', pdu: 'Data', header: 'HTTP' },
  transport: { name: 'Transport', num: 3, color: '#ff8a3d', pdu: 'Segment', header: 'TCP' },
  internet: { name: 'Internet', num: 2, color: '#35d07f', pdu: 'Packet', header: 'IP' },
  link: { name: 'Link', num: 1, color: '#3d9bff', pdu: 'Frame', header: 'Ethernet' },
};

export const NET = {
  client: { name: "Alice's laptop", ip: '192.168.1.20', prefix: 24, mac: 'a4:5e:60:c2:19:07' },
  gateway: { name: 'Home router', ip: '192.168.1.1', mac: 'f0:9f:c2:0a:11:01', publicIp: '198.51.100.7' },
  server: { name: 'catpics.example', ip: '203.0.113.80', mac: '00:1b:44:11:3a:b7' },
  srcPort: 51514,
  dstPort: 443,
  clientIsn: 1000,
  serverIsn: 5000,
  mss: 1460,
  requestBytes: 4000,
  ttl: 64,
};

// The routers the packet visits, in order. `table` rows are what the player
// sees; the right answer is always the longest prefix match for the server IP.
export const ROUTES = [
  {
    id: 'GW',
    name: 'Home router',
    table: [
      { dest: '192.168.1.0/24', hop: 'LAN (deliver directly)' },
      { dest: '0.0.0.0/0', hop: 'R1 (your ISP)' },
    ],
    options: ['LAN', 'R1'],
    frame: { src: 'f0:9f:c2:0a:11:02', dst: '5c:5e:ab:10:00:01' },
  },
  {
    id: 'R1',
    name: 'ISP router R1',
    table: [
      { dest: '10.0.0.0/8', hop: 'R2' },
      { dest: '203.0.0.0/8', hop: 'R3' },
      { dest: '203.0.113.0/24', hop: 'R4' },
      { dest: '0.0.0.0/0', hop: 'R5' },
    ],
    options: ['R2', 'R3', 'R4', 'R5'],
    frame: { src: '5c:5e:ab:10:00:04', dst: '5c:5e:ab:40:00:01' },
  },
  {
    id: 'R4',
    name: 'Backbone router R4',
    table: [
      { dest: '203.0.113.128/25', hop: 'R6' },
      { dest: '203.0.113.0/25', hop: 'Server LAN (deliver directly)' },
      { dest: '0.0.0.0/0', hop: 'R1' },
    ],
    options: ['R6', 'SW', 'R1'],
    frame: { src: '5c:5e:ab:40:00:09', dst: NET.server.mac },
  },
];

export function routeAnswer(route) {
  return longestPrefixMatch(route.table, NET.server.ip);
}

const SEQS = segmentSeqNumbers(NET.clientIsn, NET.requestBytes, NET.mss);
const ARRIVAL_TTL = ttlAfterHops(NET.ttl, ROUTES.length);

function routeStep(route, index) {
  const best = routeAnswer(route);
  return {
    type: 'choice',
    text: `Destination IP is <b>${NET.server.ip}</b>. Pick the routing table row this router uses.`,
    table: { headers: ['Destination', 'Next hop'] },
    options: route.table.map((row, i) => {
      const matches = longestPrefixMatch([row], NET.server.ip) === 0;
      let why;
      if (i === best) why = `${row.dest} matches and it is the most specific (longest) prefix that matches.`;
      else if (matches) why = `${row.dest} does match, but a longer, more specific prefix also matches. Routers always prefer the longest prefix.`;
      else why = `${NET.server.ip} is not inside ${row.dest}, so this row does not match.`;
      return { label: [row.dest, row.hop], correct: i === best, why };
    }),
    onSolve: (g) => g.routeTo(index, route.options[best]),
  };
}

export const STATIONS = [
  // ---------------------------------------------------------------- sender
  {
    id: 'send-app',
    side: 'sender',
    layer: 'app',
    title: 'Browser Terminal',
    objective: 'Walk to the purple Browser Terminal',
    steps: [
      {
        type: 'info',
        text: `<p>You are a message waiting to be born inside <b>${NET.client.name}</b>.</p>
          <p>Alice just typed <code>https://${NET.server.name}/cat.png</code> into her browser. Your mission: carry that request across the internet to the web server, and get a cat picture back.</p>
          <p>Every layer of the <b>TCP/IP stack</b> will wrap you in its own header on the way down, and unwrap you on the way up.</p>`,
        button: "Let's go",
      },
      {
        type: 'choice',
        text: `The browser only knows the name <code>${NET.server.name}</code>. What has to happen first to find the server's address?`,
        options: [
          { label: 'A DNS lookup', correct: true, why: `DNS turns names into IP addresses. The resolver answers: ${NET.server.name} is ${NET.server.ip}.` },
          { label: 'An ARP request', why: 'ARP finds MAC addresses on your local network. It cannot resolve names on the internet.' },
          { label: 'A TCP handshake', why: 'You cannot open a connection yet: you do not know which IP address to connect to.' },
          { label: 'A ping', why: 'Ping tests whether a host is reachable, but you still need its address first.' },
        ],
        onSolve: (g) => g.toast(`DNS: ${NET.server.name} → ${NET.server.ip}`),
      },
      {
        type: 'choice',
        text: 'Which application protocol and port does the browser use for a secure web page?',
        options: [
          { label: 'HTTPS on port 443', correct: true, why: 'HTTPS is HTTP inside TLS encryption. Web servers listen for it on the well-known port 443.' },
          { label: 'HTTP on port 80', why: 'Port 80 is plain, unencrypted HTTP. The address starts with https://, so we want encryption.' },
          { label: 'SMTP on port 25', why: 'SMTP is for sending e-mail, not fetching web pages.' },
          { label: 'SSH on port 22', why: 'SSH is for remote terminal logins.' },
        ],
      },
      {
        type: 'info',
        text: `<p>The browser writes the request. This is the <b>application data</b>, the precious cargo at your core:</p>
          <pre>GET /cat.png HTTP/1.1\nHost: ${NET.server.name}</pre>
          <p>TLS encrypts it so nobody along the way can read it. Now head down the ramp to the <b>Transport</b> layer.</p>`,
        button: 'Become the data',
        onEnter: (g) => g.setLayer('app', { proto: 'HTTPS (TLS)', data: 'GET /cat.png' }),
      },
    ],
  },
  {
    id: 'send-transport',
    side: 'sender',
    layer: 'transport',
    title: 'Handshake Harbor',
    objective: 'Go down to the orange Handshake Harbor',
    steps: [
      {
        type: 'info',
        text: `<p>The <b>Transport layer</b> gets data reliably from one program to another. The browser uses <b>TCP</b>, which first sets up a connection with a <b>three-way handshake</b>.</p>
          <p>The server lives far away on the other side of the network. Let's knock on its door.</p>`,
      },
      {
        type: 'choice',
        text: 'Which TCP flag do you send first to open the connection?',
        options: [
          { label: 'SYN', correct: true, why: `SYN = "synchronize". It carries your starting sequence number, seq=${NET.clientIsn}.` },
          { label: 'ACK', why: 'Nothing has been received yet, so there is nothing to acknowledge.' },
          { label: 'FIN', why: 'FIN closes a connection. We have not opened one yet.' },
          { label: 'RST', why: 'RST aborts a connection. That would be rude before saying hello.' },
        ],
        onSolve: (g) => g.fx.handshake('SYN', 'out'),
      },
      {
        type: 'info',
        text: `<p>The server answers with <b>SYN-ACK</b>: it acknowledges your SYN (<code>ack=${NET.clientIsn + 1}</code>) and sends its own starting number (<code>seq=${NET.serverIsn}</code>).</p>`,
        button: 'Received it',
        onEnter: (g) => g.fx.handshake('SYN-ACK', 'in'),
      },
      {
        type: 'choice',
        text: `Finish the handshake with an ACK. Which acknowledgement number do you send back?`,
        options: [
          { label: `ack=${NET.serverIsn + 1}`, correct: true, why: `An ACK number is "the next byte I expect". The SYN used up seq ${NET.serverIsn}, so you expect ${NET.serverIsn + 1}.` },
          { label: `ack=${NET.serverIsn}`, why: `That would re-request the SYN itself. You want the next number after it.` },
          { label: `ack=${NET.clientIsn + 1}`, why: 'That is your own sequence number, not the server\'s.' },
          { label: 'ack=0', why: 'Zero would acknowledge nothing at all.' },
        ],
        onSolve: (g) => g.fx.handshake('ACK', 'out'),
      },
      {
        type: 'choice',
        text: `Connection open! The request is ${NET.requestBytes} bytes, but each segment can carry at most ${NET.mss} bytes (the MSS). How many segments does TCP need?`,
        options: [
          { label: String(segmentCount(NET.requestBytes, NET.mss)), correct: true, why: `${NET.requestBytes} / ${NET.mss} = ${(NET.requestBytes / NET.mss).toFixed(2)}, rounded up. Each segment gets a sequence number: ${SEQS.join(', ')}. You ride in the first one.` },
          { label: String(segmentCount(NET.requestBytes, NET.mss) - 1), why: 'That would leave some bytes behind. Always round up.' },
          { label: '1', why: 'The data is larger than the MSS, so it cannot fit in one segment.' },
          { label: '4000', why: 'TCP segments hold many bytes each, not one.' },
        ],
      },
      {
        type: 'info',
        text: `<p>TCP wraps you in its header. You are now a <b>segment</b>.</p>
          <p>Source port <code>${NET.srcPort}</code> (picked at random by Alice's laptop) and destination port <code>${NET.dstPort}</code> (HTTPS) tell the two computers <i>which programs</i> are talking.</p>`,
        button: 'Wrap me in TCP',
        onEnter: (g) => g.setLayer('transport', { srcPort: NET.srcPort, dstPort: NET.dstPort, seq: SEQS[0], ack: NET.serverIsn + 1, flags: 'PSH ACK' }),
      },
    ],
  },
  {
    id: 'send-internet',
    side: 'sender',
    layer: 'internet',
    title: 'Address Office',
    objective: 'Go down to the green Address Office',
    steps: [
      {
        type: 'info',
        text: '<p>The <b>Internet layer</b> (IP) moves packets between computers, across many networks. Its header holds the source and destination <b>IP addresses</b>.</p>',
      },
      {
        type: 'choice',
        text: 'Which destination IP address goes in the header?',
        options: [
          { label: NET.server.ip, correct: true, why: 'The IP destination is always the final destination: the web server DNS told you about.' },
          { label: NET.gateway.ip, why: 'The gateway is only the first stop. The IP header keeps the final destination for the whole trip.' },
          { label: '8.8.8.8', why: 'That is a public DNS resolver, not the web server.' },
        ],
      },
      {
        type: 'choice',
        text: `Every packet gets a TTL (time to live) of ${NET.ttl}. Each router lowers it by one. What happens if it reaches 0?`,
        options: [
          { label: 'The router drops it and reports back', correct: true, why: 'The router discards the packet and sends an ICMP "Time Exceeded" message to the sender. This stops packets looping forever. The traceroute tool is built on this trick.' },
          { label: 'It is sent back to the sender', why: 'The packet itself is thrown away; only a small ICMP error goes back.' },
          { label: 'It is reset to 64', why: 'Then a packet stuck in a loop would circle forever.' },
        ],
      },
      {
        type: 'choice',
        text: `Alice's laptop is <code>${NET.client.ip}/${NET.client.prefix}</code>. Is <code>${NET.server.ip}</code> on the same local network?`,
        options: [
          { label: 'No, send it to the default gateway', correct: true, why: `With a /24 mask the local network is 192.168.1.x. ${NET.server.ip} is outside it, so the packet goes to the default gateway (the home router, ${NET.gateway.ip}).` },
          { label: 'Yes, deliver it directly', why: 'Compare the first 24 bits: 192.168.1 vs 203.0.113. They differ.' },
        ],
      },
      {
        type: 'info',
        text: '<p>IP wraps you in its header. You are now a <b>packet</b>. Head down to the <b>Link</b> layer to get onto the wire.</p>',
        button: 'Wrap me in IP',
        onEnter: (g) => g.setLayer('internet', { src: NET.client.ip, dst: NET.server.ip, ttl: NET.ttl, proto: 'TCP (6)' }),
      },
    ],
  },
  {
    id: 'send-link',
    side: 'sender',
    layer: 'link',
    title: 'Frame Foundry',
    objective: 'Go down to the blue Frame Foundry',
    steps: [
      {
        type: 'info',
        text: '<p>The <b>Link layer</b> moves frames across one physical network: Wi-Fi or an Ethernet cable. It uses hardware <b>MAC addresses</b>, not IP addresses.</p>',
      },
      {
        type: 'choice',
        text: `You need the MAC address of the gateway (${NET.gateway.ip}). How do you find it?`,
        options: [
          { label: 'Broadcast an ARP request', correct: true, why: `"Who has ${NET.gateway.ip}?" goes to every device on the LAN (ff:ff:ff:ff:ff:ff). The router answers: "That's me, ${NET.gateway.mac}".` },
          { label: 'Ask DNS', why: 'DNS maps names to IP addresses, not IP addresses to MAC addresses.' },
          { label: 'Guess it from the IP', why: 'MAC addresses are burned into network cards and unrelated to IP addresses.' },
        ],
        onSolve: (g) => g.fx.broadcast(),
      },
      {
        type: 'choice',
        text: 'Which destination MAC goes in the Ethernet frame?',
        options: [
          { label: `The gateway: ${NET.gateway.mac}`, correct: true, why: 'A frame only travels one hop. The IP header keeps the final destination; the MAC header names the next device on this link.' },
          { label: "The web server's MAC", why: 'The server is on another network. You cannot reach its network card directly, and you do not even know its MAC.' },
          { label: 'Broadcast: ff:ff:ff:ff:ff:ff', why: 'Broadcasting would bother every device on the LAN. You know exactly who the next hop is.' },
        ],
      },
      {
        type: 'info',
        text: `<p>Ethernet wraps you in a frame and adds a <b>checksum (FCS)</b> at the end, so the receiver can detect damage.</p>
          <p>You are now a <b>frame</b>, fully encapsulated: Ethernet ▸ IP ▸ TCP ▸ HTTPS data.</p>
          <p>The network card turns you into bits: electrical pulses, light or radio waves. Time to cross the internet!</p>`,
        button: 'Transmit!',
        onEnter: (g) => g.setLayer('link', { src: NET.client.mac, dst: NET.gateway.mac, type: 'IPv4', fcs: 'OK' }),
        onSolve: (g) => g.startNetwork(),
      },
    ],
  },
  // --------------------------------------------------------------- network
  ...ROUTES.map((route, index) => ({
    id: `route-${route.id}`,
    side: 'network',
    layer: 'internet',
    router: route.id,
    title: route.name,
    objective: 'Choose the next hop',
    steps: [
      {
        type: 'info',
        text: index === 0
          ? `<p>You arrive at the <b>${route.name}</b>. It checks the frame's MAC is its own, removes the old Ethernet frame and looks at the IP header.</p>
             <p><b>NAT:</b> your private source IP ${NET.client.ip} cannot be used on the internet, so the router swaps it for its public address <b>${NET.gateway.publicIp}</b> and remembers the mapping.</p>
             <p>It lowers the TTL: ${NET.ttl} → ${NET.ttl - 1}.</p>`
          : `<p>You arrive at <b>${route.name}</b>. Old frame off, TTL ${NET.ttl - index} → ${NET.ttl - index - 1}. Where next?</p>`,
        onEnter: (g) => g.routerArrive(index, index === 0 ? { src: NET.gateway.publicIp } : {}),
      },
      routeStep(route, index),
    ],
  })),
  // -------------------------------------------------------------- receiver
  {
    id: 'recv-link',
    side: 'receiver',
    layer: 'link',
    title: 'Frame Gate',
    objective: "You made it to the server's network. Walk to the blue Frame Gate",
    steps: [
      {
        type: 'info',
        text: `<p>You reached the web server. Now the stack runs in reverse: each layer checks its header, strips it off and hands the rest up. This is <b>decapsulation</b>.</p>
          <p>The server's network card has MAC <code>${NET.server.mac}</code>.</p>`,
      },
      {
        type: 'choice',
        text: 'Three frames arrive at the network card. Which one does it accept?',
        options: [
          { label: `dst ${NET.server.mac}, FCS ok`, correct: true, why: 'Addressed to this card and the checksum matches. Accepted!' },
          { label: `dst ${NET.server.mac}, FCS mismatch`, why: 'The checksum does not match, so the frame was damaged on the way. It is silently dropped (TCP will notice and resend).' },
          { label: 'dst 3c:22:fb:9e:01:02, FCS ok', why: 'That frame is for another device on this network. The card ignores it.' },
        ],
      },
      {
        type: 'choice',
        text: 'Which header does the Link layer remove before passing you up?',
        options: [
          { label: 'Ethernet', correct: true, why: 'Each layer removes only its own header: the outermost one comes off first.' },
          { label: 'IP', why: 'IP is inside the frame. The Internet layer will deal with it.' },
          { label: 'TCP', why: 'TCP is two layers further in.' },
        ],
        onSolve: (g) => g.removeLayer('link'),
      },
    ],
  },
  {
    id: 'recv-internet',
    side: 'receiver',
    layer: 'internet',
    title: 'IP Checkpoint',
    objective: 'Climb up to the green IP Checkpoint',
    steps: [
      {
        type: 'choice',
        text: `The packet left Alice's laptop with TTL ${NET.ttl} and passed ${ROUTES.length} routers. What TTL does the server see?`,
        options: [
          { label: String(ARRIVAL_TTL), correct: true, why: `${NET.ttl} − ${ROUTES.length} routers = ${ARRIVAL_TTL}. Every router lowered it by one.` },
          { label: String(NET.ttl), why: 'Every router on the way lowers the TTL by one.' },
          { label: String(ARRIVAL_TTL - 1), why: 'Count only the routers: the sender and receiver do not lower the TTL.' },
          { label: String(ROUTES.length), why: 'That is the number of hops, not what is left of the TTL.' },
        ],
      },
      {
        type: 'choice',
        text: 'The IP header\'s protocol field says <code>6</code>. Who gets the payload?',
        options: [
          { label: 'TCP', correct: true, why: 'Protocol number 6 is TCP (17 is UDP, 1 is ICMP). IP strips its header and hands the segment to TCP.' },
          { label: 'UDP', why: 'UDP is protocol number 17.' },
          { label: 'ICMP', why: 'ICMP is protocol number 1.' },
        ],
        onSolve: (g) => g.removeLayer('internet'),
      },
    ],
  },
  {
    id: 'recv-transport',
    side: 'receiver',
    layer: 'transport',
    title: 'Reassembly Dock',
    objective: 'Climb up to the orange Reassembly Dock',
    steps: [
      {
        type: 'order',
        text: 'The three segments took different paths and arrived out of order. Put them back in order by sequence number.',
        items: SEQS.map((s, i) => `seq=${s} (segment ${i + 1})`),
        why: 'TCP uses sequence numbers to rebuild the byte stream in the right order, and acknowledges what it received. Missing segments are sent again.',
      },
      {
        type: 'choice',
        text: `Which program receives the data? The TCP header says destination port <code>${NET.dstPort}</code>.`,
        options: [
          { label: 'The web server (443)', correct: true, why: 'Ports identify programs. The web server is listening on 443. TCP strips its header and hands over the data.' },
          { label: 'The SSH daemon (22)', why: 'SSH listens on port 22.' },
          { label: 'The mail server (25)', why: 'SMTP mail listens on port 25.' },
        ],
        onSolve: (g) => g.removeLayer('transport'),
      },
    ],
  },
  {
    id: 'recv-app',
    side: 'receiver',
    layer: 'app',
    title: 'Web Server',
    objective: 'Climb to the purple Web Server at the top',
    steps: [
      {
        type: 'info',
        text: `<p>TLS decrypts the data and the web server reads your request: <code>GET /cat.png</code>.</p>
          <p>It answers <code>HTTP/1.1 200 OK</code> with the cat picture, which takes the same trip back to Alice, in reverse.</p>`,
        button: 'Deliver the request',
      },
      {
        type: 'order',
        text: 'Final test! On the way down, in which order were the headers added?',
        items: ['HTTP data (Application)', 'TCP header (Transport)', 'IP header (Internet)', 'Ethernet frame (Link)'],
        why: 'Down the stack, each layer wraps what it gets from the layer above. The receiver unwraps in the opposite order.',
        onSolve: (g) => g.finish(),
      },
    ],
  },
];
