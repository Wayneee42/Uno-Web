import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card, CardColor, ClientGameState } from '@uno-web/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../contexts/GameContext';

const COLOR_STYLES: Record<CardColor, string> = {
  Red: 'bg-red-500',
  Blue: 'bg-blue-500',
  Green: 'bg-emerald-500',
  Yellow: 'bg-amber-400 text-slate-900',
  Wild: 'bg-slate-700',
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
  draw: { x: '46%', y: '50%' },
  discard: { x: '54%', y: '50%' },
  bottom: { x: '50%', y: '82%' },
  left: { x: '14%', y: '50%' },
  top: { x: '50%', y: '16%' },
  right: { x: '86%', y: '50%' },
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

function PlayerSeat({
  name,
  handCount,
  isCurrent,
  hasCalledUno,
  position,
}: {
  name: string;
  handCount: number;
  isCurrent: boolean;
  hasCalledUno: boolean;
  position: 'left' | 'top' | 'right';
}) {
  const showLastCard = handCount === 1;
  const positionClass = {
    left: 'left-4 top-1/2 -translate-y-1/2',
    top: 'top-4 left-1/2 -translate-x-1/2',
    right: 'right-4 top-1/2 -translate-y-1/2',
  }[position];

  return (
    <div className={`absolute ${positionClass}`}>
      <div className={`rounded-xl px-4 py-3 bg-slate-800/80 border ${
        isCurrent ? 'border-emerald-400 shadow-emerald-400/20 shadow-lg' : 'border-slate-700'
      }`}>
        <div className="text-sm uppercase tracking-wide text-slate-400">Player</div>
        <div className="text-white font-semibold">{name}</div>
        <div className="text-slate-300 text-sm">{handCount} cards</div>
        {showLastCard && <div className="text-amber-300 text-xs mt-1">Last Card</div>}
        {hasCalledUno && <div className="text-amber-300 text-xs mt-1">UNO</div>}
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
    callUno,
    returnToLobby,
    systemMessage,
    isConnected,
  } = useGame();
  const [error, setError] = useState<string | null>(null);
  const [pendingWildCardId, setPendingWildCardId] = useState<string | null>(null);
  const [dealCards, setDealCards] = useState<DealCard[]>([]);
  const [showDealer, setShowDealer] = useState(false);
  const [flyCard, setFlyCard] = useState<FlyCard | null>(null);
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
  const canCallUno = isMyTurn && isLastCard && !gameState.myPlayer.hasCalledUno && !isGameFinished;
  const winnerName = gameState.winnerId === gameState.myPlayer.id
    ? gameState.myPlayer.name
    : gameState.otherPlayers.find(player => player.id === gameState.winnerId)?.name ?? null;
  const getSeatForIndex = (playerIndex: number): SeatPosition => {
    const relative = (playerIndex - gameState.myPlayerIndex + totalPlayers) % totalPlayers;
    if (relative === 0) return 'bottom';
    if (totalPlayers === 2) return 'top';
    if (totalPlayers === 3) {
      return relative === 1 ? 'left' : 'top';
    }
    if (relative === 1) return 'left';
    if (relative === 2) return 'top';
    return 'right';
  };
  const dealerSeat = getSeatForIndex(gameState.currentPlayerIndex);

  const otherSeats = useMemo(() => {
    const seats: Array<{ position: 'left' | 'top' | 'right'; player: ClientGameState['otherPlayers'][number] }> = [];
    for (const player of gameState.otherPlayers) {
      const relative = (player.playerIndex - gameState.myPlayerIndex + totalPlayers) % totalPlayers;
      if (totalPlayers === 3) {
        if (relative === 1) {
          seats.push({ position: 'left', player });
        }
        if (relative === 2) {
          seats.push({ position: 'top', player });
        }
      } else {
        if (relative === 1) {
          seats.push({ position: 'left', player });
        } else if (relative === 2) {
          seats.push({ position: 'top', player });
        } else if (relative === 3) {
          seats.push({ position: 'right', player });
        }
      }
    }
    return seats;
  }, [gameState, totalPlayers]);

  useEffect(() => {
    const prev = prevStateRef.current;
    let dealTimer: number | null = null;
    let dealerTimer: number | null = null;

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
            sequence.push({
              id: `deal-${index}-${round}`,
              to: getSeatForIndex(index),
              delay,
            });
            delay += 0.06;
          }
        }
      }

      if (sequence.length > 0) {
        setDealCards(sequence);
        const totalDurationMs = (delay + 0.4) * 1000;
        dealTimer = window.setTimeout(() => setDealCards([]), totalDurationMs);
      }

      setShowDealer(true);
      dealerTimer = window.setTimeout(() => setShowDealer(false), 1400);
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
      if (dealerTimer) window.clearTimeout(dealerTimer);
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-white">
      <div className="w-full max-w-6xl flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">UNO Room</h2>
          <div className="text-slate-300 text-sm">
            {isGameFinished ? 'Game finished' : isMyTurn ? 'Your turn' : 'Waiting for other player'}
            {gameState.pendingPenalty > 0 && ` | Pending +${gameState.pendingPenalty}`}
            {gameState.activeColor && ` | Active ${gameState.activeColor}`}
            {gameState.directionChosen && ` | Direction ${gameState.direction === 1 ? 'Clockwise' : 'Counterclockwise'}`}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isGameFinished && isHost && (
            <button
              onClick={async () => {
                const result = await returnToLobby();
                if (!result.success) {
                  setError(result.error || 'Failed to return to lobby');
                }
              }}
              className="px-4 py-2 rounded-full bg-slate-700 hover:bg-slate-600"
            >
              Return to Lobby
            </button>
          )}
          <button
            onClick={leaveRoom}
            className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-700"
          >
            Leave
          </button>
        </div>
      </div>

      {!isConnected && (
        <div className="w-full max-w-3xl mb-4 bg-slate-800/80 text-slate-200 border border-slate-700 rounded-lg px-4 py-3">
          Reconnecting to server...
        </div>
      )}

      {systemMessage && (
        <div className="w-full max-w-3xl mb-4 bg-blue-500/20 text-blue-200 border border-blue-500/40 rounded-lg px-4 py-3">
          {systemMessage}
        </div>
      )}

      {error && (
        <div className="w-full max-w-3xl mb-4 bg-red-500/20 text-red-200 border border-red-500/40 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {isLastCard && (
        <div className="w-full max-w-3xl mb-4 bg-amber-400/10 text-amber-200 border border-amber-300/40 rounded-lg px-4 py-3 text-center font-semibold">
          {gameState.myPlayer.hasCalledUno ? 'UNO called.' : 'You have one card left.'}
        </div>
      )}

      {canCallUno && (
        <div className="w-full max-w-3xl mb-4 flex justify-center">
          <button
            onClick={callUno}
            className="px-6 py-2 rounded-full bg-amber-400 text-slate-900 font-semibold hover:bg-amber-300"
          >
            Call UNO
          </button>
        </div>
      )}

      {isGameFinished && winnerName && (
        <div className="w-full max-w-3xl mb-4 bg-emerald-400/10 text-emerald-200 border border-emerald-300/40 rounded-lg px-4 py-3 text-center font-semibold">
          {winnerName} wins.
        </div>
      )}

      {needsDirection && (
        <div className="w-full max-w-3xl mb-4 bg-slate-800/80 text-slate-200 border border-slate-700 rounded-lg px-4 py-3 text-center">
          {isMyTurn ? (
            <div className="flex flex-col items-center gap-3">
              <div className="font-semibold">Choose play direction before the first move</div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleChooseDirection(1)}
                  className="px-4 py-2 rounded-full bg-emerald-500 text-slate-900 font-semibold"
                >
                  Clockwise
                </button>
                <button
                  onClick={() => handleChooseDirection(-1)}
                  className="px-4 py-2 rounded-full bg-sky-500 text-slate-900 font-semibold"
                >
                  Counterclockwise
                </button>
              </div>
            </div>
          ) : (
            <div className="font-semibold">Dealer is choosing the play direction.</div>
          )}
        </div>
      )}

      <div className="relative w-full max-w-6xl aspect-[16/9] bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-slate-800/80 rounded-3xl border border-slate-700/50 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <AnimatePresence>
            {dealCards.map((card) => (
              <motion.div
                key={card.id}
                className="absolute w-12 h-16 rounded-lg border border-slate-500/60 bg-slate-800 shadow-lg"
                initial={{
                  left: POINTS.draw.x,
                  top: POINTS.draw.y,
                  opacity: 0.8,
                  scale: 0.8,
                }}
                animate={{
                  left: POINTS[card.to].x,
                  top: POINTS[card.to].y,
                  opacity: 1,
                  scale: 1,
                }}
                transition={{
                  delay: card.delay,
                  duration: 0.4,
                  ease: [0.2, 0.8, 0.2, 1],
                }}
              />
            ))}
          </AnimatePresence>

          <AnimatePresence>
            {flyCard && (
              <motion.div
                key={flyCard.id}
                className={`absolute w-16 h-24 rounded-xl border border-slate-500/60 shadow-xl ${COLOR_STYLES[flyCard.color]}`}
                initial={{
                  left: POINTS[flyCard.from].x,
                  top: POINTS[flyCard.from].y,
                  opacity: 0.9,
                  scale: 0.9,
                }}
                animate={{
                  left: POINTS[flyCard.to].x,
                  top: POINTS[flyCard.to].y,
                  opacity: 1,
                  scale: 1,
                }}
                transition={{
                  delay: flyCard.delay ?? 0,
                  duration: 0.45,
                  ease: [0.2, 0.8, 0.2, 1],
                }}
                onAnimationComplete={() => setFlyCard(null)}
              >
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                  {flyCard.value}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showDealer && (
              <motion.div
                className="absolute px-3 py-1 rounded-full text-xs font-semibold bg-amber-400 text-slate-900 shadow-md"
                style={{ left: POINTS[dealerSeat].x, top: POINTS[dealerSeat].y }}
                initial={{ opacity: 0, scale: 0.6, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: -14 }}
                exit={{ opacity: 0, scale: 0.8, y: -6 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                Dealer
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {otherSeats.map(({ position, player }) => (
          <PlayerSeat
            key={player.id}
            name={player.name}
            handCount={player.handCount}
            hasCalledUno={player.hasCalledUno}
            isCurrent={gameState.currentPlayerIndex === player.playerIndex}
            position={position}
          />
        ))}

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <div className="text-xs uppercase tracking-wide text-slate-400">Draw Pile</div>
            <button
              onClick={handleDraw}
              disabled={!isMyTurn || isChallengePending || needsDirection || isGameFinished}
              className={`w-20 h-28 rounded-xl border-2 border-slate-500/60 bg-slate-900/70 flex items-center justify-center ${
                isMyTurn ? 'hover:border-emerald-400' : 'opacity-60'
              }`}
            >
              <span className="text-sm">{gameState.drawPileCount}</span>
            </button>
            {gameState.hasDrawnThisTurn && (
              <button
                onClick={handleEndTurn}
                disabled={isGameFinished}
                className="text-xs uppercase tracking-wide text-slate-300 hover:text-white disabled:opacity-60"
              >
                End Turn
              </button>
            )}
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="text-xs uppercase tracking-wide text-slate-400">Discard</div>
            <div className={`w-20 h-28 rounded-xl border-2 border-slate-500/60 flex items-center justify-center ${COLOR_STYLES[gameState.topCard.color]}`}>
              <span className="text-xl font-bold">{gameState.topCard.value}</span>
            </div>
          </div>
        </div>

        <div className="absolute left-1/2 bottom-6 -translate-x-1/2 w-[90%]">
          <div className="flex items-end justify-center gap-3 flex-wrap">
            {gameState.myPlayer.hand.map((card) => {
              const playable = isPlayableCard(card, gameState, isMyTurn);
              const isLastDrawn = gameState.lastDrawnCardId === card.id;
              return (
                <motion.button
                  key={card.id}
                  onClick={() => handlePlayCard(card)}
                  whileHover={playable ? { y: -6 } : undefined}
                  className={`w-20 h-28 rounded-xl border-2 flex items-center justify-center transition ${
                    playable ? 'border-emerald-400/80 shadow-lg shadow-emerald-400/20' : 'border-slate-700/60 opacity-70'
                  } ${isLastDrawn ? 'ring-2 ring-amber-300' : ''} ${COLOR_STYLES[card.color]}`}
                >
                  <span className="text-lg font-bold">{card.value}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {pendingWildCardId && (
          <motion.div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <h3 className="text-lg font-semibold mb-4">Choose a color</h3>
              <div className="grid grid-cols-2 gap-3">
                {COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleWildColor(color)}
                    className={`rounded-lg py-3 font-semibold ${COLOR_STYLES[color]}`}
                  >
                    {color}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPendingWildCardId(null)}
                className="mt-4 w-full text-sm text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {amChallenger && (
          <motion.div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm text-center"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
            >
              <h3 className="text-xl font-semibold mb-2">Wild Draw 4</h3>
              <p className="text-slate-300 mb-3">Choose to accept the penalty or challenge the play.</p>
              {challengePreviousColor && (
                <div className="mb-4 text-sm text-slate-300">
                  Previous color:{' '}
                  <span className={`inline-flex items-center px-2 py-1 rounded-md text-white ${COLOR_STYLES[challengePreviousColor]}`}>
                    {challengePreviousColor}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleChallenge(false)}
                  className="bg-slate-700 hover:bg-slate-600 rounded-lg py-3 font-semibold"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleChallenge(true)}
                  className="bg-amber-500 hover:bg-amber-400 rounded-lg py-3 font-semibold text-slate-900"
                >
                  Challenge
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

