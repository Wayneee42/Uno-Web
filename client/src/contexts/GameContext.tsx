import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientGameState,
  ClientToServerEvents,
  ErrorPayload,
  InitializeProfileResponse,
  MatchDetails,
  MatchHistoryPage,
  PlayerDisconnectedPayload,
  PlayerProfile,
  ProfileStats,
  RoomInfo,
  ServerToClientEvents,
} from '@uno-web/shared';
import { ERROR_CODES } from '@uno-web/shared';
import { resolveServerUrl } from '../config/serverUrl';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SESSION_STORAGE_KEY = 'uno-session';
const PROFILE_STORAGE_KEY = 'uno-profile';
const DEFAULT_DISCONNECT_GRACE_MS = 30_000;

type StoredSession = {
  playerId: string;
  sessionId: string;
};

type StoredProfile = {
  recoveryCode: string;
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
  profile: PlayerProfile | null;
  profileReady: boolean;
  historyAvailable: boolean;
  recoveryCode: string | null;
  isConnected: boolean;
  systemMessage: string | null;
  globalError: ErrorPayload | null;
  reconnectWaitList: ReconnectWaitItem[];
  clearGlobalError: () => void;
  importProfile: (recoveryCode: string) => Promise<{ success: boolean; error?: string }>;
  rotateRecoveryCode: () => Promise<{ success: boolean; recoveryCode?: string; error?: string }>;
  loadMatchHistory: (cursor?: string) => Promise<{
    success: boolean;
    page?: MatchHistoryPage;
    error?: string;
  }>;
  loadMatchDetails: (matchId: string) => Promise<{
    success: boolean;
    match?: MatchDetails;
    error?: string;
  }>;
  loadProfileStats: () => Promise<{
    success: boolean;
    stats?: ProfileStats;
    error?: string;
  }>;
  createRoom: (playerName: string) => Promise<RoomInfo | null>;
  joinRoom: (roomId: string, playerName: string) => Promise<{ success: boolean; error?: string }>;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  startGame: () => Promise<{ success: boolean; error?: string }>;
  playAgain: () => Promise<{ success: boolean; error?: string }>;
  returnToLobby: () => Promise<{ success: boolean; error?: string }>;
  playCard: (
    cardId: string,
    chosenColor?: ClientGameState['activeColor'],
  ) => Promise<{ success: boolean; error?: string }>;
  drawCard: () => Promise<{ success: boolean; error?: string }>;
  endTurn: () => Promise<{ success: boolean; error?: string }>;
  chooseDirection: (
    direction: ClientGameState['direction'],
  ) => Promise<{ success: boolean; error?: string }>;
  callUno: () => void;
  challenge: (challenge: boolean) => Promise<{ success: boolean; error?: string }>;
}

const GameContext = createContext<GameContextValue | null>(null);

function readStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (parsed.playerId && parsed.sessionId) {
      return { playerId: parsed.playerId, sessionId: parsed.sessionId };
    }
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  return null;
}

function persistSession(session: StoredSession): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function readStoredProfile(): StoredProfile | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProfile>;
    return typeof parsed.recoveryCode === 'string'
      ? { recoveryCode: parsed.recoveryCode }
      : null;
  } catch {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    return null;
  }
}

function persistProfile(recoveryCode: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ recoveryCode }));
}

