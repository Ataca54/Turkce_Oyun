const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;

app.use(express.static('public'));

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);

  socket.on('create_room', (playerName) => {
    let roomCode = generateRoomCode();

    while (rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    rooms.set(roomCode, {
      host: socket.id,
      players: [{ id: socket.id, name: playerName }],
      mode: null,
      started: false
    });

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerName = playerName;

    socket.emit('room_created', {
      roomCode,
      players: rooms.get(roomCode).players
    });

    console.log(`Oda oluşturuldu: ${roomCode} - Kurucu: ${playerName}`);
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = rooms.get(roomCode);

    if (!room) {
      socket.emit('join_error', 'Oda bulunamadı');
      return;
    }

    if (room.started) {
      socket.emit('join_error', 'Oyun zaten başlamış');
      return;
    }

    const existingPlayer = room.players.find(p => p.name === playerName);
    if (existingPlayer) {
      socket.emit('join_error', 'Bu isim zaten kullanılıyor');
      return;
    }

    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerName = playerName;

    socket.emit('join_success', {
      roomCode,
      players: room.players,
      isHost: false
    });

    io.to(roomCode).emit('update_players', room.players);

    console.log(`${playerName} odaya katıldı: ${roomCode}`);
  });

  socket.on('select_mode', (mode) => {
    const roomCode = socket.roomCode;
    const room = rooms.get(roomCode);

    if (room && room.host === socket.id) {
      room.mode = mode;
      console.log(`Oda ${roomCode} için mod seçildi: ${mode}`);
    }
  });

  socket.on('start_game', () => {
    const roomCode = socket.roomCode;
    const room = rooms.get(roomCode);

    if (room && room.host === socket.id && room.mode) {
      room.started = true;
      io.to(roomCode).emit('game_started', {
        mode: room.mode,
        players: room.players
      });
      console.log(`Oyun başlatıldı: ${roomCode} - Mod: ${room.mode}`);
    }
  });

  socket.on('disconnect', () => {
    const roomCode = socket.roomCode;
    const room = rooms.get(roomCode);

    if (room) {
      room.players = room.players.filter(p => p.id !== socket.id);

      if (room.players.length === 0) {
        rooms.delete(roomCode);
        console.log(`Oda silindi: ${roomCode}`);
      } else {
        if (room.host === socket.id && room.players.length > 0) {
          room.host = room.players[0].id;
          io.to(room.players[0].id).emit('became_host');
        }
        io.to(roomCode).emit('update_players', room.players);
        console.log(`${socket.playerName} odadan ayrıldı: ${roomCode}`);
      }
    }

    console.log('Kullanıcı ayrıldı:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🎮 TR YARIŞI sunucusu http://localhost:${PORT} adresinde çalışıyor`);
});
