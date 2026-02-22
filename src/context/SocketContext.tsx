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

    // Create the socket connection once.
    // Vite's dev proxy forwards /socket.io to the game server
    // (see vite.config.ts), so we connect to the same origin.
    const newSocket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 750,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 10000,
      transports: ['websocket', 'polling'],
    });

    setSocket(newSocket);

    const onConnect = () => {
      console.log('[socket] connected:', newSocket.id);
      setConnected(true);
    };

    const onDisconnect = (reason: Socket.DisconnectReason) => {
      console.log('[socket] disconnected:', reason);
      setConnected(false);
    };

    const onConnectError = (err: Error) => {
      console.warn('[socket] connect_error:', err.message);
      setConnected(false);
    };

    const onReconnect = (attempt: number) => {
      console.log('[socket] reconnected after', attempt, 'attempts');
    };

    const onReconnectAttempt = (attempt: number) => {
      console.log('[socket] reconnect attempt', attempt);
    };

    const onReconnectError = (err: Error) => {
      console.warn('[socket] reconnect_error:', err.message);
    };

    const onReconnectFailed = () => {
      console.warn('[socket] reconnect_failed');
      setConnected(false);
    };

    // Ping/pong latency tracking
    let pingStart = 0;
    const onPing = () => {
      pingStart = performance.now();
    };
    const onPong = () => {
      const ms = Math.round(performance.now() - pingStart);
      console.log(`[socket] ping: ${ms}ms`);
      setLatency(ms);
    };

    newSocket.on('connect', onConnect);
    newSocket.on('disconnect', onDisconnect);
    newSocket.on('connect_error', onConnectError);
    newSocket.io.on('reconnect', onReconnect);
    newSocket.io.on('reconnect_attempt', onReconnectAttempt);
    newSocket.io.on('reconnect_error', onReconnectError);
    newSocket.io.on('reconnect_failed', onReconnectFailed);
    newSocket.io.on('ping', onPing);
    newSocket.io.on('pong', onPong);

    return () => {
      newSocket.off('connect', onConnect);
      newSocket.off('disconnect', onDisconnect);
      newSocket.off('connect_error', onConnectError);
      newSocket.io.off('reconnect', onReconnect);
      newSocket.io.off('reconnect_attempt', onReconnectAttempt);
      newSocket.io.off('reconnect_error', onReconnectError);
      newSocket.io.off('reconnect_failed', onReconnectFailed);
      newSocket.io.off('ping', onPing);
      newSocket.io.off('pong', onPong);
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
