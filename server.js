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

// Scrabble letter values
const LETTER_VALUES = {
    a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 2, h: 4, i: 1, j: 8, k: 5,
    l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 1, v: 4,
    w: 4, x: 8, y: 4, z: 10
};

// Calculate word value using Scrabble points
function getWordValue(word) {
    return word.toLowerCase().split('').reduce((sum, letter) => {
        return sum + (LETTER_VALUES[letter] || 0);
    }, 0);
}

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
            res.resume();
        }).on('error', (err) => {
            console.error('Dictionary API error:', err.message);
            resolve(true); // Fail-open on API error
        });
    });
}

function createNewRoom(hostSocketId) {
    return {
        id: 'game-' + Date.now(),
        players: {
            player1: {
                socketId: hostSocketId,
                name: null,
                pendingName: null,
                words: [],           // Array of 5 secret words
                wordsRemaining: [],  // Words not yet guessed by opponent
                currentWord: null,   // Current word opponent is guessing
                score: 0,
                turnsTaken: 0,
                guessedLetters: [],  // Letters guessed for current word
                wrongGuesses: 0      // Wrong guesses for current word
            },
            player2: {
                socketId: null,
                name: null,
                pendingName: null,
                words: [],
                wordsRemaining: [],
                currentWord: null,
                score: 0,
                turnsTaken: 0,
                guessedLetters: [],
                wrongGuesses: 0
            }
        },
        phase: 'waiting', // waiting, setup, playing, finished
        currentTurn: null,
        messages: [],
        maxTurns: 10
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

function isWordFullyGuessed(word, guessedLetters) {
    return word.toLowerCase().split('').every(letter =>
        guessedLetters.includes(letter.toLowerCase())
    );
}

// Pick a random word from remaining words
function pickNextWord(player) {
    if (player.wordsRemaining.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * player.wordsRemaining.length);
    player.currentWord = player.wordsRemaining[randomIndex];
    return player.currentWord;
}

// Calculate score for completing a word
function calculateWordScore(word, wrongGuesses) {
    const wordValue = getWordValue(word);
    return (wordValue * 2) - wrongGuesses;
}

// Check if game should end
function checkGameOver(room) {
    const p1 = room.players.player1;
    const p2 = room.players.player2;

    // Check if both players have taken max turns
    if (p1.turnsTaken >= room.maxTurns && p2.turnsTaken >= room.maxTurns) {
        room.phase = 'finished';
        return true;
    }

    // Check if one player has guessed all 5 words
    const p1GuessedAll = p1.wordsRemaining.length === 0;
    const p2GuessedAll = p2.wordsRemaining.length === 0;

    if (p1GuessedAll || p2GuessedAll) {
        // Make sure both players have equal turns
        if (p1.turnsTaken === p2.turnsTaken) {
            room.phase = 'finished';
            return true;
        }
    }

    return false;
}

function getGameResult(room) {
    const p1 = room.players.player1;
    const p2 = room.players.player2;

    if (p1.score > p2.score) {
        return { winner: 'player1', tie: false };
    } else if (p2.score > p1.score) {
        return { winner: 'player2', tie: false };
    } else {
        return { winner: null, tie: true };
    }
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('joinGame', (data) => {
        const playerName = data?.playerName || 'Player';

        if (playerName !== 'Ashima' && playerName !== 'Anjali') {
            socket.emit('error', { message: 'Only Ashima and Anjali can play this game!' });
            return;
        }

        if (!gameRoom) {
            gameRoom = createNewRoom(socket.id);
            gameRoom.players.player1.pendingName = playerName;
            gameRoom.players.player1.name = playerName;
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
            const existingPlayerName = gameRoom.players.player1.pendingName;
            if (existingPlayerName === playerName) {
                socket.emit('error', { message: `${playerName} is already in the game! Ask your sister to join.` });
                return;
            }

            gameRoom.players.player2.socketId = socket.id;
            gameRoom.players.player2.pendingName = playerName;
            gameRoom.players.player2.name = playerName;
            socket.join(gameRoom.id);
            gameRoom.phase = 'setup';

            const emoji = playerName === 'Ashima' ? '🌸' : '🦋';
            addRefereeMessage(gameRoom, `${emoji} ${playerName} joined! Time to pick your 5 secret words!`);

            io.to(gameRoom.id).emit('gameState', {
                room: gameRoom,
                message: "Both sisters are here! Pick your 5 words!"
            });

            io.to(gameRoom.players.player1.socketId).emit('yourPlayer', 'player1');
            io.to(gameRoom.players.player2.socketId).emit('yourPlayer', 'player2');
        } else {
            socket.emit('error', { message: 'Game is full! Wait for the current game to finish.' });
        }
    });

    // Player submits their 5 words
    socket.on('submitWords', async ({ words }) => {
        if (!gameRoom || gameRoom.phase !== 'setup') {
            socket.emit('error', { message: 'Cannot submit words at this time.' });
            return;
        }

        const playerKey = getPlayerBySocketId(gameRoom, socket.id);
        if (!playerKey) {
            socket.emit('error', { message: 'You are not in this game.' });
            return;
        }

        const player = gameRoom.players[playerKey];

        if (player.words.length > 0) {
            socket.emit('setupError', { message: 'You have already submitted your words.' });
            return;
        }

        // Validate all 5 words
        if (!words || words.length !== 5) {
            socket.emit('setupError', { message: 'Please submit exactly 5 words.' });
            return;
        }

        const validatedWords = [];
        for (let i = 0; i < words.length; i++) {
            const word = words[i].toLowerCase().trim();
            if (!word || word.length < 3) {
                socket.emit('setupError', { message: `Word ${i + 1} must be at least 3 letters.` });
                return;
            }
            if (!/^[a-z]+$/.test(word)) {
                socket.emit('setupError', { message: `Word ${i + 1} can only contain letters.` });
                return;
            }
            const isValid = await isValidWord(word);
            if (!isValid) {
                socket.emit('setupError', { message: `"${words[i]}" is not a valid English word.` });
                return;
            }
            if (validatedWords.includes(word)) {
                socket.emit('setupError', { message: `Duplicate word: "${words[i]}". All words must be different.` });
                return;
            }
            validatedWords.push(word);
        }

        player.words = validatedWords;
        player.wordsRemaining = [...validatedWords];

        addRefereeMessage(gameRoom, `${player.name} has submitted their 5 secret words!`);

        // Check if both players are ready
        const p1 = gameRoom.players.player1;
        const p2 = gameRoom.players.player2;

        if (p1.words.length === 5 && p2.words.length === 5) {
            gameRoom.phase = 'playing';
            gameRoom.currentTurn = 'player1';

            // Pick first word for each player to guess
            pickNextWord(p2); // p1 will guess p2's word
            pickNextWord(p1); // p2 will guess p1's word

            addRefereeMessage(gameRoom, `Both players are ready! ${p1.name} goes first!`);
            addRefereeMessage(gameRoom, `${p1.name}, guess letters to reveal ${p2.name}'s word!`);
        }

        io.to(gameRoom.id).emit('gameState', { room: gameRoom });
    });

    // Player makes a letter guess
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

        const normalizedLetter = letter.toLowerCase().trim();
        if (!/^[a-z]$/.test(normalizedLetter)) {
            socket.emit('guessError', { message: 'Please enter a single letter (a-z).' });
            return;
        }

        if (player.guessedLetters.includes(normalizedLetter)) {
            socket.emit('guessError', { message: 'You already guessed that letter!' });
            return;
        }

        player.guessedLetters.push(normalizedLetter);
        player.turnsTaken++;

        const currentWord = opponent.currentWord;
        const isCorrect = currentWord.includes(normalizedLetter);

        if (isCorrect) {
            addRefereeMessage(gameRoom, `${player.name} guessed "${normalizedLetter.toUpperCase()}" - Correct! (+${LETTER_VALUES[normalizedLetter]} points potential)`);
        } else {
            player.wrongGuesses++;
            addRefereeMessage(gameRoom, `${player.name} guessed "${normalizedLetter.toUpperCase()}" - Wrong! (-1 point)`);
        }

        // Check if word is fully guessed
        if (isWordFullyGuessed(currentWord, player.guessedLetters)) {
            const wordScore = calculateWordScore(currentWord, player.wrongGuesses);
            player.score += wordScore;
            addRefereeMessage(gameRoom, `${player.name} guessed the word "${currentWord.toUpperCase()}"! +${wordScore} points!`);

            // Remove word from opponent's remaining words
            opponent.wordsRemaining = opponent.wordsRemaining.filter(w => w !== currentWord);

            // Reset for next word
            player.guessedLetters = [];
            player.wrongGuesses = 0;

            // Pick next word
            if (opponent.wordsRemaining.length > 0) {
                pickNextWord(opponent);
                addRefereeMessage(gameRoom, `New word selected for ${player.name} to guess!`);
            } else {
                addRefereeMessage(gameRoom, `${player.name} has guessed all of ${opponent.name}'s words!`);
            }
        }

        // Check if game is over
        if (checkGameOver(gameRoom)) {
            const result = getGameResult(gameRoom);
            const p1 = gameRoom.players.player1;
            const p2 = gameRoom.players.player2;

            if (result.tie) {
                addRefereeMessage(gameRoom, `Game Over! It's a tie! Both scored ${p1.score} points!`);
            } else {
                const winner = gameRoom.players[result.winner];
                const loser = gameRoom.players[getOpponent(result.winner)];
                addRefereeMessage(gameRoom, `Game Over! ${winner.name} wins with ${winner.score} points! ${loser.name} scored ${loser.score} points.`);
            }
        } else {
            // Switch turns
            gameRoom.currentTurn = opponentKey;
            addRefereeMessage(gameRoom, `${opponent.name}, it's your turn!`);
        }

        io.to(gameRoom.id).emit('gameState', { room: gameRoom });
    });

    // "I Know This Word!" - guess the full word
    socket.on('guessWord', ({ word }) => {
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

        const guessedWord = word.toLowerCase().trim();
        const currentWord = opponent.currentWord;
        const wordValue = getWordValue(currentWord);

        player.turnsTaken++;

        if (guessedWord === currentWord) {
            // Correct! Award normal score
            const wordScore = calculateWordScore(currentWord, player.wrongGuesses);
            player.score += wordScore;
            addRefereeMessage(gameRoom, `${player.name} knew the word! "${currentWord.toUpperCase()}" is correct! +${wordScore} points!`);

            // Send correct guess modal to the player
            socket.emit('correctWordGuess', {
                word: currentWord,
                points: wordScore
            });

            // Remove word from opponent's remaining words
            opponent.wordsRemaining = opponent.wordsRemaining.filter(w => w !== currentWord);

            // Reset for next word
            player.guessedLetters = [];
            player.wrongGuesses = 0;

            if (opponent.wordsRemaining.length > 0) {
                pickNextWord(opponent);
                addRefereeMessage(gameRoom, `New word selected for ${player.name} to guess!`);
            } else {
                addRefereeMessage(gameRoom, `${player.name} has guessed all of ${opponent.name}'s words!`);
            }
        } else {
            // Wrong! Apply penalty
            const penalty = wordValue * 2;
            player.score -= penalty;
            addRefereeMessage(gameRoom, `${player.name} guessed "${guessedWord.toUpperCase()}" - WRONG! The word was "${currentWord.toUpperCase()}". -${penalty} points penalty!`);

            // Send wrong guess modal to the player who guessed wrong
            socket.emit('wrongWordGuess', {
                guessed: guessedWord,
                actual: currentWord,
                penalty: penalty
            });

            // Remove word (deemed guessed even though wrong)
            opponent.wordsRemaining = opponent.wordsRemaining.filter(w => w !== currentWord);

            // Reset for next word
            player.guessedLetters = [];
            player.wrongGuesses = 0;

            if (opponent.wordsRemaining.length > 0) {
                pickNextWord(opponent);
                addRefereeMessage(gameRoom, `New word selected for ${player.name} to guess!`);
            } else {
                addRefereeMessage(gameRoom, `No more words left for ${player.name} to guess.`);
            }
        }

        // Check if game is over
        if (checkGameOver(gameRoom)) {
            const result = getGameResult(gameRoom);
            const p1 = gameRoom.players.player1;
            const p2 = gameRoom.players.player2;

            if (result.tie) {
                addRefereeMessage(gameRoom, `Game Over! It's a tie! Both scored ${p1.score} points!`);
            } else {
                const winner = gameRoom.players[result.winner];
                const loser = gameRoom.players[getOpponent(result.winner)];
                addRefereeMessage(gameRoom, `Game Over! ${winner.name} wins with ${winner.score} points! ${loser.name} scored ${loser.score} points.`);
            }
        } else {
            gameRoom.currentTurn = opponentKey;
            addRefereeMessage(gameRoom, `${opponent.name}, it's your turn!`);
        }

        io.to(gameRoom.id).emit('gameState', { room: gameRoom });
    });

    socket.on('resetGame', () => {
        if (gameRoom) {
            const playerKey = getPlayerBySocketId(gameRoom, socket.id);
            if (playerKey) {
                gameRoom = null;
                io.emit('gameReset');
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        if (gameRoom) {
            const playerKey = getPlayerBySocketId(gameRoom, socket.id);
            if (playerKey) {
                const player = gameRoom.players[playerKey];
                if (player.name) {
                    addRefereeMessage(gameRoom, `${player.name} has left the game.`);
                }
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
    console.log(`Word Guess Game v2 server running on http://localhost:${PORT}`);
});
