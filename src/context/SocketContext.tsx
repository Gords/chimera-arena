// ============================================================
// Chimera Arena - Socket.IO Context
// Provides a shared socket instance + connection status
// ============================================================

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';

// ---- Context shape ----

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
});

// ---- Provider ----

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  // Guard against StrictMode double-mount
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Create the socket connection once.
    // Vite's dev proxy forwards /socket.io to the game server
    // (see vite.config.ts), so we connect to the same origin.
    const newSocket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('[socket] connected:', newSocket.id);
      setConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[socket] disconnected:', reason);
      setConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.warn('[socket] connect_error:', err.message);
      setConnected(false);
    });

    newSocket.on('reconnect', (attempt: number) => {
      console.log('[socket] reconnected after', attempt, 'attempts');
    });

    newSocket.on('reconnect_attempt', (attempt: number) => {
      console.log('[socket] reconnect attempt', attempt);
    });

    return () => {
      newSocket.removeAllListeners();
      newSocket.close();
      setSocket(null);
      mountedRef.current = false;
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

// ---- Hook ----

export function useSocket(): SocketContextValue {
  const ctx = useContext(SocketContext);
  if (ctx === undefined) {
    throw new Error('useSocket must be used inside a <SocketProvider>');
  }
  return ctx;
}

export default SocketContext;
