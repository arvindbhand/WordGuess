const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// Game state
let gameRoom = null;

// Validate word using free Dictionary API
async function isValidWord(word) {
    if (!word || typeof word !== 'string') return false;
    const normalized = word.toLowerCase().trim();
    if (normalized.length < 3) return false;
    if (!/^[a-z]+$/.test(normalized)) return false;

    return new Promise((resolve) => {
        const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${normalized}`;

        https.get(url, (res) => {
            if (res.statusCode === 200) {
                resolve(true);
            } else {
                resolve(false);
            }
            // Consume response data to free up memory
            res.resume();
        }).on('error', (err) => {
            console.error('Dictionary API error:', err.message);
            // On API error, accept the word (fail-open)
            resolve(true);
        });
    });
}

function createNewRoom(hostSocketId) {
    return {
        id: 'game-' + Date.now(),
        players: {
            player1: { socketId: hostSocketId, name: null, word: null, guessesRemaining: 6, guessedLetters: [], won: null },
            player2: { socketId: null, name: null, word: null, guessesRemaining: 6, guessedLetters: [], won: null }
        },
        phase: 'waiting', // waiting, setup, playing, finished
        currentTurn: null,
        messages: []
    };
}

function addRefereeMessage(room, message) {
    const msg = {
        from: 'Referee',
        text: message,
        timestamp: Date.now()
    };
    room.messages.push(msg);
    return msg;
}

function getPlayerBySocketId(room, socketId) {
    if (room.players.player1.socketId === socketId) return 'player1';
    if (room.players.player2.socketId === socketId) return 'player2';
    return null;
}

function getOpponent(playerKey) {
    return playerKey === 'player1' ? 'player2' : 'player1';
}

function getMaskedWord(word, guessedLetters) {
    return word.split('').map(letter =>
        guessedLetters.includes(letter.toLowerCase()) ? letter : '_'
    ).join(' ');
}

// Count how many unique letters a player still needs to guess to reveal opponent's word
function getLettersRemaining(opponentWord, guessedLetters) {
    const uniqueLetters = [...new Set(opponentWord.toLowerCase().split(''))];
    return uniqueLetters.filter(letter => !guessedLetters.includes(letter)).length;
}

function checkGameOver(room, currentPlayerKey) {
    const p1 = room.players.player1;
    const p2 = room.players.player2;

    // Check if player1 has guessed player2's word
    const p2WordRevealed = p2.word.toLowerCase().split('').every(letter =>
        p1.guessedLetters.includes(letter.toLowerCase())
    );

    // Check if player2 has guessed player1's word
    const p1WordRevealed = p1.word.toLowerCase().split('').every(letter =>
        p2.guessedLetters.includes(letter.toLowerCase())
    );

    // Mark winners
    if (p2WordRevealed) p1.won = true;
    if (p1WordRevealed) p2.won = true;

    // Mark losers (ran out of guesses)
    if (p1.guessesRemaining <= 0 && p1.won !== true) p1.won = false;
    if (p2.guessesRemaining <= 0 && p2.won !== true) p2.won = false;

    // Case 1: Player 1 just won on this turn (first to win)
    // Player 2 gets a chance to tie ONLY if they have exactly 1 letter remaining
    if (currentPlayerKey === 'player1' && p1.won === true && p2.won !== true) {
        const p2LettersRemaining = getLettersRemaining(p1.word, p2.guessedLetters);
        if (p2LettersRemaining > 1 || p2.guessesRemaining <= 0) {
            // Player 2 has more than 1 letter remaining or no guesses left - game over, p1 wins
            p2.won = false;
            room.phase = 'finished';
            return true;
        }
        // Player 2 has exactly 1 letter remaining - they get one more turn to try to tie
        return false;
    }

    // Case 2: Player 2 just won on this turn
    // If player 1 already won (p1.won === true), this is a tie - game over
    // If player 1 hasn't won, player 2 wins outright - NO extra turn for player 1
    if (currentPlayerKey === 'player2' && p2.won === true) {
        if (p1.won !== true) {
            p1.won = false;  // Player 2 wins, player 1 loses
        }
        // Either way (tie or p2 wins), game is over
        room.phase = 'finished';
        return true;
    }

    // Case 3: Player 2 just took their tie attempt but failed (player 1 already won previously)
    if (currentPlayerKey === 'player2' && p1.won === true && p2.won !== true) {
        p2.won = false;
        room.phase = 'finished';
        return true;
    }

    // Game is over if both players have finished (both won, both lost, or one of each)
    if ((p1.won !== null) && (p2.won !== null)) {
        room.phase = 'finished';
        return true;
    }

    return false;
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Create or join room
    socket.on('joinGame', (data) => {
        const playerName = data?.playerName || 'Player';

        // Only allow Ashima or Anjali
        if (playerName !== 'Ashima' && playerName !== 'Anjali') {
            socket.emit('error', { message: 'Only Ashima and Anjali can play this game!' });
            return;
        }

        if (!gameRoom) {
            // Create new room
            gameRoom = createNewRoom(socket.id);
            gameRoom.players.player1.pendingName = playerName;
            socket.join(gameRoom.id);
            const emoji = playerName === 'Ashima' ? '🌸' : '🦋';
            const sisterName = playerName === 'Ashima' ? 'Anjali' : 'Ashima';
            addRefereeMessage(gameRoom, `${emoji} ${playerName} is here! Waiting for ${sisterName} to join...`);
            socket.emit('gameState', {
                room: gameRoom,
                yourPlayer: 'player1',
                message: `Waiting for ${sisterName}...`
            });
        } else if (!gameRoom.players.player2.socketId) {
            // Check if same player is trying to join twice
            const existingPlayerName = gameRoom.players.player1.pendingName;
            if (existingPlayerName === playerName) {
                socket.emit('error', { message: `${playerName} is already in the game! Ask your sister to join.` });
                return;
            }

            // Join existing room
            gameRoom.players.player2.socketId = socket.id;
            gameRoom.players.player2.pendingName = playerName;
            socket.join(gameRoom.id);
            gameRoom.phase = 'setup';

            const emoji = playerName === 'Ashima' ? '🌸' : '🦋';
            addRefereeMessage(gameRoom, `${emoji} ${playerName} joined! Time to pick your secret words!`);

            io.to(gameRoom.id).emit('gameState', {
                room: gameRoom,
                message: "Both sisters are here! Pick your words!"
            });

            // Send individual player info
            io.to(gameRoom.players.player1.socketId).emit('yourPlayer', 'player1');
            io.to(gameRoom.players.player2.socketId).emit('yourPlayer', 'player2');
        } else {
            socket.emit('error', { message: 'Game is full! Wait for the current game to finish.' });
        }
    });

    // Player submits name and word
    socket.on('submitSetup', async ({ name, word }) => {
        if (!gameRoom || gameRoom.phase !== 'setup') {
            socket.emit('error', { message: 'Cannot submit setup at this time.' });
            return;
        }

        const playerKey = getPlayerBySocketId(gameRoom, socket.id);
        if (!playerKey) {
            socket.emit('error', { message: 'You are not in this game.' });
            return;
        }

        // Validate name
        if (!name || name.trim().length < 1) {
            socket.emit('setupError', { message: 'Please enter a valid name.' });
            return;
        }

        // Validate word using Dictionary API
        const normalizedWord = word.toLowerCase().trim();
        const isValid = await isValidWord(normalizedWord);
        if (!isValid) {
            socket.emit('setupError', {
                message: `"${word}" is not a valid English word. Please choose a real English word (3 or more letters).`
            });
            return;
        }

        // Save player's setup
        gameRoom.players[playerKey].name = name.trim();
        gameRoom.players[playerKey].word = normalizedWord;

        addRefereeMessage(gameRoom, `${name} is ready!`);

        // Check if both players are ready
        const p1 = gameRoom.players.player1;
        const p2 = gameRoom.players.player2;

        if (p1.name && p1.word && p2.name && p2.word) {
            gameRoom.phase = 'playing';
            gameRoom.currentTurn = 'player1';
            addRefereeMessage(gameRoom, `Both players are ready! ${p1.name} will try to guess ${p2.name}'s word. ${p2.name} will try to guess ${p1.name}'s word.`);
            addRefereeMessage(gameRoom, `${p1.name}, it's your turn! Guess a letter.`);
        }

        io.to(gameRoom.id).emit('gameState', { room: gameRoom });
    });

    // Player makes a guess
    socket.on('guess', ({ letter }) => {
        if (!gameRoom || gameRoom.phase !== 'playing') {
            socket.emit('error', { message: 'Cannot guess at this time.' });
            return;
        }

        const playerKey = getPlayerBySocketId(gameRoom, socket.id);
        if (!playerKey) {
            socket.emit('error', { message: 'You are not in this game.' });
            return;
        }

        if (gameRoom.currentTurn !== playerKey) {
            socket.emit('error', { message: "It's not your turn!" });
            return;
        }

        const player = gameRoom.players[playerKey];
        const opponentKey = getOpponent(playerKey);
        const opponent = gameRoom.players[opponentKey];

        // Validate letter
        const normalizedLetter = letter.toLowerCase().trim();
        if (!/^[a-z]$/.test(normalizedLetter)) {
            socket.emit('guessError', { message: 'Please enter a single letter (a-z).' });
            return;
        }

        if (player.guessedLetters.includes(normalizedLetter)) {
            socket.emit('guessError', { message: 'You already guessed that letter!' });
            return;
        }

        // Record the guess
        player.guessedLetters.push(normalizedLetter);

        // Check if letter is in opponent's word
        const wordToGuess = opponent.word;
        const isCorrect = wordToGuess.includes(normalizedLetter);

        if (isCorrect) {
            addRefereeMessage(gameRoom, `${player.name} guessed "${normalizedLetter.toUpperCase()}" - Correct!`);
        } else {
            player.guessesRemaining--;
            addRefereeMessage(gameRoom, `${player.name} guessed "${normalizedLetter.toUpperCase()}" - Wrong! ${player.guessesRemaining} guesses remaining.`);
        }

        // Check if game is over
        if (checkGameOver(gameRoom, playerKey)) {
            let resultMessage = '';
            const p1 = gameRoom.players.player1;
            const p2 = gameRoom.players.player2;

            if (p1.won && p2.won) {
                resultMessage = `It's a tie! Both ${p1.name} and ${p2.name} guessed their words!`;
            } else if (p1.won && !p2.won) {
                resultMessage = `${p1.name} wins! They guessed "${p2.word}". ${p2.name}'s word was "${p1.word}".`;
            } else if (!p1.won && p2.won) {
                resultMessage = `${p2.name} wins! They guessed "${p1.word}". ${p1.name}'s word was "${p2.word}".`;
            } else {
                resultMessage = `Game over! Neither player guessed their word. ${p1.name}'s word was "${p1.word}", ${p2.name}'s word was "${p2.word}".`;
            }

            addRefereeMessage(gameRoom, resultMessage);
        } else {
            // Switch turns
            gameRoom.currentTurn = opponentKey;
            addRefereeMessage(gameRoom, `${opponent.name}, it's your turn!`);
        }

        io.to(gameRoom.id).emit('gameState', { room: gameRoom });
    });

    // Reset game
    socket.on('resetGame', () => {
        if (gameRoom) {
            const playerKey = getPlayerBySocketId(gameRoom, socket.id);
            if (playerKey) {
                gameRoom = null;
                io.emit('gameReset');
            }
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        if (gameRoom) {
            const playerKey = getPlayerBySocketId(gameRoom, socket.id);
            if (playerKey) {
                const player = gameRoom.players[playerKey];
                if (player.name) {
                    addRefereeMessage(gameRoom, `${player.name} has left the game.`);
                }
                // Reset the game if a player leaves
                io.to(gameRoom.id).emit('playerLeft', {
                    message: 'Your opponent has left. The game will reset.'
                });
                gameRoom = null;
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Word Guess Game server running on http://localhost:${PORT}`);
});
