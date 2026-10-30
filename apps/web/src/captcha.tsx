import { useEffect, useRef } from "react";
declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      remove: (id: string) => void;
      reset: () => void;
    };
  }
}
export function Captcha() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false,
      id: string | undefined;
    let timer: ReturnType<typeof setTimeout>;
    fetch("/api/v1/config")
      .then((r) => r.json())
      .then((c: any) => {
        if (!c.turnstileSiteKey) return;
        if (!document.querySelector("#turnstile-script")) {
          const script = document.createElement("script");
          script.id = "turnstile-script";
          script.src =
            "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
          script.async = true;
          document.head.appendChild(script);
        }
        const render = () => {
          if (cancelled) return;
          if (window.turnstile && ref.current)
            id = window.turnstile.render(ref.current, {
              sitekey: c.turnstileSiteKey,
              theme: "dark",
            });
          else timer = setTimeout(render, 200);
        };
        render();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (id) window.turnstile?.remove(id);
    };
  }, []);
  return <div ref={ref} />;
}
