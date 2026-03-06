import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientGameState } from '@uno-web/shared';
import Game from './Game';

const mockUseGame = vi.fn();

vi.mock('../contexts/GameContext', () => ({
  useGame: () => mockUseGame(),
}));

const baseState: ClientGameState = {
  roomId: 'ROOM1',
  phase: 'playing',
  myPlayer: {
    id: 'p1',
    sessionId: 'session-1',
    name: 'Alice',
    hand: [{ id: 'c1', color: 'Red', value: '1' }],
    status: 'playing',
    hasCalledUno: false,
    socketId: 'sock-1',
    connected: true,
  },
  otherPlayers: [
    {
      id: 'p2',
      name: 'Bob',
      playerIndex: 1,
      handCount: 7,
      status: 'playing',
      hasCalledUno: false,
      connected: true,
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
  eventLog: [
    {
      id: 'log-1',
      createdAt: Date.now(),
      message: 'Game started with 3 players.',
    },
  ],
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
      playAgain: vi.fn(),
      returnToLobby: vi.fn(),
      systemMessage: null,
      globalError: null,
      reconnectWaitList: [],
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
      playAgain: vi.fn(),
      returnToLobby: vi.fn(),
      systemMessage: null,
      globalError: null,
      reconnectWaitList: [],
      isConnected: true,
    });

    render(<Game />);
    expect(screen.getByText('Choose play direction')).toBeInTheDocument();
  });

  it('shows global socket errors as banners', () => {
    mockUseGame.mockReturnValue({
      gameState: baseState,
      playCard: vi.fn(),
      drawCard: vi.fn(),
      endTurn: vi.fn(),
      chooseDirection: vi.fn(),
      challenge: vi.fn(),
      leaveRoom: vi.fn(),
      callUno: vi.fn(),
      playAgain: vi.fn(),
      returnToLobby: vi.fn(),
      systemMessage: null,
      globalError: { code: 'INTERNAL_ERROR', message: 'Failed to synchronize game state.' },
      reconnectWaitList: [],
      isConnected: true,
    });

    render(<Game />);
    expect(screen.getByText('Failed to synchronize game state.')).toBeInTheDocument();
  });

  it('renders match log panel', () => {
    mockUseGame.mockReturnValue({
      gameState: baseState,
      playCard: vi.fn(),
      drawCard: vi.fn(),
      endTurn: vi.fn(),
      chooseDirection: vi.fn(),
      challenge: vi.fn(),
      leaveRoom: vi.fn(),
      callUno: vi.fn(),
      playAgain: vi.fn(),
      returnToLobby: vi.fn(),
      systemMessage: null,
      globalError: null,
      reconnectWaitList: [],
      isConnected: true,
    });

    render(<Game />);
    expect(screen.getByText('Match Log')).toBeInTheDocument();
    expect(screen.getAllByText('Game started with 3 players.').length).toBeGreaterThan(0);
  });
});

