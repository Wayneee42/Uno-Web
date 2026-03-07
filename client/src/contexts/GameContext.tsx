import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientGameState,
  ClientToServerEvents,
  ErrorPayload,
  PlayerDisconnectedPayload,
  RoomInfo,
  ServerToClientEvents,
} from '@uno-web/shared';
import { ERROR_CODES } from '@uno-web/shared';
import { resolveServerUrl } from '../config/serverUrl';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const STORAGE_KEY = 'uno-session';
const DEFAULT_DISCONNECT_GRACE_MS = 30_000;

type StoredSession = {
  playerId: string;
  sessionId: string;
};

type ReconnectWaitItem = {
  playerId: string;
  name: string;
  remainingSeconds: number;
};

type DeadlineRecord = Record<string, { name: string; expiresAt: number }>;

interface GameContextValue {
  socket: GameSocket | null;
  room: RoomInfo | null;
  gameState: ClientGameState | null;
  playerId: string | null;
  isConnected: boolean;
  systemMessage: string | null;
  globalError: ErrorPayload | null;
  reconnectWaitList: ReconnectWaitItem[];
  clearGlobalError: () => void;
  createRoom: (playerName: string) => Promise<RoomInfo | null>;
  joinRoom: (roomId: string, playerName: string) => Promise<{ success: boolean; error?: string }>;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  startGame: () => Promise<{ success: boolean; error?: string }>;
  playAgain: () => Promise<{ success: boolean; error?: string }>;
  returnToLobby: () => Promise<{ success: boolean; error?: string }>;
  playCard: (cardId: string, chosenColor?: ClientGameState['activeColor']) => Promise<{ success: boolean; error?: string }>;
  drawCard: () => Promise<{ success: boolean; error?: string }>;
  endTurn: () => Promise<{ success: boolean; error?: string }>;
  chooseDirection: (direction: ClientGameState['direction']) => Promise<{ success: boolean; error?: string }>;
  callUno: () => void;
  challenge: (challenge: boolean) => Promise<{ success: boolean; error?: string }>;
}

const GameContext = createContext<GameContextValue | null>(null);

function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (parsed.playerId && parsed.sessionId) {
      return { playerId: parsed.playerId, sessionId: parsed.sessionId };
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return null;
}

