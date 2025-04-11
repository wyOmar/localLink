# LocalLink

LocalLink is a lightweight web application that uses WebRTC to stream audio and video between devices using peer-to-peer (P2P) connections. Originally developed to allow streaming audio to a bluetooth capable device, it can allow stream video to second device as a “static” secondary screen for watching videos or presentations.

One of the best parts? **There’s nothing to install!**  
LocalLink is entirely web-based. You just open the broadcaster or watcher page in your browser, and you're ready to go.

## Overview

The project consists of two main parts:

- A **Backend Signaling Server** built with Node.js, Express, and Socket.IO. This server (deployed on Heroku) facilitates the exchange of WebRTC offers, answers, and ICE candidates between the broadcaster and watchers.
- This **Frontend** with static HTML and JavaScript files (deployed on Vercel) that provide separate pages for the broadcaster and the watcher.

## Features

- **Broadcasting:** Share your screen or system audio directly through your web browser.
- **Real-Time Viewer Count:** See the number of active watchers in real time.
- **Quality Options:** Choose from multiple resolutions (audio only, 720p, 1080p, 1440p, 4K) to match your bandwidth and performance needs.
- **Low-Latency P2P Streaming:** Direct peer-to-peer connections via WebRTC ensure minimal latency for streaming.
- **Secondary Display Functionality:** Use a phone, tablet, or another computer as a “static” secondary monitor (ideal for watching videos or presentations).
- **No Installation Required:** Simply open the web pages—there’s no need to install any software or drivers for the basic functionality.

## Usage

### As a Broadcaster

1. Open `broadcaster` in a supported browser (Chrome is recommended).
2. Select the desired resolution from the dropdown.
3. Click the **Go Live** button.
4. Your screen or audio will be captured and broadcast, and the viewer count will update as watchers join.
5. Click **Stop Broadcast** to end the stream.

### As a Watcher

1. Open `watcher` on a secondary device (phone, tablet, or another computer).
2. The watcher page will automatically connect to the signaling server and wait for a broadcast.
3. Note that the app prevents the broadcaster from watching their own stream on the same device.

## Additional Information

- **Latency Considerations:** P2P connections ensure low latency for most streaming activities. However, using a virtual display as an interactive secondary monitor may result in higher latency.
- **No Extra Software Needed:** Because everything runs in your web browser and on cloud servers, there is no need to install additional software or configure drivers (unless you choose to enhance functionality with virtual display drivers).

Enjoy streaming with LocalLink!
