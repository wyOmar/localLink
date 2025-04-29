// watcher.js
;(function() {
  const HEROKU = "https://locallink-signaling-0763fb08f9e9.herokuapp.com";
  // now global `io` is loaded by your CDN <script>
  const socket = io(HEROKU, { path: "/socket" });

  // UI refs
  const statusCx = document.getElementById("status-container");
  const statusEl = document.getElementById("status");
  const videoEl   = document.getElementById("video");
  const recsDiv   = document.getElementById("recommendations");
  const codeIn    = document.getElementById("codeInput");
  const btnConnect= document.getElementById("connectBtn");

  // PeerConnection for WebRTC
  let pc = null, broadcasterId = null;
  let remoteStream = new MediaStream();
  videoEl.srcObject = remoteStream;

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
    updateStatus("Connecting to broadcast…", "connecting");
    if (pc) pc.close();
    pc = new RTCPeerConnection();
    // reset remote stream
    remoteStream.getTracks().forEach((t) => t.stop());
    remoteStream = new MediaStream();
    videoEl.srcObject = remoteStream;

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
      updateStatus("Connected to broadcast!", "success");
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
      updateStatus("Broadcast ended, waiting…", "connecting");
      socket.emit("watcher");
    }
  });

  // ——— Real-time Recommendations ———
  socket.on("recommendations", (recs) => {
    renderRecs(recs);
  });

  function renderRecs(recs) {
    recsDiv.innerHTML = "";
    recs.forEach((r) => {
      const btn = document.createElement("button");
      Object.assign(btn.style, {
        display: "flex",
        alignItems: "center",
        width: "100%",
        border: "1px solid #ccc",
        padding: "10px",
        marginBottom: "10px",
        background: "#fff",
        cursor: "pointer",
        textAlign: "left",
      });
      btn.onclick = (e) => {
        e.preventDefault();
        if (!pin) return;
        socket.emit("navigate", { code: pin, url: r.url });
      };
      btn.innerHTML = `
        <img src="${r.thumbnail}" 
             style="width:88px;height:49px;
                    flex-shrink:0;margin-right:10px;" />
        <div style="flex:1;overflow:hidden;">
          <div style="
            font-weight:bold;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          ">${r.title}</div>
          <div style="font-size:.9em;color:#555;">
            ${r.channel} · ${r.views} · ${r.posted}
          </div>
        </div>
      `;
      recsDiv.appendChild(btn);
    });
  }
})();
