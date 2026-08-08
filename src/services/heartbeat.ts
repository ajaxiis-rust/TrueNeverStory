import { EventBus, EventTopic } from '@/lib/event-bus';
import { WebSocketManager } from '@/services/websocket-manager';
import { HeartbeatStage, HeartbeatEvent, HEARTBEAT_MESSAGES, HEARTBEAT_PROGRESS } from '@/models/heartbeat';
import { getLogger } from '@/utils/logger';

const logger = getLogger('HeartbeatService');

/**
 * Heartbeat Service
 *
 * Broadcasts real-time progress updates to connected clients via WebSocket.
 * Subscribes to heartbeat events and forwards them to all connected clients.
 */
export class HeartbeatService {
  private activeWorld?: string;

  constructor(
    private eventBus: EventBus,
    private wsManager: WebSocketManager,
  ) {
    this.subscribeToEvents();
  }

  setActiveWorld(worldId: string | undefined): void {
    this.activeWorld = worldId;
  }

  /**
   * Subscribe to heartbeat events on the EventBus.
   */
  private subscribeToEvents(): void {
    // Subscribe to all heartbeat event topics
    const heartbeatTopics = Object.values(HeartbeatStage).map(
      stage => `heartbeat.${stage}` as EventTopic
    );

    this.eventBus.subscribeMany(
      heartbeatTopics,
      async (event) => {
        this.broadcastHeartbeat(event);
      },
      100 // High priority for UI updates
    );

    logger.debug('Subscribed to heartbeat events');
  }

  /**
   * Broadcast a heartbeat event to all connected WebSocket clients.
   */
  private broadcastHeartbeat(event: { topic: EventTopic; payload: Record<string, unknown> }): void {
    const stage = event.topic.replace('heartbeat.', '') as HeartbeatStage;

    const heartbeat: HeartbeatEvent = {
      stage,
      message: HEARTBEAT_MESSAGES[stage] ?? 'Processing...',
      progress: HEARTBEAT_PROGRESS[stage] ?? 0,
      metadata: event.payload,
    };

    // Broadcast to connected clients, optionally filtered by world
    const filter = this.activeWorld
      ? (sock: { worldId?: string }) => sock.worldId === this.activeWorld
      : undefined;
    this.wsManager.broadcast({
      type: 'heartbeat',
      ...heartbeat,
    }, filter);

    logger.debug(`Heartbeat: ${stage} (${(heartbeat.progress * 100).toFixed(0)}%)`);
  }

  /**
   * Send a custom heartbeat event.
   */
  sendHeartbeat(
    stage: HeartbeatStage,
    message?: string,
    metadata?: Record<string, unknown>,
  ): void {
    const heartbeat: HeartbeatEvent = {
      stage,
      message: message ?? HEARTBEAT_MESSAGES[stage] ?? 'Processing...',
      progress: HEARTBEAT_PROGRESS[stage] ?? 0,
      metadata,
    };

    const filter = this.activeWorld
      ? (sock: { worldId?: string }) => sock.worldId === this.activeWorld
      : undefined;
    this.wsManager.broadcast({
      type: 'heartbeat',
      ...heartbeat,
    }, filter);
  }

  /**
   * Send completion heartbeat.
   */
  sendComplete(location?: string, storyTime?: string, activeCharacter?: string): void {
    const filter = this.activeWorld
      ? (sock: { worldId?: string }) => sock.worldId === this.activeWorld
      : undefined;
    this.wsManager.broadcast({
      type: 'heartbeat',
      stage: HeartbeatStage.COMPLETE,
      message: HEARTBEAT_MESSAGES[HeartbeatStage.COMPLETE],
      progress: 1.0,
      metadata: { location, storyTime, activeCharacter },
    }, filter);
  }
}
