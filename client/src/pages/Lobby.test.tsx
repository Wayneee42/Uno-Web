import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Lobby from './Lobby';

const mockUseGame = vi.fn();

vi.mock('../contexts/GameContext', () => ({
  useGame: () => mockUseGame(),
}));

describe('Lobby', () => {
  beforeEach(() => {
    mockUseGame.mockReset();
  });

  it('shows connecting state when socket is disconnected', () => {
    mockUseGame.mockReturnValue({
      isConnected: false,
      room: null,
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      setReady: vi.fn(),
      startGame: vi.fn(),
      playerId: 'p1',
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
    });

    render(<Lobby />);
    await user.click(screen.getByRole('button', { name: 'Create Room' }));
    expect(screen.getByText('Please enter your name')).toBeInTheDocument();
  });
});
