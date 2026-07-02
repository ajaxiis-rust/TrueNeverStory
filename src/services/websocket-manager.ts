/**
 * WebSocket connection manager for real-time events.
 * Replaces the ConnectionManager class from api.py.
 */

import { getLogger } from "../utils/logger";

const log = getLogger("websocket-manager");

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

interface ManagedSocket {
  id?: string;
  send: (data: string) => void;
  close: () => void;
}

export class WebSocketManager {
  private _connections: Map<string, ManagedSocket> = new Map();
  private _nextId = 0;

  add(socket: ManagedSocket): string {
    const id = `ws-${this._nextId++}`;
    socket.id = id;
    this._connections.set(id, socket);
    return id;
  }

  remove(id: string): void {
    this._connections.delete(id);
  }

  has(id: string): boolean {
    return this._connections.has(id);
  }

  get size(): number {
    return this._connections.size;
  }

  async broadcast(message: WSMessage): Promise<void> {
    const data = JSON.stringify(message);
    const dead: string[] = [];
    for (const [id, socket] of this._connections) {
      try {
        socket.send(data);
      } catch {
        dead.push(id);
      }
    }
    for (const id of dead) {
      this._connections.delete(id);
    }
  }

  async sendTo(id: string, message: WSMessage): Promise<boolean> {
    const socket = this._connections.get(id);
    if (!socket) return false;
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      this._connections.delete(id);
      return false;
    }
  }

  closeAll(): void {
    for (const socket of this._connections.values()) {
      try {
        socket.close();
      } catch (err) {
        log.debug({ err }, "Error closing WebSocket");
      }
    }
    this._connections.clear();
  }
}
