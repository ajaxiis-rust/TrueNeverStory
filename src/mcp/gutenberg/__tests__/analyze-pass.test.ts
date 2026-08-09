import { describe, it, expect } from 'bun:test';
import { analyzeChunk, clusterBySceneType } from '../analyze-pass';

describe('analyzeChunk', () => {
  it('identifies battle_scene', () => {
    const r = analyzeChunk('The sword struck the shield. Blood ran down the warrior arm as the battle raged.');
    expect(r.scene_type).toBe('battle_scene');
    expect(r.pre_score).toBeGreaterThan(0);
  });
  it('identifies love_scene', () => {
    const r = analyzeChunk('He kissed her tenderly. The embrace was gentle, their hearts beating as one.');
    expect(r.scene_type).toBe('love_scene');
  });
  it('identifies dialogue_scene from quoted speech', () => {
    const r = analyzeChunk('"Hello," she said. "How are you?" he asked. "I am well," she replied.');
    expect(r.scene_type).toBe('dialogue_scene');
  });
  it('identifies introspection from first-person markers', () => {
    const r = analyzeChunk('I thought about what I had done. I felt the weight of my conscience.');
    expect(r.scene_type).toBe('introspection');
  });
  it('returns sensory tags', () => {
    const r = analyzeChunk('I saw the bright light. I heard the thunder. I felt the cold wind.');
    expect(r.sensory_tags).toContain('sight');
    expect(r.sensory_tags).toContain('sound');
    expect(r.sensory_tags).toContain('touch');
  });
  it('calculates tempo from variance', () => {
    expect(analyzeChunk('He went. She came. They sat.').tempo).toBe('slow');
  });
  it('detects flashback', () => {
    expect(analyzeChunk('He remembered the days of his youth. Years ago, things had been different.').temporal_markers).toContain('flashback');
  });
  it('pre_score between 0 and 1', () => {
    const r = analyzeChunk('Some random text without much interesting content.');
    expect(r.pre_score).toBeGreaterThanOrEqual(0);
    expect(r.pre_score).toBeLessThanOrEqual(1);
  });
});

describe('clusterBySceneType', () => {
  it('groups by scene_type', () => {
    const chunks = [{scene_type:'battle_scene',id:'1'},{scene_type:'love_scene',id:'2'},{scene_type:'battle_scene',id:'3'}] as any[];
    const c = clusterBySceneType(chunks);
    expect(c).toHaveLength(2);
  });
  it('returns empty for empty', () => {
    expect(clusterBySceneType([])).toEqual([]);
  });
});
