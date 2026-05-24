// listener.js
;(function() {
  const HEROKU = "https://locallink-signaling-0763fb08f9e9.herokuapp.com";
  const socket = io(HEROKU, { path: "/socket" });

  // UI refs
  const statusCx = document.getElementById("status-container");
  const statusEl = document.getElementById("status");
  const audioEl  = document.getElementById("audio");

  // PeerConnection for WebRTC
  let pc = null, broadcasterId = null;
  let remoteStream = new MediaStream();
  audioEl.srcObject = remoteStream;

  function updateStatus(msg, cls="") {
    statusEl.textContent = msg;
    statusCx.className = "status-indicator";
    if (cls) statusCx.classList.add(cls);
  }

  // ——— WebRTC Signaling ———
  
  // 1. Immediately announce ourselves when connected to the server
  socket.on("connect", () => {
    console.log("Socket connected:", socket.id);
    updateStatus("Waiting for broadcaster…", "connecting");
    socket.emit("watcher"); 
  });

  // 2. If a broadcaster joins AFTER the listener is already open
  socket.on("broadcaster", () => {
    socket.emit("watcher");
  });

  // 3. Handle incoming WebRTC connection
  socket.on("offer", (bId, desc) => {
    broadcasterId = bId;
    updateStatus("Connecting to audio broadcast…", "connecting");
    
    if (pc) pc.close();
    pc = new RTCPeerConnection();
    
    // Reset remote stream
    remoteStream.getTracks().forEach((t) => t.stop());
    remoteStream = new MediaStream();
    audioEl.srcObject = remoteStream;

    pc.setRemoteDescription(desc)
      .then(() => pc.createAnswer())
      .then((ans) => pc.setLocalDescription(ans))
      .then(() => socket.emit("answer", broadcasterId, pc.localDescription))
      .catch(console.error);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("candidate", broadcasterId, e.candidate);
      }
    };
    
    pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
      updateStatus("Receiving Audio!", "success");
      
      // Attempt to play automatically
      audioEl.play().catch((err) => {
        console.warn("Autoplay blocked. User interaction required:", err);
        // If the browser blocks audio, tell the user to click the player
        updateStatus("Click the play button to hear audio", "connecting");
      });
    };
  });

  socket.on("candidate", (from, cand) => {
    if (from === broadcasterId && pc) {
      pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
    }
  });

  socket.on("disconnectPeer", (id) => {
    if (id === broadcasterId && pc) {
      pc.close();
      pc = null;
      updateStatus("Audio broadcast ended, waiting…", "connecting");
      // Tell the server we are ready for a new connection
      socket.emit("watcher");
    }
  });
})();