import { useEffect, useRef } from "react";
import { getWsUrl } from "./api";
import { subscribeServerConfig } from "./serverConfig";

export function useWebSocket(onMessage: (msg: any) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<any>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let stopped = false;
    const close = () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
    const connect = () => {
      if (stopped) return;
      const url = getWsUrl();
      if (!url) { timerRef.current = setTimeout(connect, 3000); return; }
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onmessage = (e) => { try { handlerRef.current(JSON.parse(e.data)); } catch {} };
        ws.onclose = () => { if (!stopped) timerRef.current = setTimeout(connect, 2000); };
        ws.onerror = () => { try { ws.close(); } catch {} };
      } catch { timerRef.current = setTimeout(connect, 2000); }
    };
    connect();
    const unsub = subscribeServerConfig(() => { close(); if (!stopped) connect(); });
    return () => { stopped = true; close(); unsub(); };
  }, []);
}
