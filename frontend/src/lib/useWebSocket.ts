import { useEffect, useRef } from "react";
import { getWsUrl } from "./api";
import { subscribeServerConfig } from "./serverConfig";

export function useWebSocket(onMessage: (msg: any) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<any>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let stopped = false;

    const close = () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      try {
        wsRef.current?.close();
      } catch {}
      wsRef.current = null;
    };

    const connect = () => {
      if (stopped) return;
      const url = getWsUrl();
      if (!url) {
        // Offline mode — no WebSocket. Retry periodically in case config changes.
        reconnectTimer.current = setTimeout(connect, 3000);
        return;
      }
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onmessage = (e) => {
          try {
            handlerRef.current(JSON.parse(e.data));
          } catch {
            // ignore
          }
        };
        ws.onclose = () => {
          if (!stopped) reconnectTimer.current = setTimeout(connect, 2000);
        };
        ws.onerror = () => {
          try {
            ws.close();
          } catch {}
        };
      } catch {
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };

    connect();

    // Reconnect/disconnect when server config changes
    const unsub = subscribeServerConfig(() => {
      close();
      if (!stopped) connect();
    });

    return () => {
      stopped = true;
      close();
      unsub();
    };
  }, []);
}
