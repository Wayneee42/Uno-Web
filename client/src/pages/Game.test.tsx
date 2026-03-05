import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Game from './Game';
import type { ClientGameState } from '@uno-web/shared';

const mockUseGame = vi.fn();

vi.mock('../contexts/GameContext', () => ({
  useGame: () => mockUseGame(),
}));

const baseState: ClientGameState = {
  roomId: 'ROOM1',
  phase: 'playing',
  myPlayer: {
    id: 'p1',
    name: 'Alice',
    hand: [{ id: 'c1', color: 'Red', value: '1' }],
    status: 'playing',
    hasCalledUno: false,
    socketId: 'sock-1',
  },
  otherPlayers: [
    {
      id: 'p2',
      name: 'Bob',
      playerIndex: 1,
      handCount: 7,
      status: 'playing',
      hasCalledUno: false,
    },
  ],
  currentPlayerIndex: 0,
  myPlayerIndex: 0,
  direction: 1,
  directionChosen: false,
  topCard: { id: 'c2', color: 'Blue', value: '2' },
  drawPileCount: 40,
  activeColor: null,
  pendingPenalty: 0,
  hostId: 'p1',
  hasDrawnThisTurn: false,
  lastPlayedCard: null,
  challengeState: null,
  lastDrawnCardId: null,
  winnerId: null,
  isDraw: false,
};

describe('Game', () => {
  beforeEach(() => {
    mockUseGame.mockReset();
  });

  it('shows loading when game state is missing', () => {
    mockUseGame.mockReturnValue({
      gameState: null,
      playCard: vi.fn(),
      drawCard: vi.fn(),
      endTurn: vi.fn(),
      chooseDirection: vi.fn(),
      challenge: vi.fn(),
      leaveRoom: vi.fn(),
      callUno: vi.fn(),
      returnToLobby: vi.fn(),
      systemMessage: null,
      isConnected: true,
    });

    render(<Game />);
    expect(screen.getByText('Loading game...')).toBeInTheDocument();
  });

  it('prompts for direction choice before first move', () => {
    mockUseGame.mockReturnValue({
      gameState: baseState,
      playCard: vi.fn(),
      drawCard: vi.fn(),
      endTurn: vi.fn(),
      chooseDirection: vi.fn(),
      challenge: vi.fn(),
      leaveRoom: vi.fn(),
      callUno: vi.fn(),
      returnToLobby: vi.fn(),
      systemMessage: null,
      isConnected: true,
    });

    render(<Game />);
    expect(screen.getByText('Choose play direction before the first move')).toBeInTheDocument();
  });
});
