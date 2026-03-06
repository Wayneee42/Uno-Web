import { describe, expect, it } from 'vitest';
import { RoomManager } from './RoomManager';

describe('RoomManager', () => {
  it('creates rooms, tracks stable identities, and restores disconnected players', () => {
    const manager = new RoomManager();
    const created = manager.createRoom('Alice', 'socket-1');
    expect(created.room.roomId).toHaveLength(6);
    expect(created.playerId).not.toBe('socket-1');
    expect(created.sessionId).toContain('session_');

    const join2 = manager.joinRoom(created.room.roomId, 'Bob', 'socket-2');
    const join3 = manager.joinRoom(created.room.roomId, 'Cara', 'socket-3');

    expect(join2.success).toBe(true);
    expect(join3.success).toBe(true);

    manager.setReady(created.playerId, true);
    manager.setReady(join2.playerId!, true);
    manager.setReady(join3.playerId!, true);

    expect(manager.canStartGame(created.playerId)).toBe(true);

    const disconnected = manager.markDisconnected('socket-2');
    expect(disconnected?.playerId).toBe(join2.playerId);
    expect(manager.canStartGame(created.playerId)).toBe(false);

    const restored = manager.resumeSession(join2.sessionId!, 'socket-2b');
    expect(restored.success).toBe(true);
    expect(restored.playerId).toBe(join2.playerId);
    expect(manager.getPlayerIdBySocketId('socket-2b')).toBe(join2.playerId);
    expect(manager.canStartGame(created.playerId)).toBe(true);
  });
});
