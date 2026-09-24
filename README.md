# ✉️ Packet Quest

A 3D serious game, built with [Three.js](https://threejs.org), that teaches the **TCP/IP stack** by making you the packet.

Alice wants a cat picture from `catpics.example`. You are her HTTPS request:

1. **Down the sender's stack.** Walk down four plateaus, one per layer. At each station you answer questions and get wrapped in that layer's header (encapsulation).
   - **Application** · DNS lookup, choosing HTTPS on port 443
   - **Transport** · the TCP three-way handshake, ACK numbers, segmentation by MSS
   - **Internet** · IP addressing, TTL, "is the destination on my subnet?"
   - **Link** · ARP, next-hop MAC addresses, the frame checksum
2. **Across the network.** Fly as bits from router to router. At each router you pick the next hop from its routing table (longest prefix match), watch the TTL drop, the frame get rebuilt, and NAT rewrite the source address. Halfway, a congested link **drops** you: work out how TCP detects the loss, what the retransmitted copy looks like and why TCP then slows down.
3. **Up the receiver's stack.** Climb back up while each layer checks and strips its header (decapsulation): accept the right frame, verify TTL, get past the server's firewall (first matching rule wins), check the protocol field, reassemble TCP segments by sequence number and deliver to the right port.

The **Packet anatomy** panel shows your current headers and their fields at all times. Correct first answers are worth 100 points, with fewer points for later tries and an explanation for every wrong answer.

### The world: the Postal Kingdom

The stack is a castle town built down a cliff, and you are a letter.

- **Alicehold** (the sender) has four terraces, one per layer, joined by stone stairs and closed by gatehouses whose portcullis rises when you solve the station:
  - **The Royal Scriptorium** (Application): Alice's tower with a scrying mirror showing her request, a keep with banners, floating scrolls for every kind of message (HTTP, SMTP, video, chat) and the Herald's Registry, a DNS booth that turns names into addresses.
  - **The Courier Guild** (Transport): a wall of pigeonholes, one cubby per port, a wax-seal press stamping sequence numbers, a chute of numbered envelopes, heraldic pennants for SYN, ACK, FIN and RST, a dovecote with circling carrier pigeons and a hoist for mail sacks.
  - **Crossroads Post Office** (Internet): signposts that are routing table rows, royal pillar postboxes, a golden armillary sphere and a windmill.
  - **Harbour Stables** (Link): stalls, horse-drawn mail carts shuttling between neighbours, a bell tower that rings frames over the air (Wi-Fi) and the stablemaster's board that learns which cart tag lives in which stall (a switch).
- **The Sea of Routes** (the network): every router is a lighthouse watchtower on its own island, joined by golden sky-roads. Carrier pigeons fly every road, boats bob between the islands and other kingdoms stand on the horizon under snow-capped mountains.
- **Catpics Keep** (the receiver) mirrors Alicehold on the way up, ending at the Treasury of Cats where the picture is kept.

Your letter gets a new translucent envelope, tied with the layer's ribbon and stamped with its wax seal, at every layer on the way down, and loses one at every layer on the way up. Couriers wander every terrace and the whole scene sits in a golden-hour sky, with bloom glow on the lanterns (toggle with ✨).

### Extras

- **Explore freely.** From the start or end screen: every portcullis rises, and ferry piers carry you across the Sea of Routes between Alicehold and Catpics Keep. Sprint with `Shift`, jump with `Space`.

- **Knowledge orbs.** 14 glowing `?` orbs are hidden on the terraces. Walk through one to unlock a glossary card (DNS, TLS, UDP, flow control, IPv6, ICMP, switches, Wi-Fi, MTU, private addresses, traceroute, sockets, QUIC, HTTP status codes). Open the glossary with `G` or the 📖 button.
- **Learning report.** The end screen lists every topic you practised, marks the ones that took more than one try as "worth another look", and remembers your best score.
- **Router Rush.** A 60-second bonus game from the start or end screen: random routing tables, one destination, pick the winning row. Streaks multiply your points, wrong answers cost 5 seconds and the tables get harder every 5 correct answers.
- **Sound.** Synthesized with the Web Audio API (no audio files). Toggle with the 🔊 button.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | `W` `A` `S` `D` or arrow keys, or click the ground | Tap the ground |
| Sprint / jump | `Shift` / `Space` | |
| Look around | Drag | Drag |
| Zoom | Scroll wheel | |
| Use a station | `E` / `Enter`, or click it | Tap the prompt |
| Glossary | `G` (close with `Esc`) | Tap 📖 |

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests for the networking logic and the lesson content
npm run build    # static build in dist/
```

## Project layout

| File | What it holds |
| --- | --- |
| `src/content.js` | The whole lesson: network constants, routing tables and every station's steps. Edit this to change or translate questions. |
| `src/logic/net.js` | Pure helpers (CIDR matching, longest prefix match, firewall rule matching, segmentation, TTL) used by the content and covered by tests. |
| `src/logic/rush.js` | Seeded question generator for Router Rush. |
| `src/glossary.js` | Knowledge orb cards and where they are hidden. |
| `src/rush.js` | The Router Rush bonus game UI. |
| `src/sound.js` | Synthesized sound effects. |
| `src/world.js` | The 3D world: terrain, layer terraces, stations, gatehouses, watchtower routers, sky-roads and ferry piers. |
| `src/kingdom.js` | The Postal Kingdom scenery for each terrace, couriers, pigeons, trees, mountains and clouds. |
| `src/effects.js` | Bloom post-processing, the golden-hour sky dome and the sea shader. |
| `src/packet.js` | The player avatar: the data core plus one shell per header. |
| `src/game.js` | Game loop, movement, camera, station flow and network flight. |
| `src/ui.js` | HUD, packet anatomy card and the station panel that runs the steps. |

Steps in `src/content.js` are plain data (`info`, `choice` or `order`) with optional `onEnter` / `onSolve` hooks, so adding a station is mostly writing questions.

## Deploying

The build is a static site with relative paths. `.github/workflows/pages.yml` publishes it to GitHub Pages on every push to `main` once Pages is set to "GitHub Actions" in the repository settings.
