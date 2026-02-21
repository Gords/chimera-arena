// ============================================================
// Chimera Arena - Socket.IO Context
// Provides a shared socket instance + connection status + latency
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

// In dev, Vite proxies /socket.io to localhost:3001 (see vite.config.ts),
// so same-origin works for both localhost and ngrok.
// In production, Express serves the client so same-origin also works.

// ---- Context shape ----

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  latency: number;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  latency: 0,
});

// ---- Provider ----

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [latency, setLatency] = useState(0);
  // Guard against StrictMode double-mount
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

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

    // Track ping/pong latency from the Socket.IO engine
    const onPong = (ms: number) => {
      setLatency(ms);
      if (import.meta.env.DEV) {
        console.log(`[socket] ping: ${ms}ms`);
      }
    };

    const attachPong = () => {
      (newSocket.io.engine as any)?.on('pong', onPong);
    };

    attachPong();
    // Re-attach pong listener if engine reconnects
    newSocket.io.on('open', attachPong);

    return () => {
      newSocket.removeAllListeners();
      newSocket.close();
      setSocket(null);
      mountedRef.current = false;
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected, latency }}>
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
