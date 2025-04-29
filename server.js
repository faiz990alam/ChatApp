import express from "express"
import http from "http"
import { Server } from "socket.io"
import path from "path"
import { fileURLToPath } from "url"

// Setup paths for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Initialize Express app and HTTP server
const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  maxHttpBufferSize: 1e9, // 1GB buffer size for large files
  pingTimeout: 120000, // Increase timeout for large transfers
})

// Serve static files
app.use(express.static(path.join(__dirname, "public")))

// In-memory storage for active rooms and users
const rooms = {}

// Socket.IO connection handling
io.on("connection", (socket) => {
  let currentRoom = null
  let currentUser = null

  // Handle user joining a room
  socket.on("join", ({ username, roomCode }) => {
    currentUser = username
    currentRoom = roomCode

    // Create room if it doesn't exist
    if (!rooms[roomCode]) {
      rooms[roomCode] = { users: [] }
    }

    // Add user to room
    rooms[roomCode].users.push({
      id: socket.id,
      username,
    })

    // Join the Socket.IO room
    socket.join(roomCode)

    // Notify everyone in the room
    io.to(roomCode).emit("userJoined", {
      user: username,
      users: rooms[roomCode].users,
    })

    // Send welcome message to the user
    socket.emit("message", {
      user: "System",
      text: `Welcome to the chat room, ${username}!`,
      timestamp: new Date().toISOString(),
    })

    // Broadcast to others in the room
    socket.to(roomCode).emit("message", {
      user: "System",
      text: `${username} has joined the chat!`,
      timestamp: new Date().toISOString(),
    })
  })

  // Handle chat messages
  socket.on("sendMessage", (message) => {
    if (currentRoom) {
      io.to(currentRoom).emit("message", {
        user: currentUser,
        ...message,
        timestamp: new Date().toISOString(),
      })
    }
  })

  // Handle image messages
  socket.on("sendImage", (imageData) => {
    if (currentRoom) {
      io.to(currentRoom).emit("imageMessage", {
        user: currentUser,
        image: imageData,
        timestamp: new Date().toISOString(),
      })
    }
  })

  // Handle PDF messages
  socket.on("sendPDF", (pdfData) => {
    if (currentRoom) {
      io.to(currentRoom).emit("pdfMessage", {
        user: currentUser,
        pdf: pdfData.data,
        filename: pdfData.filename,
        filesize: pdfData.filesize,
        timestamp: new Date().toISOString(),
      })
    }
  })

  // Video call signaling

  // Handle call initiation
  socket.on("call-user", ({ target, caller }) => {
    if (currentRoom) {
      // Find target user in the room
      const targetUser = rooms[currentRoom].users.find((user) => user.username === target)
      if (targetUser) {
        // Send incoming call notification to target user
        io.to(targetUser.id).emit("incoming-call", { caller })
      }
    }
  })

  // Handle call acceptance
  socket.on("call-accepted", ({ target, acceptor }) => {
    if (currentRoom) {
      // Find target user in the room
      const targetUser = rooms[currentRoom].users.find((user) => user.username === target)
      if (targetUser) {
        // Notify caller that call was accepted
        io.to(targetUser.id).emit("call-accepted", { acceptor })
      }
    }
  })

  // Handle call rejection
  socket.on("call-rejected", ({ target, rejector }) => {
    if (currentRoom) {
      // Find target user in the room
      const targetUser = rooms[currentRoom].users.find((user) => user.username === target)
      if (targetUser) {
        // Notify caller that call was rejected
        io.to(targetUser.id).emit("call-rejected", { rejector })
      }
    }
  })

  // Handle call offer
  socket.on("call-offer", ({ target, caller, offer }) => {
    if (currentRoom) {
      // Find target user in the room
      const targetUser = rooms[currentRoom].users.find((user) => user.username === target)
      if (targetUser) {
        // Send offer to target user
        io.to(targetUser.id).emit("call-offer", { caller, offer })
      }
    }
  })

  // Handle call answer
  socket.on("call-answer", ({ target, answerer, answer }) => {
    if (currentRoom) {
      // Find target user in the room
      const targetUser = rooms[currentRoom].users.find((user) => user.username === target)
      if (targetUser) {
        // Send answer to caller
        io.to(targetUser.id).emit("call-answer", { answerer, answer })
      }
    }
  })

  // Handle ICE candidates
  socket.on("ice-candidate", ({ target, candidate }) => {
    if (currentRoom) {
      // Find target user in the room
      const targetUser = rooms[currentRoom].users.find((user) => user.username === target)
      if (targetUser) {
        // Send ICE candidate to target user
        io.to(targetUser.id).emit("ice-candidate", { candidate })
      }
    }
  })

  // Handle call end
  socket.on("call-ended", ({ target, ender }) => {
    if (currentRoom) {
      // Find target user in the room
      const targetUser = rooms[currentRoom].users.find((user) => user.username === target)
      if (targetUser) {
        // Notify target user that call was ended
        io.to(targetUser.id).emit("call-ended", { ender })
      }
    }
  })

  // Handle user disconnection
  socket.on("disconnect", () => {
    if (currentRoom && currentUser) {
      // Remove user from room
      if (rooms[currentRoom]) {
        rooms[currentRoom].users = rooms[currentRoom].users.filter((user) => user.id !== socket.id)

        // Delete room if empty
        if (rooms[currentRoom].users.length === 0) {
          delete rooms[currentRoom]
        } else {
          // Notify others that user has left
          socket.to(currentRoom).emit("message", {
            user: "System",
            text: `${currentUser} has left the chat.`,
            timestamp: new Date().toISOString(),
          })

          // Update user list for everyone in the room
          io.to(currentRoom).emit("userLeft", {
            user: currentUser,
            users: rooms[currentRoom].users,
          })
        }
      }
    }
  })

  // Handle explicit logout
  socket.on("logout", () => {
    socket.disconnect()
  })
})

// Start the server
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
