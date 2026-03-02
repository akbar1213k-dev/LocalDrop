import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';
import { parse } from 'url';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const port = process.env.PORT || 3000;

app.prepare().then(() => {
  const expressApp = express();
  const server = createServer(expressApp);
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const users = new Map();

  io.on('connection', (socket) => {
    // Get client IP to group users by "local network"
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0] : socket.handshake.address;
    
    // Room based on IP
    const room = ip || 'global';
    socket.join(room);

    socket.on('join', (userData) => {
      const user = {
        id: socket.id,
        room,
        ...userData,
      };
      users.set(socket.id, user);

      // Notify others in the room
      socket.to(room).emit('peer-joined', user);

      // Send existing peers to the new user
      const peers = Array.from(users.values()).filter(
        (u) => u.room === room && u.id !== socket.id
      );
      socket.emit('peers', peers);
    });

    socket.on('signal', (data) => {
      io.to(data.to).emit('signal', {
        from: socket.id,
        signal: data.signal,
      });
    });

    socket.on('disconnect', () => {
      const user = users.get(socket.id);
      if (user) {
        socket.to(user.room).emit('peer-left', socket.id);
        users.delete(socket.id);
      }
    });
  });

  expressApp.all(/.*/, (req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
