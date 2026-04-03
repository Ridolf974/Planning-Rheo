const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Make io accessible in routes
app.set('io', io);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/patients', require('./routes/patients'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/lines', require('./routes/lines'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/exports', require('./routes/exports'));

// Socket.IO
require('./sockets')(io);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Planning Rhéophérèse démarré sur http://localhost:${PORT}`);
});
