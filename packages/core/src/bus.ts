import type { EventBus } from "@hub/sdk";

type Handler = (payload: unknown) => void;
interface Socket {
  send(data: string): void;
}

/**
 * In-process pub/sub that also fans out to connected WebSocket clients.
 * Topics are namespaced per module (`<module>:<topic>`) by the facade, so
 * modules can't accidentally collide on topic names.
 */
export class GlobalEventBus {
  private subs = new Map<string, Set<Handler>>();
  private sockets = new Set<Socket>();

  addSocket(s: Socket): () => void {
    this.sockets.add(s);
    return () => this.sockets.delete(s);
  }

  /** Publish to both WebSocket clients and server-side subscribers. */
  publishRaw(topic: string, payload: unknown): void {
    const msg = JSON.stringify({ topic, payload });
    for (const s of this.sockets) {
      try {
        s.send(msg);
      } catch {
        /* drop dead sockets silently */
      }
    }
    this.dispatch(topic, payload);
  }

  /** Deliver to server-side subscribers only (used for inbound WS messages). */
  dispatch(topic: string, payload: unknown): void {
    const set = this.subs.get(topic);
    if (set) for (const h of set) h(payload);
  }

  private subscribeRaw(topic: string, handler: Handler): () => void {
    let set = this.subs.get(topic);
    if (!set) {
      set = new Set();
      this.subs.set(topic, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  facadeFor(module: string): EventBus {
    const ns = (t: string) => `${module}:${t}`;
    return {
      publish: (t, p) => this.publishRaw(ns(t), p),
      subscribe: (t, h) => this.subscribeRaw(ns(t), h as Handler),
    };
  }
}
