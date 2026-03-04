import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientGameState,
  RoomInfo,
  ClientToServerEvents,
  ServerToClientEvents,
} from '@uno-web/shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface GameContextValue {
  socket: GameSocket | null;
  room: RoomInfo | null;
  gameState: ClientGameState | null;
  playerId: string | null;
  isConnected: boolean;
  createRoom: (playerName: string) => Promise<RoomInfo | null>;
  joinRoom: (roomId: string, playerName: string) => Promise<{ success: boolean; error?: string }>;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  startGame: () => Promise<{ success: boolean; error?: string }>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io('http://localhost:3001', {
      autoConnect: true,
    }) as GameSocket;

    newSocket.on('connect', () => {
      setIsConnected(true);
      setPlayerId(newSocket.id);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('roomUpdate', (updatedRoom) => {
      setRoom(updatedRoom);
    });

    newSocket.on('gameStart', () => {
      setRoom(null);
    });

    newSocket.on('gameStateUpdate', (state) => {
      setGameState(state as ClientGameState);
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const createRoom = useCallback(async (playerName: string): Promise<RoomInfo | null> => {
    if (!socket) return null;
    return new Promise((resolve) => {
      socket.emit('createRoom', { playerName }, (roomInfo) => {
        setRoom(roomInfo);
        resolve(roomInfo);
      });
    });
  }, [socket]);

  const joinRoom = useCallback(async (roomId: string, playerName: string) => {
    if (!socket) return { success: false, error: 'Not connected' };
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      socket.emit('joinRoom', { roomId, playerName }, (response) => {
        if (response.success && response.room) {
          setRoom(response.room);
        }
        resolve(response);
      });
    });
  }, [socket]);

  const leaveRoom = useCallback(() => {
    if (!socket) return;
    socket.emit('leaveRoom', () => {
      setRoom(null);
      setGameState(null);
    });
  }, [socket]);

  const setReady = useCallback((ready: boolean) => {
    if (!socket) return;
    socket.emit('ready', { ready });
  }, [socket]);

  const startGame = useCallback(async () => {
    if (!socket) return { success: false, error: 'Not connected' };
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      socket.emit('startGame', {}, resolve);
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
        createRoom,
        joinRoom,
        leaveRoom,
        setReady,
        startGame,
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
