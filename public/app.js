const socket = io();

let myPlayerKey = null;
let currentRoom = null;
let selectedPlayer = null; // 'Ashima' or 'Anjali'

// Player profiles
const players = {
    Ashima: { emoji: '🌸', color: '#FF69B4' },
    Anjali: { emoji: '🦋', color: '#9370DB' }
};

// DOM Elements
const welcomeScreen = document.getElementById('welcomeScreen');
const waitingScreen = document.getElementById('waitingScreen');
const setupScreen = document.getElementById('setupScreen');
const gameScreen = document.getElementById('gameScreen');
const gameOverScreen = document.getElementById('gameOverScreen');

const selectAshimaBtn = document.getElementById('selectAshima');
const selectAnjaliBtn = document.getElementById('selectAnjali');
const setupForm = document.getElementById('setupForm');
const setupError = document.getElementById('setupError');
const waitingForOpponent = document.getElementById('waitingForOpponent');
const messagesContainer = document.getElementById('messagesContainer');
const guessError = document.getElementById('guessError');
const playAgainBtn = document.getElementById('playAgainBtn');

// Screens management
function showScreen(screen) {
    [welcomeScreen, waitingScreen, setupScreen, gameScreen, gameOverScreen].forEach(s => {
        s.classList.add('hidden');
    });
    screen.classList.remove('hidden');
}

// Player selection
selectAshimaBtn.addEventListener('click', () => {
    selectedPlayer = 'Ashima';
    socket.emit('joinGame', { playerName: 'Ashima' });
});

selectAnjaliBtn.addEventListener('click', () => {
    selectedPlayer = 'Anjali';
    socket.emit('joinGame', { playerName: 'Anjali' });
});

// Setup form submission
setupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const word = document.getElementById('secretWord').value.trim();

    if (!word) {
        showSetupError('Please type a secret word!');
        return;
    }

    socket.emit('submitSetup', { name: selectedPlayer, word });
});

// Play again
playAgainBtn.addEventListener('click', () => {
    socket.emit('resetGame');
    showScreen(welcomeScreen);
    selectedPlayer = null;
});

// Socket event handlers
socket.on('gameState', (data) => {
    currentRoom = data.room;

    if (data.yourPlayer) {
        myPlayerKey = data.yourPlayer;
    }

    updateUI();
});

socket.on('yourPlayer', (playerKey) => {
    myPlayerKey = playerKey;
});

socket.on('setupError', (data) => {
    showSetupError(data.message);
});

socket.on('guessError', (data) => {
    showGuessError(data.message);
});

socket.on('error', (data) => {
    alert(data.message);
});

socket.on('playerLeft', (data) => {
    alert(data.message);
    showScreen(welcomeScreen);
    myPlayerKey = null;
    currentRoom = null;
    selectedPlayer = null;
});

socket.on('gameReset', () => {
    showScreen(welcomeScreen);
    myPlayerKey = null;
    currentRoom = null;
    selectedPlayer = null;
});

function showSetupError(message) {
    setupError.textContent = message;
    setupError.classList.remove('hidden');
    setTimeout(() => {
        setupError.classList.add('hidden');
    }, 5000);
}

function showGuessError(message) {
    guessError.textContent = message;
    guessError.classList.remove('hidden');
    setTimeout(() => {
        guessError.classList.add('hidden');
    }, 3000);
}

function getMaskedWord(word, guessedLetters) {
    return word.split('').map(letter =>
        guessedLetters.includes(letter.toLowerCase()) ? letter.toUpperCase() : '_'
    ).join(' ');
}

function getPlayerEmoji(name) {
    if (name === 'Ashima') return '🌸';
    if (name === 'Anjali') return '🦋';
    return '⭐';
}

function getSisterName(name) {
    if (name === 'Ashima') return 'Anjali';
    if (name === 'Anjali') return 'Ashima';
    return 'Sister';
}

