const socket = io();

let myPlayerKey = null;
let currentRoom = null;
let selectedPlayer = null;

// Player profiles
const players = {
    Ashima: { emoji: '🌸', color: '#FF69B4' },
    Anjali: { emoji: '🦋', color: '#9370DB' }
};

// Scrabble letter values
const LETTER_VALUES = {
    a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5,
    l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4,
    w: 4, x: 8, y: 4, z: 10
};

// DOM Elements
const welcomeScreen = document.getElementById('welcomeScreen');
const waitingScreen = document.getElementById('waitingScreen');
const setupScreen = document.getElementById('setupScreen');
const gameScreen = document.getElementById('gameScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const rulesModal = document.getElementById('rulesModal');
const wordGuessModal = document.getElementById('wordGuessModal');

const selectAshimaBtn = document.getElementById('selectAshima');
const selectAnjaliBtn = document.getElementById('selectAnjali');
const setupForm = document.getElementById('setupForm');
const setupError = document.getElementById('setupError');
const waitingForOpponent = document.getElementById('waitingForOpponent');
const messagesContainer = document.getElementById('messagesContainer');
const guessError = document.getElementById('guessError');
const playAgainBtn = document.getElementById('playAgainBtn');
const iKnowBtn = document.getElementById('iKnowBtn');
const rulesOkBtn = document.getElementById('rulesOkBtn');
const dontShowAgain = document.getElementById('dontShowAgain');

// Screens management
function showScreen(screen) {
    [welcomeScreen, waitingScreen, setupScreen, gameScreen, gameOverScreen].forEach(s => {
        s.classList.add('hidden');
    });
    screen.classList.remove('hidden');
}

// Show rules modal on load (if not dismissed before)
function checkShowRulesModal() {
    const hideRules = localStorage.getItem('hideRulesV2');
    if (!hideRules) {
        rulesModal.classList.remove('hidden');
    }
}

rulesOkBtn.addEventListener('click', () => {
    if (dontShowAgain.checked) {
        localStorage.setItem('hideRulesV2', 'true');
    }
    rulesModal.classList.add('hidden');
});

// Player selection
selectAshimaBtn.addEventListener('click', () => {
    selectedPlayer = 'Ashima';
    socket.emit('joinGame', { playerName: 'Ashima' });
});

selectAnjaliBtn.addEventListener('click', () => {
    selectedPlayer = 'Anjali';
    socket.emit('joinGame', { playerName: 'Anjali' });
});

// Setup form submission - 5 words
setupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const words = [
        document.getElementById('word1').value.trim(),
        document.getElementById('word2').value.trim(),
        document.getElementById('word3').value.trim(),
        document.getElementById('word4').value.trim(),
        document.getElementById('word5').value.trim()
    ];

    // Basic client-side validation
    for (let i = 0; i < words.length; i++) {
        if (!words[i]) {
            showSetupError(`Please enter word ${i + 1}!`);
            return;
        }
    }

    socket.emit('submitWords', { words });
});

// Play again
playAgainBtn.addEventListener('click', () => {
    socket.emit('resetGame');
    showScreen(welcomeScreen);
    selectedPlayer = null;
});

// "I Know This Word!" button
iKnowBtn.addEventListener('click', () => {
    wordGuessModal.classList.remove('hidden');
    document.getElementById('wordGuessInput').value = '';
    document.getElementById('wordGuessInput').focus();
});

document.getElementById('cancelGuessBtn').addEventListener('click', () => {
    wordGuessModal.classList.add('hidden');
});

document.getElementById('submitGuessBtn').addEventListener('click', () => {
    const word = document.getElementById('wordGuessInput').value.trim();
    if (word) {
        socket.emit('guessWord', { word });
        wordGuessModal.classList.add('hidden');
    }
});

// Allow Enter key to submit word guess
document.getElementById('wordGuessInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const word = e.target.value.trim();
        if (word) {
            socket.emit('guessWord', { word });
            wordGuessModal.classList.add('hidden');
        }
    }
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

// Handle wrong word guess - show modal with details
socket.on('wrongWordGuess', (data) => {
    showWrongGuessModal(data.guessed, data.actual, data.penalty);
});

function showWrongGuessModal(guessed, actual, penalty) {
    const modal = document.getElementById('wrongGuessModal');
    document.getElementById('wrongGuessWord').textContent = guessed.toUpperCase();
    document.getElementById('actualWord').textContent = actual.toUpperCase();
    document.getElementById('penaltyPoints').textContent = penalty;
    modal.classList.remove('hidden');
}

document.getElementById('wrongGuessOkBtn').addEventListener('click', () => {
    document.getElementById('wrongGuessModal').classList.add('hidden');
});

// Handle correct word guess - show celebration modal
socket.on('correctWordGuess', (data) => {
    showCorrectGuessModal(data.word, data.points);
});

function showCorrectGuessModal(word, points) {
    const modal = document.getElementById('correctGuessModal');
    document.getElementById('correctWord').textContent = word.toUpperCase();
    document.getElementById('earnedPoints').textContent = points;
    modal.classList.remove('hidden');
}

