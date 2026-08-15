import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PlayerProfileStore, createDefaultProfile } from '../player-profile-store';
import { createDefaultProfile as createJungianProfile } from '../../services/jungian-profiler';
import { unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

describe('PlayerProfileStore — jungian', () => {
  let jstore: PlayerProfileStore;
  let jdbPath: string;

  beforeEach(() => {
    jdbPath = join(tmpdir(), `tns-jungian-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    jstore = new PlayerProfileStore(jdbPath);
  });
  afterEach(() => { jstore.close(); rmSync(jdbPath, { force: true }); });

  it('upsert + get roundtrip preserves all fields', () => {
    const p = createJungianProfile();
    p.extraversion.preference = 0.3; p.extraversion.range = 0.2;
    p.thinking.preference = 0.75; p.confidence = 0.42; p.source = 'blended';
    jstore.upsertJungianProfile('player1', p);
    const got = jstore.getJungianProfile('player1')!;
    expect(got.extraversion.preference).toBeCloseTo(0.3, 5);
    expect(got.extraversion.range).toBeCloseTo(0.2, 5);
    expect(got.thinking.preference).toBeCloseTo(0.75, 5);
    expect(got.confidence).toBeCloseTo(0.42, 5);
    expect(got.source).toBe('blended');
  });

  it('get for unknown player → null', () => {
    expect(jstore.getJungianProfile('nobody')).toBeNull();
  });

  it('behavioral metrics roundtrip with fractional aggregates', () => {
    const agg = { dialogueInitiated: 4.5, dialogueCount: 9.2, dialogueTotalWords: 100.0,
      avoidedDialogues: 0.9, explorationActions: 3.3, riskTakingActions: 2.1,
      planningActions: 1.8, combatInitiated: 5.0, inputTotalChars: 250.5, expressiveActions: 1.1 };
    const signals = { extraversion: 0.62, intuition: 0.4, thinking: 0.7, judging: 0.55 };
    jstore.upsertBehavioralMetrics('player1', agg, 25, signals);
    const got = jstore.getBehavioralMetrics('player1')!;
    expect(got.aggregates.dialogueInitiated).toBeCloseTo(4.5, 5);
    expect(got.totalTurns).toBe(25);
    expect(got.signals.thinking).toBeCloseTo(0.7, 5);
  });
});

describe('PlayerProfileStore — npc_perception', () => {
  let pstore: PlayerProfileStore;
  let pdbPath: string;

  beforeEach(() => {
    pdbPath = join(tmpdir(), `tns-npcperception-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    pstore = new PlayerProfileStore(pdbPath);
  });
  afterEach(() => { pstore.close(); rmSync(pdbPath, { force: true }); });

  it('roundtrip perceivedPlayerType + interactionCount', () => {
    const perceived = createJungianProfile();
    perceived.thinking.preference = 0.9;
    pstore.upsertNpcPerception('npc-bran', 'player1', perceived, 4);
    const got = pstore.getNpcPerception('npc-bran', 'player1')!;
    expect(got.perceived.thinking.preference).toBeCloseTo(0.9, 5);
    expect(got.interactionCount).toBe(4);
  });

  it('unknown npc/player → null', () => {
    expect(pstore.getNpcPerception('x', 'y')).toBeNull();
  });
});

describe('PlayerProfileStore — closest_author', () => {
  let cstore: PlayerProfileStore;
  let cdbPath: string;

  beforeEach(() => {
    cdbPath = join(tmpdir(), `tns-closestauthor-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    cstore = new PlayerProfileStore(cdbPath);
  });
  afterEach(() => { cstore.close(); rmSync(cdbPath, { force: true }); });

  it('roundtrip closest_author', () => {
    cstore.upsertClosestAuthor('player1', 'Tolkien');
    expect(cstore.getClosestAuthor('player1')).toBe('Tolkien');
  });

  it('upsert null clears', () => {
    cstore.upsertClosestAuthor('player1', 'Tolkien');
    cstore.upsertClosestAuthor('player1', null);
    expect(cstore.getClosestAuthor('player1')).toBeNull();
  });

  it('unknown player → null', () => {
    expect(cstore.getClosestAuthor('missing')).toBeNull();
  });

  it('closest_author survives a later upsertProfile (ON CONFLICT DO UPDATE)', () => {
    cstore.upsertClosestAuthor('player1', 'Tolkien');
    const p = createDefaultProfile('player1');
    p.avg_sentence_len = 30;
    cstore.upsertProfile(p);
    expect(cstore.getClosestAuthor('player1')).toBe('Tolkien');
  });
});
