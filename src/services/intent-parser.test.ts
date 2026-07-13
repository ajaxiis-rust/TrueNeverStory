import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { IntentParser } from './intent-parser';
import { ParserContext } from '@/models/intent';

describe('IntentParser', () => {
  let parser: IntentParser;
  let mockLLMQueue: { generateText: ReturnType<typeof mock> };

  beforeEach(() => {
    mockLLMQueue = { generateText: mock(() => Promise.resolve('{"type":"action","verb":"test"}')) };
    parser = new IntentParser(mockLLMQueue as any);
  });

  const defaultContext: ParserContext = {
    currentLocation: 'tavern',
    activeCharacter: 'Hero',
    nearbyNpcs: ['Merchant', 'Guard'],
    activeQuests: [],
    gameTime: new Date(),
  };

  describe('Fast regex parsing', () => {
    it('parses commands', async () => {
      const intent = await parser.parse('/look', defaultContext);
      expect(intent.type).toBe('command');
      expect(intent.type === 'command' && intent.command).toBe('look');
    });

    it('parses movement', async () => {
      const intent = await parser.parse('go to the tavern', defaultContext);
      expect(intent.type).toBe('movement');
      if (intent.type === 'movement') {
        expect(intent.destination).toContain('tavern');
      }
    });

    it('parses dialogue', async () => {
      const intent = await parser.parse('say to Merchant hello there', defaultContext);
      expect(intent.type).toBe('dialogue');
      if (intent.type === 'dialogue') {
        expect(intent.target).toBe('Merchant');
        expect(intent.content).toBe('hello there');
      }
    });

    it('parses observation', async () => {
      const intent = await parser.parse('examine the door', defaultContext);
      expect(intent.type).toBe('observation');
      if (intent.type === 'observation') {
        expect(intent.target).toBe('the door');
        expect(intent.detail_level).toBe('examine');
      }
    });

    it('returns observation for empty input', async () => {
      const intent = await parser.parse('', defaultContext);
      expect(intent.type).toBe('observation');
    });
  });

  describe('LLM fallback', () => {
    it('calls LLM for ambiguous input', async () => {
      mockLLMQueue.generateText.mockResolvedValueOnce('{"type":"action","verb":"inspect","target":"mysterious object"}');
      const intent = await parser.parse('I want to inspect that mysterious object carefully', defaultContext);
      expect(mockLLMQueue.generateText).toHaveBeenCalled();
      expect(intent.type).toBe('action');
    });

    it('falls back to action on invalid LLM response', async () => {
      mockLLMQueue.generateText.mockResolvedValueOnce('invalid json');
      const intent = await parser.parse('do something complex', defaultContext);
      expect(intent.type).toBe('action');
    });
  });
});
