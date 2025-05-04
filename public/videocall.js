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
  let callTimeout = null

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

  // Get socket.io instance
  const socket = io()

  // Initialize current user
  currentUser = sessionStorage.getItem("username")

  // Debug logging function
  function logEvent(event, data) {
    console.log(`[VideoCall] ${event}:`, data)
  }

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

      // Show the video call modal with calling status
      videoCallModal.style.display = "block"
      remoteVideoLabel.textContent = targetUser
      callStatus.textContent = "Calling..."
      callStatus.style.display = "block"

      // Get local media stream
      await setupLocalStream()

      // Send call offer to target user
      logEvent("Initiating call", { target: targetUser, caller: currentUser })
      socket.emit("call-user", {
        target: targetUser,
        caller: currentUser,
      })

      // Set a timeout for the call
      callTimeout = setTimeout(() => {
        if (!callInProgress) {
          alert(`No response from ${targetUser}. They may be unavailable.`)
          endCall()
        }
      }, 30000) // 30 seconds timeout
    } catch (error) {
      logEvent("Error initiating call", error)
      alert("Could not start video call. Please check your camera and microphone permissions.")
      cleanupCall()
    }
  }

  // Handle call request sent confirmation
  socket.on("call-request-sent", ({ target }) => {
    logEvent("Call request sent", { target })
  })

  // Handle call failed
  socket.on("call-failed", ({ target, reason }) => {
    logEvent("Call failed", { target, reason })
    alert(`Call to ${target} failed: ${reason}`)
    endCall()
  })

  // Handle incoming call
  socket.on("incoming-call", ({ caller }) => {
    logEvent("Incoming call", { caller })

    // If already in a call, automatically reject
    if (callInProgress) {
      logEvent("Rejecting call (already in call)", { caller })
      socket.emit("call-rejected", {
        target: caller,
        rejector: currentUser,
      })
      return
    }

    // Play notification sound
    playCallSound()

    // Show incoming call modal
    incomingCallText.textContent = `${caller} is calling you`
    incomingCallModal.style.display = "block"

    // Set caller as target user
    targetUser = caller

    // Set a timeout for the incoming call
    callTimeout = setTimeout(() => {
      if (incomingCallModal.style.display === "block") {
        logEvent("Call timed out", { caller })
        // Auto reject after 30 seconds
        socket.emit("call-rejected", {
          target: caller,
          rejector: currentUser,
          reason: "no_answer",
        })
        incomingCallModal.style.display = "none"
        targetUser = null
      }
    }, 30000) // 30 seconds timeout
  })

  // Accept call button click handler
  acceptCallBtn.addEventListener("click", async () => {
    try {
      // Clear the call timeout
      if (callTimeout) {
        clearTimeout(callTimeout)
        callTimeout = null
      }

      // Hide incoming call modal
      incomingCallModal.style.display = "none"

      // Show video call modal with connecting status
      videoCallModal.style.display = "block"
      remoteVideoLabel.textContent = targetUser
      callStatus.textContent = "Connecting..."
      callStatus.style.display = "block"

      // Get local media stream
      await setupLocalStream()

      // Create peer connection
      createPeerConnection()

      // Add local tracks to peer connection
      addLocalStreamTracks()

      // Send call accepted to caller
      logEvent("Accepting call", { target: targetUser })
      socket.emit("call-accepted", {
        target: targetUser,
        acceptor: currentUser,
      })
    } catch (error) {
      logEvent("Error accepting call", error)
      alert("Could not accept video call. Please check your camera and microphone permissions.")

      // Notify caller that call was rejected due to error
      socket.emit("call-rejected", {
        target: targetUser,
        rejector: currentUser,
        reason: "error",
      })

      cleanupCall()
    }
  })

  // Reject call button click handler
  rejectCallBtn.addEventListener("click", () => {
    // Clear the call timeout
    if (callTimeout) {
      clearTimeout(callTimeout)
      callTimeout = null
    }

    // Hide incoming call modal
    incomingCallModal.style.display = "none"

    // Send call rejected to caller
    logEvent("Rejecting call", { target: targetUser })
    socket.emit("call-rejected", {
      target: targetUser,
      rejector: currentUser,
      reason: "rejected",
    })

    // Add system message to chat
    addCallHistoryMessage(`You declined a call from ${targetUser}`)

    // Reset target user
    targetUser = null
  })

  // Handle call accepted
  socket.on("call-accepted", async ({ acceptor }) => {
    logEvent("Call accepted", { acceptor })

    // Clear the call timeout
    if (callTimeout) {
      clearTimeout(callTimeout)
      callTimeout = null
    }

    callStatus.textContent = "Setting up connection..."

    try {
      // Create peer connection if not already created
      if (!peerConnection) {
        createPeerConnection()
        addLocalStreamTracks()
      }

      // Create and send offer
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })

      await peerConnection.setLocalDescription(offer)

      logEvent("Sending offer", { target: acceptor, offer })
      socket.emit("call-offer", {
        target: acceptor,
        caller: currentUser,
        offer: peerConnection.localDescription,
      })

      callInProgress = true
    } catch (error) {
      logEvent("Error creating offer", error)
      alert("Error establishing connection. Please try again.")
      endCall()
    }
  })

  // Handle call rejected
  socket.on("call-rejected", ({ rejector, reason }) => {
    logEvent("Call rejected", { rejector, reason })

    // Clear the call timeout
    if (callTimeout) {
      clearTimeout(callTimeout)
      callTimeout = null
    }

    // Show appropriate message based on reason
    if (reason === "no_answer") {
      alert(`${rejector} did not answer the call.`)
    } else if (reason === "error") {
      alert(`${rejector} couldn't connect due to a technical issue.`)
    } else {
      alert(`${rejector} declined your call.`)
    }

    // Add system message to chat
    addCallHistoryMessage(`${rejector} declined your call`)

    // Clean up call resources
    cleanupCall()
  })

  // Handle call offer
  socket.on("call-offer", async ({ caller, offer }) => {
    logEvent("Received offer", { caller, offer })

    try {
      // Create peer connection if not already created
      if (!peerConnection) {
        createPeerConnection()
        addLocalStreamTracks()
      }

      // Set remote description
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))

      // Create answer
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)

      logEvent("Sending answer", { target: caller, answer })
      socket.emit("call-answer", {
        target: caller,
        answerer: currentUser,
        answer: peerConnection.localDescription,
      })
    } catch (error) {
      logEvent("Error handling offer", error)
      alert("Error establishing connection. Please try again.")
      endCall()
    }
  })

  // Handle call answer
  socket.on("call-answer", async ({ answerer, answer }) => {
    logEvent("Received answer", { answerer, answer })

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      callStatus.textContent = "Connected"
      setTimeout(() => {
        if (callStatus) callStatus.style.display = "none"
      }, 2000)
    } catch (error) {
      logEvent("Error handling answer", error)
      alert("Error establishing connection. Please try again.")
      endCall()
    }
  })

  // Handle ICE candidate
  socket.on("ice-candidate", async ({ candidate }) => {
    logEvent("Received ICE candidate", { candidate })

    try {
      if (peerConnection && peerConnection.remoteDescription && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      } else if (candidate) {
        // Queue candidates if remote description is not set yet
        setTimeout(async () => {
          if (peerConnection && peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          }
        }, 1000)
      }
    } catch (error) {
      logEvent("Error adding ICE candidate", error)
    }
  })

  // Handle call ended
  socket.on("call-ended", ({ ender }) => {
    logEvent("Call ended", { ender })

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
      if (localStream) {
        return localStream
      }

      // Show loading status
      if (callStatus) {
        callStatus.textContent = "Requesting camera access..."
        callStatus.style.display = "block"
      }

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
      logEvent("Error accessing media devices", error)

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
      if (peerConnection) {
        return peerConnection
      }

      peerConnection = new RTCPeerConnection(iceServers)

      // Handle ICE candidate events
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          logEvent("Generated ICE candidate", event.candidate)
          socket.emit("ice-candidate", {
            target: targetUser,
            candidate: event.candidate,
          })
        }
      }

      // Log ICE gathering state changes
      peerConnection.onicegatheringstatechange = () => {
        logEvent("ICE gathering state", peerConnection.iceGatheringState)
      }

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        logEvent("Connection state", peerConnection.connectionState)

        if (peerConnection.connectionState === "connected") {
          callStatus.textContent = "Connected"
          setTimeout(() => {
            if (callStatus) callStatus.style.display = "none"
          }, 2000)
          callInProgress = true
        } else if (
          peerConnection.connectionState === "disconnected" ||
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "closed"
        ) {
          if (callStatus) {
            callStatus.textContent = "Connection lost"
            callStatus.style.display = "block"
          }

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
        logEvent("ICE connection state", peerConnection.iceConnectionState)

        if (peerConnection.iceConnectionState === "connected") {
          callStatus.textContent = "Connected"
          setTimeout(() => {
            if (callStatus) callStatus.style.display = "none"
          }, 2000)
        } else if (
          peerConnection.iceConnectionState === "disconnected" ||
          peerConnection.iceConnectionState === "failed" ||
          peerConnection.iceConnectionState === "closed"
        ) {
          if (callStatus) {
            callStatus.textContent = "Connection issue"
            callStatus.style.display = "block"
          }
        }
      }

      // Handle remote track events
      peerConnection.ontrack = (event) => {
        logEvent("Remote track received", event.track.kind)
        remoteStream = event.streams[0]
        if (remoteVideo) {
          remoteVideo.srcObject = remoteStream

          // Hide the call status when we start receiving video
          setTimeout(() => {
            if (callStatus) callStatus.style.display = "none"
          }, 1000)
        }
      }

      return peerConnection
    } catch (error) {
      logEvent("Error creating peer connection", error)
      throw error
    }
  }

  // Add local stream tracks to peer connection
  function addLocalStreamTracks() {
    if (localStream && peerConnection) {
      localStream.getTracks().forEach((track) => {
        logEvent("Adding local track to peer connection", track.kind)
        peerConnection.addTrack(track, localStream)
      })
    }
  }

  // End call and clean up resources
  function endCall() {
    // Clear the call timeout
    if (callTimeout) {
      clearTimeout(callTimeout)
      callTimeout = null
    }

    if (targetUser) {
      // Notify other user that call has ended
      logEvent("Ending call", { target: targetUser })
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
    // Hide modals
    videoCallModal.style.display = "none"
    incomingCallModal.style.display = "none"

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
    if (toggleAudioBtn) {
      toggleAudioBtn.innerHTML = '<i class="fas fa-microphone"></i>'
      toggleAudioBtn.classList.remove("muted")
    }

    if (toggleVideoBtn) {
      toggleVideoBtn.innerHTML = '<i class="fas fa-video"></i>'
      toggleVideoBtn.classList.remove("muted")
    }

    logEvent("Call resources cleaned up", {})
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

    // Save message if window.saveMessage exists
    if (typeof window.saveMessage === "function") {
      window.saveMessage(callMessage)
    }
  }

  // Play call sound
  function playCallSound() {
    try {
      // Create audio element
      const audio = new Audio()
      audio.src =
        "data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV"
      audio.loop = true
      audio.play().catch((e) => logEvent("Error playing sound", e))

      // Stop after 30 seconds
      setTimeout(() => {
        audio.pause()
        audio.src = ""
      }, 30000)

      // Store reference to stop when call is answered/rejected
      window.callSound = audio

      // Stop sound when call is accepted or rejected
      acceptCallBtn.addEventListener(
        "click",
        () => {
          if (window.callSound) {
            window.callSound.pause()
            window.callSound.src = ""
            window.callSound = null
          }
        },
        { once: true },
      )

      rejectCallBtn.addEventListener(
        "click",
        () => {
          if (window.callSound) {
            window.callSound.pause()
            window.callSound.src = ""
            window.callSound = null
          }
        },
        { once: true },
      )
    } catch (e) {
      logEvent("Error with call sound", e)
    }
  }

  // Handle window beforeunload event to end call when page is closed
  window.addEventListener("beforeunload", () => {
    if (callInProgress) {
      endCall()
    }
  })
})
