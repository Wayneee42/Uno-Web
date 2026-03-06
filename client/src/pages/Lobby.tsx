import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../contexts/GameContext';

function formatJoinError(error?: string): string {
  if (!error) return 'Failed to join room.';
  if (error === 'Room not found') {
    return 'Room not found. Check the room ID or ask host for a fresh invite link.';
  }
  if (error === 'Room is full') {
    return 'Room is full. Ask the host to create another room.';
  }
  return error;
}

function buildWaitHint(reconnectWaitList: Array<{ name: string; remainingSeconds: number }>): string {
  if (reconnectWaitList.length === 0) {
    return '';
  }
  return reconnectWaitList
    .map(item => `${item.name} (${item.remainingSeconds}s)`)
    .join(', ');
}

export default function Lobby() {
  const {
    isConnected,
    room,
    createRoom,
    joinRoom,
    setReady,
    startGame,
    playerId,
    systemMessage,
    globalError,
    reconnectWaitList,
  } = useGame();

  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const copyToastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const invitedRoom = params.get('room')?.trim().toUpperCase() ?? '';
    if (!invitedRoom) return;
    setRoomId(invitedRoom.slice(0, 6));
    setShowJoinForm(true);
    setInfo(`Invite detected. Room ${invitedRoom.slice(0, 6)} is pre-filled.`);
  }, []);

  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        window.clearTimeout(copyToastTimerRef.current);
      }
    };
  }, []);

  const showCopyToast = (message: string) => {
    setCopyToast(message);
    if (copyToastTimerRef.current) {
      window.clearTimeout(copyToastTimerRef.current);
    }
    copyToastTimerRef.current = window.setTimeout(() => {
      setCopyToast(null);
      copyToastTimerRef.current = null;
    }, 1600);
  };

  const handleCreateRoom = async () => {
    if (!isConnected) {
      setError('Cannot create room while disconnected. Reconnect and try again.');
      return;
    }

    if (!playerName.trim()) {
      setError('Please enter your name.');
      return;
    }

    setError('');
    setInfo('');
    await createRoom(playerName.trim());
  };

  const handleJoinRoom = async () => {
    if (!isConnected) {
      setError('Cannot join room while disconnected. Reconnect and try again.');
      return;
    }

    if (!playerName.trim()) {
      setError('Please enter your name before joining.');
      return;
    }

    if (!roomId.trim()) {
      setError('Please enter a room ID.');
      return;
    }

    const normalizedRoomId = roomId.trim().toUpperCase();
    if (normalizedRoomId.length < 4) {
      setError('Room ID looks too short. Check the invite and try again.');
      return;
    }

    setError('');
    setInfo('');
    const result = await joinRoom(normalizedRoomId, playerName.trim());
    if (!result.success) {
      setError(formatJoinError(result.error));
    }
  };

  const handleReady = () => {
    setReady(true);
  };

  const handleStartGame = async () => {
    const result = await startGame();
    if (!result.success) {
      setError(result.error || 'Failed to start game');
    }
  };

  const fallbackCopyText = (text: string): boolean => {
    if (typeof document === 'undefined') {
      return false;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }

    document.body.removeChild(textarea);
    return copied;
  };

  const copyText = async (text: string, successMessage: string) => {
    try {
      const canUseClipboardApi = typeof navigator !== 'undefined' && !!navigator.clipboard && window.isSecureContext;
      if (canUseClipboardApi) {
        await navigator.clipboard.writeText(text);
      } else {
        const copied = fallbackCopyText(text);
        if (!copied) {
          throw new Error('Fallback copy failed');
        }
      }

      setError('');
      showCopyToast(successMessage);
    } catch {
      setError('Copy failed. Please copy manually.');
    }
  };

  const isPlayerReady = room?.players.find(player => player.id === playerId)?.isReady;
  const isHost = room?.players.find(player => player.id === playerId)?.isHost;
  const allReady = room?.players.every(player => player.isReady);
  const canStart = room?.canStart && allReady;

  const startBlocker = useMemo(() => {
    if (!room) return '';
    const missingPlayers = Math.max(0, room.minPlayers - room.players.length);
    if (missingPlayers > 0) {
      return `Need ${missingPlayers} more player(s) to start.`;
    }

    const offlinePlayers = room.players.filter(player => !player.connected).map(player => player.name);
    if (offlinePlayers.length > 0) {
      return `Waiting for reconnect: ${offlinePlayers.join(', ')}.`;
    }

    const unreadyPlayers = room.players.filter(player => !player.isReady).map(player => player.name);
    if (unreadyPlayers.length > 0) {
      return `Waiting for ready: ${unreadyPlayers.join(', ')}.`;
    }

    return 'All players ready. Host can start the game.';
  }, [room]);

  const waitHint = buildWaitHint(reconnectWaitList);

  if (room) {
    const inviteLink = typeof window === 'undefined'
      ? `?room=${room.roomId}`
      : `${window.location.origin}${window.location.pathname}?room=${room.roomId}`;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <AnimatePresence>
          {copyToast && (
            <motion.div
              initial={{ x: 180, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 180, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed right-4 top-4 z-50 rounded-lg border border-emerald-300/40 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100 shadow-lg"
            >
              {copyToast}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="bg-slate-800 rounded-lg p-8 w-full max-w-md">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-2xl font-bold text-white">Room: {room.roomId}</h2>
            <div className="flex items-center gap-1">
              <button
                title="Copy room ID"
                aria-label="Copy room ID"
                onClick={() => copyText(room.roomId, 'Room ID copied')}
                className="h-7 min-w-7 px-2 rounded-md bg-slate-700 hover:bg-slate-600 text-[11px] font-semibold text-white transition"
              >
                ID
              </button>
              <button
                title="Copy invite link"
                aria-label="Copy invite link"
                onClick={() => copyText(inviteLink, 'Invite link copied')}
                className="h-7 min-w-7 px-2 rounded-md bg-blue-600 hover:bg-blue-700 text-[11px] font-semibold text-white transition"
              >
                URL
              </button>
            </div>
          </div>
          <p className="text-slate-400 mb-4">
            Players ({room.players.length}/{room.maxPlayers})
          </p>

          <div className="bg-slate-900/60 border border-slate-700 rounded p-3 mb-4 text-sm text-slate-200">
            {startBlocker}
          </div>

          {!isConnected && (
            <div className="bg-amber-500/20 text-amber-200 rounded p-3 mb-4">
              Reconnecting to server...
            </div>
          )}

          {waitHint && (
            <div className="bg-amber-500/20 text-amber-100 rounded p-3 mb-4 text-sm">
              Waiting for reconnect: {waitHint}
            </div>
          )}

          <div className="space-y-3 mb-6">
            {room.players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between bg-slate-700 rounded-lg p-3"
              >
                <div>
                  <span className="text-white font-medium">
                    {player.name}
                    {player.isHost && ' (Host)'}
                  </span>
                  {!player.connected && (
                    <div className="text-xs text-amber-300 mt-1">Disconnected</div>
                  )}
                </div>
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    player.connected
                      ? player.isReady
                        ? 'bg-green-600 text-white'
                        : 'bg-slate-600 text-slate-300'
                      : 'bg-amber-500/20 text-amber-200'
                  }`}
                >
                  {player.connected ? (player.isReady ? 'Ready' : 'Waiting') : 'Offline'}
                </span>
              </div>
            ))}
          </div>

          {systemMessage && (
            <div className="bg-blue-500/20 text-blue-300 rounded p-3 mb-4">{systemMessage}</div>
          )}
          {globalError && (
            <div className="bg-red-500/20 text-red-300 rounded p-3 mb-4">{globalError.message}</div>
          )}
          {error && (
            <div className="bg-red-500/20 text-red-400 rounded p-3 mb-4">{error}</div>
          )}
          {info && (
            <div className="bg-emerald-500/20 text-emerald-200 rounded p-3 mb-4">{info}</div>
          )}

          <div className="space-y-3">
            {!isPlayerReady ? (
              <button
                onClick={handleReady}
                disabled={!isConnected}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition"
              >
                Ready
              </button>
            ) : (
              <div className="text-center text-green-400 py-3">You are ready. Waiting for others...</div>
            )}

            {isHost && canStart && (
              <button
                onClick={handleStartGame}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition"
              >
                Start Game
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-white">Connecting to server...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-5xl font-bold text-white mb-8">UNO</h1>

      <div className="bg-slate-800 rounded-lg p-8 w-full max-w-md">
        <div className="bg-slate-900/60 border border-slate-700 rounded p-3 mb-4 text-sm text-slate-300 space-y-1">
          <div>Lobby guide:</div>
          <div>- 3 to 4 players are required to start.</div>
          <div>- Host starts the game after everyone is ready.</div>
          <div>- If someone disconnects, the room waits up to 30 seconds.</div>
        </div>

        {waitHint && (
          <div className="bg-amber-500/20 text-amber-100 rounded p-3 mb-4 text-sm">
            Waiting for reconnect: {waitHint}
          </div>
        )}

        {systemMessage && (
          <div className="bg-blue-500/20 text-blue-300 rounded p-3 mb-4">{systemMessage}</div>
        )}
        {globalError && (
          <div className="bg-red-500/20 text-red-300 rounded p-3 mb-4">{globalError.message}</div>
        )}
        {error && (
          <div className="bg-red-500/20 text-red-400 rounded p-3 mb-4">{error}</div>
        )}
        {info && (
          <div className="bg-emerald-500/20 text-emerald-200 rounded p-3 mb-4">{info}</div>
        )}

        {!showJoinForm ? (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Your name"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={20}
            />
            <button
              onClick={handleCreateRoom}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              Create Room
            </button>
            <button
              onClick={() => setShowJoinForm(true)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              Join Room
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Your name"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={20}
            />
            <input
              type="text"
              placeholder="Room ID (from invite link)"
              value={roomId}
              onChange={(event) => setRoomId(event.target.value.toUpperCase())}
              className="w-full bg-slate-700 text-white rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={6}
            />
            <button
              onClick={handleJoinRoom}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              Join
            </button>
            <button
              onClick={() => setShowJoinForm(false)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition"
            >
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}