document.getElementById('correctGuessOkBtn').addEventListener('click', () => {
    document.getElementById('correctGuessModal').classList.add('hidden');
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
    if (!word) return '_ _ _ _';
    return word.split('').map(letter =>
        guessedLetters.includes(letter.toLowerCase()) ? letter.toUpperCase() : '_'
    ).join(' ');
}

// Calculate running score for current word
function calculateRunningScore(word, guessedLetters, wrongGuesses) {
    if (!word) return { earned: 0, potential: 0, penalty: 0 };

    let earned = 0;
    let potential = 0;

    // Calculate earned points (letters correctly guessed)
    const uniqueLetters = [...new Set(word.toLowerCase().split(''))];
    uniqueLetters.forEach(letter => {
        const value = LETTER_VALUES[letter] || 0;
        if (guessedLetters.includes(letter)) {
            earned += value * 2; // 2x for correct guesses
        } else {
            potential += value * 2; // potential points still available
        }
    });

    return {
        earned: earned,
        potential: potential,
        penalty: wrongGuesses
    };
}

function getPlayerEmoji(name) {
    if (name === 'Ashima') return '🌸';
    if (name === 'Anjali') return '🦋';
    return '⭐';
}

function getPlayerAvatar(name) {
    if (name === 'Ashima') return 'images/Ashima.jpeg';
    if (name === 'Anjali') return 'images/Anjali.jpeg';
    return '';
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
            const sisterName = getSisterName(selectedPlayer);
            document.getElementById('waitingTitle').textContent = `Waiting for ${sisterName}...`;
            document.getElementById('waitingMessage').textContent = `Tell ${sisterName} to click her name to join!`;
            break;

        case 'setup':
            showScreen(setupScreen);
            document.getElementById('setupPrompt').textContent =
                `${selectedPlayer}, pick 5 words for ${getSisterName(selectedPlayer)} to guess!`;

            if (myPlayer.words && myPlayer.words.length === 5) {
                setupForm.classList.add('hidden');
                waitingForOpponent.classList.remove('hidden');
                document.getElementById('waitingForSister').textContent =
                    `Waiting for ${getSisterName(selectedPlayer)} to pick her words...`;
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

    // Update player names with emojis and avatars
    document.getElementById('yourName').textContent = myPlayer.name;
    document.getElementById('opponentName').textContent = opponent.name;
    document.getElementById('yourEmoji').textContent = getPlayerEmoji(myPlayer.name);
    document.getElementById('opponentEmoji').textContent = getPlayerEmoji(opponent.name);
    document.getElementById('yourAvatar').src = getPlayerAvatar(myPlayer.name);
    document.getElementById('opponentAvatar').src = getPlayerAvatar(opponent.name);

    // Update scoreboard
    document.getElementById('yourScoreEmoji').textContent = getPlayerEmoji(myPlayer.name);
    document.getElementById('yourScoreName').textContent = myPlayer.name;
    document.getElementById('yourScore').textContent = myPlayer.score;

    const myTurnsLeft = currentRoom.maxTurns - myPlayer.turnsTaken;
    document.getElementById('yourTurnsLeft').textContent = myTurnsLeft;

    document.getElementById('opponentScoreEmoji').textContent = getPlayerEmoji(opponent.name);
    document.getElementById('opponentScoreName').textContent = opponent.name;
    document.getElementById('opponentScore').textContent = opponent.score;

    const oppTurnsLeft = currentRoom.maxTurns - opponent.turnsTaken;
    document.getElementById('opponentTurnsLeft').textContent = oppTurnsLeft;

    // Update your guessing progress (you're guessing opponent's word)
    document.getElementById('opponentWordMasked').textContent =
        getMaskedWord(opponent.currentWord, myPlayer.guessedLetters);
    document.getElementById('opponentWordsLeft').textContent = opponent.wordsRemaining.length;
    document.getElementById('yourGuessedLetters').textContent = myPlayer.guessedLetters.length > 0
        ? myPlayer.guessedLetters.map(l => l.toUpperCase()).join(', ')
        : '-';

    // Calculate and show running score for your current word guess
    const myRunningScore = calculateRunningScore(opponent.currentWord, myPlayer.guessedLetters, myPlayer.wrongGuesses);
    const runningScoreEl = document.getElementById('yourRunningScore');
    if (runningScoreEl) {
        const netScore = myRunningScore.earned - myRunningScore.penalty;
        runningScoreEl.innerHTML = `<span class="earned">+${myRunningScore.earned}</span> <span class="penalty">-${myRunningScore.penalty}</span> = <span class="net">${netScore}</span> pts`;
    }

    // Update opponent's guessing progress (they're guessing your word)
    document.getElementById('yourWordMasked').textContent =
        getMaskedWord(myPlayer.currentWord, opponent.guessedLetters);
    document.getElementById('yourWordsLeft').textContent = myPlayer.wordsRemaining.length;
    document.getElementById('opponentGuessedLetters').textContent = opponent.guessedLetters.length > 0
        ? opponent.guessedLetters.map(l => l.toUpperCase()).join(', ')
        : '-';

    // Calculate and show running score for opponent's current word guess
    const oppRunningScore = calculateRunningScore(myPlayer.currentWord, opponent.guessedLetters, opponent.wrongGuesses);
    const oppRunningScoreEl = document.getElementById('opponentRunningScore');
    if (oppRunningScoreEl) {
        const netScore = oppRunningScore.earned - oppRunningScore.penalty;
        oppRunningScoreEl.innerHTML = `<span class="earned">+${oppRunningScore.earned}</span> <span class="penalty">-${oppRunningScore.penalty}</span> = <span class="net">${netScore}</span> pts`;
    }

    // Update turn indicator
    const turnIndicator = document.getElementById('turnIndicator');
    const isMyTurn = currentRoom.currentTurn === myPlayerKey;

    if (isMyTurn) {
        turnIndicator.textContent = `${getPlayerEmoji(myPlayer.name)} Your turn, ${myPlayer.name}! Pick a letter!`;
        turnIndicator.className = 'turn-indicator your-turn';
        iKnowBtn.classList.remove('hidden');
    } else {
        turnIndicator.textContent = `${getPlayerEmoji(opponent.name)} ${opponent.name} is guessing...`;
        turnIndicator.className = 'turn-indicator opponent-turn';
        iKnowBtn.classList.add('hidden');
    }

    // Update keyboard
    updateKeyboard(isMyTurn, myPlayer.guessedLetters, opponent.currentWord);
}

function updateKeyboard(isMyTurn, guessedLetters, opponentWord) {
    const keyboardDiv = document.querySelector('.keyboard');
    keyboardDiv.innerHTML = '';

    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

    letters.forEach(letter => {
        const btn = document.createElement('button');
        btn.className = 'key';

        // Show letter with its point value
        const value = LETTER_VALUES[letter];
        btn.innerHTML = `<span class="key-letter">${letter.toUpperCase()}</span><span class="key-value">${value}</span>`;

        if (guessedLetters.includes(letter)) {
            btn.classList.add('used');
            if (opponentWord && opponentWord.includes(letter)) {
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
    const finalScores = document.getElementById('finalScores');
    const finalWords = document.getElementById('finalWords');

    const myEmoji = getPlayerEmoji(myPlayer.name);
    const oppEmoji = getPlayerEmoji(opponent.name);

    // Show final scores
    finalScores.innerHTML = `
        <div class="final-score-display">
            <div class="final-score-item ${myPlayer.score > opponent.score ? 'winner' : ''}">
                ${myEmoji} ${myPlayer.name}: <strong>${myPlayer.score}</strong> points
            </div>
            <div class="final-score-item ${opponent.score > myPlayer.score ? 'winner' : ''}">
                ${oppEmoji} ${opponent.name}: <strong>${opponent.score}</strong> points
            </div>
        </div>
    `;

    // Determine winner
    let winnerName = null;
    let isTie = false;

    if (myPlayer.score === opponent.score) {
        title.innerHTML = "<span class='winner-title tie'>It's a Tie!</span>";
        message.textContent = `Both scored ${myPlayer.score} points! Great game, sisters!`;
        isTie = true;
    } else if (myPlayer.score > opponent.score) {
        title.innerHTML = `<span class='winner-title flash-winner'>${myEmoji} ${myPlayer.name} Wins!</span>`;
        message.textContent = `Congratulations ${myPlayer.name}! You scored ${myPlayer.score} points!`;
        winnerName = myPlayer.name;
    } else {
        title.innerHTML = `<span class='winner-title flash-winner'>${oppEmoji} ${opponent.name} Wins!</span>`;
        message.textContent = `${opponent.name} wins with ${opponent.score} points!`;
        winnerName = opponent.name;
    }

    // Show all words
    const myWordsUsed = myPlayer.words.filter(w => !myPlayer.wordsRemaining.includes(w));
    const oppWordsUsed = opponent.words.filter(w => !opponent.wordsRemaining.includes(w));

    finalWords.innerHTML = `
        <div class="word-reveal">
            <p><strong>${myEmoji} ${myPlayer.name}'s words:</strong></p>
            <p class="words-list">${myPlayer.words.map(w => w.toUpperCase()).join(', ')}</p>
            <p><strong>${oppEmoji} ${opponent.name}'s words:</strong></p>
            <p class="words-list">${opponent.words.map(w => w.toUpperCase()).join(', ')}</p>
        </div>
    `;

    // Launch celebration effects
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

    // Don't capture if word guess modal is open
    if (!wordGuessModal.classList.contains('hidden')) return;

    const letter = e.key.toLowerCase();
    if (/^[a-z]$/.test(letter)) {
        socket.emit('guess', { letter });
    }
});

// Show rules modal on page load
document.addEventListener('DOMContentLoaded', () => {
    checkShowRulesModal();
});
