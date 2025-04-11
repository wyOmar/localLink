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
      // Minimal video constraints for capturing system audio.
      return {
        width: { max: 100 },
        height: { max: 100 },
        frameRate: { max: 1 },
      };
    }
    let constraints = {};
    switch (choice) {
      case "720p":
        constraints = {
          width: { max: 1280 },
          height: { max: 720 },
          frameRate: { max: 10 },
        };
        break;
      case "1080p":
        constraints = {
          width: { max: 1920 },
          height: { max: 1080 },
          frameRate: { max: 60 },
        };
        break;
      case "1440p":
        constraints = {
          width: { max: 2560 },
          height: { max: 1440 },
          frameRate: { max: 60 },
        };
        break;
      case "4k":
        constraints = {
          width: { max: 3840 },
          height: { max: 2160 },
          frameRate: { max: 60 },
        };
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
    const videoConstraints = getVideoConstraints(currentQuality);
  
    navigator.mediaDevices
      .getDisplayMedia({
        video: videoConstraints === true ? true : videoConstraints,
        audio: {
          channelCount: 2, // Request stereo audio
          sampleRate: 48000, // Common sample rate
          echoCancellation: false,
          noiseSuppression: false,
        },
      })
      .then((mediaStream) => {
        stream = mediaStream;
        updateStatus("Broadcasting live!", "live");
        console.log("Broadcast started. Stream:", stream);
        socket.emit("broadcaster");
        // Flag that this machine is broadcasting.
        localStorage.setItem("isBroadcasting", "true");
  
        socket.on("watcher", (watcherId) => {
          console.log("New watcher connected:", watcherId);
          createPeerConnection(watcherId, currentQuality);
        });
  
        socket.on("answer", (watcherId, description) => {
          console.log(
            "Received answer from watcher:",
            watcherId,
            description
          );
          if (peerConnections[watcherId]) {
            peerConnections[watcherId].setRemoteDescription(description);
          }
        });
  
        socket.on("candidate", (watcherId, candidate) => {
          console.log(
            "Received candidate for watcher:",
            watcherId,
            candidate
          );
          if (peerConnections[watcherId]) {
            peerConnections[watcherId].addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          }
        });
  
        socket.on("disconnectPeer", (id) => {
          console.log("Watcher disconnected:", id);
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
      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
      if (quality !== "audioOnly") {
        stream.getVideoTracks().forEach((track) => pc.addTrack(track, stream));
      }
    }
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Sending ICE candidate to", watcherId, event.candidate);
        socket.emit("candidate", watcherId, event.candidate);
      }
    };
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        console.log(
          "Sending offer to watcher",
          watcherId,
          pc.localDescription
        );
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
    // Remove the broadcasting flag.
    localStorage.removeItem("isBroadcasting");
  });
  
  window.onunload = window.onbeforeunload = () => {
    socket.close();
  };
  