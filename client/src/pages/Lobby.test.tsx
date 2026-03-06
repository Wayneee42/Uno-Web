import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Lobby from './Lobby';

const mockUseGame = vi.fn();

vi.mock('../contexts/GameContext', () => ({
  useGame: () => mockUseGame(),
}));

describe('Lobby', () => {
  beforeEach(() => {
    mockUseGame.mockReset();
  });

  it('shows connecting state when socket is disconnected and no room is active', () => {
    mockUseGame.mockReturnValue({
      isConnected: false,
      room: null,
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      setReady: vi.fn(),
      startGame: vi.fn(),
      playerId: 'p1',
      systemMessage: null,
      globalError: null,
      reconnectWaitList: [],
    });

    render(<Lobby />);
    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
  });

  it('shows validation error when creating room without a name', async () => {
    const user = userEvent.setup();
    mockUseGame.mockReturnValue({
      isConnected: true,
      room: null,
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      setReady: vi.fn(),
      startGame: vi.fn(),
      playerId: 'p1',
      systemMessage: null,
      globalError: null,
      reconnectWaitList: [],
    });

    render(<Lobby />);
    await user.click(screen.getByRole('button', { name: 'Create Room' }));
    expect(screen.getByText('Please enter your name.')).toBeInTheDocument();
  });

  it('keeps the room visible while reconnecting', () => {
    mockUseGame.mockReturnValue({
      isConnected: false,
      room: {
        roomId: 'ROOM1',
        players: [{ id: 'p1', name: 'Alice', isReady: true, isHost: true, connected: false }],
        minPlayers: 3,
        maxPlayers: 4,
        canStart: false,
      },
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      setReady: vi.fn(),
      startGame: vi.fn(),
      playerId: 'p1',
      systemMessage: null,
      globalError: null,
      reconnectWaitList: [{ playerId: 'p1', name: 'Alice', remainingSeconds: 18 }],
    });

    render(<Lobby />);
    expect(screen.getByText('Room: ROOM1')).toBeInTheDocument();
    expect(screen.getByText('Reconnecting to server...')).toBeInTheDocument();
    expect(screen.getByText('Waiting for reconnect: Alice (18s)')).toBeInTheDocument();
  });

  it('shows global socket errors in the lobby shell', () => {
    mockUseGame.mockReturnValue({
      isConnected: true,
      room: null,
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      setReady: vi.fn(),
      startGame: vi.fn(),
      playerId: 'p1',
      systemMessage: null,
      globalError: { code: 'INTERNAL_ERROR', message: 'Server encountered an unexpected error.' },
      reconnectWaitList: [],
    });

    render(<Lobby />);
    expect(screen.getByText('Server encountered an unexpected error.')).toBeInTheDocument();
  });
});
