import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, CardColor, ClientGameState } from '@uno-web/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../contexts/GameContext';

const COLOR_STYLES: Record<CardColor, string> = {
  Red: 'bg-gradient-to-br from-red-500 to-red-600 text-white border-white/20 shadow-[0_0_15px_rgba(239,68,68,0.3)]',
  Blue: 'bg-gradient-to-br from-blue-500 to-blue-600 text-white border-white/20 shadow-[0_0_15px_rgba(59,130,246,0.3)]',
  Green: 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white border-white/20 shadow-[0_0_15px_rgba(16,185,129,0.3)]',
  Yellow: 'bg-gradient-to-br from-amber-400 to-amber-500 text-slate-900 border-white/20 shadow-[0_0_15px_rgba(251,191,36,0.3)]',
  Wild: 'bg-gradient-to-br from-slate-700 to-slate-900 text-white border-white/20 shadow-[0_0_15px_rgba(51,65,85,0.3)]',
};

const COLOR_OPTIONS: CardColor[] = ['Red', 'Blue', 'Green', 'Yellow'];

type SeatPosition = 'bottom' | 'left' | 'top' | 'right';
type CardPoint = SeatPosition | 'draw' | 'discard';

type FlyCard = {
  id: string;
  from: CardPoint;
  to: CardPoint;
  color: CardColor;
  value: Card['value'];
  delay?: number;
};

type DealCard = {
  id: string;
  to: SeatPosition;
  delay: number;
};

const POINTS: Record<CardPoint, { x: string; y: string }> = {
  draw: { x: '50%', y: '45%' },     // Draw pile in center-ish
  discard: { x: '50%', y: '45%' },  // Discard pile aligned
  bottom: { x: '50%', y: '85%' },   // Bottom hand area
  left: { x: '12%', y: '45%' },     // Left player
  top: { x: '50%', y: '15%' },      // Top player
  right: { x: '88%', y: '45%' },    // Right player
};

function isPlayableCard(
  card: Card,
  state: ClientGameState,
  isMyTurn: boolean
): boolean {
  if (state.phase !== 'playing') return false;
  if (!isMyTurn) return false;
  if (!state.directionChosen) return false;
  if (state.challengeState && !state.challengeState.resolved) return false;

  if (state.pendingPenalty > 0) {
    return card.value === 'Draw2' || card.value === 'WildDraw4';
  }

  if (state.hasDrawnThisTurn && state.lastDrawnCardId && card.id !== state.lastDrawnCardId) {
    return false;
  }

  if (card.color === 'Wild') return true;
  const effectiveColor = state.activeColor ?? state.topCard.color;
  return card.color === effectiveColor || card.value === state.topCard.value;
}

