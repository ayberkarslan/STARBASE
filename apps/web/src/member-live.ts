const EVENT = "starbase:directory-changed";

export function invalidateDirectory() {
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeDirectoryChanges(onChange: () => void) {
  let socket: WebSocket | null = null;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let disposed = false;
  window.addEventListener(EVENT, onChange);

  function connect() {
    if (disposed || document.hidden || socket) return;
    const url = new URL("/api/v1/directory/live", location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const current = new WebSocket(url);
    socket = current;
    current.onopen = () => {
      if (disposed || socket !== current) return;
      attempts = 0;
      onChange(); // Catch changes made while this tab was disconnected.
    };
    current.onmessage = (event) => {
      try {
        if (JSON.parse(event.data).type === "directory.changed") onChange();
      } catch { /* Ignore unknown frames. */ }
    };
    current.onclose = () => {
      if (socket !== current) return;
      socket = null;
      if (!disposed && !document.hidden) reconnect = setTimeout(connect,
        Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)) + Math.random() * 500);
    };
    current.onerror = () => current.close();
  }
  function visibility() {
    clearTimeout(reconnect);
    socket?.close();
    socket = null;
    if (!document.hidden) { onChange(); connect(); }
  }
  document.addEventListener("visibilitychange", visibility);
  connect();
  return () => {
    disposed = true;
    clearTimeout(reconnect);
    socket?.close();
    window.removeEventListener(EVENT, onChange);
    document.removeEventListener("visibilitychange", visibility);
  };
}
