const socket = io();

// DOM elements (updated)
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username');
const roomCodeInput = document.getElementById('room-code');
const joinButton = document.getElementById('join-button');
const loginError = document.getElementById('login-error');
const roomNameDisplay = document.getElementById('room-name');
const messagesContainer = document.getElementById('message-container');
const messagesList = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const openCameraButton = document.getElementById('open-camera-button'); // New camera button
const fileUpload = document.getElementById('file-upload'); // Hidden file input
const logoutButton = document.getElementById('logout-button');
const clearChatButton = document.getElementById('clear-chat-button');
const cameraModal = document.getElementById('camera-modal');
const cameraStream = document.getElementById('camera-stream');
const captureButton = document.getElementById('capture-button');
const uploadFromDeviceButton = document.getElementById('upload-from-device-button');
const closeCameraButton = document.getElementById('close-camera-button');

let currentUsername = '';
let currentRoomCode = '';
const chatStorageKey = 'chatMessages';
const userStorageKey = 'userSession';
let capturedImage = null;
let mediaStream = null;

// Function to display a message
function displayMessage(data, isMe = false) {
    const li = document.createElement('li');
    li.classList.toggle('me', isMe);
    li.innerHTML = `<strong>${data.username}:</strong> ${data.text}`;
    messagesList.appendChild(li);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    saveChat();
}

// Function to display an image message
function displayImage(data, isMe = false) {
    const li = document.createElement('li');
    li.classList.toggle('me', isMe);
    li.innerHTML = `<strong>${data.username}:</strong> <img src="${data.data}" alt="Image">`;
    messagesList.appendChild(li);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    saveChat();
}

// Function to save the chat messages to local storage
function saveChat() {
    const messages = messagesList.innerHTML;
    localStorage.setItem(chatStorageKey, messages);
}

// Function to load the chat messages from local storage
function loadChat() {
    const storedMessages = localStorage.getItem(chatStorageKey);
    if (storedMessages) {
        messagesList.innerHTML = storedMessages;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// Function to save the user session to local storage
function saveUserSession() {
    const session = { username: currentUsername, roomCode: currentRoomCode };
    localStorage.setItem(userStorageKey, JSON.stringify(session));
}

// Function to load the user session from local storage
function loadUserSession() {
    const storedSession = localStorage.getItem(userStorageKey);
    if (storedSession) {
        const session = JSON.parse(storedSession);
        currentUsername = session.username;
        currentRoomCode = session.roomCode;
        roomNameDisplay.textContent = currentRoomCode;
        loginScreen.style.display = 'none';
        chatScreen.style.display = 'flex';
        loadChat();
        socket.emit('joinRoom', { username: currentUsername, roomCode: currentRoomCode });
    }
}

// Event listener for joining a room
joinButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const roomCode = roomCodeInput.value.trim();

    if (username && roomCode) {
        currentUsername = username;
        currentRoomCode = roomCode;
        console.log('Client (join): Emitting joinRoom:', { username, roomCode });
        socket.emit('joinRoom', { username, roomCode });
        loginScreen.style.display = 'none';
        chatScreen.style.display = 'flex';
        roomNameDisplay.textContent = roomCode;
        loginError.textContent = '';
        saveUserSession();
        loadChat();
    } else {
        loginError.textContent = 'Please enter a username and room code.';
    }
});

// Event listener for sending a text message
sendButton.addEventListener('click', () => {
    const message = messageInput.value.trim();
    sendMessage(message);
});

messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendButton.click();
    }
});

// Event listener to open the camera modal
openCameraButton.addEventListener('click', () => {
    cameraModal.style.display = 'flex';
    startCamera();
});

// Function to start the camera
async function startCamera() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        cameraStream.srcObject = mediaStream;
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Could not access camera. Please check your permissions.');
        cameraModal.style.display = 'none';
    }
}

// Event listener to capture a photo
captureButton.addEventListener('click', () => {
    if (mediaStream) {
        const canvas = document.createElement('canvas');
        const videoTrack = mediaStream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        canvas.width = settings.width;
        canvas.height = settings.height;
        const context = canvas.getContext('2d');
        context.drawImage(cameraStream, 0, 0, canvas.width, canvas.height);
        capturedImage = canvas.toDataURL('image/png'); // Convert to base64
        stopCamera();
        sendMessage(capturedImage, true); // Send the captured image
        cameraModal.style.display = 'none';
    }
});

// Event listener for "Upload from Device" button in the modal
uploadFromDeviceButton.addEventListener('click', () => {
    fileUpload.click(); // Trigger the hidden file input
});

// Event listener for the hidden file input
fileUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = reader.result;
            sendMessage(base64Data, true); // Send the uploaded image
        };
        reader.readAsDataURL(file);
    }
    cameraModal.style.display = 'none'; // Close the modal after selecting a file
});

// Event listener to close the camera modal
closeCameraButton.addEventListener('click', () => {
    cameraModal.style.display = 'none';
    stopCamera();
});

// Function to stop the camera
function stopCamera() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        cameraStream.srcObject = null;
        mediaStream = null;
    }
}

// Modified sendMessage function to handle both text and image
function sendMessage(data, isImage = false) {
    if (isImage && data) {
        console.log('Client (send): Emitting sendImage (from camera/upload):', data.substring(0, 50));
        socket.emit('sendImage', data);
        displayImage({ username: currentUsername, data: data }, true);
    } else if (!isImage && data.trim()) {
        console.log('Client (send): Emitting sendMessage:', data);
        socket.emit('sendMessage', data);
        displayMessage({ username: currentUsername, text: data }, true);
        messageInput.value = '';
    }
}

// Event listener for receiving a new text message
socket.on('newMessage', (data) => {
    console.log('Client (receive): Received newMessage:', data);
    if (data.username !== currentUsername) {
        displayMessage(data);
    }
});

// Event listener for receiving a new image message
socket.on('newImage', (data) => {
    console.log('Client (receive): Received newImage:', data);
    if (data.username !== currentUsername) {
        displayImage(data, false);
    }
});

// Event listener for user joined notification
socket.on('userJoined', (username) => {
    console.log('Client (system): User joined:', username);
    const li = document.createElement('li');
    li.classList.add('system-message');
    li.textContent = `${username} joined the room.`;
    messagesList.appendChild(li);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Event listener for user left notification
socket.on('userLeft', (username) => {
    console.log('Client (system): User left:', username);
    const li = document.createElement('li');
    li.classList.add('system-message');
    li.textContent = `${username} left the room.`;
    messagesList.appendChild(li);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

socket.on('disconnect', () => {
    console.log('Client (system): Disconnected from server.');
});

socket.on('connect', () => {
    console.log('Client (system): Connected to server with ID:', socket.id);
    loadUserSession(); // Attempt to load session on connect
});

// Event listener for clear chat button
clearChatButton.addEventListener('click', () => {
    messagesList.innerHTML = '';
    localStorage.removeItem(chatStorageKey); // Clear stored chat as well
});

logoutButton.addEventListener('click', () => {
    console.log('Client (logout): Logout clicked.');
    loginScreen.style.display = 'flex';
    chatScreen.style.display = 'none';
    messagesList.innerHTML = '';
    localStorage.removeItem(chatStorageKey);
    localStorage.removeItem(userStorageKey); // Clear user session on logout
    currentUsername = '';
    currentRoomCode = '';
    socket.disconnect();
});