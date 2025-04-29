// Video Call Functionality
document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const videoCallBtn = document.getElementById("video-call-btn")
  const videoCallSelectModal = document.getElementById("video-call-select-modal")
  const videoCallUsersList = document.getElementById("video-call-users-list")
  const incomingCallModal = document.getElementById("incoming-call-modal")
  const incomingCallText = document.getElementById("incoming-call-text")
  const acceptCallBtn = document.getElementById("accept-call-btn")
  const rejectCallBtn = document.getElementById("reject-call-btn")
  const videoCallModal = document.getElementById("video-call-modal")
  const localVideo = document.getElementById("local-video")
  const remoteVideo = document.getElementById("remote-video")
  const remoteVideoLabel = document.getElementById("remote-video-label")
  const callStatus = document.getElementById("call-status")
  const toggleAudioBtn = document.getElementById("toggle-audio-btn")
  const toggleVideoBtn = document.getElementById("toggle-video-btn")
  const endCallBtn = document.getElementById("end-call-btn")
  const closeModalButtons = document.querySelectorAll(".close-modal")

  // WebRTC variables
  let localStream = null
  let remoteStream = null
  let peerConnection = null
  let callInProgress = false
  let isCallInitiator = false
  let targetUser = null
  let currentUser = null
  let isAudioMuted = false
  let isVideoMuted = false

  // STUN servers for NAT traversal
  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
    ],
  }

  // Get socket.io instance from the main script
  const socket = io()

  // Initialize current user
  currentUser = sessionStorage.getItem("username")

  // Video call button click handler
  videoCallBtn.addEventListener("click", () => {
    // Get current users in the room
    const usersList = document.getElementById("users-list")
    const users = Array.from(usersList.children).map((li) => li.textContent)

    // Filter out current user
    const otherUsers = users.filter((user) => user !== currentUser)

    if (otherUsers.length === 0) {
      alert("No other users in the room to call.")
      return
    }

    // Populate the user selection list
    videoCallUsersList.innerHTML = ""
    otherUsers.forEach((user) => {
      const li = document.createElement("li")
      li.innerHTML = `<i class="fas fa-user"></i> ${user}`
      li.addEventListener("click", () => initiateCall(user))
      videoCallUsersList.appendChild(li)
    })

    // Show the user selection modal
    videoCallSelectModal.style.display = "block"
  })

  // Close modal buttons
  closeModalButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const modal = this.closest(".modal")
      if (modal === videoCallModal) {
        endCall()
      } else {
        modal.style.display = "none"
      }
    })
  })

  // Initiate a call to a specific user
  async function initiateCall(user) {
    try {
      // Hide the user selection modal
      videoCallSelectModal.style.display = "none"

      // Set target user
      targetUser = user
      isCallInitiator = true

      // Get local media stream
      await setupLocalStream()

      // Create peer connection
      createPeerConnection()

      // Add local tracks to peer connection
      addLocalStreamTracks()

      // Show the video call modal
      videoCallModal.style.display = "block"
      remoteVideoLabel.textContent = targetUser
      callStatus.textContent = "Calling..."
      callStatus.style.display = "block"

      // Send call offer to target user
      socket.emit("call-user", {
        target: targetUser,
        caller: currentUser,
      })

      console.log(`Initiating call to ${targetUser}`)
    } catch (error) {
      console.error("Error initiating call:", error)
      alert("Could not start video call. Please check your camera and microphone permissions.")
      cleanupCall()
    }
  }

  // Handle incoming call
  socket.on("incoming-call", ({ caller }) => {
    console.log(`Incoming call from ${caller}`)

    // If already in a call, automatically reject
    if (callInProgress) {
      socket.emit("call-rejected", {
        target: caller,
        rejector: currentUser,
      })
      return
    }

    // Show incoming call modal
    incomingCallText.textContent = `${caller} is calling you`
    incomingCallModal.style.display = "block"

    // Set caller as target user
    targetUser = caller
  })

  // Accept call button click handler
  acceptCallBtn.addEventListener("click", async () => {
    try {
      // Hide incoming call modal
      incomingCallModal.style.display = "none"

      // Get local media stream
      await setupLocalStream()

      // Create peer connection
      createPeerConnection()

      // Add local tracks to peer connection
      addLocalStreamTracks()

      // Show video call modal
      videoCallModal.style.display = "block"
      remoteVideoLabel.textContent = targetUser
      callStatus.textContent = "Connecting..."
      callStatus.style.display = "block"

      // Send call accepted to caller
      socket.emit("call-accepted", {
        target: targetUser,
        acceptor: currentUser,
      })

      console.log(`Accepted call from ${targetUser}`)
    } catch (error) {
      console.error("Error accepting call:", error)
      alert("Could not accept video call. Please check your camera and microphone permissions.")
      cleanupCall()

      // Notify caller that call was rejected due to error
      socket.emit("call-rejected", {
        target: targetUser,
        rejector: currentUser,
      })
    }
  })

  // Reject call button click handler
  rejectCallBtn.addEventListener("click", () => {
    // Hide incoming call modal
    incomingCallModal.style.display = "none"

    // Send call rejected to caller
    socket.emit("call-rejected", {
      target: targetUser,
      rejector: currentUser,
    })

    console.log(`Rejected call from ${targetUser}`)

    // Add system message to chat
    addCallHistoryMessage(`You rejected a call from ${targetUser}`)

    // Reset target user
    targetUser = null
  })

  // Handle call accepted
  socket.on("call-accepted", async ({ acceptor }) => {
    console.log(`Call accepted by ${acceptor}`)

    // Create and send offer
    try {
      callStatus.textContent = "Setting up connection..."
      callStatus.style.display = "block"

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      await peerConnection.setLocalDescription(offer)

      socket.emit("call-offer", {
        target: acceptor,
        caller: currentUser,
        offer: peerConnection.localDescription,
      })

      callStatus.textContent = "Waiting for connection..."
    } catch (error) {
      console.error("Error creating offer:", error)
      alert("Error establishing connection. Please try again.")
      endCall()
    }
  })

  // Handle call rejected
  socket.on("call-rejected", ({ rejector }) => {
    console.log(`Call rejected by ${rejector}`)

    // Show alert to caller
    alert(`${rejector} declined your call`)

    // Add system message to chat
    addCallHistoryMessage(`${rejector} declined your call`)

    // Clean up call resources
    cleanupCall()
  })

  // Handle call offer
  socket.on("call-offer", async ({ caller, offer }) => {
    try {
      console.log(`Received offer from ${caller}`)
      callStatus.textContent = "Connecting..."
      callStatus.style.display = "block"

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))

      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)

      socket.emit("call-answer", {
        target: caller,
        answerer: currentUser,
        answer: peerConnection.localDescription,
      })

      callInProgress = true
    } catch (error) {
      console.error("Error handling offer:", error)
      alert("Error establishing connection. Please try again.")
      endCall()
    }
  })

  // Handle call answer
  socket.on("call-answer", async ({ answerer, answer }) => {
    try {
      console.log(`Received answer from ${answerer}`)

      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer))

      callInProgress = true
      callStatus.textContent = "Connected"
      setTimeout(() => {
        callStatus.style.display = "none"
      }, 2000)
    } catch (error) {
      console.error("Error handling answer:", error)
      alert("Error establishing connection. Please try again.")
      endCall()
    }
  })

  // Handle ICE candidate
  socket.on("ice-candidate", async ({ candidate }) => {
    try {
      if (peerConnection && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      }
    } catch (error) {
      console.error("Error adding ICE candidate:", error)
    }
  })

  // Handle call ended
  socket.on("call-ended", ({ ender }) => {
    console.log(`Call ended by ${ender}`)

    // Add system message to chat
    addCallHistoryMessage(`${ender} ended the call`)

    // Clean up call resources
    cleanupCall()
  })

  // End call button click handler
  endCallBtn.addEventListener("click", () => {
    endCall()
  })

  // Toggle audio button click handler
  toggleAudioBtn.addEventListener("click", () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks()
      if (audioTracks.length > 0) {
        isAudioMuted = !isAudioMuted
        audioTracks[0].enabled = !isAudioMuted

        // Update button UI
        if (isAudioMuted) {
          toggleAudioBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>'
          toggleAudioBtn.classList.add("muted")
          toggleAudioBtn.title = "Unmute Audio"
        } else {
          toggleAudioBtn.innerHTML = '<i class="fas fa-microphone"></i>'
          toggleAudioBtn.classList.remove("muted")
          toggleAudioBtn.title = "Mute Audio"
        }
      }
    }
  })

  // Toggle video button click handler
  toggleVideoBtn.addEventListener("click", () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks()
      if (videoTracks.length > 0) {
        isVideoMuted = !isVideoMuted
        videoTracks[0].enabled = !isVideoMuted

        // Update button UI
        if (isVideoMuted) {
          toggleVideoBtn.innerHTML = '<i class="fas fa-video-slash"></i>'
          toggleVideoBtn.classList.add("muted")
          toggleVideoBtn.title = "Turn On Video"
        } else {
          toggleVideoBtn.innerHTML = '<i class="fas fa-video"></i>'
          toggleVideoBtn.classList.remove("muted")
          toggleVideoBtn.title = "Turn Off Video"
        }
      }
    }
  })

  // Setup local media stream
  async function setupLocalStream() {
    try {
      // Show loading status
      callStatus.textContent = "Requesting camera access..."
      callStatus.style.display = "block"

      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      })

      if (localVideo) {
        localVideo.srcObject = localStream
      }

      return localStream
    } catch (error) {
      console.error("Error accessing media devices:", error)

      // Show more specific error message
      if (error.name === "NotAllowedError") {
        alert("Camera or microphone access denied. Please allow access to use video calls.")
      } else if (error.name === "NotFoundError") {
        alert("No camera or microphone found. Please connect a device and try again.")
      } else {
        alert("Could not access camera or microphone: " + error.message)
      }

      throw error
    }
  }

  // Create WebRTC peer connection
  function createPeerConnection() {
    try {
      peerConnection = new RTCPeerConnection(iceServers)

      // Handle ICE candidate events
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice-candidate", {
            target: targetUser,
            candidate: event.candidate,
          })
        }
      }

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log("Connection state:", peerConnection.connectionState)

        if (peerConnection.connectionState === "connected") {
          callStatus.textContent = "Connected"
          setTimeout(() => {
            callStatus.style.display = "none"
          }, 2000)
        } else if (
          peerConnection.connectionState === "disconnected" ||
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "closed"
        ) {
          callStatus.textContent = "Connection lost"
          callStatus.style.display = "block"

          // Auto end call after a short delay if connection is lost
          if (peerConnection.connectionState === "failed") {
            setTimeout(() => {
              endCall()
            }, 3000)
          }
        }
      }

      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", peerConnection.iceConnectionState)

        if (peerConnection.iceConnectionState === "connected") {
          callStatus.textContent = "Connected"
          setTimeout(() => {
            callStatus.style.display = "none"
          }, 2000)
        } else if (
          peerConnection.iceConnectionState === "disconnected" ||
          peerConnection.iceConnectionState === "failed" ||
          peerConnection.iceConnectionState === "closed"
        ) {
          callStatus.textContent = "Connection issue"
          callStatus.style.display = "block"
        }
      }

      // Handle remote track events
      peerConnection.ontrack = (event) => {
        console.log("Remote track received")
        remoteStream = event.streams[0]
        if (remoteVideo) {
          remoteVideo.srcObject = remoteStream

          // Hide the call status when we start receiving video
          setTimeout(() => {
            callStatus.style.display = "none"
          }, 1000)
        }
      }

      return peerConnection
    } catch (error) {
      console.error("Error creating peer connection:", error)
      throw error
    }
  }

  // Add local stream tracks to peer connection
  function addLocalStreamTracks() {
    if (localStream && peerConnection) {
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream)
      })
    }
  }

  // End call and clean up resources
  function endCall() {
    if (targetUser) {
      // Notify other user that call has ended
      socket.emit("call-ended", {
        target: targetUser,
        ender: currentUser,
      })

      // Add system message to chat
      addCallHistoryMessage(`Call with ${targetUser} ended`)
    }

    // Clean up resources
    cleanupCall()
  }

  // Clean up call resources
  function cleanupCall() {
    // Hide video call modal
    videoCallModal.style.display = "none"

    // Stop local stream tracks
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop()
      })
      localStream = null
    }

    // Close peer connection
    if (peerConnection) {
      peerConnection.close()
      peerConnection = null
    }

    // Reset video elements
    if (localVideo) localVideo.srcObject = null
    if (remoteVideo) remoteVideo.srcObject = null

    // Reset call state
    callInProgress = false
    isCallInitiator = false
    targetUser = null
    isAudioMuted = false
    isVideoMuted = false

    // Reset UI
    toggleAudioBtn.innerHTML = '<i class="fas fa-microphone"></i>'
    toggleAudioBtn.classList.remove("muted")
    toggleVideoBtn.innerHTML = '<i class="fas fa-video"></i>'
    toggleVideoBtn.classList.remove("muted")
  }

  // Add call history message to chat
  function addCallHistoryMessage(message) {
    // Create system message for call history
    const callMessage = {
      user: "System",
      text: message,
      timestamp: new Date().toISOString(),
    }

    // Get the chat messages container
    const chatMessages = document.getElementById("chat-messages")

    // Create message element
    const div = document.createElement("div")
    div.classList.add("message", "system")

    // Create message text
    const text = document.createElement("div")
    text.classList.add("message-text")
    text.textContent = message

    // Append to message div
    div.appendChild(text)

    // Add to chat
    chatMessages.appendChild(div)

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight

    // Save message if the saveMessage function exists
    if (typeof saveMessage === "function") {
      saveMessage(callMessage)
    }
  }

  // Handle window beforeunload event to end call when page is closed
  window.addEventListener("beforeunload", () => {
    if (callInProgress) {
      endCall()
    }
  })
})
