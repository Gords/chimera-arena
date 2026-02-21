import { io, Socket } from 'socket.io-client';

// Connect to the server (auto-detect URL in prod, localhost:3001 in dev)
const URL = import.meta.env.DEV ? 'http://localhost:3001' : '';

export const socket: Socket = io(URL, {
  autoConnect: false,        // Manual connect on user action
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export function connectSocket(): void {
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket(): void {
  if (socket.connected) {
    socket.disconnect();
  }
}
