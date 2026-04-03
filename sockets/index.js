module.exports = function (io) {
  io.on('connection', (socket) => {
    console.log('Utilisateur connecté:', socket.id);

    socket.on('join-month', (month) => {
      // Leave all previous month rooms
      socket.rooms.forEach((room) => {
        if (room !== socket.id) socket.leave(room);
      });
      socket.join(month);
    });

    socket.on('disconnect', () => {
      console.log('Utilisateur déconnecté:', socket.id);
    });
  });
};
