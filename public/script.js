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
const openCameraButton = document.getElementById('open-camera-button');
const fileUpload = document.getElementById('file-upload');
const logoutButton = document.getElementById('logout-button');
const clearChatButton = document.getElementById('clear-chat-button');
const cameraModal = document.getElementById('camera-modal');
const cameraStream = document.getElementById('camera-stream');
const captureButton = document.getElementById('capture-button');
const uploadFromDeviceButton = document.getElementById('upload-from-device-button');
const closeCameraButton = document.getElementById('close-camera-button');

// Encryption Key
const encryptionKey = 'your-secret-encryption-key'; // Replace with a strong, secret key

let currentUsername = '';
let currentRoomCode = '';
const chatStorageKey = 'chatMessages';
const userStorageKey = 'userSession';
let capturedImage = null;
let currentStream = null;
const cameraSelect = document.createElement('select'); // Create a select dropdown

// Function to encrypt a message
function encryptMessage(message) {
    return CryptoJS.AES.encrypt(message, encryptionKey).toString();
}

// Function to decrypt a message
function decryptMessage(encryptedMessage) {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedMessage, encryptionKey);
        return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
        console.error("Error decrypting message:", error);
        return encryptedMessage; // Return the original if decryption fails
    }
}

// Function to display a message
function displayMessage(data, isMe = false) {
    const li = document.createElement('li');
    li.classList.toggle('me', isMe);
    li.innerHTML = `<strong>${data.username}:</strong> ${data.text}`;
    if (isMe) {
        li.innerHTML += ` <span class="message-status single-tick"></span>`;
    }
    messagesList.appendChild(li);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    saveChat();
}

// Function to display an image message
function displayImage(data, isMe = false) {
    const li = document.createElement('li');
    li.classList.toggle('me', isMe);
    li.innerHTML = `<strong>${data.username}:</strong> <img src="${data.data}" alt="Image">`;
    if (isMe) {
        li.innerHTML += ` <span class="message-status single-tick"></span>`;
    }
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

// Function to get available cameras
async function getCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        const videoOptions = [];
        videoDevices.forEach(device => {
            let label = device.label || `Camera ${videoOptions.length + 1}`;
            if (label.toLowerCase().includes('back') || label.toLowerCase().includes('rear')) {
                label = 'Rear Camera';
            } else if (label.toLowerCase().includes('front')) {
                label = 'Front Camera';
            }
            videoOptions.push({ deviceId: device.deviceId, label: label });
        });

        cameraSelect.innerHTML = ''; // Clear previous options
        // Remove duplicate labels and prioritize front/rear
        const uniqueOptions = [];
        const seenLabels = {};
        videoOptions.forEach(option => {
            if (!seenLabels[option.label]) {
                uniqueOptions.push(option);
                seenLabels[option.label] = true;
            }
        });

        uniqueOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.deviceId;
            optionElement.textContent = option.label;
            cameraSelect.appendChild(optionElement);
        });

        const cameraControls = cameraModal.querySelector('#camera-controls');
        if (uniqueOptions.length > 1 && !cameraControls.contains(cameraSelect)) {
            cameraControls.insertBefore(cameraSelect, captureButton); // Add it to the modal if multiple cameras
        } else if (uniqueOptions.length <= 1 && cameraControls.contains(cameraSelect)) {
            cameraControls.removeChild(cameraSelect); // Remove if only one or none
        }

    } catch (error) {
        console.error('Error enumerating devices:', error);
        alert('Could not access camera information.');
    }
}

// Function to start the camera with a specific device ID
async function startCamera(deviceId) {
    try {
        const constraints = {
            video: { deviceId: deviceId ? { exact: deviceId } : undefined },
            audio: false
        };
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        cameraStream.srcObject = currentStream;
    } catch (error) {
        console.error('Error accessing camera:', error);
        alert('Could not access the selected camera.');
        cameraModal.style.display = 'none';
        chatScreen.style.display = 'flex';
    }
}

// Event listener to open the camera modal
openCameraButton.addEventListener('click', async () => {
    chatScreen.style.display = 'none'; // Hide the chat screen
    cameraModal.style.display = 'flex'; // Show the camera modal
    await getCameras(); // Populate the camera selection
    startCamera(cameraSelect.value); // Start with the initially selected camera
});

