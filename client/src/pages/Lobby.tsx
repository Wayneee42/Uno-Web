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
      <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-8">
        <AnimatePresence>
          {copyToast && (
            <motion.div
              initial={{ x: 180, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 180, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed right-4 top-4 z-50 rounded-xl border border-emerald-400/50 bg-emerald-500/20 backdrop-blur-md px-4 py-3 text-sm text-emerald-100 shadow-2xl"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                {copyToast}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="glass-panel rounded-2xl p-6 sm:p-8 w-full max-w-md relative overflow-hidden">
          {/* Decorative background glow */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl"></div>

          <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
            <h2 className="text-2xl font-bold text-white tracking-tight">Room: {room.roomId}</h2>
            <div className="flex items-center gap-2">
              <button
                title="Copy room ID"
                aria-label="Copy room ID"
                onClick={() => copyText(room.roomId, 'Room ID copied')}
                className="h-8 min-w-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold text-white transition-all shadow-sm"
              >
                ID
              </button>
              <button
                title="Copy invite link"
                aria-label="Copy invite link"
                onClick={() => copyText(inviteLink, 'Invite link copied')}
                className="h-8 min-w-8 px-3 rounded-lg bg-blue-500/80 hover:bg-blue-500 border border-blue-400/50 text-xs font-semibold text-white transition-all shadow-sm shadow-blue-500/20"
              >
                URL
              </button>
            </div>
          </div>
          <p className="text-slate-300 font-medium mb-6 relative z-10">
            Players <span className="text-blue-400">({room.players.length}/{room.maxPlayers})</span>
          </p>

          <div className="bg-black/30 border border-white/5 rounded-xl p-4 mb-5 text-sm text-slate-200 relative z-10">
            {startBlocker}
          </div>

          {!isConnected && (
            <div className="bg-amber-500/20 border border-amber-500/30 text-amber-200 rounded-xl p-3 mb-5 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></div>
              Reconnecting to server...
            </div>
          )}

          {waitHint && (
            <div className="bg-amber-500/20 border border-amber-500/30 text-amber-100 rounded-xl p-3 mb-5 text-sm">
              Waiting for reconnect: <span className="font-semibold">{waitHint}</span>
            </div>
          )}

          <div className="space-y-3 mb-8 relative z-10">
            {room.players.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-xl p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-inner">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-white font-semibold flex items-center gap-2">
                      {player.name}
                      {player.isHost && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">HOST</span>
                      )}
                    </span>
                    {!player.connected && (
                      <div className="text-[11px] text-amber-400 mt-0.5 flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-amber-400"></div> Disconnected
                      </div>
                    )}
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-lg text-xs font-bold shadow-sm ${
                    player.connected
                      ? player.isReady
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {player.connected ? (player.isReady ? 'READY' : 'WAITING') : 'OFFLINE'}
                </span>
              </div>
            ))}
          </div>

          {systemMessage && (
            <div className="bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded-xl p-3 mb-5 relative z-10">{systemMessage}</div>
          )}
          {globalError && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl p-3 mb-5 relative z-10">{globalError.message}</div>
          )}
          {error && (
            <div className="bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl p-3 mb-5 relative z-10">{error}</div>
          )}
          {info && (
            <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 rounded-xl p-3 mb-5 relative z-10">{info}</div>
          )}

          <div className="space-y-3 relative z-10">
            {!isPlayerReady ? (
              <button
                onClick={handleReady}
                disabled={!isConnected}
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:from-slate-600 disabled:to-slate-700 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] disabled:shadow-none"
              >
                Ready
              </button>
            ) : (
              <div className="text-center font-medium text-emerald-400 py-3.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                You are ready. Waiting for others...
              </div>
            )}

            {isHost && canStart && (
              <button
                onClick={handleStartGame}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)]"
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
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <div className="text-lg font-medium text-slate-300">Connecting to server...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-8">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-6xl sm:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-blue-400 via-indigo-400 to-purple-400 mb-8 sm:mb-12 drop-shadow-lg text-center tracking-tighter">
          UNO<span className="text-blue-500">.</span>WEB
        </h1>
      </motion.div>

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="glass-panel rounded-3xl p-6 sm:p-8 w-full max-w-md relative overflow-hidden"
      >
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl"></div>

        <div className="bg-black/30 border border-white/5 rounded-xl p-4 mb-6 text-sm text-slate-300 space-y-2 relative z-10 shadow-inner">
          <div className="font-semibold text-white mb-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Lobby Guide
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0"></div>
            <span>2 to 4 players are required to start.</span>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0"></div>
            <span>Host starts the game after everyone is ready.</span>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0"></div>
            <span>If someone disconnects, the room waits up to 30 seconds.</span>
          </div>
        </div>

        {waitHint && (
          <div className="bg-amber-500/20 border border-amber-500/30 text-amber-200 rounded-xl p-3 mb-5 text-sm relative z-10">
            Waiting for reconnect: <span className="font-semibold">{waitHint}</span>
          </div>
        )}

        {systemMessage && (
          <div className="bg-blue-500/20 border border-blue-500/30 text-blue-200 rounded-xl p-3 mb-5 relative z-10">{systemMessage}</div>
        )}
        {globalError && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl p-3 mb-5 relative z-10">{globalError.message}</div>
        )}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl p-3 mb-5 relative z-10">{error}</div>
        )}
        {info && (
          <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 rounded-xl p-3 mb-5 relative z-10">{info}</div>
        )}

        <div className="relative z-10 transition-all duration-300">
          {!showJoinForm ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide ml-1">Your Name</label>
                <input
                  type="text"
                  placeholder="Enter your nickname"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder:text-slate-500"
                  maxLength={20}
                />
              </div>
              <div className="pt-2 space-y-3">
                <button
                  onClick={handleCreateRoom}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_0_25px_rgba(79,70,229,0.4)]"
                >
                  Create New Room
                </button>
                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink-0 mx-4 text-slate-500 text-xs font-medium uppercase">OR</span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>
                <button
                  onClick={() => setShowJoinForm(true)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-3.5 px-4 rounded-xl transition-all"
                >
                  Join Existing Room
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide ml-1">Your Name</label>
                <input
                  type="text"
                  placeholder="Enter your nickname"
                  value={playerName}
                  onChange={(event) => setPlayerName(event.target.value)}
                  className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder:text-slate-500"
                  maxLength={20}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide ml-1">Room ID</label>
                <input
                  type="text"
                  placeholder="e.g. A1B2"
                  value={roomId}
                  onChange={(event) => setRoomId(event.target.value.toUpperCase())}
                  className="w-full bg-black/40 border border-white/10 text-white rounded-xl p-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder:text-slate-500 uppercase"
                  maxLength={6}
                />
              </div>
              <div className="pt-2 space-y-3">
                <button
                  onClick={handleJoinRoom}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_0_25px_rgba(79,70,229,0.4)]"
                >
                  Join Room
                </button>
                <button
                  onClick={() => setShowJoinForm(false)}
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-3.5 px-4 rounded-xl transition-all"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

