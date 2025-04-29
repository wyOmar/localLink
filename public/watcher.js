// watcher.js
;(function(){
  const HEROKU_BASE =
    "https://locallink-signaling-0763fb08f9e9.herokuapp.com";

  // global `io` from socket.io.min.js
  const socket = io(HEROKU_BASE, { path: "/socket" });

  // UI refs
  const statusCx = document.getElementById("status-container");
  const statusEl = document.getElementById("status");
  const videoEl = document.getElementById("video");
  const recsDiv = document.getElementById("recommendations");
  const codeInput = document.getElementById("codeInput");
  const connectBtn = document.getElementById("connectBtn");

  // WebRTC state
  let pc = null;
  let broadcasterId = null;
  let remoteStream = new MediaStream();
  videoEl.srcObject = remoteStream;

  // PIN state
  let pin = "";

  function updateStatus(msg, cls=""){
    statusEl.textContent = msg;
    statusCx.className = "status-indicator";
    if(cls) statusCx.classList.add(cls);
  }

  // load last PIN
  window.addEventListener("DOMContentLoaded", ()=>{
    const last = localStorage.getItem("lastPinCode");
    if(last && last.length===4){
      codeInput.value = last;
      joinRoom(last);
    }
  });

  connectBtn.onclick = ()=>{
    const val = codeInput.value.trim().toUpperCase();
    if(val.length===4){
      localStorage.setItem("lastPinCode", val);
      joinRoom(val);
    }
  };

  function joinRoom(code){
    pin = code;
    socket.emit("joinRoom", pin);
    updateStatus(`Joined PIN ${pin}`, "success");
  }

  // SIGNALING
  socket.on("connect", ()=>{
    console.log("socket connected", socket.id);
    if(pin) socket.emit("joinRoom", pin);
    socket.emit("watcher");
  });
  socket.on("broadcaster", ()=> socket.emit("watcher"));
  socket.on("offer",(bId, desc)=>{
    broadcasterId = bId;
    updateStatus("Connecting to broadcast…","connecting");
    if(pc) pc.close();
    pc = new RTCPeerConnection();
    remoteStream.getTracks().forEach(t=>t.stop());
    remoteStream = new MediaStream();
    videoEl.srcObject = remoteStream;

    pc.setRemoteDescription(desc)
      .then(()=> pc.createAnswer())
      .then(ans=> pc.setLocalDescription(ans))
      .then(()=> socket.emit("answer", broadcasterId, pc.localDescription))
      .catch(console.error);

    pc.onicecandidate = e=>{
      if(e.candidate) socket.emit("candidate", broadcasterId, e.candidate);
    };
    pc.ontrack = e=>{
      e.streams[0].getTracks().forEach(t=> remoteStream.addTrack(t));
      updateStatus("Connected to broadcast!","success");
    };
  });
  socket.on("candidate",(fromId, cand)=>{
    if(fromId===broadcasterId && pc){
      pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.error);
    }
  });
  socket.on("disconnectPeer",id=>{
    if(id===broadcasterId && pc){
      pc.close(); pc=null;
      updateStatus("Broadcast ended, waiting…","connecting");
      socket.emit("watcher");
    }
  });

  // REAL-TIME RECS
  socket.on("recommendations", recs=>{
    renderRecs(recs);
  });

  function renderRecs(recs){
    recsDiv.innerHTML = "";
    recs.forEach(r=>{
      // use a <button> so click never navigates this page
      const btn = document.createElement("button");
      Object.assign(btn.style,{
        display: "flex",
        alignItems: "center",
        width: "100%",
        border: "1px solid #ccc",
        padding: "10px",
        marginBottom: "10px",
        background: "#fff",
        cursor: "pointer",
        textAlign: "left"
      });
      btn.onclick = e=>{
        e.preventDefault();  // just in case
        e.stopPropagation();
        if(!pin) return;
        socket.emit("navigate",{code:pin,url:r.url});
      };
      btn.innerHTML = `
        <img src="${r.thumbnail}" style="width:88px;height:49px;flex-shrink:0;margin-right:10px;" />
        <div style="flex:1;overflow:hidden;">
          <div style="font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${r.title}
          </div>
          <div style="font-size:0.9em;color:#555;">
            ${r.channel} · ${r.views} · ${r.posted}
          </div>
        </div>
      `;
      recsDiv.appendChild(btn);
    });
  }
})();