// Event listener for camera selection change
cameraSelect.addEventListener('change', () => {
    stopCamera();
    startCamera(cameraSelect.value);
});

// Event listener to capture a photo
captureButton.addEventListener('click', () => {
    if (currentStream) {
        const canvas = document.createElement('canvas');
        const videoTrack = currentStream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        canvas.width = settings.width;
        canvas.height = settings.height;
        const context = canvas.getContext('2d');
        context.drawImage(cameraStream, 0, 0, canvas.width, canvas.height);
        capturedImage = canvas.toDataURL('image/png'); // Convert to base64
        stopCamera();
        sendMessage(capturedImage, true); // Send the captured image
        cameraModal.style.display = 'none';
        chatScreen.style.display = 'flex'; // Show the chat screen after sending
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
    cameraModal.style.display = 'none';
    chatScreen.style.display = 'flex'; // Show chat after upload
});

// Event listener to close the camera modal
closeCameraButton.addEventListener('click', () => {
    cameraModal.style.display = 'none';
    chatScreen.style.display = 'flex'; // Show the chat screen again
    stopCamera();
});

// Function to stop the camera
function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        cameraStream.srcObject = null;
        currentStream = null;
    }
}

// Modified sendMessage function to handle both text and image (with single tick on send)
function sendMessage(data, isImage = false) {
    if (isImage && data) {
        console.log('Client (send): Emitting sendImage:', data.substring(0, 50));
        socket.emit('sendImage', data);
        displayImage({ username: currentUsername, data: data }, true);
        // Immediately mark as sent (single tick)
        const lastMessage = messagesList.lastElementChild;
        if (lastMessage && lastMessage.classList.contains('me')) {
            const statusSpan = lastMessage.querySelector('.message-status');
            if (statusSpan) {
                statusSpan.classList.remove('double-tick'); // Remove if it was added previously
                statusSpan.classList.add('single-tick');
            }
        }
    } else if (!isImage && data.trim()) {
        const encryptedText = encryptMessage(data);
        console.log('Client (send): Emitting sendMessage (encrypted):', encryptedText);
        socket.emit('sendMessage', encryptedText);
        displayMessage({ username: currentUsername, text: data }, true); // Display original message
        messageInput.value = '';
        // Immediately mark as sent (single tick)
        const lastMessage = messagesList.lastElementChild;
        if (lastMessage && lastMessage.classList.contains('me')) {
            const statusSpan = lastMessage.querySelector('.message-status');
            if (statusSpan) {
                statusSpan.classList.remove('double-tick'); // Remove if it was added previously
                statusSpan.classList.add('single-tick');
            }
        }
    }
}

// To simulate a delivered state (this is a basic example and would need server-side logic)
socket.on('messageDelivered', (messageData) => {
    const messages = messagesList.querySelectorAll('li.me');
    messages.forEach(msg => {
        const textContent = msg.textContent.split(' ').slice(1, -1).join(' '); // Extract message text
        if (textContent === messageData.text && msg.querySelector('.message-status.single-tick')) {
            const statusSpan = msg.querySelector('.message-status');
            statusSpan.classList.remove('single-tick');
            statusSpan.classList.add('delivered-tick');
        } else if (msg.querySelector('.message-status.single-tick') && messageData.isImage && msg.innerHTML.includes(`<img src="${messageData.data.substring(0, 50)}`)) {
            const statusSpan = msg.querySelector('.message-status');
            statusSpan.classList.remove('single-tick');
            statusSpan.classList.add('delivered-tick');
        }
    });
});

// Event listener for receiving a new text message (with decryption)
socket.on('newMessage', (data) => {
    console.log('Client (receive): Received newMessage (encrypted):', data);
    if (data.username !== currentUsername) {
        const decryptedText = decryptMessage(data.text);
        displayMessage({ ...data, text: decryptedText });
    }
});

// Event listener for receiving a new image message
socket.on('newImage', (data) => {
    console.log('Client (receive): Received newImage:', data);
    if (data.username !== currentUsername) {
        displayImage({ username: data.username, data: data.data }, false);
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

// Initial setup: Add camera selection to the modal
cameraModal.addEventListener('show', async () => {
    await getCameras();
});

// Load user session on initial load
loadUserSession();