function persistSession(session: StoredSession): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(readStoredSession()?.playerId ?? null);
  const [isConnected, setIsConnected] = useState(false);
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<ErrorPayload | null>(null);
  const [disconnectDeadlines, setDisconnectDeadlines] = useState<DeadlineRecord>({});
  const [nowTs, setNowTs] = useState(() => Date.now());
  const messageTimeoutRef = useRef<number | null>(null);

  const pushSystemMessage = useCallback((message: string) => {
    setSystemMessage(message);
    if (messageTimeoutRef.current) {
      window.clearTimeout(messageTimeoutRef.current);
    }
    messageTimeoutRef.current = window.setTimeout(() => setSystemMessage(null), 5000);
  }, []);

  const clearGlobalError = useCallback(() => {
    setGlobalError(null);
  }, []);

  const removeDisconnectEntry = useCallback((targetPlayerId: string) => {
    setDisconnectDeadlines(prev => {
      if (!prev[targetPlayerId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[targetPlayerId];
      return next;
    });
  }, []);

  const reconnectWaitList = useMemo(() => {
    return Object.entries(disconnectDeadlines)
      .map(([id, info]) => ({
        playerId: id,
        name: info.name,
        remainingSeconds: Math.max(0, Math.ceil((info.expiresAt - nowTs) / 1000)),
      }))
      .filter(item => item.remainingSeconds > 0)
      .sort((a, b) => a.remainingSeconds - b.remainingSeconds);
  }, [disconnectDeadlines, nowTs]);

  useEffect(() => {
    if (Object.keys(disconnectDeadlines).length === 0) {
      return;
    }
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [disconnectDeadlines]);

  useEffect(() => {
    let newSocket: GameSocket | null = null;

    try {
      const serverUrl = resolveServerUrl(
        import.meta.env.VITE_SERVER_URL,
        typeof window !== 'undefined' ? window.location : undefined
      );

      newSocket = io(serverUrl, {
        autoConnect: true,
      }) as GameSocket;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to resolve server URL.';
      setSocket(null);
      setIsConnected(false);
      setGlobalError({
        code: ERROR_CODES.INTERNAL_ERROR,
        message,
      });
      pushSystemMessage(message);
      return;
    }

    const restoreSession = (stored: StoredSession) => {
      newSocket?.emit('resumeSession', { sessionId: stored.sessionId }, response => {
        if (!response.success || !response.playerId || !response.sessionId) {
          clearStoredSession();
          setPlayerId(null);
          setRoom(null);
          setGameState(null);
          setDisconnectDeadlines({});
          setGlobalError({
            code: ERROR_CODES.RESUME_SESSION_FAILED,
            message: response.error ?? 'Session expired. Please join again.',
          });
          pushSystemMessage(response.error ?? 'Session expired. Please join again.');
          return;
        }

        setGlobalError(null);
        persistSession({ playerId: response.playerId, sessionId: response.sessionId });
        setPlayerId(response.playerId);
        if (response.gameState) {
          setRoom(null);
          setGameState(response.gameState);
          pushSystemMessage('Game restored after reconnect.');
          return;
        }

        if (response.room) {
          setRoom(response.room);
          setGameState(null);
          pushSystemMessage('Room restored after reconnect.');
        }
      });
    };

    newSocket.on('connect', () => {
      setIsConnected(true);
      setGlobalError(null);
      pushSystemMessage('Connected to server.');
      const stored = readStoredSession();
      if (stored) {
        setPlayerId(stored.playerId);
        restoreSession(stored);
      }
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      setGlobalError(null);
      pushSystemMessage('Connection lost. Trying to reconnect...');
    });

    newSocket.on('roomUpdate', updatedRoom => {
      setGlobalError(null);
      setRoom(updatedRoom);
      setDisconnectDeadlines(prev => {
        const next: DeadlineRecord = {};
        for (const player of updatedRoom.players) {
          if (!player.connected) {
            next[player.id] = prev[player.id] ?? {
              name: player.name,
              expiresAt: Date.now() + DEFAULT_DISCONNECT_GRACE_MS,
            };
          }
        }
        return next;
      });
    });

    newSocket.on('gameStart', () => {
      setGlobalError(null);
      setRoom(null);
    });

    newSocket.on('gameEnd', () => {
      setGlobalError(null);
      setGameState(null);
      setDisconnectDeadlines({});
    });

    newSocket.on('gameStateUpdate', state => {
      setGlobalError(null);
      setGameState(state as ClientGameState);
    });

    newSocket.on('playerJoined', player => {
      pushSystemMessage(`${player.name} joined the room.`);
    });

    newSocket.on('playerLeft', leftPlayerId => {
      removeDisconnectEntry(leftPlayerId);
      pushSystemMessage('A player left the room.');
    });

    newSocket.on('playerDisconnected', (player: PlayerDisconnectedPayload) => {
      setDisconnectDeadlines(prev => ({
        ...prev,
        [player.playerId]: {
          name: player.name,
          expiresAt: player.expiresAt,
        },
      }));
      pushSystemMessage(`${player.name} disconnected. Waiting up to ${Math.ceil(player.graceMs / 1000)}s.`);
    });

    newSocket.on('playerReconnected', player => {
      removeDisconnectEntry(player.playerId);
      pushSystemMessage(`${player.name} reconnected.`);
    });

    newSocket.on('error', error => {
      setGlobalError(error);
      pushSystemMessage(error.message ?? 'Unexpected socket error');
    });

    setSocket(newSocket);

    return () => {
      if (messageTimeoutRef.current) {
        window.clearTimeout(messageTimeoutRef.current);
      }
      newSocket?.close();
    };
  }, [pushSystemMessage, removeDisconnectEntry]);

  const createRoom = useCallback(async (playerName: string): Promise<RoomInfo | null> => {
    if (!socket) return null;
    setGlobalError(null);
    return new Promise(resolve => {
      socket.emit('createRoom', { playerName }, response => {
        persistSession({ playerId: response.playerId, sessionId: response.sessionId });
        setPlayerId(response.playerId);
        setRoom(response.room);
        setGameState(null);
        setDisconnectDeadlines({});
        resolve(response.room);
      });
    });
  }, [socket]);

  const joinRoom = useCallback(async (roomId: string, playerName: string) => {
    if (!socket) return { success: false, error: 'Not connected' };
    setGlobalError(null);
    return new Promise<{ success: boolean; error?: string }>(resolve => {
      socket.emit('joinRoom', { roomId, playerName }, response => {
        if (response.success && response.room && response.playerId && response.sessionId) {
          persistSession({ playerId: response.playerId, sessionId: response.sessionId });
          setPlayerId(response.playerId);
          setRoom(response.room);
          setGameState(null);
          setDisconnectDeadlines({});
        }
        resolve({ success: response.success, error: response.error });
      });
    });
  }, [socket]);

  const leaveRoom = useCallback(() => {
    if (!socket) return;
    setGlobalError(null);
    socket.emit('leaveRoom', () => {
      clearStoredSession();
      setPlayerId(null);
      setRoom(null);
      setGameState(null);
      setDisconnectDeadlines({});
    });
  }, [socket]);

  const setReady = useCallback((ready: boolean) => {
    if (!socket) return;
    setGlobalError(null);
    socket.emit('ready', { ready });
  }, [socket]);

  const startGame = useCallback(async () => {
    if (!socket) return { success: false, error: 'Not connected' };
    setGlobalError(null);
    return new Promise<{ success: boolean; error?: string }>(resolve => {
      socket.emit('startGame', {}, resolve);
    });
  }, [socket]);

  const playAgain = useCallback(async () => {
    if (!socket) return { success: false, error: 'Not connected' };
    setGlobalError(null);
    return new Promise<{ success: boolean; error?: string }>(resolve => {
      socket.emit('playAgain', {}, resolve);
    });
  }, [socket]);

  const returnToLobby = useCallback(async () => {
    if (!socket) return { success: false, error: 'Not connected' };
    setGlobalError(null);
    return new Promise<{ success: boolean; error?: string }>(resolve => {
      socket.emit('returnToLobby', {}, resolve);
    });
  }, [socket]);

  const playCard = useCallback(async (cardId: string, chosenColor?: ClientGameState['activeColor']) => {
    if (!socket) return { success: false, error: 'Not connected' };
    setGlobalError(null);
    return new Promise<{ success: boolean; error?: string }>(resolve => {
      socket.emit('playCard', { cardId, chosenColor: chosenColor ?? undefined }, resolve);
    });
  }, [socket]);

  const drawCard = useCallback(async () => {
    if (!socket) return { success: false, error: 'Not connected' };
    setGlobalError(null);
    return new Promise<{ success: boolean; error?: string }>(resolve => {
      socket.emit('drawCard', {}, resolve);
    });
  }, [socket]);

  const endTurn = useCallback(async () => {
    if (!socket) return { success: false, error: 'Not connected' };
    setGlobalError(null);
    return new Promise<{ success: boolean; error?: string }>(resolve => {
      socket.emit('endTurn', {}, resolve);
    });
  }, [socket]);

  const chooseDirection = useCallback(async (direction: ClientGameState['direction']) => {
    if (!socket) return { success: false, error: 'Not connected' };
    setGlobalError(null);
    return new Promise<{ success: boolean; error?: string }>(resolve => {
      socket.emit('chooseDirection', { direction }, resolve);
    });
  }, [socket]);

  const callUno = useCallback(() => {
    if (!socket) return;
    setGlobalError(null);
    socket.emit('callUno', {});
  }, [socket]);

  const challenge = useCallback(async (challengeValue: boolean) => {
    if (!socket) return { success: false, error: 'Not connected' };
    setGlobalError(null);
    return new Promise<{ success: boolean; error?: string }>(resolve => {
      socket.emit('challenge', { challenge: challengeValue }, resolve);
    });
  }, [socket]);

  return (
    <GameContext.Provider
      value={{
        socket,
        room,
        gameState,
        playerId,
        isConnected,
        systemMessage,
        globalError,
        reconnectWaitList,
        clearGlobalError,
        createRoom,
        joinRoom,
        leaveRoom,
        setReady,
        startGame,
        playAgain,
        returnToLobby,
        playCard,
        drawCard,
        endTurn,
        chooseDirection,
        callUno,
        challenge,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
