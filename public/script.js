document.addEventListener("DOMContentLoaded", () => {
  // Set current year in footer
  document.getElementById("current-year").textContent = new Date().getFullYear().toString()

  // DOM Elements
  const loginScreen = document.getElementById("login-screen")
  const chatScreen = document.getElementById("chat-screen")
  const joinBtn = document.getElementById("join-btn")
  const logoutBtn = document.getElementById("logout-btn")
  const usernameInput = document.getElementById("username")
  const roomCodeInput = document.getElementById("room-code")
  const roomTitle = document.getElementById("room-title")
  const userCount = document.getElementById("user-count")
  const usersList = document.getElementById("users-list")
  const chatMessages = document.getElementById("chat-messages")
  const chatForm = document.getElementById("chat-form")
  const messageInput = document.getElementById("message-input")
  const imageUpload = document.getElementById("image-upload")
  const userCountElement = document.querySelector(".user-count")
  const clearChatBtn = document.getElementById("clear-chat-btn")
  const cameraBtn = document.getElementById("camera-btn")
  const cameraModal = document.getElementById("camera-modal")
  const closeModal = document.querySelector(".close-modal")
  const switchCameraBtn = document.getElementById("switch-camera-btn")
  const captureBtn = document.getElementById("capture-btn")
  const cameraView = document.getElementById("camera-view")
  const cameraCanvas = document.getElementById("camera-canvas")
  const chatSidebar = document.getElementById("chat-sidebar")
  const closeSidebar = document.getElementById("close-sidebar")
  const loadingOverlay = document.getElementById("loading-overlay")

  // Variables for camera
  let stream = null
  let facingMode = "user" // Start with front camera
  let currentRoomMessages = []
  let capturedImage = null
  let isProcessingImage = false

  // Initialize Socket.IO
  const socket = io()

  // Join chat room
  joinBtn.addEventListener("click", () => {
    const username = usernameInput.value.trim()
    const roomCode = roomCodeInput.value.trim()

    if (!username || !roomCode) {
      alert("Please enter both your name and room code")
      return
    }

    // Join room via socket
    socket.emit("join", { username, roomCode })

    // Update UI
    roomTitle.textContent = `Room: ${roomCode}`
    loginScreen.classList.remove("active")
    chatScreen.classList.add("active")

    // Store session info
    sessionStorage.setItem("username", username)
    sessionStorage.setItem("roomCode", roomCode)
  })

  // Check for existing session
  const savedUsername = sessionStorage.getItem("username")
  const savedRoomCode = sessionStorage.getItem("roomCode")

  // Load saved messages from localStorage
  function loadSavedMessages() {
    const roomCode = sessionStorage.getItem("roomCode")
    if (!roomCode) return

    const savedMessages = localStorage.getItem(`chat_messages_${roomCode}`)
    if (savedMessages) {
      try {
        const messages = JSON.parse(savedMessages)
        currentRoomMessages = messages

        // Display saved messages
        chatMessages.innerHTML = ""
        messages.forEach((message) => {
          if (message.image) {
            displayImageMessage(message)
          } else {
            displayMessage(message)
          }
        })

        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight
      } catch (error) {
        console.error("Error loading saved messages:", error)
      }
    }
  }

  // Save message to localStorage
  function saveMessage(message) {
    const roomCode = sessionStorage.getItem("roomCode")
    if (!roomCode) return

    currentRoomMessages.push(message)
    localStorage.setItem(`chat_messages_${roomCode}`, JSON.stringify(currentRoomMessages))
  }

  if (savedUsername && savedRoomCode) {
    usernameInput.value = savedUsername
    roomCodeInput.value = savedRoomCode

    // Auto-join if session exists
    socket.emit("join", {
      username: savedUsername,
      roomCode: savedRoomCode,
    })

    roomTitle.textContent = `Room: ${savedRoomCode}`
    loginScreen.classList.remove("active")
    chatScreen.classList.add("active")

    // Load saved messages if session exists
    loadSavedMessages()
  }

  // Send message
  chatForm.addEventListener("submit", (e) => {
    e.preventDefault()

    const messageText = messageInput.value.trim()

    if (messageText) {
      // Emit message to server
      socket.emit("sendMessage", { text: messageText })

      // Clear input
      messageInput.value = ""
      messageInput.focus()
    }
  })

  // Handle image upload
  imageUpload.addEventListener("change", (e) => {
    const file = e.target.files[0]

    if (file) {
      if (!file.type.match("image.*")) {
        alert("Please select an image file")
        return
      }

      // Show loading overlay
      loadingOverlay.style.display = "flex"
      isProcessingImage = true

      const reader = new FileReader()

      reader.onload = (event) => {
        const imageData = event.target.result

        // Process image to prevent app from crashing
        processImage(imageData)
          .then((processedImage) => {
            socket.emit("sendImage", processedImage)
            isProcessingImage = false
            loadingOverlay.style.display = "none"
          })
          .catch((error) => {
            console.error("Error processing image:", error)
            alert("There was an error processing your image. Please try again with a smaller image.")
            isProcessingImage = false
            loadingOverlay.style.display = "none"
          })
      }

      reader.onerror = () => {
        alert("Error reading the image file")
        isProcessingImage = false
        loadingOverlay.style.display = "none"
      }

      reader.readAsDataURL(file)

      // Reset file input
      e.target.value = ""
    }
  })

  // Process image to prevent app from crashing with large images
  function processImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        // Create a canvas to resize the image if needed
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")

        // Set maximum dimensions
        const MAX_WIDTH = 1200
        const MAX_HEIGHT = 1200

        let width = img.width
        let height = img.height

        // Resize if needed
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          if (width > height) {
            height = Math.round(height * (MAX_WIDTH / width))
            width = MAX_WIDTH
          } else {
            width = Math.round(width * (MAX_HEIGHT / height))
            height = MAX_HEIGHT
          }
        }

        // Set canvas dimensions
        canvas.width = width
        canvas.height = height

        // Draw image on canvas
        ctx.drawImage(img, 0, 0, width, height)

        // Get compressed image
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.8)
        resolve(compressedDataUrl)
      }

      img.onerror = () => {
        reject(new Error("Failed to load image"))
      }

      img.src = dataUrl
    })
  }

  // Logout
  logoutBtn.addEventListener("click", () => {
    // Prevent logout if processing image
    if (isProcessingImage) {
      alert("Please wait until image processing is complete")
      return
    }

    // Clear session
    sessionStorage.removeItem("username")
    sessionStorage.removeItem("roomCode")

    // Emit logout event
    socket.emit("logout")

    // Refresh the page
    window.location.reload()
  })

  // Socket event listeners

  // Handle user joined event
  socket.on("userJoined", ({ user, users }) => {
    // Update users list
    updateUsersList(users)
  })

  // Handle user left event
  socket.on("userLeft", ({ user, users }) => {
    // Update users list
    updateUsersList(users)
  })

  // Handle incoming messages
  socket.on("message", (message) => {
    displayMessage(message)
    saveMessage(message)

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight
  })

  // Handle incoming image messages
  socket.on("imageMessage", (message) => {
    displayImageMessage(message)
    saveMessage(message)

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight
  })

  // Mobile sidebar toggle
  userCountElement.addEventListener("click", () => {
    chatSidebar.classList.add("show")
  })

  // Close sidebar button
  closeSidebar.addEventListener("click", () => {
    chatSidebar.classList.remove("show")
  })

  // Close sidebar when clicking outside on mobile
  document.addEventListener("click", (e) => {
    if (
      chatSidebar.classList.contains("show") &&
      !chatSidebar.contains(e.target) &&
      !userCountElement.contains(e.target)
    ) {
      chatSidebar.classList.remove("show")
    }
  })

  // Helper functions

  // Update users list
  function updateUsersList(users) {
    usersList.innerHTML = ""
    userCount.textContent = users.length

    users.forEach((user) => {
      const li = document.createElement("li")
      li.textContent = user.username
      usersList.appendChild(li)
    })
  }

  // Display text message
  function displayMessage(message) {
    const div = document.createElement("div")
    const currentUser = sessionStorage.getItem("username")

    if (message.user === "System") {
      div.classList.add("message", "system")
    } else if (message.user === currentUser) {
      div.classList.add("message", "self")
    } else {
      div.classList.add("message", "other")
    }

    // Create message header
    const header = document.createElement("div")
    header.classList.add("message-header")

    const username = document.createElement("span")
    username.textContent = message.user
    username.classList.add("message-username")

    const timestamp = document.createElement("span")
    timestamp.textContent = formatTime(new Date(message.timestamp))
    timestamp.classList.add("message-timestamp")

    header.appendChild(username)
    header.appendChild(timestamp)

    // Create message text
    const text = document.createElement("div")
    text.classList.add("message-text")
    text.textContent = message.text

    // Append to message div
    div.appendChild(header)
    div.appendChild(text)

    // Add to chat
    chatMessages.appendChild(div)
  }

  // Display image message
  function displayImageMessage(message) {
    const div = document.createElement("div")
    const currentUser = sessionStorage.getItem("username")

    if (message.user === currentUser) {
      div.classList.add("message", "self")
    } else {
      div.classList.add("message", "other")
    }

    // Create message header
    const header = document.createElement("div")
    header.classList.add("message-header")

    const username = document.createElement("span")
    username.textContent = message.user
    username.classList.add("message-username")

    const timestamp = document.createElement("span")
    timestamp.textContent = formatTime(new Date(message.timestamp))
    timestamp.classList.add("message-timestamp")

    header.appendChild(username)
    header.appendChild(timestamp)

    // Create image element
    const img = document.createElement("img")
    img.src = message.image
    img.alt = "Shared image"
    img.classList.add("message-image")

    // Add loading indicator
    img.onload = () => {
      // Image loaded successfully
    }

    img.onerror = () => {
      // Replace with error message if image fails to load
      img.style.display = "none"
      const errorText = document.createElement("div")
      errorText.textContent = "[Image could not be displayed]"
      errorText.style.fontStyle = "italic"
      errorText.style.color = "#999"
      div.appendChild(errorText)
    }

    // Append to message div
    div.appendChild(header)
    div.appendChild(img)

    // Add to chat
    chatMessages.appendChild(div)
  }

  // Format timestamp
  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  // Clear chat button
  clearChatBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear the chat history?")) {
      // Clear UI
      chatMessages.innerHTML = ""

      // Clear localStorage for this room
      const roomCode = sessionStorage.getItem("roomCode")
      if (roomCode) {
        localStorage.removeItem(`chat_messages_${roomCode}`)
        currentRoomMessages = []
      }
    }
  })

  // Camera button
  cameraBtn.addEventListener("click", (e) => {
    e.preventDefault() // Prevent form submission
    openCamera()
  })

  // Close camera modal
  closeModal.addEventListener("click", () => {
    closeCamera()
  })

  // Switch camera
  switchCameraBtn.addEventListener("click", () => {
    facingMode = facingMode === "user" ? "environment" : "user"
    openCamera() // Reopen with new facing mode
  })

  // Capture photo
  captureBtn.addEventListener("click", () => {
    const context = cameraCanvas.getContext("2d")
    const previewContainer = document.getElementById("preview-container")
    const previewImage = document.getElementById("preview-image")
    const cameraButtons = document.getElementById("camera-buttons")
    const previewButtons = document.getElementById("preview-buttons")

    // Set canvas dimensions to match video
    cameraCanvas.width = cameraView.videoWidth
    cameraCanvas.height = cameraView.videoHeight

    // Draw the video frame to the canvas
    context.drawImage(cameraView, 0, 0, cameraCanvas.width, cameraCanvas.height)

    // Get the image data as base64
    capturedImage = cameraCanvas.toDataURL("image/jpeg")

    // Show preview
    previewImage.src = capturedImage
    cameraView.style.display = "none"
    previewContainer.style.display = "block"
    cameraButtons.style.display = "none"
    previewButtons.style.display = "flex"
  })

  // Retake photo
  document.getElementById("retake-btn").addEventListener("click", () => {
    const previewContainer = document.getElementById("preview-container")
    const cameraButtons = document.getElementById("camera-buttons")
    const previewButtons = document.getElementById("preview-buttons")

    // Hide preview, show camera
    previewContainer.style.display = "none"
    cameraView.style.display = "block"
    previewButtons.style.display = "none"
    cameraButtons.style.display = "flex"
    capturedImage = null
  })

  // Send photo
  document.getElementById("send-photo-btn").addEventListener("click", () => {
    if (capturedImage) {
      // Show loading overlay
      loadingOverlay.style.display = "flex"
      isProcessingImage = true

      // Process image before sending
      processImage(capturedImage)
        .then((processedImage) => {
          // Send the image
          socket.emit("sendImage", processedImage)
          capturedImage = null
          isProcessingImage = false
          loadingOverlay.style.display = "none"

          // Close the camera modal
          closeCamera()
        })
        .catch((error) => {
          console.error("Error processing camera image:", error)
          alert("There was an error processing your image. Please try again.")
          isProcessingImage = false
          loadingOverlay.style.display = "none"
        })
    }
  })

  // Open camera
  function openCamera() {
    // Reset UI state
    const previewContainer = document.getElementById("preview-container")
    const cameraButtons = document.getElementById("camera-buttons")
    const previewButtons = document.getElementById("preview-buttons")

    previewContainer.style.display = "none"
    cameraView.style.display = "block"
    previewButtons.style.display = "none"
    cameraButtons.style.display = "flex"

    // Stop any existing stream
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
    }

    // Get camera access
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facingMode },
        audio: false,
      })
      .then((videoStream) => {
        stream = videoStream
        cameraView.srcObject = stream
        cameraModal.style.display = "block"
      })
      .catch((error) => {
        console.error("Error accessing camera:", error)
        alert("Could not access the camera. Please check permissions.")
      })
  }

  // Close camera
  function closeCamera() {
    cameraModal.style.display = "none"
    capturedImage = null

    // Stop all tracks
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      stream = null
    }
  }

  // Close modal if clicked outside
  window.addEventListener("click", (e) => {
    if (e.target === cameraModal) {
      closeCamera()
    }
  })
})
