const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const PUZZLE = [
  [5,3,0,0,7,0,0,0,0],[6,0,0,1,9,5,0,0,0],[0,9,8,0,0,0,0,6,0],
  [8,0,0,0,6,0,0,0,3],[4,0,0,8,0,3,0,0,1],[7,0,0,0,2,0,0,0,6],
  [0,6,0,0,0,0,2,8,0],[0,0,0,4,1,9,0,0,5],[0,0,0,0,8,0,0,7,9]
];
const SOLUTION = [
  [5,3,4,6,7,8,9,1,2],[6,7,2,1,9,5,3,4,8],[1,9,8,3,4,2,5,6,7],
  [8,5,9,7,6,1,4,2,3],[4,2,6,8,5,3,7,9,1],[7,1,3,9,2,4,8,5,6],
  [9,6,1,5,3,7,2,8,4],[2,8,7,4,1,9,6,3,5],[3,4,5,2,8,6,1,7,9]
];
const rooms = new Map();

app.get('/health', (_, res) => res.json({ ok: true, service: 'sudoku-friends', rooms: rooms.size }));
app.get('/', (_, res) => res.json({ service: 'Sudoku Friends backend', status: 'online' }));

function emptyBoard() { return PUZZLE.map(r => [...r]); }
function solved(board) { return board.every((r,y) => r.every((v,x) => v === SOLUTION[y][x])); }

io.on('connection', socket => {
  socket.on('room:create', ({ roomId, name } = {}) => {
    const id = String(roomId || Math.random().toString(36).slice(2,8)).toUpperCase();
    if (rooms.has(id)) return socket.emit('room:error', 'Room already exists');
    rooms.set(id, { players: [{ id: socket.id, name: name || 'Player 1', board: emptyBoard() }] });
    socket.join(id); socket.data.roomId = id;
    socket.emit('room:created', { roomId: id });
  });

  socket.on('room:join', ({ roomId, name } = {}) => {
    const id = String(roomId || '').toUpperCase(); const room = rooms.get(id);
    if (!room) return socket.emit('room:error', 'Room not found');
    if (room.players.length >= 2) return socket.emit('room:error', 'Room is full');
    room.players.push({ id: socket.id, name: name || 'Player 2', board: emptyBoard() });
    socket.join(id); socket.data.roomId = id;
    io.to(id).emit('room:ready', { players: room.players.map(p => ({ id: p.id, name: p.name })) });
  });

  socket.on('game:start', () => {
    const room = rooms.get(socket.data.roomId); if (!room || room.players.length !== 2) return;
    io.to(socket.data.roomId).emit('game:started', { puzzle: PUZZLE });
  });

  socket.on('game:move', ({ row, col, value } = {}) => {
    const room = rooms.get(socket.data.roomId); if (!room) return;
    const player = room.players.find(p => p.id === socket.id); if (!player) return;
    if (PUZZLE[row]?.[col]) return;
    if (Number(value) !== SOLUTION[row][col]) return socket.emit('game:mistake', { row, col });
    player.board[row][col] = Number(value);
    io.to(socket.data.roomId).emit('game:move', { playerId: socket.id, row, col, value: Number(value) });
    if (solved(player.board)) io.to(socket.data.roomId).emit('game:winner', { playerId: socket.id, name: player.name });
  });

  socket.on('disconnect', () => {
    const id = socket.data.roomId; const room = rooms.get(id); if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (!room.players.length) rooms.delete(id); else io.to(id).emit('room:player-left');
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Sudoku Friends backend listening on ${PORT}`));
