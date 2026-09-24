# 📦 Packet Quest

A 3D serious game, built with [Three.js](https://threejs.org), that teaches the **TCP/IP stack** by making you the packet.

Packet Quest is a set of seven chapters. Each one is a practical, everyday thing people do online, played in its own 3D world. Pick one from the scenario menu:

| Chapter | Scenario | World | What it adds |
| --- | --- | --- | --- |
| 1 | 🐱 Loading a website | The physical internet: Wi-Fi, fibre, undersea cable, data centre | Connection reuse, the browser cache (304) |
| 2 | 📹 Joining a video call | The deep ocean | Why calls use UDP, speed-of-light delay through undersea cables |
| 3 | ✉️ Sending an email | The postal kingdom | MX records in DNS, SMTP between mail servers |
| 4 | 💾 Downloading a file | The railway (you are a train, headers are wagons) | TCP flow control, resuming with HTTP Range |
| 5 | 🎬 Streaming a video | Space stations | Adaptive bitrate chunks, CDNs |
| 6 | 🎮 Playing an online game | The block (voxel) world | UDP for game state, ping |
| 7 | 💬 Sending a chat message | The neon cyberpunk city | Long-lived connections, end-to-end encryption |

Every chapter plays the same core lesson. You are Alice's request, and in each world you:

1. **Down the sender's stack.** Walk down four plateaus, one per layer. At each station you answer questions and get wrapped in that layer's header (encapsulation).
   - **Application** · DNS lookup, choosing HTTPS on port 443
   - **Transport** · the TCP three-way handshake, ACK numbers, segmentation by MSS
   - **Internet** · IP addressing, TTL, "is the destination on my subnet?"
   - **Link** · ARP, next-hop MAC addresses, the frame checksum
2. **Across the network.** Fly as bits from router to router. At each router you pick the next hop from its routing table (longest prefix match), watch the TTL drop, the frame get rebuilt, and NAT rewrite the source address. Halfway, a congested link **drops** you: work out how TCP detects the loss, what the retransmitted copy looks like and why TCP then slows down.
3. **Up the receiver's stack.** Climb back up while each layer checks and strips its header (decapsulation): accept the right frame, verify TTL, get past the server's firewall (first matching rule wins), check the protocol field, reassemble TCP segments by sequence number and deliver to the right port.

The **Packet anatomy** panel shows your current headers and their fields at all times. Correct first answers are worth 100 points, with fewer points for later tries and an explanation for every wrong answer.

### The worlds

Each world is its own page, so the menu loads instantly and a world's 3D code only downloads when you pick it. The intro card of every chapter shows the scenario's story and a few real-life facts; the end card repeats them and remembers your best score per chapter, which the menu shows.

The ocean, railway and space worlds include the later polish rounds: minimap, holographic routing tables over the routers, adaptive graphics quality, touch controls, a loading screen and an intro flythrough with a soundscape. The physical internet, postal kingdom, block world and neon city were built before those rounds and don't have them yet.

### Extras

- **Explore freely.** From the start or end screen: every gate opens, and ferry pads fly you across the network between Alice's side and the server's side. Sprint with `Shift`, jump with `Space`.

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

| Path | What it holds |
| --- | --- |
| `index.html`, `src/menu/` | The scenario menu (no Three.js, so it opens instantly). Thumbnails live in `public/thumbs/`. |
| `src/shared/scenarios.js` | The seven scenarios: story, server, the request you carry, two scenario questions and the real-life facts. |
| `src/shared/content.js` | The shared lesson. `buildContent(scenario)` builds every station's steps for one scenario; the page's scenario comes from `<html data-scenario>`. |
| `src/shared/scenario-ui.js` | Puts the chapter title, story, facts and the "All scenarios" button on a world's start and end cards. |
| `src/shared/logic/` | Pure networking helpers and the Router Rush generator, covered by tests. |
| `src/shared/` (rest) | Code that several worlds use unchanged: labels, tween, perf tuning, touch controls, glossary. |
| `worlds/<world>/index.html` | One page per world. |
| `src/worlds/<world>/` | That world's own code: `main.js`, `game.js`, `world.js` and its scenery modules (`geography.js`, `ocean.js`, `kingdom.js`, `trains.js`, `space.js`, `voxel/`, `city.js`). |

Steps in `src/shared/content.js` are plain data (`info`, `choice` or `order`) with optional `onEnter` / `onSolve` hooks, so adding a station is mostly writing questions.

## Deploying

The build is a static site with relative paths. `.github/workflows/pages.yml` publishes it to GitHub Pages on every push to `main` once Pages is set to "GitHub Actions" in the repository settings.
