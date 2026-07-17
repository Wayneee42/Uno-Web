import { describe, expect, it } from 'vitest';
import { RoomManager } from './RoomManager.js';

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

  it('allows host to start when 2 connected players are ready', () => {
    const manager = new RoomManager();
    const created = manager.createRoom('Alice', 'socket-1');
    const join2 = manager.joinRoom(created.room.roomId, 'Bob', 'socket-2');

    expect(join2.success).toBe(true);

    manager.setReady(created.playerId, true);
    manager.setReady(join2.playerId!, true);

    expect(manager.canStartGame(created.playerId)).toBe(true);
  });

  it('limits a profile to one seat and ignores disconnects from a replaced socket', () => {
    const manager = new RoomManager();
    const created = manager.createRoom('Alice', 'socket-old', 'profile-a');
    expect(created.success).toBe(true);

    const duplicate = manager.createRoom('Alice again', 'socket-other', 'profile-a');
    expect(duplicate).toMatchObject({ success: false });

    const restored = manager.resumeSession(created.sessionId!, 'socket-new', 'profile-a');
    expect(restored).toMatchObject({
      success: true,
      playerId: created.playerId,
      replacedSocketId: 'socket-old',
    });
    expect(manager.markDisconnected('socket-old')).toBeNull();
    expect(manager.getPlayerById(created.playerId!)?.connected).toBe(true);

    const joined = manager.joinRoom(created.room.roomId, 'Bob', 'socket-third', 'profile-b');
    const crossSeat = manager.resumeSession(created.sessionId!, 'socket-third', 'profile-a');
    expect(crossSeat).toMatchObject({ success: false });
    expect(manager.getPlayerIdBySocketId('socket-third')).toBe(joined.playerId);

    const wrongProfile = manager.resumeSession(created.sessionId!, 'socket-fourth', 'profile-b');
    expect(wrongProfile).toMatchObject({ success: false });
  });
});