function updateUI() {
    if (!currentRoom) return;

    const phase = currentRoom.phase;
    const myPlayer = currentRoom.players[myPlayerKey];
    const opponentKey = myPlayerKey === 'player1' ? 'player2' : 'player1';
    const opponent = currentRoom.players[opponentKey];

    // Update messages
    updateMessages();

    switch (phase) {
        case 'waiting':
            showScreen(waitingScreen);
            // Update waiting message with sister's name
            const sisterName = getSisterName(selectedPlayer);
            document.getElementById('waitingTitle').textContent = `Waiting for ${sisterName}...`;
            document.getElementById('waitingMessage').textContent = `Tell ${sisterName} to click her name to join!`;
            break;

        case 'setup':
            showScreen(setupScreen);
            document.getElementById('setupPrompt').textContent =
                `${selectedPlayer}, pick a word for ${getSisterName(selectedPlayer)} to guess!`;

            if (myPlayer.name && myPlayer.word) {
                setupForm.classList.add('hidden');
                waitingForOpponent.classList.remove('hidden');
                document.getElementById('waitingForSister').textContent =
                    `Waiting for ${getSisterName(selectedPlayer)} to pick her word...`;
            } else {
                setupForm.classList.remove('hidden');
                waitingForOpponent.classList.add('hidden');
            }
            break;

        case 'playing':
            showScreen(gameScreen);
            updateGameUI();
            break;

        case 'finished':
            showScreen(gameOverScreen);
            updateGameOverUI();
            break;
    }
}

function updateMessages() {
    if (!currentRoom || !currentRoom.messages) return;

    messagesContainer.innerHTML = '';
    currentRoom.messages.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message';

        // Add emoji for player messages
        let fromText = msg.from;
        if (msg.from === 'Ashima') fromText = '🌸 Ashima';
        else if (msg.from === 'Anjali') fromText = '🦋 Anjali';
        else if (msg.from === 'Referee') fromText = '✨ Game';

        msgDiv.innerHTML = `<span class="message-from">${fromText}:</span> ${msg.text}`;
        messagesContainer.appendChild(msgDiv);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateGameUI() {
    if (!currentRoom || !myPlayerKey) return;

    const myPlayer = currentRoom.players[myPlayerKey];
    const opponentKey = myPlayerKey === 'player1' ? 'player2' : 'player1';
    const opponent = currentRoom.players[opponentKey];

    // Update player names with emojis
    document.getElementById('yourName').textContent = myPlayer.name;
    document.getElementById('opponentName').textContent = opponent.name;
    document.getElementById('yourEmoji').textContent = getPlayerEmoji(myPlayer.name);
    document.getElementById('opponentEmoji').textContent = getPlayerEmoji(opponent.name);

    // Update your guessing progress (you're guessing opponent's word)
    document.getElementById('opponentWordMasked').textContent = getMaskedWord(opponent.word, myPlayer.guessedLetters);
    document.getElementById('yourGuessesLeft').textContent = myPlayer.guessesRemaining;
    document.getElementById('yourGuessedLetters').textContent = myPlayer.guessedLetters.length > 0
        ? myPlayer.guessedLetters.map(l => l.toUpperCase()).join(', ')
        : '-';

    // Update opponent's guessing progress (they're guessing your word)
    document.getElementById('yourWordMasked').textContent = getMaskedWord(myPlayer.word, opponent.guessedLetters);
    document.getElementById('opponentGuessesLeft').textContent = opponent.guessesRemaining;
    document.getElementById('opponentGuessedLetters').textContent = opponent.guessedLetters.length > 0
        ? opponent.guessedLetters.map(l => l.toUpperCase()).join(', ')
        : '-';

    // Update turn indicator
    const turnIndicator = document.getElementById('turnIndicator');
    const isMyTurn = currentRoom.currentTurn === myPlayerKey;

    if (isMyTurn) {
        turnIndicator.textContent = `${getPlayerEmoji(myPlayer.name)} Your turn, ${myPlayer.name}! Pick a letter!`;
        turnIndicator.className = 'turn-indicator your-turn';
    } else {
        turnIndicator.textContent = `${getPlayerEmoji(opponent.name)} ${opponent.name} is guessing...`;
        turnIndicator.className = 'turn-indicator opponent-turn';
    }

    // Update keyboard
    updateKeyboard(isMyTurn, myPlayer.guessedLetters, opponent.word);
}

function updateKeyboard(isMyTurn, guessedLetters, opponentWord) {
    const keyboardDiv = document.querySelector('.keyboard');
    keyboardDiv.innerHTML = '';

    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

    letters.forEach(letter => {
        const btn = document.createElement('button');
        btn.className = 'key';
        btn.textContent = letter.toUpperCase();

        if (guessedLetters.includes(letter)) {
            btn.classList.add('used');
            if (opponentWord.includes(letter)) {
                btn.classList.add('correct');
            } else {
                btn.classList.add('wrong');
            }
            btn.disabled = true;
        } else if (!isMyTurn) {
            btn.classList.add('disabled');
            btn.disabled = true;
        } else {
            btn.addEventListener('click', () => {
                socket.emit('guess', { letter });
            });
        }

        keyboardDiv.appendChild(btn);
    });
}

// Fireworks celebration effect
function createFirework(x, y) {
    const colors = ['#FF69B4', '#9370DB', '#FFD700', '#FF1493', '#8A2BE2', '#FF6B6B', '#4ECDC4'];
    const particleCount = 30;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'firework-particle';
        particle.style.left = x + 'px';
        particle.style.top = y + 'px';
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

        const angle = (Math.PI * 2 * i) / particleCount;
        const velocity = 50 + Math.random() * 100;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;

        particle.style.setProperty('--tx', tx + 'px');
        particle.style.setProperty('--ty', ty + 'px');

        document.body.appendChild(particle);

        setTimeout(() => particle.remove(), 1000);
    }
}

