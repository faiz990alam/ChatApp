document.addEventListener("DOMContentLoaded", () => {
  // Set current year in footer and menu
  const currentYear = new Date().getFullYear().toString()
  document.getElementById("current-year").textContent = currentYear

  // Set the year in the menu footer when it's created
  const menuYearElement = document.getElementById("menu-year")
  if (menuYearElement) {
    menuYearElement.textContent = currentYear
  }

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
  const usersDropdownList = document.getElementById("users-dropdown-list")
  const chatMessages = document.getElementById("chat-messages")
  const chatForm = document.getElementById("chat-form")
  const messageInput = document.getElementById("message-input")
  const imageUpload = document.getElementById("image-upload")
  const userCountElement = document.querySelector(".user-count")
  const clearChatBtn = document.getElementById("clear-chat-btn")
  const cameraModal = document.getElementById("camera-modal")
  const closeModal = document.querySelectorAll(".close-modal")
  const switchCameraBtn = document.getElementById("switch-camera-btn")
  const captureBtn = document.getElementById("capture-btn")
  const cameraView = document.getElementById("camera-view")
  const cameraCanvas = document.getElementById("camera-canvas")
  const sideMenu = document.getElementById("side-menu")
  const menuBtn = document.getElementById("menu-btn")
  const closeMenu = document.getElementById("close-menu")
  const usersDropdown = document.getElementById("users-dropdown")
  const mediaBtn = document.getElementById("media-btn")
  const mediaOptionsModal = document.getElementById("media-options-modal")
  const captureCameraBtn = document.getElementById("capture-camera-btn")
  const uploadImageBtn = document.getElementById("upload-image-btn")
  const loadingOverlay = document.getElementById("loading-overlay")
  const previewContainer = document.getElementById("preview-container")
  const previewImage = document.getElementById("preview-image")
  const cameraButtons = document.getElementById("camera-buttons")
  const previewButtons = document.getElementById("preview-buttons")
  const retakeBtn = document.getElementById("retake-btn")
  const sendPhotoBtn = document.getElementById("send-photo-btn")

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

  // Optimized image processing function for large images
  function optimizeImage(dataUrl, maxWidth = 1600, maxHeight = 1600, quality = 0.7) {
    return new Promise((resolve, reject) => {
      // Create a new image to load the data URL
      const img = new Image()

      // Set up onload handler to process the image once it's loaded
      img.onload = () => {
        // Use setTimeout to prevent UI blocking
        setTimeout(() => {
          try {
            // Calculate new dimensions while maintaining aspect ratio
            let width = img.width
            let height = img.height

            // Only resize if the image is larger than the max dimensions
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height)
              width = Math.floor(width * ratio)
              height = Math.floor(height * ratio)
            }

            // Create a canvas to draw the resized image
            const canvas = document.createElement("canvas")
            canvas.width = width
            canvas.height = height

            // Draw the image on the canvas
            const ctx = canvas.getContext("2d")
            ctx.drawImage(img, 0, 0, width, height)

            // Get the compressed image as a data URL
            const compressedDataUrl = canvas.toDataURL("image/jpeg", quality)

            // Resolve the promise with the optimized image
            resolve(compressedDataUrl)
          } catch (error) {
            console.error("Error optimizing image:", error)
            // If optimization fails, return the original image
            resolve(dataUrl)
          }
        }, 0) // Use setTimeout with 0ms to defer execution to the next event loop
      }

      // Set up error handler
      img.onerror = () => {
        console.error("Failed to load image for optimization")
        // If loading fails, return the original image
        resolve(dataUrl)
      }

      // Load the image
      img.src = dataUrl
    })
  }

  // Handle image upload with optimized processing
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

        // Update loading message
        document.querySelector(".loading-overlay p").textContent = "Optimizing image..."

        // Optimize the image before sending
        optimizeImage(imageData)
          .then((optimizedImage) => {
            // Update loading message
            document.querySelector(".loading-overlay p").textContent = "Sending image..."

            // Send the optimized image
            socket.emit("sendImage", optimizedImage)
            isProcessingImage = false
            loadingOverlay.style.display = "none"
          })
          .catch((error) => {
            console.error("Error during image optimization:", error)
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

  // Menu button
  menuBtn.addEventListener("click", () => {
    sideMenu.classList.add("show")
  })

  // Close menu button
  closeMenu.addEventListener("click", () => {
    sideMenu.classList.remove("show")
  })

  // Close menu when clicking outside
  document.addEventListener("click", (e) => {
    if (
      sideMenu.classList.contains("show") &&
      !sideMenu.contains(e.target) &&
      e.target !== menuBtn &&
      !menuBtn.contains(e.target)
    ) {
      sideMenu.classList.remove("show")
    }
  })

  // User count click - show dropdown
  userCountElement.addEventListener("click", (e) => {
    e.stopPropagation()
    usersDropdown.classList.toggle("show")
  })

  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (
      usersDropdown.classList.contains("show") &&
      !usersDropdown.contains(e.target) &&
      e.target !== userCountElement &&
      !userCountElement.contains(e.target)
    ) {
      usersDropdown.classList.remove("show")
    }
  })

  // Media button click - show options
  mediaBtn.addEventListener("click", () => {
    mediaOptionsModal.style.display = "block"
  })

  // Capture from camera option
  captureCameraBtn.addEventListener("click", () => {
    mediaOptionsModal.style.display = "none"
    openCamera()
  })

  // Upload from device option
  uploadImageBtn.addEventListener("click", () => {
    mediaOptionsModal.style.display = "none"
    imageUpload.click()
  })

  // Close modals
  closeModal.forEach((closeBtn) => {
    closeBtn.addEventListener("click", function () {
      const modal = this.closest(".modal")
      if (modal === cameraModal) {
        closeCamera()
      } else {
        modal.style.display = "none"
      }
    })
  })

  // Helper functions

  // Update users list
  function updateUsersList(users) {
    // Update side menu users list
    usersList.innerHTML = ""
    // Update dropdown users list
    usersDropdownList.innerHTML = ""
    // Update user count
    userCount.textContent = users.length

    users.forEach((user) => {
      // Add to side menu list
      const li = document.createElement("li")
      li.textContent = user.username
      usersList.appendChild(li)

      // Add to dropdown list
      const dropdownLi = document.createElement("li")
      dropdownLi.textContent = user.username
      usersDropdownList.appendChild(dropdownLi)
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

    // Create image container
    const imageContainer = document.createElement("div")
    imageContainer.classList.add("message-image-container")

    // Create image element
    const img = document.createElement("img")
    img.src = message.image
    img.alt = "Shared image"
    img.classList.add("message-image")

    // Create download button
    const downloadBtn = document.createElement("button")
    downloadBtn.classList.add("download-image-btn")
    downloadBtn.title = "Download image"
    downloadBtn.innerHTML = '<i class="fas fa-download"></i>'

    // Add download functionality
    downloadBtn.addEventListener("click", () => {
      downloadImage(message.image, `shieldtalk-image-${Date.now()}.jpg`)
    })

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
      imageContainer.appendChild(errorText)
    }

    // Append to image container
    imageContainer.appendChild(img)
    imageContainer.appendChild(downloadBtn)

    // Append to message div
    div.appendChild(header)
    div.appendChild(imageContainer)

    // Add to chat
    chatMessages.appendChild(div)
  }

  // Download image function
  function downloadImage(dataUrl, filename) {
    const link = document.createElement("a")
    link.href = dataUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
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

      // Close the side menu after clearing
      sideMenu.classList.remove("show")

      // Refresh the page to reflect changes
      setTimeout(() => {
        window.location.reload()
      }, 300)
    }
  })

  // CAMERA FUNCTIONALITY
  // -------------------

  // Open camera function
  function openCamera() {
    console.log("Opening camera...")

    // Reset UI state
    previewContainer.style.display = "none"
    cameraView.style.display = "block"
    previewButtons.style.display = "none"
    cameraButtons.style.display = "flex"
    capturedImage = null

    // Stop any existing stream
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      stream = null
    }

    // Get camera access
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: facingMode },
        audio: false,
      })
      .then((videoStream) => {
        console.log("Camera stream obtained successfully")
        stream = videoStream
        cameraView.srcObject = stream

        // Apply mirror effect only for front camera (selfie mode)
        if (facingMode === "user") {
          cameraView.classList.add("mirror")
        } else {
          cameraView.classList.remove("mirror")
        }

        cameraModal.style.display = "block"
      })
      .catch((error) => {
        console.error("Error accessing camera:", error)
        alert("Could not access the camera. Please check permissions.")
      })
  }

  // Close camera function
  function closeCamera() {
    console.log("Closing camera...")
    cameraModal.style.display = "none"
    capturedImage = null

    // Stop all tracks
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      stream = null
    }
  }

  // Capture from camera option
  if (captureCameraBtn) {
    captureCameraBtn.addEventListener("click", () => {
      console.log("Capture camera button clicked")
      mediaOptionsModal.style.display = "none"
      openCamera()
    })
  }

  // Switch camera button
  if (switchCameraBtn) {
    switchCameraBtn.addEventListener("click", () => {
      console.log("Switch camera button clicked")
      // Toggle between front and back camera
      facingMode = facingMode === "user" ? "environment" : "user"

      // Stop current stream before reopening
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }

      // Reopen camera with new facing mode
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: facingMode },
          audio: false,
        })
        .then((videoStream) => {
          console.log("Camera switched successfully")
          stream = videoStream
          cameraView.srcObject = stream

          // Apply mirror effect only for front camera
          if (facingMode === "user") {
            cameraView.classList.add("mirror")
          } else {
            cameraView.classList.remove("mirror")
          }
        })
        .catch((error) => {
          console.error("Error switching camera:", error)
          alert("Could not switch camera. Please check permissions.")
        })
    })
  }

  // Capture photo button
  if (captureBtn) {
    captureBtn.addEventListener("click", () => {
      console.log("Capture button clicked")

      try {
        // Set canvas dimensions to match video
        cameraCanvas.width = cameraView.videoWidth
        cameraCanvas.height = cameraView.videoHeight

        console.log("Canvas dimensions set:", cameraCanvas.width, "x", cameraCanvas.height)

        const context = cameraCanvas.getContext("2d")

        // Clear the canvas first
        context.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height)

        if (facingMode === "user") {
          // For front camera, flip the image horizontally when drawing to canvas
          context.save()
          context.scale(-1, 1)
          context.drawImage(cameraView, -cameraCanvas.width, 0, cameraCanvas.width, cameraCanvas.height)
          context.restore()
          console.log("Front camera image captured (flipped)")
        } else {
          // For back camera, draw normally
          context.drawImage(cameraView, 0, 0, cameraCanvas.width, cameraCanvas.height)
          console.log("Back camera image captured")
        }

        // Get the image data as base64
        capturedImage = cameraCanvas.toDataURL("image/jpeg")
        console.log("Image captured successfully")

        // Show preview
        previewImage.src = capturedImage
        cameraView.style.display = "none"
        previewContainer.style.display = "block"
        cameraButtons.style.display = "none"
        previewButtons.style.display = "flex"
      } catch (error) {
        console.error("Error capturing image:", error)
        alert("There was an error capturing the image. Please try again.")
      }
    })
  }

  // Retake photo button
  if (retakeBtn) {
    retakeBtn.addEventListener("click", () => {
      console.log("Retake button clicked")
      // Hide preview, show camera
      previewContainer.style.display = "none"
      cameraView.style.display = "block"
      previewButtons.style.display = "none"
      cameraButtons.style.display = "flex"
      capturedImage = null
    })
  }

  // Send photo button
  if (sendPhotoBtn) {
    sendPhotoBtn.addEventListener("click", () => {
      console.log("Send photo button clicked")
      if (capturedImage) {
        // Show loading overlay
        loadingOverlay.style.display = "flex"
        document.querySelector(".loading-overlay p").textContent = "Optimizing image..."
        isProcessingImage = true

        // Optimize the captured image before sending
        optimizeImage(capturedImage)
          .then((optimizedImage) => {
            // Update loading message
            document.querySelector(".loading-overlay p").textContent = "Sending image..."

            // Send the optimized image
            socket.emit("sendImage", optimizedImage)
            console.log("Optimized image sent to server")

            capturedImage = null
            isProcessingImage = false
            loadingOverlay.style.display = "none"

            // Close the camera modal
            closeCamera()
          })
          .catch((error) => {
            console.error("Error optimizing camera image:", error)
            alert("There was an error processing your image. Please try again.")
            isProcessingImage = false
            loadingOverlay.style.display = "none"
          })
      }
    })
  }

  // Close modal if clicked outside
  window.addEventListener("click", (e) => {
    if (e.target === cameraModal) {
      closeCamera()
    } else if (e.target === mediaOptionsModal) {
      mediaOptionsModal.style.display = "none"
    }
  })
})
