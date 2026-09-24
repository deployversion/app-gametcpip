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

### The world: a railway

**You are the train.** The locomotive is the request, and every layer couples a wagon behind it. A new header always goes straight behind the engine, in front of what was already there, just as a header goes in front of the data it wraps: HTTP cargo, then a TCP box van, an IP tank wagon and an Ethernet van, with a red-lamped caboose at the end for the frame's checksum (FCS). On the way up the receiver's stack the wagons are uncoupled one by one, and at every router the Ethernet van and caboose come off and a new pair is coupled on (a new frame per hop).

Every layer is a different kind of railway place:
- **Application** · the grand terminal, with a clock tower, an iron canopy, a DNS enquiries kiosk and a departures board where the platform is the port (the receiver's board shows arrivals)
- **Transport** · the freight yard: segment wagons numbered by sequence number, containers labelled by port, a gantry crane, a turntable, and three semaphores that play out SYN, SYN-ACK, ACK
- **Internet** · the junction: a signal box, fingerposts that read like a routing table, a TTL board counting down, and a signal gantry over diverging tracks
- **Link** · the engine shed with MAC addresses on its doors, telegraph wires carrying pulses (bits on the wire) and a radio mast for Wi-Fi

Locked gates are level crossings whose barriers lift when you solve the station, and each station's semaphore clears. The network is a valley of stone viaducts between junction towers; other trains run the lines, and when the congested line near R4 drops you, the train derails off the viaduct. Around it all: a golden-hour sky, mountains, a forest, villages, a river, birds, and two trains circling the whole valley on a ring viaduct. Bloom glow can be toggled with ✨.

Graphics detail tunes itself: if the frame rate drops, the game lowers resolution, then glow, then shadows, until it runs smoothly. Clicking ✨ switches to manual. On phones and tablets a joystick, jump and use buttons appear, and you can pinch to zoom. While the start card is up, the camera flies along the whole line with a caption naming each layer, and a soft generated soundscape (a drone, server hiss and data blips tuned to each layer) plays under the sound effects.

### Extras

- **Explore freely.** From the start or end screen: every gate opens, and Express platforms carry you across the network between Alice's side and the server's side. Sprint with `Shift`, jump with `Space`.

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
| `src/world.js` | The 3D world: platforms, stations, level crossings, junctions, viaducts, network traffic and Express platforms. |
| `src/environment.js` | The railway scenery of each layer (terminal, freight yard, junction, engine shed). |
| `src/landscape.js` | The valley around it: mountains, forest, villages, the ring railway, clouds and birds. |
| `src/trains.js` | Shared rolling stock, track and steam. |
| `src/packet.js` | You: the locomotive and the wagons that follow its trail. |
| `src/effects.js` | Sky, valley floor and river, and the bloom post-processing. |
| `src/game.js` | Game loop, movement, camera, station flow and network flight. |
| `src/ui.js` | HUD, packet anatomy card and the station panel that runs the steps. |

Steps in `src/content.js` are plain data (`info`, `choice` or `order`) with optional `onEnter` / `onSolve` hooks, so adding a station is mostly writing questions.

## Deploying

The build is a static site with relative paths. `.github/workflows/pages.yml` publishes it to GitHub Pages on every push to `main` once Pages is set to "GitHub Actions" in the repository settings.
