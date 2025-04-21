const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const users = {};
const rooms = {};

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('Server: A user connected:', socket.id);

    socket.on('joinRoom', ({ username, roomCode }) => {
        socket.join(roomCode);
        users[socket.id] = { username, roomCode };

        if (!rooms[roomCode]) {
            rooms[roomCode] = [];
        }
        rooms[roomCode].push(socket.id);

        socket.to(roomCode).emit('userJoined', username);
        console.log(`Server: ${username} joined room ${roomCode} (Socket ID: ${socket.id})`);
        console.log('Server: Current rooms:', rooms);
    });

    socket.on('sendMessage', (message) => {
        const user = users[socket.id];
        if (user) {
            console.log('Server (receive): Received sendMessage from', user.username, 'in room', user.roomCode, ':', message);
            io.to(user.roomCode).emit('newMessage', {
                username: user.username,
                text: message
            });
            console.log('Server (emit): Emitted newMessage to room', user.roomCode);
        }
    });

    socket.on('sendImage', (imageData) => {
        const user = users[socket.id];
        if (user) {
            console.log('Server (receive): Received sendImage from', user.username, 'in room', user.roomCode, '(Data length:', imageData.length, 'first 50 chars:', imageData.substring(0, 50), ')');
            io.to(user.roomCode).emit('newImage', {
                username: user.username,
                data: imageData
            });
            console.log('Server (emit): Emitted newImage to room', user.roomCode);
        }
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            const { username, roomCode } = user;
            socket.leave(roomCode);
            if (rooms[roomCode]) {
                rooms[roomCode] = rooms[roomCode].filter(id => id !== socket.id);
                if (rooms[roomCode].length === 0) {
                    delete rooms[roomCode];
                }
            }
            socket.to(roomCode).emit('userLeft', username);
            delete users[socket.id];
            console.log(`Server: ${username} left room ${roomCode} (Socket ID: ${socket.id})`);
            console.log('Server: Current rooms:', rooms);
        }
        console.log('Server: A user disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});