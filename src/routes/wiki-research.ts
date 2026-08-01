import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { WorldCreationProgressManager } from '../services/world-creation-progress';
import { getLogger } from '../utils/logger';

const log = getLogger('wiki-research-routes');

const progressManagers = new Map<string, WorldCreationProgressManager>();

export function getOrCreateProgressManager(worldId: string): WorldCreationProgressManager {
  if (!progressManagers.has(worldId)) {
    progressManagers.set(worldId, new WorldCreationProgressManager(worldId));
  }
  return progressManagers.get(worldId)!;
}

export const wikiResearchRoutes = new Hono();

wikiResearchRoutes.get('/api/wiki/research/:worldId/progress', (c) => {
  const worldId = c.req.param('worldId');
  const manager = getOrCreateProgressManager(worldId);

  return streamSSE(c, async (stream) => {
    const currentProgress = manager.getProgress();
    await stream.writeSSE({
      data: JSON.stringify(currentProgress),
      event: 'progress',
    });

    const unsubscribe = manager.subscribe(async (progress) => {
      try {
        await stream.writeSSE({
          data: JSON.stringify(progress),
          event: progress.stage === 'complete' ? 'complete' : 'progress',
        });
      } catch {
        unsubscribe();
      }
    });

    while (true) {
      await stream.writeSSE({ data: '', event: 'heartbeat' });
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  });
});

wikiResearchRoutes.post('/api/wiki/research/:worldId', async (c) => {
  const worldId = c.req.param('worldId');
  const manager = getOrCreateProgressManager(worldId);

  return c.json({
    worldId,
    status: manager.getProgress().stage,
    message: 'Research initiated',
  });
});

wikiResearchRoutes.post('/api/wiki/research/:worldId/pause', (c) => {
  const worldId = c.req.param('worldId');
  const manager = getOrCreateProgressManager(worldId);
  manager.pause();

  return c.json({ worldId, paused: true });
});

wikiResearchRoutes.post('/api/wiki/research/:worldId/resume', (c) => {
  const worldId = c.req.param('worldId');
  const manager = getOrCreateProgressManager(worldId);
  manager.resume();

  return c.json({ worldId, paused: false });
});

wikiResearchRoutes.get('/api/wiki/research/:worldId/status', (c) => {
  const worldId = c.req.param('worldId');
  const manager = getOrCreateProgressManager(worldId);

  return c.json(manager.getProgress());
});
