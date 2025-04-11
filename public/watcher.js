// watcher.js

console.log("Watcher script starting...");

// Prevent viewing your own broadcast on this device.
if (localStorage.getItem("isBroadcasting") === "true") {
  const errorStatus = document.getElementById("status");
  errorStatus.textContent =
    "Error: You cannot view your own broadcast on this device.";
  // Optionally hide the video element.
  document.getElementById("video").style.display = "none";
  throw new Error("Watching broadcast on the same machine is not allowed.");
}

const statusElem = document.getElementById("status");
const statusContainer = document.getElementById("status-container");
const videoElement = document.getElementById("video");

function updateStatus(message, type = "") {
  statusElem.textContent = message;
  statusContainer.className = "status-indicator mb-4";
  if (type) {
    statusContainer.classList.add(type);
  }
}

// Connect to the Heroku signaling server.
const socket = io(
  "https://locallink-signaling-0763fb08f9e9.herokuapp.com",
  { path: "/socket" }
);
console.log("Socket object:", socket);

let pc = null;
let broadcastId = null;
let remoteStream = new MediaStream();
videoElement.srcObject = remoteStream;

socket.on("connect", () => {
  console.log("Watcher connected with id:", socket.id);
  updateStatus("Connected to signaling server.", "connecting");
  console.log("Emitting watcher event...");
  socket.emit("watcher");
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error);
  updateStatus("Connection error: " + error);
});

socket.on("broadcaster", () => {
  console.log("Received 'broadcaster' event from server.");
  socket.emit("watcher");
});

socket.on("offer", (broadcasterId, description) => {
  console.log("Received offer from broadcaster:", broadcasterId);
  broadcastId = broadcasterId;
  updateStatus("Connecting to broadcast...", "connecting");

  if (pc) {
    pc.close();
    pc = null;
  }
  pc = new RTCPeerConnection();
  console.log("Created new RTCPeerConnection.");

  // Clear previous remote stream tracks.
  remoteStream.getTracks().forEach((track) => track.stop());
  remoteStream = new MediaStream();
  videoElement.srcObject = remoteStream;

  pc.setRemoteDescription(description)
    .then(() => {
      console.log("Remote description set, creating answer...");
      return pc.createAnswer();
    })
    .then((answer) => {
      console.log("Answer created:", answer);
      return pc.setLocalDescription(answer);
    })
    .then(() => {
      console.log("Local description set, sending answer.");
      socket.emit("answer", broadcastId, pc.localDescription);
    })
    .catch((error) =>
      console.error("Error during offer handling:", error)
    );

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate:", event.candidate);
      socket.emit("candidate", broadcastId, event.candidate);
    }
  };

  pc.ontrack = (event) => {
    console.log("Received track:", event.track.kind);
    event.streams[0].getTracks().forEach((track) => {
      console.log("Adding track:", track.kind);
      remoteStream.addTrack(track);
    });
    updateStatus("Connected to broadcast!", "success");
  };
});

socket.on("candidate", (id, candidate) => {
  if (id === broadcastId && pc) {
    console.log("Received candidate from broadcaster:", candidate);
    pc.addIceCandidate(new RTCIceCandidate(candidate))
      .then(() => console.log("ICE candidate added successfully."))
      .catch((e) =>
        console.error("Error adding ICE candidate:", e)
      );
  }
});

socket.on("disconnectPeer", (id) => {
  if (id === broadcastId && pc) {
    console.log("Broadcaster disconnected.");
    pc.close();
    pc = null;
    updateStatus(
      "Broadcast ended. Waiting for broadcaster...",
      "connecting"
    );
    socket.emit("watcher");
  }
});

window.onunload = window.onbeforeunload = () => {
  socket.close();
  if (pc) {
    pc.close();
  }
};
