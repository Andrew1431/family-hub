import { useEffect, useRef } from "react";

type Handler = (payload: unknown) => void;

const handlers = new Map<string, Set<Handler>>();
let socket: WebSocket | null = null;

function ensure(): WebSocket {
  if (socket && socket.readyState <= WebSocket.OPEN) return socket;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${proto}://${location.host}/ws`);
  socket.onmessage = (e) => {
    try {
      const { topic, payload } = JSON.parse(e.data);
      handlers.get(topic)?.forEach((h) => h(payload));
    } catch {
      /* ignore malformed frames */
    }
  };
  socket.onclose = () => {
    socket = null;
    setTimeout(ensure, 1500); // auto-reconnect
  };
  return socket;
}

/** Publish an event. Topics are the full namespaced form `<module>:<topic>`. */
export function publish(topic: string, payload: unknown): void {
  const s = ensure();
  const send = () => s.send(JSON.stringify({ topic, payload }));
  if (s.readyState === WebSocket.OPEN) send();
  else s.addEventListener("open", send, { once: true });
}

function subscribe(topic: string, handler: Handler): () => void {
  ensure();
  let set = handlers.get(topic);
  if (!set) {
    set = new Set();
    handlers.set(topic, set);
  }
  set.add(handler);
  return () => set!.delete(handler);
}

/** Subscribe a component to a namespaced topic for its lifetime. */
export function useSubscribe(topic: string, handler: Handler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe(topic, (p) => ref.current(p)), [topic]);
}
