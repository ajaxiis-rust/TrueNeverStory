import { describe, test, expect, beforeEach } from 'bun:test';
import { StartResolver } from './start-resolver';
import type { UnifiedEntityStore } from '@/store/entity-store';
import type { LLMQueue } from '@/lib/llm-queue';

const makeStore = (overrides: {
  characters?: Array<{ name: string; uid: string }>;
  locations?: Array<{ name: string; uid: string }>;
} = {}) => {
  const characters = overrides.characters ?? [];
  const locations = overrides.locations ?? [];
  return {
    listByType: (type: string) => {
      if (type === 'Character') return characters as never;
      if (type === 'Location') return locations as never;
      return [];
    },
    getByNameAndType: (name: string, type: string) => {
      const list = type === 'Character' ? characters : locations;
      return list.find(e => e.name === name) as never ?? undefined;
    },
  } as unknown as UnifiedEntityStore;
};

const makeLLM = (response: Record<string, unknown>) => ({
  generateJson: async () => response,
  generateText: async () => JSON.stringify(response),
}) as unknown as LLMQueue;

describe('StartResolver.resolve', () => {
  let resolver: StartResolver;

  beforeEach(() => {
    resolver = new StartResolver(makeStore(), makeLLM({}));
  });

  test('parses JSON input', async () => {
    const result = await resolver.resolve(
      '{"character":"Alek","location":"Tavern","scenario":"morning"}',
      'World',
      new Date(),
    );
    expect(result.character).toBe('Alek');
    expect(result.location).toBe('Tavern');
    expect(result.scenario).toBe('morning');
  });

  test('parses key=value input', async () => {
    const result = await resolver.resolve(
      'character=Alek location=Forge scenario=crafting',
      'World',
      new Date(),
    );
    expect(result.character).toBe('Alek');
    expect(result.location).toBe('Forge');
    expect(result.scenario).toBe('crafting');
  });

  test('falls back to LLM for free-form text', async () => {
    const llm = makeLLM({
      character: 'Bran',
      location: 'Market',
      scenario: 'trading',
    });
    const r = new StartResolver(makeStore(), llm);
    const result = await r.resolve('Bran goes to the market to trade', 'World', new Date());
    expect(result.character).toBe('Bran');
    expect(result.location).toBe('Market');
  });

  test('LLM failure → fallback with scenario=userSpec', async () => {
    const llm = {
      generateJson: async () => { throw new Error('LLM failed'); },
    } as unknown as LLMQueue;
    const r = new StartResolver(makeStore(), llm);
    const result = await r.resolve('some free text', 'World', new Date());
    expect(result.character).toBeNull();
    expect(result.location).toBeNull();
    expect(result.scenario).toBe('some free text');
    expect(result.customContext).toBe('some free text');
  });
});

describe('StartResolver.applyToSession', () => {
  test('applies known character to session', () => {
    const store = makeStore({ characters: [{ name: 'Alek', uid: 'c1' }] });
    const resolver = new StartResolver(store, makeLLM({}));
    const session = { activeCharacter: null as string | null, currentLocation: 'Default', currentTime: new Date() };
    resolver.applyToSession(session, { character: 'Alek', location: null, storyTime: null, scenario: null, customContext: null });
    expect(session.activeCharacter).toBe('Alek');
  });

  test('unknown character + fuzzy match → uses closest', () => {
    const store = makeStore({ characters: [{ name: 'Aleksandr', uid: 'c1' }] });
    const resolver = new StartResolver(store, makeLLM({}));
    const session = { activeCharacter: null as string | null, currentLocation: 'Default', currentTime: new Date() };
    resolver.applyToSession(session, { character: 'Aleksand', location: null, storyTime: null, scenario: null, customContext: null });
    expect(session.activeCharacter).toBe('Aleksandr');
  });

  test('unknown character + no fuzzy match → throws', () => {
    const store = makeStore({ characters: [{ name: 'Bran', uid: 'c1' }] });
    const resolver = new StartResolver(store, makeLLM({}));
    const session = { activeCharacter: null as string | null, currentLocation: 'Default', currentTime: new Date() };
    expect(() => {
      resolver.applyToSession(session, { character: 'Ghost', location: null, storyTime: null, scenario: null, customContext: null });
    }).toThrow('Unknown character: Ghost');
  });

  test('applies known location to session', () => {
    const store = makeStore({ locations: [{ name: 'Forge', uid: 'l1' }] });
    const resolver = new StartResolver(store, makeLLM({}));
    const session = { activeCharacter: null as string | null, currentLocation: 'Default', currentTime: new Date() };
    resolver.applyToSession(session, { character: null, location: 'Forge', storyTime: null, scenario: null, customContext: null });
    expect(session.currentLocation).toBe('Forge');
  });

  test('unknown location → fuzzy match', () => {
    const store = makeStore({ locations: [{ name: 'Blacksmith Forge', uid: 'l1' }] });
    const resolver = new StartResolver(store, makeLLM({}));
    const session = { activeCharacter: null as string | null, currentLocation: 'Default', currentTime: new Date() };
    resolver.applyToSession(session, { character: null, location: 'Forge', storyTime: null, scenario: null, customContext: null });
    expect(session.currentLocation).toBe('Blacksmith Forge');
  });

  test('unknown location + no fuzzy → uses default location', () => {
    const store = makeStore({ locations: [{ name: 'Town Square', uid: 'l1' }] });
    const resolver = new StartResolver(store, makeLLM({}));
    const session = { activeCharacter: null as string | null, currentLocation: 'Default', currentTime: new Date() };
    resolver.applyToSession(session, { character: null, location: 'Nowhere', storyTime: null, scenario: null, customContext: null });
    expect(session.currentLocation).toBe('Town Square');
  });

  test('unknown location + no locations → location stays null', () => {
    const store = makeStore();
    const resolver = new StartResolver(store, makeLLM({}));
    const session = { activeCharacter: null as string | null, currentLocation: 'Default', currentTime: new Date() };
    resolver.applyToSession(session, { character: null, location: 'Nowhere', storyTime: null, scenario: null, customContext: null });
    expect(session.currentLocation).toBe('Default');
  });

  test('storyTime updates session.currentTime', () => {
    const store = makeStore();
    const resolver = new StartResolver(store, makeLLM({}));
    const time = new Date('2026-06-15T10:00:00Z');
    const session = { activeCharacter: null as string | null, currentLocation: 'Default', currentTime: new Date() };
    resolver.applyToSession(session, { character: null, location: null, storyTime: time, scenario: null, customContext: null });
    expect(session.currentTime).toBe(time);
  });

  test('null character/location/time → session unchanged', () => {
    const store = makeStore();
    const resolver = new StartResolver(store, makeLLM({}));
    const original = new Date('2020-01-01');
    const session = { activeCharacter: 'Old' as string | null, currentLocation: 'OldLoc', currentTime: original };
    resolver.applyToSession(session, { character: null, location: null, storyTime: null, scenario: null, customContext: null });
    expect(session.activeCharacter).toBe('Old');
    expect(session.currentLocation).toBe('OldLoc');
    expect(session.currentTime).toBe(original);
  });
});
