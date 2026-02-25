import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TerminalInfo = { id: number; name: string; isTmux: boolean };

type SocketContextType = {
  connected: boolean;
  authenticated: boolean;
  connecting: boolean;
  paired: boolean;        // true if credentials are stored locally
  error: string | null;
  terminals: TerminalInfo[];
  serverUrl: string;
  connect: (url: string, token: string) => void;
  unpair: () => void;     // clear saved credentials and disconnect
  createTerminal: (name?: string) => void;
  attachTerminal: (id: number, cols: number, rows: number) => void;
  detachTerminal: (id: number) => void;
  sendInput: (id: number, data: string) => void;
  resizeTerminal: (id: number, cols: number, rows: number) => void;
  killTerminal: (id: number) => void;
  subscribeToData: (id: number, cb: (data: string) => void) => () => void;
};

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [paired, setPaired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminals, setTerminals] = useState<TerminalInfo[]>([]);
  const [serverUrl, setServerUrl] = useState('');

  // Per-terminal data listeners (persists across reconnects)
  const dataListeners = useRef(new Map<number, Set<(data: string) => void>>());

  // Auto-connect on mount if credentials are saved
  useEffect(() => {
    AsyncStorage.multiGet(['serverUrl', 'authToken']).then(
      ([[, savedUrl], [, savedToken]]) => {
        if (savedUrl && savedToken) {
          setPaired(true);
          connect(savedUrl, savedToken);
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback((url: string, token: string) => {
    socketRef.current?.disconnect();
    setConnected(false);
    setAuthenticated(false);
    setConnecting(true);
    setError(null);
    setTerminals([]);
    dataListeners.current.clear();

    const socket = io(url, {
      transports: ['websocket'],
      timeout: 10000,
      forceNew: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnecting(false);
      setError(null);
      setServerUrl(url);
      socket.emit('auth', token);
      // Persist credentials locally
      AsyncStorage.multiSet([
        ['serverUrl', url],
        ['authToken', token],
      ]);
      setPaired(true);
    });

    socket.on('auth:ok', () => setAuthenticated(true));

    socket.on('auth:error', (msg: string) => {
      setError(msg);
      setAuthenticated(false);
      setConnecting(false);
    });

    socket.on('terminals:list', (list: TerminalInfo[]) => setTerminals(list));

    socket.on('terminal:new', (info: TerminalInfo) =>
      setTerminals((prev) => [...prev.filter((t) => t.id !== info.id), info])
    );

    socket.on('terminal:closed', (id: number) =>
      setTerminals((prev) => prev.filter((t) => t.id !== id))
    );

    socket.on('terminal:renamed', ({ id, name }: { id: number; name: string }) =>
      setTerminals((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)))
    );

    socket.on('terminal:data', ({ id, data }: { id: number; data: string }) => {
      dataListeners.current.get(id)?.forEach((cb) => cb(data));
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setAuthenticated(false);
    });

    socket.on('connect_error', (err) => {
      setError(`Connection failed: ${err.message}`);
      setConnected(false);
      setConnecting(false);
    });
  }, []);

  const unpair = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setConnected(false);
    setAuthenticated(false);
    setTerminals([]);
    setServerUrl('');
    setPaired(false);
    dataListeners.current.clear();
    AsyncStorage.multiRemove(['serverUrl', 'authToken']);
  }, []);

  const createTerminal = useCallback((name?: string) => {
    socketRef.current?.emit('terminal:create', { name, cols: 80, rows: 24 });
  }, []);

  const attachTerminal = useCallback((id: number, cols: number, rows: number) => {
    socketRef.current?.emit('terminal:attach', { id, cols, rows });
  }, []);

  const detachTerminal = useCallback((id: number) => {
    socketRef.current?.emit('terminal:detach', { id });
  }, []);

  const sendInput = useCallback((id: number, data: string) => {
    socketRef.current?.emit('terminal:input', { id, data });
  }, []);

  const resizeTerminal = useCallback((id: number, cols: number, rows: number) => {
    socketRef.current?.emit('terminal:resize', { id, cols, rows });
  }, []);

  const killTerminal = useCallback((id: number) => {
    socketRef.current?.emit('terminal:kill', { id });
  }, []);

  const subscribeToData = useCallback(
    (id: number, cb: (data: string) => void) => {
      if (!dataListeners.current.has(id)) {
        dataListeners.current.set(id, new Set());
      }
      dataListeners.current.get(id)!.add(cb);
      return () => {
        dataListeners.current.get(id)?.delete(cb);
      };
    },
    []
  );

  return (
    <SocketContext.Provider
      value={{
        connected,
        authenticated,
        connecting,
        paired,
        error,
        terminals,
        serverUrl,
        connect,
        unpair,
        createTerminal,
        attachTerminal,
        detachTerminal,
        sendInput,
        resizeTerminal,
        killTerminal,
        subscribeToData,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within SocketProvider');
  return ctx;
}
