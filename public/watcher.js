// watcher.js

// ——————————————————————————————————————————————————————————
// 1) CONFIG & STATE
// ——————————————————————————————————————————————————————————
const HEROKU_BASE =
  "https://locallink-signaling-0763fb08f9e9.herokuapp.com";
const socket = io(HEROKU_BASE, { path: "/socket" });

// DOM refs
const statusContainer = document.getElementById("status-container");
const statusElem = document.getElementById("status");
const videoElem = document.getElementById("video");
const recsContainer = document.getElementById("recommendations");
const codeInput = document.getElementById("codeInput");
const connectBtn = document.getElementById("connectBtn");

// WebRTC state
let pc = null;
let broadcastId = null;
let remoteStream = new MediaStream();
videoElem.srcObject = remoteStream;

// PIN state
let code = "";

// ——————————————————————————————————————————————————————————
// 2) STATUS UTIL
// ——————————————————————————————————————————————————————————
function updateStatus(msg, cssClass = "") {
  statusElem.textContent = msg;
  statusContainer.className = "status-indicator";
  if (cssClass) statusContainer.classList.add(cssClass);
}

// ——————————————————————————————————————————————————————————
// 3) RESTORE LAST PIN & JOIN ROOM
// ——————————————————————————————————————————————————————————
window.addEventListener("DOMContentLoaded", () => {
  const last = localStorage.getItem("lastPinCode");
  if (last && last.length === 4) {
    code = last;
    codeInput.value = last;
    socket.emit("joinRoom", code);
  }
});

// Wire up “Connect” button
connectBtn.addEventListener("click", () => {
  const val = codeInput.value.trim().toUpperCase();
  if (val.length === 4) {
    code = val;
    localStorage.setItem("lastPinCode", code);
    socket.emit("joinRoom", code);
    updateStatus(`Joined PIN ${code}`, "success");
  }
});

// ——————————————————————————————————————————————————————————
// 4) SOCKET.IO SIGNALING + CONTROL CHANNEL
// ——————————————————————————————————————————————————————————
socket.on("connect", () => {
  console.log("🔌 socket.io connected:", socket.id);
  // if we already have a PIN, re-join
  if (code) socket.emit("joinRoom", code);
  // register as a WebRTC watcher
  socket.emit("watcher");
});

socket.on("connect_error", (err) => {
  console.error("❌ connection error:", err);
  updateStatus("Connection error", "error");
});

// 4a) REAL-TIME RECOMMENDATIONS PUSH
socket.on("recommendations", (recs) => {
  renderRecs(recs);
});

// 4b) REAL-TIME NAVIGATION PUSH
socket.on("navigate", ({ code: c, url }) => {
  if (c === code) {
    window.location.href = url;
  }
});

// ——————————————————————————————————————————————————————————
// 5) RENDER RECOMMENDATIONS
// ——————————————————————————————————————————————————————————
function renderRecs(recs) {
  recsContainer.innerHTML = "";
  recs.forEach((rec) => {
    const div = document.createElement("div");
    Object.assign(div.style, {
      cursor: "pointer",
      border: "1px solid #ccc",
      padding: "10px",
      marginBottom: "20px",
      display: "flex",
      alignItems: "center",
    });
    div.onclick = () => {
      socket.emit("navigate", { code, url: rec.url });
    };
    div.innerHTML = `
      <img
        src="${rec.thumbnail}"
        style="width:120px;height:auto;margin-right:10px;"
      />
      <div>
        <b>${rec.title}</b><br>
        ${rec.channel} · ${rec.views} · ${rec.posted}
      </div>
    `;
    recsContainer.appendChild(div);
  });
}

// ——————————————————————————————————————————————————————————
// 6) WEBRTC WATCHER LOGIC (unchanged)
// ——————————————————————————————————————————————————————————
socket.on("broadcaster", () => {
  socket.emit("watcher");
});

socket.on("offer", (bId, description) => {
  broadcastId = bId;
  updateStatus("Connecting to broadcast…", "connecting");

  if (pc) pc.close();
  pc = new RTCPeerConnection();

  // reset stream
  remoteStream.getTracks().forEach((t) => t.stop());
  remoteStream = new MediaStream();
  videoElem.srcObject = remoteStream;

  pc.setRemoteDescription(description)
    .then(() => pc.createAnswer())
    .then((answer) => pc.setLocalDescription(answer))
    .then(() => {
      socket.emit("answer", broadcastId, pc.localDescription);
    })
    .catch(console.error);

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      socket.emit("candidate", broadcastId, ev.candidate);
    }
  };
  pc.ontrack = (ev) => {
    ev.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
    updateStatus("Connected to broadcast!", "success");
  };
});

socket.on("candidate", (fromId, candidate) => {
  if (fromId === broadcastId && pc) {
    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
  }
});

socket.on("disconnectPeer", (id) => {
  if (id === broadcastId && pc) {
    pc.close();
    pc = null;
    updateStatus("Broadcast ended, waiting…", "connecting");
    socket.emit("watcher");
  }
});

// clean up on unload
window.onbeforeunload = window.onunload = () => {
  socket.close();
  if (pc) pc.close();
};
