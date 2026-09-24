# 📦 Packet Quest

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

### The world: two space stations

Alice lives on **Terra-1**, a station orbiting a blue planet with city lights on its night side. `catpics.example` runs on **Kepler Station**, beside a ringed gas giant. Each station's four layer decks are rooms of the ship:

- **Deck 4 · the Bridge** (application): a panoramic window, crew consoles with live telemetry, holographic app windows on projector beams and a comms dish that is the DNS resolver.
- **Deck 3 · the Cargo Bay** (transport): cargo pods sorted by port, a robot arm, a docked segment shuttle, SYN/ACK/FIN/RST pennants and a maglev belt of TCP segments.
- **Deck 2 · the Nav Deck** (internet): a holographic star chart where every planet is a network labelled with its prefix and a packet hops between them, nav beacons with routing arrows and pneumatic mail tubes.
- **Deck 1 · Engineering** (link): a plasma reactor, blinking server racks, a power conduit, a Wi-Fi mast, a switch and the airlock to open space.

Between the stations is the network: relay satellites (the routers) joined by laser links, drifting through an asteroid belt. Around it all are a procedural nebula sky with twinkling stars, a sun, a moon, a rotating habitat ring, solar arrays, thrusters, ships on far-off traffic lanes, distant stations and the odd shooting star. Maintenance drones and other packets float around the decks. Gravity is low, so jumps float. Bloom glow can be toggled with ✨.

Graphics detail tunes itself: if the frame rate drops, the game lowers resolution, then glow, then shadows, until it runs smoothly. Clicking ✨ switches to manual. On phones and tablets a joystick, jump and use buttons appear, and you can pinch to zoom. While the start card is up, the camera flies over the whole journey with a caption naming each layer, and a soft generated soundscape (a drone, server hiss and data blips tuned to each layer) plays under the sound effects.

### Extras

- **Explore freely.** From the start or end screen: every airlock opens, and a shuttle pad on each station flies you across the network to the other one. Sprint with `Shift`, jump with `Space`.

- **Knowledge orbs.** 14 glowing `?` orbs are hidden on the plateaus. Walk through one to unlock a glossary card (DNS, TLS, UDP, flow control, IPv6, ICMP, switches, Wi-Fi, MTU, private addresses, traceroute, sockets, QUIC, HTTP status codes). Open the glossary with `G` or the 📖 button.
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
| `src/world.js` | The 3D world: station hulls and decks, stations, airlock gates, relay satellites, laser links, network traffic and shuttle pads. |
| `src/environment.js` | The rooms on every layer deck, drones and packets, the shuttle model and prop colliders. |
| `src/space.js` | Nebula sky, sun, planets (shader surfaces, atmospheres, rings), asteroids, ship traffic, shooting stars, distant stations. |
| `src/effects.js` | Bloom post-processing. |
| `src/packet.js` | The player avatar: the data core plus one shell per header. |
| `src/game.js` | Game loop, movement, camera, station flow and network flight. |
| `src/ui.js` | HUD, packet anatomy card and the station panel that runs the steps. |

Steps in `src/content.js` are plain data (`info`, `choice` or `order`) with optional `onEnter` / `onSolve` hooks, so adding a station is mostly writing questions.

## Deploying

The build is a static site with relative paths. `.github/workflows/pages.yml` publishes it to GitHub Pages on every push to `main` once Pages is set to "GitHub Actions" in the repository settings.