function formatLogTime(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function PlayerSeat({
  name,
  handCount,
  isCurrent,
  position,
}: {
  name: string;
  handCount: number;
  isCurrent: boolean;
  position: 'left' | 'top' | 'right';
}) {
  const showLastCard = handCount === 1;
  const isTopSeat = position === 'top';
  const positionClass = {
    left: 'hidden sm:block sm:left-3 lg:left-5 xl:left-8 sm:top-[47%] lg:top-[44%] xl:top-[46%] sm:-translate-y-1/2',
    top: 'hidden sm:block sm:top-3 lg:top-2 xl:top-3 sm:left-1/2 sm:-translate-x-1/2',
    right: 'hidden sm:block sm:right-3 lg:right-5 xl:right-8 sm:top-[47%] lg:top-[44%] xl:top-[46%] sm:-translate-y-1/2',
  }[position];

  return (
    <div className={`absolute ${positionClass} z-10 transition-transform duration-300 ${isCurrent ? 'scale-100 lg:scale-105' : 'scale-90 lg:scale-95'}`}>
      <div
        className={`relative flex flex-col items-center justify-center rounded-2xl backdrop-blur-md transition-all ${
          isTopSeat ? 'px-3 py-2 sm:px-4 sm:py-2.5 lg:px-3 lg:py-2' : 'p-2.5 sm:p-3 lg:p-2.5'
        } ${
          isCurrent ? 'bg-white/10 border-2 border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.3)]' : 'bg-black/40 border border-white/10'
        }`}
      >
        <div className={`${isTopSeat ? 'w-9 h-9 text-base mb-1 sm:w-10 sm:h-10 sm:text-lg sm:mb-1.5' : 'w-10 h-10 text-lg mb-1.5 sm:w-12 sm:h-12 sm:text-xl sm:mb-2 lg:w-10 lg:h-10 lg:text-lg lg:mb-1.5'} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold shadow-inner border border-white/20`}>
          {name.charAt(0).toUpperCase()}
        </div>
        <div className={`${isTopSeat ? 'text-[11px] max-w-[88px] sm:text-xs sm:max-w-[96px]' : 'text-xs max-w-[72px] sm:text-sm sm:max-w-[80px] lg:text-xs lg:max-w-[72px]'} text-white font-bold tracking-wide truncate text-center drop-shadow-md`}>
          {name}
        </div>
        <div className={`${isTopSeat ? 'text-[10px] px-2 py-0.5 mt-1 sm:text-[11px]' : 'text-[11px] px-2 py-0.5 mt-1 sm:text-xs sm:px-2.5 lg:text-[11px] lg:px-2'} text-slate-300 bg-black/40 rounded-full border border-white/5`}>
          {handCount} cards
        </div>
      </div>
    </div>
  );
}
export default function Game() {
  const {
    gameState,
    playCard,
    drawCard,
    endTurn,
    chooseDirection,
    challenge,
    leaveRoom,
    playAgain,
    returnToLobby,
    systemMessage,
    globalError,
    reconnectWaitList,
    isConnected,
  } = useGame();
  const [error, setError] = useState<string | null>(null);
  const [pendingWildCardId, setPendingWildCardId] = useState<string | null>(null);
  const [dealCards, setDealCards] = useState<DealCard[]>([]);
  const [flyCard, setFlyCard] = useState<FlyCard | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const prevStateRef = useRef<ClientGameState | null>(null);

  if (!gameState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl text-white">Loading game...</div>
      </div>
    );
  }

  const isMyTurn = gameState.currentPlayerIndex === gameState.myPlayerIndex;
  const totalPlayers = 1 + gameState.otherPlayers.length;
  const isChallengePending = gameState.challengeState && !gameState.challengeState.resolved;
  const amChallenger = isChallengePending && gameState.challengeState?.challengerIndex === gameState.myPlayerIndex;
  const isLastCard = gameState.myPlayer.hand.length === 1;
  const needsDirection = !gameState.directionChosen;
  const challengePreviousColor = gameState.challengeState?.previousColor ?? null;
  const isGameFinished = gameState.phase === 'finished';
  const isHost = gameState.myPlayer.id === gameState.hostId;
  const winnerName = gameState.winnerId === gameState.myPlayer.id
    ? gameState.myPlayer.name
    : gameState.otherPlayers.find(player => player.id === gameState.winnerId)?.name ?? null;
  const turnStatusLabel = isGameFinished
    ? 'Game finished'
    : isMyTurn
      ? 'Your turn'
      : 'Waiting for other player';

  const reconnectWaitHint = reconnectWaitList
    .map(item => `${item.name} (${item.remainingSeconds}s)`)
    .join(', ');

  const getSeatForIndex = (playerIndex: number): SeatPosition => {
    const relative = (playerIndex - gameState.myPlayerIndex + totalPlayers) % totalPlayers;
    if (relative === 0) return 'bottom';

    // Distribute opponent seats better across the UI based on total count
    if (totalPlayers === 2) {
      // 1 opponent -> top center
      return 'top';
    }
    if (totalPlayers === 3) {
      // 2 opponents -> left and right (skip top to keep it balanced)
      return relative === 1 ? 'left' : 'right';
    }
    // 3 opponents -> left, top, right
    if (relative === 1) return 'left';
    if (relative === 2) return 'top';
    return 'right';
  };

  const otherSeats = useMemo(() => {
    const seats: Array<{ position: 'left' | 'top' | 'right'; player: ClientGameState['otherPlayers'][number] }> = [];
    for (const player of gameState.otherPlayers) {
      const position = getSeatForIndex(player.playerIndex);
      if (position !== 'bottom') {
        seats.push({ position: position as 'left' | 'top' | 'right', player });
      }
    }
    return seats;
  }, [gameState, totalPlayers]);

  useEffect(() => {
    const prev = prevStateRef.current;
    let dealTimer: number | null = null;

    if (!prev) {
      const counts = new Map<number, number>();
      counts.set(gameState.myPlayerIndex, gameState.myPlayer.hand.length);
      for (const player of gameState.otherPlayers) {
        counts.set(player.playerIndex, player.handCount);
      }

      const playerIndices = Array.from(counts.keys()).sort((a, b) => a - b);
      const maxCards = Math.max(...Array.from(counts.values()));
      const sequence: DealCard[] = [];
      let delay = 0;

      for (let round = 0; round < maxCards; round += 1) {
        for (const index of playerIndices) {
          if ((counts.get(index) ?? 0) > round) {
            const seat = getSeatForIndex(index);
            if (seat !== 'bottom') {
              sequence.push({
                id: `deal-${index}-${round}`,
                to: seat,
                delay,
              });
            }
            delay += 0.09;
          }
        }
      }

      if (sequence.length > 0) {
        setDealCards(sequence);
        const totalDurationMs = (delay + 0.5) * 1000;
        dealTimer = window.setTimeout(() => setDealCards([]), totalDurationMs);
      }
    } else {
      if (gameState.lastPlayedCard && gameState.lastPlayedCard.id !== prev.lastPlayedCard?.id) {
        const from = getSeatForIndex(prev.currentPlayerIndex);
        setFlyCard({
          id: `play-${gameState.lastPlayedCard.id}`,
          from,
          to: 'discard',
          color: gameState.lastPlayedCard.color,
          value: gameState.lastPlayedCard.value,
        });
      } else if (gameState.lastDrawnCardId && gameState.lastDrawnCardId !== prev.lastDrawnCardId) {
        const to = getSeatForIndex(prev.currentPlayerIndex);
        setFlyCard({
          id: `draw-${gameState.lastDrawnCardId}`,
          from: 'draw',
          to,
          color: 'Wild',
          value: 'Wild',
        });
      }
    }

    prevStateRef.current = gameState;

    return () => {
      if (dealTimer) window.clearTimeout(dealTimer);
    };
  }, [gameState, totalPlayers]);

  const handlePlayCard = async (card: Card) => {
    if (!isPlayableCard(card, gameState, isMyTurn)) return;
    setError(null);

    if (card.color === 'Wild') {
      setPendingWildCardId(card.id);
      return;
    }

    const result = await playCard(card.id);
    if (!result.success) {
      setError(result.error || 'Failed to play card');
    }
  };

  const handleDraw = async () => {
    setError(null);
    const result = await drawCard();
    if (!result.success) {
      setError(result.error || 'Failed to draw card');
    }
  };

  const handleEndTurn = async () => {
    setError(null);
    const result = await endTurn();
    if (!result.success) {
      setError(result.error || 'Failed to end turn');
    }
  };

  const handleChallenge = async (challengeValue: boolean) => {
    setError(null);
    const result = await challenge(challengeValue);
    if (!result.success) {
      setError(result.error || 'Failed to resolve challenge');
    }
  };

  const handleChooseDirection = async (direction: ClientGameState['direction']) => {
    setError(null);
    const result = await chooseDirection(direction);
    if (!result.success) {
      setError(result.error || 'Failed to choose direction');
    }
  };

  const handleWildColor = async (color: CardColor) => {
    if (!pendingWildCardId) return;
    setError(null);
    const result = await playCard(pendingWildCardId, color);
    setPendingWildCardId(null);
    if (!result.success) {
      setError(result.error || 'Failed to play wild card');
    }
  };

  const handlePlayAgain = async () => {
    setError(null);
    const result = await playAgain();
    if (!result.success) {
      setError(result.error || 'Failed to start rematch');
    }
  };

  const handleLeaveGame = () => {
    setShowLeaveConfirm(false);
    leaveRoom();
  };

  const logItems = [...gameState.eventLog].reverse();

  return (
    <div className="h-screen overflow-hidden flex flex-col p-3 sm:p-4 text-white relative">
      <div className="w-full max-w-[1400px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 mb-4 z-10 glass-panel p-4 rounded-2xl">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">UNO Room</h2>
            <div className="px-3 py-1.5 rounded-xl bg-black/35 border border-white/10 shadow-inner text-xs sm:text-sm font-semibold text-slate-200">
              <span className="text-slate-400 mr-2">Playing as</span>
              <span className="text-white">{gameState.myPlayer.name}</span>
            </div>
          </div>
          <div className="text-slate-300 text-xs sm:text-sm mt-2 flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 shadow-inner font-medium">
              {turnStatusLabel}
            </span>
            {gameState.pendingPenalty > 0 && (
              <span className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 font-bold animate-pulse">
                Pending +{gameState.pendingPenalty}
              </span>
            )}
            {gameState.activeColor && (
              <span className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 font-bold flex items-center gap-2 shadow-inner">
                Color:
                <div className={`w-3 h-3 rounded-full ${COLOR_STYLES[gameState.activeColor].split(' ')[0]}`}></div>
                {gameState.activeColor}
              </span>
            )}
            {gameState.directionChosen && (
              <span className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 font-medium flex items-center gap-1.5 shadow-inner">
                {gameState.direction === 1 ? (
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                ) : (
                  <svg className="w-4 h-4 text-emerald-400 scale-x-[-1]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                )}
                {gameState.direction === 1 ? 'Clockwise' : 'Counterclockwise'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto">
          {isGameFinished && isHost && (
            <button
              onClick={handlePlayAgain}
              className="px-5 py-2 text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all"
            >
              Play Again
            </button>
          )}
          {isGameFinished && isHost && (
            <button
              onClick={async () => {
                const result = await returnToLobby();
                if (!result.success) {
                  setError(result.error || 'Failed to return to lobby');
                }
              }}
              className="px-5 py-2 text-sm font-bold rounded-xl bg-slate-700 hover:bg-slate-600 shadow-lg border border-white/10 transition-all"
            >
              Back to Lobby
            </button>
          )}
          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="px-5 py-2 text-sm font-bold rounded-xl bg-red-600 hover:bg-red-500 shadow-[0_0_15px_rgba(220,38,38,0.3)] transition-all"
          >
            Leave Game
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="glass-panel border border-white/20 rounded-3xl p-6 sm:p-8 w-full max-w-sm shadow-[0_0_50px_rgba(0,0,0,0.8)]"
              initial={{ y: 20, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.96 }}
            >
              <h3 className="text-2xl font-black text-white tracking-tight mb-3">Leave Game?</h3>
              <p className="text-sm text-slate-300 leading-6 mb-6">
                You will leave the current match and return to the lobby flow. Rejoin with the room code if the room is still active.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-3 text-sm font-bold text-white transition-all"
                >
                  Stay
                </button>
                <button
                  onClick={handleLeaveGame}
                  className="w-full rounded-xl bg-red-600 hover:bg-red-500 px-4 py-3 text-sm font-bold text-white shadow-[0_0_20px_rgba(220,38,38,0.25)] transition-all"
                >
                  Leave Game
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {!isConnected && (
        <div className="w-full max-w-6xl mx-auto mb-3 bg-amber-500/20 text-amber-100 border border-amber-500/30 rounded-xl px-4 py-3 text-sm shrink-0 flex items-center gap-3 shadow-lg z-10">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></div>
          Reconnecting to server...
        </div>
      )}

      {reconnectWaitHint && (
        <div className="w-full max-w-6xl mx-auto mb-3 bg-amber-500/20 text-amber-100 border border-amber-500/30 rounded-xl px-4 py-3 text-sm shrink-0 shadow-lg z-10">
          <span className="font-bold">Waiting for reconnect:</span> {reconnectWaitHint}
        </div>
      )}

      {systemMessage && (
        <div className="w-full max-w-6xl mx-auto mb-3 bg-blue-500/20 text-blue-100 border border-blue-500/30 rounded-xl px-4 py-3 text-sm shrink-0 shadow-lg z-10 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {systemMessage}
        </div>
      )}

      {globalError && (
        <div className="w-full max-w-6xl mx-auto mb-3 bg-red-500/20 text-red-100 border border-red-500/30 rounded-xl px-4 py-3 text-sm shrink-0 shadow-lg z-10 flex items-center gap-2">
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {globalError.message}
        </div>
      )}

      {error && (
        <div className="w-full max-w-6xl mx-auto mb-3 bg-red-500/20 text-red-100 border border-red-500/30 rounded-xl px-4 py-3 text-sm shrink-0 shadow-lg z-10 flex items-center gap-2">
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}

      {isLastCard && (
        <div className="w-full max-w-6xl mx-auto mb-3 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl px-4 py-3 text-center text-sm font-extrabold shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-pulse z-10">
          WARNING: ONE CARD LEFT
        </div>
      )}

      {isGameFinished && gameState.isDraw && (
        <div className="w-full max-w-6xl mx-auto mb-3 bg-slate-700/60 text-white border border-slate-500/50 rounded-xl px-4 py-4 text-center text-lg font-bold shrink-0 shadow-xl z-10 backdrop-blur-md">
          Game ended in a draw.
        </div>
      )}

      {isGameFinished && !gameState.isDraw && winnerName && (
        <div className="w-full max-w-6xl mx-auto mb-3 bg-gradient-to-r from-emerald-600/40 to-emerald-400/40 text-emerald-100 border border-emerald-400/50 rounded-xl px-4 py-4 text-center text-xl font-black shrink-0 shadow-[0_0_30px_rgba(16,185,129,0.3)] z-10 backdrop-blur-md">
          {winnerName} WINS!
        </div>
      )}

      {needsDirection && (
        <div className="w-full max-w-[1400px] mx-auto mb-3 glass-panel rounded-xl px-6 py-4 text-center shrink-0 z-10">
          {isMyTurn ? (
            <div className="flex flex-col items-center gap-4">
              <div className="font-bold text-lg text-white">Choose play direction</div>
              <div className="flex gap-4">
                <button
                  onClick={() => handleChooseDirection(1)}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold shadow-lg hover:scale-105 transition-transform border border-blue-400/50"
                >
                  Clockwise
                </button>
                <button
                  onClick={() => handleChooseDirection(-1)}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-bold shadow-lg hover:scale-105 transition-transform border border-emerald-400/50"
                >
                  Counterclockwise
                </button>
              </div>
            </div>
          ) : (
            <div className="font-bold text-slate-300 flex items-center justify-center gap-3">
              <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
              Dealer is choosing the play direction...
            </div>
          )}
        </div>
      )}

      <div className="w-full max-w-[1400px] mx-auto flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* Left side: Match Log (desktop) */}
        <div className="hidden lg:flex w-64 shrink-0 flex-col z-10 glass-panel rounded-2xl p-4 h-full max-h-[74vh]">
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div className="text-xs uppercase tracking-widest font-bold text-slate-300">Match Log</div>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 scrollbar-hide">
            {logItems.length === 0 && (
              <div className="text-sm text-slate-500 italic">No events yet. Game starts soon...</div>
            )}
            {logItems.map(item => (
              <div key={item.id} className="text-xs text-slate-200 bg-black/20 border border-white/5 rounded-lg px-2.5 py-2 flex items-start gap-2">
                <span className="text-slate-500 text-[10px] mt-0.5 shrink-0 font-mono">[{formatLogTime(item.createdAt)}]</span>
                <span>{item.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Main Board */}
        <div className="flex-1 py-1 sm:py-3 flex items-center justify-center relative min-w-0">
          {/* Glow behind the board */}
          <div className="absolute inset-0 bg-blue-500/10 blur-[100px] rounded-[100px] pointer-events-none"></div>

          <div className="relative w-full max-w-[1080px] h-full lg:max-h-[80vh] bg-gradient-to-br from-white/5 to-black/20 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden ring-1 ring-white/5">
            <div className="absolute inset-0 pointer-events-none">
            <AnimatePresence>
              {dealCards.map((card) => (
                <motion.div
                  key={card.id}
                  className="absolute w-12 h-16 sm:w-16 sm:h-24 rounded-xl border border-white/20 bg-gradient-to-br from-slate-700 to-slate-900 shadow-xl"
                  initial={{
                    left: POINTS.draw.x,
                    top: POINTS.draw.y,
                    opacity: 0.6,
                    scale: 0.75,
                  }}
                  animate={{
                    left: POINTS[card.to].x,
                    top: POINTS[card.to].y,
                    opacity: [0.6, 1, 0],
                    scale: [0.75, 1, 0.96],
                  }}
                  transition={{
                    delay: card.delay,
                    duration: 0.75,
                    ease: [0.16, 1, 0.3, 1],
                    times: [0, 0.8, 1],
                  }}
                />
              ))}
            </AnimatePresence>

            <AnimatePresence>
              {flyCard && (
                <motion.div
                  key={flyCard.id}
                  className={`absolute w-14 h-20 sm:w-16 sm:h-24 rounded-lg border border-slate-500/60 shadow-xl ${COLOR_STYLES[flyCard.color]} flex items-center justify-center`}
                  initial={{
                    left: POINTS[flyCard.from].x,
                    top: POINTS[flyCard.from].y,
                    opacity: 0.9,
                    scale: 0.92,
                  }}
                  animate={{
                    left: POINTS[flyCard.to].x,
                    top: POINTS[flyCard.to].y,
                    opacity: 1,
                    scale: 1,
                  }}
                  transition={{
                    delay: flyCard.delay ?? 0,
                    duration: 0.5,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  onAnimationComplete={() => setFlyCard(null)}
                >
                  <span className="font-extrabold drop-shadow-md text-sm sm:text-base">
                    {flyCard.value === 'WildDraw4' ? '+4' :
                     flyCard.value === 'Wild' ? 'WILD' :
                     flyCard.value === 'Reverse' ? 'REV' :
                     flyCard.value === 'Skip' ? 'SKIP' :
                     flyCard.value === 'Draw2' ? '+2' :
                     flyCard.value}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Opponent Seats */}
          <div className="sm:hidden absolute inset-0 pointer-events-none z-10">
            {otherSeats.map(({ position, player }) => (
              <div
                key={'mobile-seat-overlay-' + player.id}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: POINTS[position].x, top: POINTS[position].y }}
              >
                <div className="min-w-[78px] rounded-xl border border-white/20 bg-slate-900/80 backdrop-blur-sm px-2.5 py-1.5 text-center shadow-lg transition-transform duration-300">
                  <div className={`text-[11px] font-bold leading-none truncate max-w-[86px] drop-shadow-md pb-0.5 ${gameState.currentPlayerIndex === player.playerIndex ? 'text-emerald-400' : 'text-white'}`}>{player.name}</div>
                  <div className="text-[10px] text-slate-300 font-medium bg-black/40 rounded-full inline-block px-2">{player.handCount} cards</div>
                </div>
              </div>
            ))}
          </div>

          {otherSeats.map(({ position, player }) => (
            <PlayerSeat
              key={player.id}
              name={player.name}
              handCount={player.handCount}
              isCurrent={gameState.currentPlayerIndex === player.playerIndex}
              position={position}
            />
          ))}

          <div className="absolute left-1/2 top-[41%] sm:top-[37%] lg:top-[33%] xl:top-[36%] -translate-x-1/2 -translate-y-1/2 flex items-start gap-10 sm:gap-16 lg:gap-[4.5rem] xl:gap-[5.5rem] z-0 scale-90 sm:scale-90 lg:scale-[0.82] xl:scale-[0.9]">
            <div className="flex flex-col items-center gap-3">
              <div className="text-[11px] uppercase tracking-widest font-black text-white/50 drop-shadow">Draw</div>
              <button
                onClick={handleDraw}
                disabled={!isMyTurn || isChallengePending || needsDirection || isGameFinished}
                className={`group relative w-14 h-20 sm:w-16 sm:h-24 lg:w-14 lg:h-20 xl:w-16 xl:h-24 rounded-xl border-2 border-white/20 bg-gradient-to-br from-slate-800 to-black shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-center justify-center transition-all duration-300 ${
                  isMyTurn ? 'hover:-translate-y-2 hover:border-white/50 hover:shadow-[0_15px_40px_rgba(255,255,255,0.15)] cursor-pointer' : 'opacity-80'
                }`}
              >
                {/* Simulated stack of cards under draw pile */}
                <div className="absolute inset-0 rounded-xl border-2 border-white/10 bg-slate-800 translate-x-1 -translate-y-1 -z-10 opacity-70"></div>
                <div className="absolute inset-0 rounded-xl border-2 border-white/10 bg-slate-800 translate-x-1.5 -translate-y-1.5 -z-20 opacity-40"></div>

                <div className="w-10 h-16 sm:w-12 sm:h-20 lg:w-10 lg:h-16 xl:w-12 xl:h-20 border border-white/10 rounded-lg flex items-center justify-center bg-black/40">
                  <span className={`text-xl sm:text-2xl lg:text-xl xl:text-2xl font-black italic drop-shadow-md transition-colors ${
                    isMyTurn ? 'text-emerald-400 group-hover:text-emerald-300' : 'text-slate-500'
                  }`}>UNO</span>
                </div>
              </button>
              {gameState.hasDrawnThisTurn && (
                <button
                  onClick={handleEndTurn}
                  disabled={isGameFinished}
                  className="mt-1 px-4 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-white/20 text-[10px] font-bold uppercase tracking-widest text-white transition-all shadow-lg z-20 hover:scale-105 whitespace-nowrap"
                >
                  End Turn
                </button>
              )}
            </div>

            <div className="flex flex-col items-center gap-3 pt-[2px]">
              <div className="text-[11px] uppercase tracking-widest font-black text-white/50 drop-shadow">Discard</div>
              <div className={`w-14 h-20 sm:w-16 sm:h-24 lg:w-14 lg:h-20 xl:w-16 xl:h-24 rounded-xl border-2 shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex items-center justify-center relative ${COLOR_STYLES[gameState.topCard.color]}`}>
                <div className="w-10 h-16 sm:w-12 sm:h-20 lg:w-10 lg:h-16 xl:w-12 xl:h-20 border border-white/20 rounded-lg flex items-center justify-center bg-black/10">
                  <span className="text-xl sm:text-2xl lg:text-xl xl:text-2xl font-extrabold pb-0.5 drop-shadow-md">
                    {gameState.topCard.value === 'WildDraw4' ? '+4' :
                     gameState.topCard.value === 'Wild' ? 'WILD' :
                     gameState.topCard.value === 'Reverse' ? 'REV' :
                     gameState.topCard.value === 'Skip' ? 'SKIP' :
                     gameState.topCard.value === 'Draw2' ? '+2' :
                     gameState.topCard.value}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute left-1/2 bottom-2 sm:bottom-3 lg:bottom-2 xl:bottom-4 -translate-x-1/2 w-[98%] sm:w-[92%] lg:w-[88%] xl:w-[90%] z-20">
            <div className="flex items-end justify-start sm:justify-center flex-nowrap overflow-x-auto pb-4 pt-12 px-4 scrollbar-hide">
              {gameState.myPlayer.hand.map((card, idx) => {
                const playable = isPlayableCard(card, gameState, isMyTurn);
                const isLastDrawn = gameState.lastDrawnCardId === card.id;
                // Add overlapping effect by negative margin, except for the first card
                const overlapClass = idx === 0 ? '' : '-ml-4 sm:-ml-6 lg:-ml-4 xl:-ml-6';

                const displayValue = card.value === 'WildDraw4' ? '+4' :
                                     card.value === 'Wild' ? 'WILD' :
                                     card.value === 'Reverse' ? 'REV' :
                                     card.value === 'Skip' ? 'SKIP' :
                                     card.value === 'Draw2' ? '+2' :
                                     card.value;

                return (
                  <motion.button
                    key={card.id}
                    onClick={() => handlePlayCard(card)}
                    whileHover={playable ? { y: -20, scale: 1.05 } : undefined}
                    className={`shrink-0 w-14 h-20 sm:w-16 sm:h-24 lg:w-14 lg:h-20 xl:w-16 xl:h-24 rounded-lg border-2 flex items-center justify-center transition-all duration-200 shadow-xl ${overlapClass} ${
                      playable
                        ? 'border-white/50 cursor-pointer z-10 hover:z-40 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                        : 'border-slate-900/60 grayscale-[0.5] brightness-75 cursor-not-allowed z-0 hover:z-20 lg:hover:-translate-y-1 xl:hover:-translate-y-2'
                    } ${isLastDrawn ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-slate-900' : ''} ${COLOR_STYLES[card.color]}`}
                  >
                    <div className="w-10 h-16 sm:w-12 sm:h-20 lg:w-10 lg:h-16 xl:w-12 xl:h-20 border border-white/20 rounded flex items-center justify-center bg-black/10 relative">
                      {/* Dark overlay for disabled cards so they don't look transparent */}
                      {!playable && <div className="absolute inset-0 bg-black/20 rounded z-0 pointer-events-none"></div>}
                      <span className={`font-extrabold pb-0.5 drop-shadow-md z-10 relative ${
                          displayValue.length > 2 ? 'text-sm sm:text-base lg:text-sm xl:text-base' : 'text-xl sm:text-2xl lg:text-xl xl:text-2xl'
                      }`}>{displayValue}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Mobile Match Log (shown below board on small screens) */}
      <div className="lg:hidden w-full max-w-[1400px] mx-auto mt-2 shrink-0 z-10 glass-panel rounded-xl p-2.5 flex items-center gap-3">
        <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <div className="text-[11px] text-slate-300 truncate flex-1 font-medium">
          {logItems.length > 0 ? (
            <>
              <span className="text-slate-500 font-mono mr-2">[{formatLogTime(logItems[logItems.length - 1].createdAt)}]</span>
              {logItems[logItems.length - 1].message}
            </>
          ) : (
            "Game starts soon..."
          )}
        </div>
      </div>

      <AnimatePresence>
        {pendingWildCardId && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="glass-panel border-white/20 rounded-3xl p-8 w-full max-w-sm shadow-[0_0_50px_rgba(0,0,0,0.8)]"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
            >
              <h3 className="text-2xl font-black mb-6 text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">Choose Color</h3>
              <div className="grid grid-cols-2 gap-4">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleWildColor(color)}
                    className={`rounded-2xl py-4 font-bold text-lg shadow-lg hover:scale-105 transition-transform ${COLOR_STYLES[color]}`}
                  >
                    {color}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPendingWildCardId(null)}
                className="mt-6 w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-sm font-semibold text-slate-300 hover:text-white transition-colors border border-white/10"
              >
                Cancel Selection
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {amChallenger && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="glass-panel border-white/20 rounded-3xl p-8 w-full max-w-sm text-center shadow-[0_0_50px_rgba(0,0,0,0.8)]"
              initial={{ y: 30, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0, scale: 0.9 }}
            >
              <div className="w-16 h-16 mx-auto bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-lg border-4 border-white/20">
                <span className="text-2xl font-black">+4</span>
              </div>
              <h3 className="text-2xl font-black mb-2 text-white">Wild Draw 4 Played!</h3>
              <p className="text-slate-300 text-sm mb-6">You can accept the 4 card penalty, or challenge if you think they illegally played it.</p>

              {challengePreviousColor && (
                <div className="mb-6 p-3 bg-black/30 rounded-xl border border-white/10 inline-flex items-center gap-3">
                  <span className="text-xs uppercase font-bold text-slate-400">Previous Color:</span>
                  <span className={`inline-flex items-center justify-center px-3 py-1 rounded-md text-white font-bold text-sm shadow-sm ${COLOR_STYLES[challengePreviousColor]}`}>
                    {challengePreviousColor}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleChallenge(false)}
                  className="bg-slate-700 hover:bg-slate-600 border border-slate-500 rounded-xl py-3.5 font-bold shadow-lg transition-colors"
                >
                  Accept (+4)
                </button>
                <button
                  onClick={() => handleChallenge(true)}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 border border-amber-300 rounded-xl py-3.5 font-bold text-slate-900 shadow-[0_0_20px_rgba(245,158,11,0.4)] transition-all hover:scale-105"
                >
                  Challenge!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
