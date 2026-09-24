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

### The world

The whole journey happens under the sea. The sender's and receiver's stacks are **coral reef terraces** stepping down into the deep, and the network is a **trench** of undersea cables and bathysphere router stations (like the real internet, where undersea cables carry most traffic between continents). Each layer has its own reef: **sunlit shallows** with app bubbles, a turtle and a giant DNS clam, a **kelp forest wreck** whose spilled containers carry port numbers, with SYN/ACK/FIN/RST buoys and a current of TCP segments, a **seamount** with a glowing internet globe, driftwood routing signposts and messages in bottles, and a **cable landing station** where the undersea cable comes ashore, with an acoustic modem (radio barely works underwater) and a switch. The server itself lives in an underwater data centre pod. Caustic light dances on the sand, light shafts slant down from the rippling surface, marine snow drifts past, and fish shoals, jellyfish, manta rays and a whale swim around. The water darkens as you go deeper over the trench, and the packet leaves a trail of bubbles. Other people's packets wander the reefs and zip along every cable, with bloom glow (toggle with ✨). Graphics detail tunes itself: if the frame rate drops, the game lowers resolution, then glow, then shadows, until it runs smoothly. Clicking ✨ switches to manual. On phones and tablets a joystick, jump and use buttons appear, and you can pinch to zoom. While the start card is up, the camera flies over the whole journey with a caption naming each layer, and a soft generated soundscape (a drone, data blips tuned to each layer and a rumble of water that deepens in the trench) plays under the sound effects.

### Extras

- **Explore freely.** From the start or end screen: every gate opens, and current pads carry you across the deep between Alice's side and the server's side. Sprint with `Shift`, swim up with `Space`.

- **Knowledge pearls.** 14 glowing `?` pearls sit in clams on the reefs. Press `Q` for a sonar ping that lights up the pearls nearby. Swim through one to unlock a glossary card (DNS, TLS, UDP, flow control, IPv6, ICMP, switches, Wi-Fi, MTU, private addresses, traceroute, sockets, QUIC, HTTP status codes). Open the glossary with `G` or the 📖 button.
- **Learning report.** The end screen lists every topic you practised, marks the ones that took more than one try as "worth another look", and remembers your best score.
- **Router Rush.** A 60-second bonus game from the start or end screen: random routing tables, one destination, pick the winning row. Streaks multiply your points, wrong answers cost 5 seconds and the tables get harder every 5 correct answers.
- **Sound.** Synthesized with the Web Audio API (no audio files). Toggle with the 🔊 button.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | `W` `A` `S` `D` or arrow keys, or click the ground | Tap the ground |
| Sprint / swim up | `Shift` / `Space` | |
| Sonar ping | `Q` | |
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
| `src/world.js` | The 3D world: layer plateaus, stations, gates, routers, cables, network traffic and ferry pads. |
| `src/environment.js` | Themed reef scenery per layer, wandering NPC packets and prop colliders. |
| `src/ocean.js` | Underwater building blocks: caustics, sky and surface, light shafts, marine snow, bubbles, coral, kelp and sea life. |
| `src/effects.js` | Bloom post-processing. |
| `src/packet.js` | The player avatar: the data core plus one shell per header. |
| `src/game.js` | Game loop, movement, camera, station flow and network flight. |
| `src/ui.js` | HUD, packet anatomy card and the station panel that runs the steps. |

Steps in `src/content.js` are plain data (`info`, `choice` or `order`) with optional `onEnter` / `onSolve` hooks, so adding a station is mostly writing questions.

## Deploying

The build is a static site with relative paths. `.github/workflows/pages.yml` publishes it to GitHub Pages on every push to `main` once Pages is set to "GitHub Actions" in the repository settings.
