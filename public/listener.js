// listener.js
;(function() {
  const HEROKU = "https://locallink-signaling-0763fb08f9e9.herokuapp.com";
  const socket = io(HEROKU, { path: "/socket" });

  // UI refs
  const statusCx = document.getElementById("status-container");
  const statusEl = document.getElementById("status");
  const audioEl  = document.getElementById("audio"); // Targeting audio tag
  const codeIn   = document.getElementById("codeInput");
  const btnConnect= document.getElementById("connectBtn");

  // PeerConnection for WebRTC
  let pc = null, broadcasterId = null;
  let remoteStream = new MediaStream();
  audioEl.srcObject = remoteStream;

  // PIN state
  let pin = "";

  function updateStatus(msg, cls="") {
    statusEl.textContent = msg;
    statusCx.className = "status-indicator";
    if (cls) statusCx.classList.add(cls);
  }

  // 1) Restore last PIN & auto-join
  window.addEventListener("DOMContentLoaded", () => {
    const last = localStorage.getItem("lastPinCode");
    if (last && last.length === 4) {
      codeIn.value = last;
      joinRoom(last);
    }
  });

  // 2) Connect button
  btnConnect.onclick = () => {
    const val = codeIn.value.trim().toUpperCase();
    if (val.length === 4) {
      localStorage.setItem("lastPinCode", val);
      joinRoom(val);
    }
  };

  function joinRoom(code) {
    pin = code;
    socket.emit("joinRoom", pin);
    updateStatus(`Joined PIN ${pin}`, "success");
  }

  // ——— WebRTC Signaling ———
  socket.on("connect", () => {
    console.log("socket connected:", socket.id);
    if (pin) socket.emit("joinRoom", pin);
    socket.emit("watcher");
  });

  socket.on("broadcaster", () => socket.emit("watcher"));

  socket.on("offer", (bId, desc) => {
    broadcasterId = bId;
    updateStatus("Connecting to audio broadcast…", "connecting");
    if (pc) pc.close();
    pc = new RTCPeerConnection();
    
    // reset remote stream
    remoteStream.getTracks().forEach((t) => t.stop());
    remoteStream = new MediaStream();
    audioEl.srcObject = remoteStream;

    pc.setRemoteDescription(desc)
      .then(() => pc.createAnswer())
      .then((ans) => pc.setLocalDescription(ans))
      .then(() =>
        socket.emit("answer", broadcasterId, pc.localDescription)
      )
      .catch(console.error);

    pc.onicecandidate = (e) => {
      if (e.candidate)
        socket.emit("candidate", broadcasterId, e.candidate);
    };
    
    pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach((t) =>
        remoteStream.addTrack(t)
      );
      updateStatus("Receiving Audio!", "success");
      
      // Attempt to play automatically
      audioEl.play().catch((err) => {
        console.warn("Autoplay blocked. User interaction required:", err);
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
      socket.emit("watcher");
    }
  });
})();