function clearStoredProfile(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PROFILE_STORAGE_KEY);
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(readStoredSession()?.playerId ?? null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [historyAvailable, setHistoryAvailable] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(
    readStoredProfile()?.recoveryCode ?? null
  );
  const [isConnected, setIsConnected] = useState(false);
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<ErrorPayload | null>(null);
  const [disconnectDeadlines, setDisconnectDeadlines] = useState<DeadlineRecord>({});
  const [nowTs, setNowTs] = useState(() => Date.now());
  const messageTimeoutRef = useRef<number | null>(null);
  const sessionReplacedRef = useRef(false);

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

    const initializeProfile = () => {
      const storedProfile = readStoredProfile();
      const finishInitialization = (
        response: InitializeProfileResponse,
        retainedRecoveryCode?: string
      ) => {
        setHistoryAvailable(response.historyAvailable);
        if (response.success && response.profile) {
          setProfile(response.profile);
          if (response.recoveryCode) {
            persistProfile(response.recoveryCode);
            setRecoveryCode(response.recoveryCode);
          } else if (retainedRecoveryCode) {
            setRecoveryCode(retainedRecoveryCode);
          }
        } else {
          setProfile(null);
          if (response.error) pushSystemMessage(response.error);
        }
        setProfileReady(true);

        const storedSession = readStoredSession();
        if (storedSession) {
          setPlayerId(storedSession.playerId);
          restoreSession(storedSession);
        }
      };

      newSocket?.emit(
        'initializeProfile',
        storedProfile ? { recoveryCode: storedProfile.recoveryCode } : {},
        response => {
          const savedCodeIsInvalid =
            Boolean(storedProfile) &&
            (response.error === 'Recovery code not found' ||
              response.error === 'Invalid recovery code format');
          if (!savedCodeIsInvalid) {
            finishInitialization(response, storedProfile?.recoveryCode);
            return;
          }

          clearStoredProfile();
          setRecoveryCode(null);
          newSocket?.emit('initializeProfile', {}, freshResponse => {
            finishInitialization(freshResponse);
            if (freshResponse.success) {
              pushSystemMessage(
                'The saved recovery code expired. A new player profile was created.'
              );
            }
          });
        }
      );
    };

    newSocket.on('connect', () => {
      setIsConnected(true);
      setProfileReady(false);
      setGlobalError(null);
      pushSystemMessage('Connected to server.');
      initializeProfile();
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
      setProfileReady(false);
      if (sessionReplacedRef.current) {
        sessionReplacedRef.current = false;
        return;
      }
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
      pushSystemMessage(
        `${player.name} disconnected. Waiting up to ${Math.ceil(player.graceMs / 1000)}s.`
      );
    });

    newSocket.on('playerReconnected', player => {
      removeDisconnectEntry(player.playerId);
      pushSystemMessage(`${player.name} reconnected.`);
    });

    newSocket.on('profileCredentialsRevoked', () => {
      clearStoredProfile();
      setProfile(null);
      setRecoveryCode(null);
      setHistoryAvailable(false);
      pushSystemMessage('This profile recovery code was rotated on another device.');
    });

    newSocket.on('sessionReplaced', () => {
      sessionReplacedRef.current = true;
      clearStoredSession();
      setPlayerId(null);
      setRoom(null);
      setGameState(null);
      setDisconnectDeadlines({});
      setGlobalError({
        code: ERROR_CODES.SESSION_REPLACED,
        message: 'This game session was resumed on another device.',
      });
      pushSystemMessage('This game session was resumed on another device.');
    });

    newSocket.on('serverRestarting', () => {
      sessionReplacedRef.current = true;
      clearStoredSession();
      setPlayerId(null);
      setRoom(null);
      setGameState(null);
      setDisconnectDeadlines({});
      pushSystemMessage('Server is restarting. The current room has ended.');
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

  const importProfile = useCallback(async (code: string) => {
    if (!socket || room || gameState) {
      return { success: false, error: 'Player profile can only be changed from the lobby' };
    }
    return new Promise<{ success: boolean; error?: string }>(resolve => {
      socket.emit('initializeProfile', { recoveryCode: code.trim() }, response => {
        setHistoryAvailable(response.historyAvailable);
        if (!response.success || !response.profile) {
          resolve({ success: false, error: response.error ?? 'Could not restore player profile' });
          return;
        }
        persistProfile(code.trim());
        setRecoveryCode(code.trim());
        setProfile(response.profile);
        setProfileReady(true);
        resolve({ success: true });
      });
    });
  }, [gameState, room, socket]);

  const rotateRecoveryCode = useCallback(async () => {
    if (!socket || !profile) {
      return { success: false, error: 'Persistent player profile is unavailable' };
    }
    return new Promise<{ success: boolean; recoveryCode?: string; error?: string }>(resolve => {
      socket.emit('rotateRecoveryCode', {}, response => {
        if (response.success && response.recoveryCode) {
          persistProfile(response.recoveryCode);
          setRecoveryCode(response.recoveryCode);
        }
        resolve(response);
      });
    });
  }, [profile, socket]);

  const loadMatchHistory = useCallback(async (cursor?: string) => {
    if (!socket || !profile) {
      return { success: false, error: 'Persistent player profile is unavailable' };
    }
    return new Promise<{ success: boolean; page?: MatchHistoryPage; error?: string }>(resolve => {
      socket.emit('getMatchHistory', { cursor, limit: 20 }, response => {
        setHistoryAvailable(response.historyAvailable);
        resolve({ success: response.success, page: response.page, error: response.error });
      });
    });
  }, [profile, socket]);

  const loadMatchDetails = useCallback(async (matchId: string) => {
    if (!socket || !profile) {
      return { success: false, error: 'Persistent player profile is unavailable' };
    }
    return new Promise<{ success: boolean; match?: MatchDetails; error?: string }>(resolve => {
      socket.emit('getMatchDetails', { matchId }, response => {
        setHistoryAvailable(response.historyAvailable);
        resolve({ success: response.success, match: response.match, error: response.error });
      });
    });
  }, [profile, socket]);

  const loadProfileStats = useCallback(async () => {
    if (!socket || !profile) {
      return { success: false, error: 'Persistent player profile is unavailable' };
    }
    return new Promise<{ success: boolean; stats?: ProfileStats; error?: string }>(resolve => {
      socket.emit('getProfileStats', {}, response => {
        setHistoryAvailable(response.historyAvailable);
        resolve({ success: response.success, stats: response.stats, error: response.error });
      });
    });
  }, [profile, socket]);

  const createRoom = useCallback(async (playerName: string): Promise<RoomInfo | null> => {
    if (!socket) return null;
    setGlobalError(null);
    return new Promise(resolve => {
      socket.emit('createRoom', { playerName }, response => {
        if (!response.success || !response.room || !response.playerId || !response.sessionId) {
          resolve(null);
          return;
        }
        persistSession({ playerId: response.playerId, sessionId: response.sessionId });
        setPlayerId(response.playerId);
        setRoom(response.room);
        setProfile(previous => previous ? { ...previous, displayName: playerName } : previous);
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
          setProfile(previous => previous ? { ...previous, displayName: playerName } : previous);
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

  const playCard = useCallback(
    async (cardId: string, chosenColor?: ClientGameState['activeColor']) => {
      if (!socket) return { success: false, error: 'Not connected' };
      setGlobalError(null);
      return new Promise<{ success: boolean; error?: string }>(resolve => {
        socket.emit('playCard', { cardId, chosenColor: chosenColor ?? undefined }, resolve);
      });
    },
    [socket],
  );

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

  const chooseDirection = useCallback(
    async (direction: ClientGameState['direction']) => {
      if (!socket) return { success: false, error: 'Not connected' };
      setGlobalError(null);
      return new Promise<{ success: boolean; error?: string }>(resolve => {
        socket.emit('chooseDirection', { direction }, resolve);
      });
    },
    [socket],
  );

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
        profile,
        profileReady,
        historyAvailable,
        recoveryCode,
        isConnected,
        systemMessage,
        globalError,
        reconnectWaitList,
        clearGlobalError,
        importProfile,
        rotateRecoveryCode,
        loadMatchHistory,
        loadMatchDetails,
        loadProfileStats,
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
