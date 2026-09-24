// The practical scenarios. Every chapter of Packet Quest is one everyday
// thing people do online, played in its own themed world. The TCP/IP lessons
// are shared (src/shared/content.js); each scenario adds its story, its server,
// the request you carry, two scenario questions and a few real-world facts.
//
// A world page picks its scenario with <html data-scenario="...">.

const opts = (list) => list.map(([label, why, correct]) => ({ label, why, ...(correct ? { correct: true } : {}) }));

export const SCENARIOS = [
  {
    id: 'website',
    world: 'physical',
    worldName: 'The physical internet',
    emoji: '🐱',
    title: 'Loading a website',
    blurb: 'Open a web page and follow the request through Wi-Fi, fibre, undersea cable and a data centre.',
    story: 'Alice opens <b>catpics.example</b> to look at a cat picture.',
    server: 'catpics.example',
    request: 'GET /cat.png',
    item: 'the cat picture',
    doneTitle: '🐱 Delivered!',
    appQuestion: {
      topic: 'Loading a whole page',
      text: 'The page also needs about 70 other files: pictures, scripts and style sheets. What does the browser do?',
      options: opts([
        ['Reuse the same connection for many requests', 'Opening a TCP connection and a TLS session costs a few round trips. HTTP keeps the connection open (and HTTP/2 even sends many requests at once over it), so the extra files come much faster.', true],
        ['Open a new connection for every single file', 'That works, but every new connection pays for a TCP and a TLS handshake again. Browsers avoid it.'],
        ['Ask for everything in one giant file', 'Web pages are built from many separate files, and the browser only learns which ones it needs while reading the page.'],
      ]),
    },
    recvQuestion: {
      topic: 'Browser cache',
      text: 'Alice reloads the page. For <code>style.css</code> the server now answers <code>304 Not Modified</code>. What does that mean?',
      options: opts([
        ['The copy in the browser cache is still good, so no need to download it again', 'The browser asked "has this changed since my copy?" and the server said no. That saves time and data.', true],
        ['The file was not found', 'That is 404 Not Found.'],
        ['The server crashed', 'Server errors are 5xx codes, like 500.'],
      ]),
    },
    facts: [
      'An average web page is around 2 MB, built from about 70 separate requests.',
      'The padlock in the address bar means the page came over TLS, and the server proved its name with a certificate.',
      'Big sites keep copies of their files on servers all over the world (a CDN), so the data does not have to cross an ocean.',
    ],
  },
  {
    id: 'video-call',
    world: 'ocean',
    worldName: 'The deep ocean',
    emoji: '📹',
    title: 'Joining a video call',
    blurb: 'Join a video call with Grandma in Sydney and dive along the undersea cables it travels through.',
    story: 'Alice clicks <b>Join</b> on a video call with her grandmother in Sydney. You are her join request: you set up the call, then her camera starts streaming.',
    server: 'meet.example',
    request: 'POST /rooms/grandma/join',
    item: 'the call details',
    doneTitle: '📹 You are in the call!',
    appQuestion: {
      topic: 'Why calls use UDP',
      text: 'You are the join request, so you travel over TCP. Once the call runs, the live video and sound use <b>UDP</b> instead. Why?',
      options: opts([
        ['A late video frame is useless, so resending it only adds delay', 'In a call, fresh beats complete. If a frame is lost, the app just shows the next one. TCP would pause everything to resend old data, and the call would lag.', true],
        ['UDP is more secure', 'UDP has no security of its own. Calls encrypt their media separately (SRTP).'],
        ['TCP cannot carry video', 'TCP carries video fine, for example when you stream a film. The problem is the waiting when something gets lost.'],
      ]),
    },
    recvQuestion: {
      topic: 'Speed of light delay',
      text: 'Sydney is about 16,000 km of undersea cable away. Light in glass fibre covers about 200 km per millisecond. What is the <b>least</b> one-way delay?',
      options: opts([
        ['About 80 ms', '16,000 ÷ 200 = 80 ms, before any router or computer has done anything. Round trip is at least 160 ms, which you can notice in a conversation.', true],
        ['About 8 ms', 'That would need light ten times faster than it goes in fibre.'],
        ['About 1 second', 'Much slower than light, even in glass. The delay you feel is mostly distance plus some queues.'],
      ]),
    },
    facts: [
      'About 99% of traffic between continents runs through cables on the sea floor, not satellites.',
      'Calls use a "jitter buffer": a few milliseconds of waiting that smooths out packets arriving unevenly.',
      'When the connection gets worse, the call app lowers the video quality instead of freezing.',
    ],
  },
  {
    id: 'email',
    world: 'kingdom',
    worldName: 'The postal kingdom',
    emoji: '✉️',
    title: 'Sending an email',
    blurb: 'Send an email from webmail. You are the letter, sealed in envelope after envelope.',
    story: 'Alice writes to Bob and presses <b>Send</b> in her webmail. You carry her email to her mail server.',
    server: 'mail.example',
    request: 'POST /mail/send',
    item: 'the delivery receipt',
    doneTitle: '✉️ Sent!',
    appQuestion: {
      topic: 'Finding a mail server (MX)',
      text: 'The email is for <code>bob@example.org</code>. How will Alice\'s mail server find out where mail for <code>example.org</code> goes?',
      options: opts([
        ['It looks up the MX record of example.org in DNS', 'DNS does more than websites: an MX (mail exchanger) record names the server that accepts mail for a domain.', true],
        ['It sends the email to every server on the internet', 'That would be spam on a planetary scale. Mail goes to exactly one server, found through DNS.'],
        ['It asks Bob\'s laptop directly', 'Bob\'s laptop is often off. Mail waits on Bob\'s mail server until he picks it up.'],
      ]),
    },
    recvQuestion: {
      topic: 'SMTP between mail servers',
      text: 'Alice\'s mail server now hands the email on to Bob\'s mail server. Which protocol do mail servers use to talk to each other?',
      options: opts([
        ['SMTP, on port 25', 'The Simple Mail Transfer Protocol has moved email between servers since 1982. Today the servers encrypt it with STARTTLS.', true],
        ['HTTPS, on port 443', 'That is how Alice\'s webmail reached her own server. Between mail servers, the protocol is SMTP.'],
        ['DNS, on port 53', 'DNS only helped find Bob\'s mail server. It does not carry the email.'],
      ]),
    },
    facts: [
      'Most emails pass through at least two mail servers: the sender\'s and the receiver\'s.',
      'Receiving servers check SPF and DKIM records in DNS to spot forged senders and spam.',
      'More than 300 billion emails are sent every day.',
    ],
  },
  {
    id: 'download',
    world: 'railway',
    worldName: 'The railway',
    emoji: '💾',
    title: 'Downloading a file',
    blurb: 'Download a big file. Your train of wagons shows how TCP moves bulk data reliably.',
    story: 'Alice downloads a 2 GB game installer. You are the request that starts the download.',
    server: 'downloads.example',
    request: 'GET /installer.zip',
    item: 'the 2 GB file',
    doneTitle: '💾 Download started!',
    appQuestion: {
      topic: 'Flow control',
      text: 'The file is 2 GB and the server can send faster than Alice\'s old laptop can save to disk. What stops the laptop from being flooded?',
      options: opts([
        ['TCP flow control: every ACK says how much room is left (the window)', 'The receiver advertises a window. When its buffer fills up, the window shrinks and the sender waits.', true],
        ['The router throws the extra data away', 'Routers do drop packets when their queues are full, but that is congestion, not a way to protect a slow receiver.'],
        ['The server guesses the laptop\'s speed', 'No guessing needed: the receiver tells the sender exactly how much it can take, in every ACK.'],
      ]),
    },
    recvQuestion: {
      topic: 'Resuming a download',
      text: 'The Wi-Fi drops after 1.2 GB. What lets the download continue instead of starting over?',
      options: opts([
        ['An HTTP Range request: "send me from byte 1,200,000,000 on"', 'The browser opens a new connection and asks only for the missing part. The server answers 206 Partial Content.', true],
        ['TCP remembers the old connection forever', 'A dropped connection is gone. TCP\'s sequence numbers only work inside one connection.'],
        ['Nothing: big downloads always restart', 'They used to, before HTTP added ranges. Now almost every download server supports resuming.'],
      ]),
    },
    facts: [
      'A 2 GB file is about 1.4 million TCP segments of 1460 bytes.',
      'Speeds are in bits: a 100 Mbit/s line downloads about 12.5 megabytes per second (divide by 8).',
      'Download pages often list a SHA-256 checksum, so you can check that not a single bit changed.',
    ],
  },
  {
    id: 'streaming',
    world: 'space',
    worldName: 'Space stations',
    emoji: '🎬',
    title: 'Streaming a video',
    blurb: 'Watch a series episode. Fly between space stations as the request for the next few seconds of video.',
    story: 'Alice is watching a series. You are the request for the next four seconds of the episode.',
    server: 'stream.example',
    request: 'GET /show/ep1/seg-042.mp4',
    item: 'the next chunk of video',
    doneTitle: '🎬 Keep watching!',
    appQuestion: {
      topic: 'Adaptive streaming',
      text: 'Streaming services cut every episode into chunks of a few seconds, each in several qualities. Why?',
      options: opts([
        ['So the player can switch quality chunk by chunk as the connection changes', 'This is adaptive bitrate streaming. When the Wi-Fi slows down, the next chunk comes in a lower quality instead of the video stopping.', true],
        ['Because TCP cannot carry large files', 'TCP carries files of any size. The chunks are about adapting quickly.'],
        ['To make piracy harder', 'Chunks do not stop copying. Their job is smooth playback.'],
      ]),
    },
    recvQuestion: {
      topic: 'CDN',
      text: 'Which server most likely answers you: the studio\'s origin server across the world, or one close to Alice?',
      options: opts([
        ['A CDN server close to Alice, with a copy of the episode', 'Streaming services put copies of popular shows in servers inside Alice\'s own internet provider. Shorter distance means faster starts and less load on long cables.', true],
        ['Always the origin server', 'That would send the same episode across oceans millions of times.'],
        ['Alice\'s own laptop', 'Alice does not have the episode yet. That is why she asks for it.'],
      ]),
    },
    facts: [
      'Video is about two thirds of all traffic on the internet.',
      'HD video needs about 5 Mbit/s; 4K needs 15 to 25 Mbit/s.',
      'The player keeps a buffer of upcoming seconds, so a short hiccup in the network goes unnoticed.',
    ],
  },
  {
    id: 'gaming',
    world: 'voxel',
    worldName: 'The block world',
    emoji: '🎮',
    title: 'Playing an online game',
    blurb: 'Join a multiplayer match in a world made of blocks, and learn why games care about ping.',
    story: 'Alice joins an online match with her friends. You are the request that finds her a game server.',
    server: 'play.example',
    request: 'POST /match/join',
    item: 'a seat in the match',
    doneTitle: '🎮 Match found!',
    appQuestion: {
      topic: 'Game traffic uses UDP',
      text: 'Once the match starts, the game sends Alice\'s moves 30 to 60 times a second. Which transport does it use for that?',
      options: opts([
        ['UDP: a lost update is replaced by the next one anyway', 'Where you were 50 ms ago no longer matters. UDP never stalls to resend old positions, which keeps the game snappy.', true],
        ['TCP: every move must arrive', 'One lost packet would make TCP hold back all newer moves until the old one is resent: that is lag.'],
        ['HTTPS, like the join request', 'The join request can afford to wait for a resend. Live moves cannot: a late move is worse than a missing one.'],
      ]),
    },
    recvQuestion: {
      topic: 'Ping (round-trip time)',
      text: 'The game shows Alice a <b>ping of 40 ms</b>. What does that measure?',
      options: opts([
        ['The time for a message to reach the server and the answer to come back', 'Ping is round-trip time. Below about 50 ms a game feels instant; above 150 ms players notice lag.', true],
        ['Her download speed', 'Speed (bandwidth) is how much data per second. Ping is about delay, which matters more for games.'],
        ['How many players are online', 'Ping has nothing to do with player counts.'],
      ]),
    },
    facts: [
      'Game servers run in many regions so every player gets a low ping.',
      'The server is the referee: it decides what really happened, so cheaters cannot just claim a hit.',
      'Games guess where other players move next (prediction) to hide the delay of the network.',
    ],
  },
  {
    id: 'chat',
    world: 'cyberpunk',
    worldName: 'The neon city',
    emoji: '💬',
    title: 'Sending a chat message',
    blurb: 'Send a message in a chat app, through a neon megacity, and see how it reaches your friend instantly.',
    story: 'Alice sends Bob "See you at 8?" in her chat app. You carry the message to the chat server.',
    server: 'chat.example',
    request: 'POST /messages',
    item: 'the ✓✓ delivered tick',
    doneTitle: '💬 Delivered ✓✓',
    appQuestion: {
      topic: 'Long-lived connections',
      text: 'Chat apps keep one connection to the server open all the time, instead of connecting for every message. Why?',
      options: opts([
        ['No handshakes per message, and the server can push new messages to Alice right away', 'An open connection (for example a WebSocket) means messages go out instantly, and Bob\'s replies arrive without Alice\'s phone having to ask.', true],
        ['Because TCP only allows one connection per app', 'An app can open as many connections as it likes. Keeping one open is simply faster.'],
        ['To use more battery', 'One quiet open connection actually uses less battery than connecting again and again.'],
      ]),
    },
    recvQuestion: {
      topic: 'End-to-end encryption',
      text: 'The message is <b>end-to-end encrypted</b>. Who can read "See you at 8?"',
      options: opts([
        ['Only Alice and Bob', 'Alice\'s app encrypts with a key only Bob\'s app can unlock. The chat server just passes on scrambled bytes.', true],
        ['The chat server too', 'With plain TLS the server could read it. End-to-end encryption means only the two ends hold the keys.'],
        ['Every router on the way', 'Routers only ever see the headers. The content is encrypted twice: end to end and by TLS.'],
      ]),
    },
    facts: [
      'The ✓✓ ticks are acknowledgements too, just like TCP ACKs but for the whole app: sent, delivered, read.',
      'When Bob\'s phone is asleep, a push notification service wakes the app so the message shows up.',
      'The biggest chat apps carry more than 100 billion messages a day.',
    ],
  },
];

export const DEFAULT_SCENARIO = 'website';

export function scenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS.find((s) => s.id === DEFAULT_SCENARIO);
}

export const bestKey = (id) => `packet-quest:best:${id}`;

// The scenario of the page that is running (the default one in tests).
export const SCENARIO = scenarioById(globalThis.document?.documentElement?.dataset?.scenario);
