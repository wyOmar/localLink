// broadcaster.js

// Connect to the Heroku signaling server using Socket.IO.
const socket = io(
  "https://locallink-signaling-0763fb08f9e9.herokuapp.com",
  { path: "/socket" }
);

const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const resolutionSelect = document.getElementById("resolutionSelect");
const statusElem = document.getElementById("status");
const statusContainer = document.getElementById("status-container");
const viewerCountElem = document.getElementById("viewerCount");

let stream = null;
const peerConnections = {};
let currentQuality = null;

function updateStatus(message, type = "") {
  statusElem.textContent = message;
  statusContainer.className = "status-indicator mb-4";
  if (type) {
    statusContainer.classList.add(type);
  }
}

function getVideoConstraints(choice) {
  if (choice === "audioOnly") {
    // Minimal video constraints to satisfy the browser's screen-share requirement.
    return {
      width: { max: 100 },
      height: { max: 100 },
      frameRate: { max: 1 },
    };
  }
  let constraints = {};
  switch (choice) {
    case "720p":
      constraints = { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 30 } };
      break;
    case "1080p":
      constraints = { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 60 } };
      break;
    case "1440p":
      constraints = { width: { max: 2560 }, height: { max: 1440 }, frameRate: { max: 60 } };
      break;
    case "4k":
      constraints = { width: { max: 3840 }, height: { max: 2160 }, frameRate: { max: 60 } };
      break;
    default:
      constraints = true;
  }
  return constraints;
}

// Listen for viewer count updates from the signaling server.
socket.on("viewerCount", (count) => {
  viewerCountElem.textContent = count;
});

startButton.addEventListener("click", () => {
  startButton.disabled = true;
  updateStatus("Starting broadcast...", "connecting");
  currentQuality = resolutionSelect.value;
  
  const isAudioOnly = currentQuality === "audioOnly";
  const videoConstraints = getVideoConstraints(currentQuality);
  
  // DYNAMIC AUDIO CONSTRAINTS
  // Use zero-latency, raw audio for "Audio Only", and standard synced audio for video.
  const audioConstraints = isAudioOnly 
    ? {
        channelCount: 2,
        sampleRate: 48000,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false, // Low latency mode
        latency: 0              // Low latency mode
      }
    : {
        channelCount: 2,
        sampleRate: 48000,
        echoCancellation: false,
        noiseSuppression: false
      };

  navigator.mediaDevices
    .getDisplayMedia({
      video: videoConstraints === true ? true : videoConstraints,
      audio: audioConstraints,
    })
    .then((mediaStream) => {
      // Safeguard: Check if the user forgot to check the "Share Audio" box
      if (mediaStream.getAudioTracks().length === 0) {
        alert("No audio track detected! Please click 'Stop Broadcast', then 'Go Live' again, and make sure to check 'Share system audio'.");
        console.warn("Broadcast started without audio tracks.");
      }

      stream = mediaStream;
      updateStatus("Broadcasting live!", "live");
      console.log("Broadcast started. Stream:", stream);
      socket.emit("broadcaster");
      localStorage.setItem("isBroadcasting", "true");

      socket.on("watcher", (watcherId) => {
        console.log("New watcher connected:", watcherId);
        createPeerConnection(watcherId, currentQuality);
      });

      socket.on("answer", (watcherId, description) => {
        if (peerConnections[watcherId]) {
          peerConnections[watcherId].setRemoteDescription(description);
        }
      });

      socket.on("candidate", (watcherId, candidate) => {
        if (peerConnections[watcherId]) {
          peerConnections[watcherId].addIceCandidate(
            new RTCIceCandidate(candidate)
          );
        }
      });

      socket.on("disconnectPeer", (id) => {
        if (peerConnections[id]) {
          peerConnections[id].close();
          delete peerConnections[id];
        }
      });

      stopButton.disabled = false;
    })
    .catch((error) => {
      console.error("Error accessing display media:", error);
      updateStatus("Error: " + error.message);
      startButton.disabled = false;
    });
});

function createPeerConnection(watcherId, quality) {
  const pc = new RTCPeerConnection();
  peerConnections[watcherId] = pc;
  
  if (stream) {
    // ALWAYS add the audio track
    stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
    
    // ONLY add the video track if we aren't using the Audio Only low-latency mode
    if (quality !== "audioOnly") {
      stream.getVideoTracks().forEach((track) => pc.addTrack(track, stream));
    }
  }
  
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", watcherId, event.candidate);
    }
  };
  
  pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .then(() => {
      socket.emit("offer", watcherId, pc.localDescription);
    })
    .catch((error) => {
      console.error("Error creating offer for watcher", watcherId, error);
    });
}

stopButton.addEventListener("click", () => {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }
  Object.keys(peerConnections).forEach((id) => {
    peerConnections[id].close();
    delete peerConnections[id];
  });
  updateStatus("Broadcast stopped.");
  startButton.disabled = false;
  stopButton.disabled = true;
  localStorage.removeItem("isBroadcasting");
});

window.onunload = window.onbeforeunload = () => {
  socket.close();
};