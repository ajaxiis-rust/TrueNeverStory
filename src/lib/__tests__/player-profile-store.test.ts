import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PlayerProfileStore, createDefaultProfile } from '../player-profile-store';
import { unlinkSync } from 'node:fs';

const TEST_DB = '/tmp/test-player-profiles.db';

describe('PlayerProfileStore', () => {
  let store: PlayerProfileStore;
  beforeEach(() => { try { unlinkSync(TEST_DB); } catch {} store = new PlayerProfileStore(TEST_DB); });
  afterEach(() => { store.close(); try { unlinkSync(TEST_DB); } catch {} });

  it('returns null for non-existent player', () => { expect(store.getProfile('nonexistent')).toBeNull(); });

  it('creates and retrieves a profile', () => {
    const p = createDefaultProfile('player1');
    p.avg_sentence_len = 25.5;
    store.upsertProfile(p);
    const r = store.getProfile('player1');
    expect(r).not.toBeNull();
    expect(r!.player_id).toBe('player1');
    expect(r!.avg_sentence_len).toBe(25.5);
  });

  it('updates on upsert', () => {
    const p = createDefaultProfile('p1');
    p.avg_sentence_len = 15; store.upsertProfile(p);
    p.avg_sentence_len = 30; store.upsertProfile(p);
    expect(store.getProfile('p1')!.avg_sentence_len).toBe(30);
  });

  it('createDefaultProfile has correct defaults', () => {
    const p = createDefaultProfile('test');
    expect(p.player_id).toBe('test');
    expect(p.avg_sentence_len).toBe(15.0);
    expect(p.confidence).toBe(0.0);
    expect(p.message_count_used).toBe(0);
  });
});
