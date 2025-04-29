// watcher.js

// ——————————————————————————————————————————————————————————
// 1) CONFIG
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

// state
let code = "";
let pc = null;
let broadcastId = null;
let remoteStream = new MediaStream();

// ——————————————————————————————————————————————————————————
// 2) STATUS UTIL
// ——————————————————————————————————————————————————————————
function updateStatus(msg, type = "") {
  statusElem.textContent = msg;
  statusContainer.className = "status-indicator";
  if (type) statusContainer.classList.add(type);
}

// ——————————————————————————————————————————————————————————
// 3) LOAD/SAVE LAST PIN
// ——————————————————————————————————————————————————————————
window.addEventListener("DOMContentLoaded", () => {
  const last = localStorage.getItem("lastPinCode");
  if (last && last.length === 4) {
    codeInput.value = last;
    setCode(last);
  }
});

function setCode(pin) {
  code = pin.toUpperCase();
  localStorage.setItem("lastPinCode", code);
  socket.emit("joinRoom", code);
}

// hook up the button
connectBtn.addEventListener("click", () => {
  const val = codeInput.value.trim().toUpperCase();
  if (val.length === 4) setCode(val);
});

// ——————————————————————————————————————————————————————————
// 4) SOCKET.IO SETUP
// ——————————————————————————————————————————————————————————
socket.on("connect", () => {
  console.log("⚡ socket connected:", socket.id);
  // if we already have a PIN, join it
  if (code) socket.emit("joinRoom", code);
  // also register as a WebRTC watcher
  socket.emit("watcher");
});

socket.on("connect_error", err => {
  console.error("Socket connect error:", err);
  updateStatus("❌ Connection error");
});

// 4a) NAVIGATION PUSH (from extension → this page)
socket.on("navigate", ({ code: c, url }) => {
  if (c !== code) return;
  window.location.href = url;
});

// 4b) RECOMMENDATIONS PUSH (from extension → this page)
socket.on("recommendations", recs => {
  renderRecs(recs);
});

// ——————————————————————————————————————————————————————————
// 5) RENDERING RECOMMENDATIONS
// ——————————————————————————————————————————————————————————
function renderRecs(recs) {
  recsContainer.innerHTML = "";
  recs.forEach(rec => {
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
      // push navigation command via socket
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
videoElem.srcObject = remoteStream;

socket.on("broadcaster", () => {
  console.log("🔔 got broadcaster signal → re-request");
  socket.emit("watcher");
});

socket.on("offer", (bId, description) => {
  broadcastId = bId;
  updateStatus("Connecting to broadcast…", "connecting");
  if (pc) pc.close();
  pc = new RTCPeerConnection();
  remoteStream.getTracks().forEach(t => t.stop());
  remoteStream = new MediaStream();
  videoElem.srcObject = remoteStream;

  pc.setRemoteDescription(description)
    .then(() => pc.createAnswer())
    .then(answer => pc.setLocalDescription(answer))
    .then(() => {
      socket.emit("answer", broadcastId, pc.localDescription);
    })
    .catch(console.error);

  pc.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("candidate", broadcastId, e.candidate);
    }
  };
  pc.ontrack = e => {
    e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
    updateStatus("Connected to broadcast!", "success");
  };
});

socket.on("candidate", (fromId, candidate) => {
  if (fromId === broadcastId && pc) {
    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
  }
});

socket.on("disconnectPeer", id => {
  if (id === broadcastId && pc) {
    pc.close();
    pc = null;
    updateStatus("Broadcast ended, waiting…", "connecting");
    socket.emit("watcher");
  }
});

// clean up
window.onunload = window.onbeforeunload = () => {
  socket.close();
  if (pc) pc.close();
};