function launchFireworks() {
    const duration = 3000;
    const interval = 300;
    let elapsed = 0;

    const launch = () => {
        if (elapsed >= duration) return;

        const x = Math.random() * window.innerWidth;
        const y = Math.random() * (window.innerHeight * 0.6);
        createFirework(x, y);

        elapsed += interval;
        setTimeout(launch, interval);
    };

    launch();
}

function createConfetti() {
    const colors = ['#FF69B4', '#9370DB', '#FFD700', '#FF1493', '#8A2BE2', '#87CEEB', '#98FB98'];
    const confettiCount = 100;

    for (let i = 0; i < confettiCount; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
            confetti.style.animationDelay = Math.random() * 0.5 + 's';
            document.body.appendChild(confetti);

            setTimeout(() => confetti.remove(), 4000);
        }, i * 30);
    }
}

function updateGameOverUI() {
    if (!currentRoom) return;

    const myPlayer = currentRoom.players[myPlayerKey];
    const opponentKey = myPlayerKey === 'player1' ? 'player2' : 'player1';
    const opponent = currentRoom.players[opponentKey];

    const title = document.getElementById('gameOverTitle');
    const message = document.getElementById('gameOverMessage');
    const finalWords = document.getElementById('finalWords');

    const myEmoji = getPlayerEmoji(myPlayer.name);
    const oppEmoji = getPlayerEmoji(opponent.name);

    // Determine winner name for celebration
    let winnerName = null;
    let isTie = false;

    if (myPlayer.won && opponent.won) {
        title.innerHTML = "<span class='winner-title tie'>It's a Tie! 🎀</span>";
        message.textContent = "You both guessed the words! Great job, sisters!";
        isTie = true;
    } else if (myPlayer.won) {
        title.innerHTML = `<span class='winner-title flash-winner'>${myEmoji} ${myPlayer.name} Wins! 🎉</span>`;
        message.textContent = `Congratulations ${myPlayer.name}! You guessed ${opponent.name}'s word!`;
        winnerName = myPlayer.name;
    } else if (opponent.won) {
        title.innerHTML = `<span class='winner-title flash-winner'>${oppEmoji} ${opponent.name} Wins! 🎉</span>`;
        message.textContent = `${opponent.name} guessed your word first! Better luck next time!`;
        winnerName = opponent.name;
    } else {
        title.textContent = "Time's Up! 😊";
        message.textContent = "Neither of you guessed the word. Try again!";
    }

    finalWords.innerHTML = `
        <div class="word-reveal">
            <p><strong>${myEmoji} ${myPlayer.name}'s word:</strong> ${myPlayer.word.toUpperCase()}</p>
            <p><strong>${oppEmoji} ${opponent.name}'s word:</strong> ${opponent.word.toUpperCase()}</p>
        </div>
    `;

    // Launch celebration effects if someone won
    if (winnerName || isTie) {
        launchFireworks();
        createConfetti();
    }

    // Update messages for game over screen
    updateMessages();
}

// Handle keyboard input for guessing
document.addEventListener('keydown', (e) => {
    if (!currentRoom || currentRoom.phase !== 'playing') return;
    if (currentRoom.currentTurn !== myPlayerKey) return;

    const letter = e.key.toLowerCase();
    if (/^[a-z]$/.test(letter)) {
        socket.emit('guess', { letter });
    }
});
