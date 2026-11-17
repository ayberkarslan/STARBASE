/** One shared orbit for the applications registered with STARBASE. */
export type OrbitalApp = {
  id: string;
  name: string;
  logoUrl?: string;
};

const MAX_STATIONS = 8;
const CENTER = { x: 330, y: 160 };
const RADIUS = { x: 245, y: 94 };

export function OrbitalIdentity({
  activeApp,
  apps = [],
}: {
  activeApp?: OrbitalApp | null;
  apps?: OrbitalApp[];
} = {}) {
  const registered = [...apps].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const active = activeApp?.id
    ? registered.find((app) => app.id === activeApp.id) ?? activeApp
    : null;
  if (active && !registered.some((app) => app.id === active.id)) registered.push(active);
  const stations = registered.slice(0, MAX_STATIONS);
  if (active && !stations.some((app) => app.id === active.id)) stations[MAX_STATIONS - 1] = active;
  const showNames = !active && stations.length <= 4;

  return (
    <figure className="orbital-identity" aria-label={active
      ? `STARBASE üzerinden ${active.name} uygulamasına giriş`
      : "Yıldız Roket Takımı uygulamaları"}>
      <svg viewBox="0 0 660 330" role="img" aria-labelledby="orbital-title">
        <title id="orbital-title">Yıldız Roket Takımı uygulama yörüngesi</title>
        <ellipse className="orbital-track" cx={CENTER.x} cy={CENTER.y} rx={RADIUS.x} ry={RADIUS.y} />
        <circle className="orbital-center-ring" cx={CENTER.x} cy={CENTER.y} r="72" />
        <circle className="orbital-center-disc" cx={CENTER.x} cy={CENTER.y} r="62" />
        <image href="/brand/yrt.png" x="282" y="112" width="96" height="96" preserveAspectRatio="xMidYMid meet" />
        {stations.map((app, index) => {
          const angle = (-135 + index * 360 / stations.length) * Math.PI / 180;
          const x = CENTER.x + RADIUS.x * Math.cos(angle);
          const y = CENTER.y + RADIUS.y * Math.sin(angle);
          const selected = app.id === active?.id;
          return <g key={app.id} className={`orbital-node${selected ? " is-active" : ""}`} transform={`translate(${x} ${y})`}>
            <title>{app.name}</title>
            <circle className="orbital-node-disc" r={selected ? 20 : 17} />
            <path className="orbital-node-fallback" d="M0 -7 2 -2 7 0 2 2 0 7 -2 2 -7 0 -2 -2Z" />
            {app.logoUrl && <image href={app.logoUrl} x="-13" y="-13" width="26" height="26" preserveAspectRatio="xMidYMid meet" />}
            {selected && <path className="orbital-node-marker" d="M -5 27 H 5" />}
            {showNames && <text className="orbital-node-name" y={y < CENTER.y ? -30 : 38} textAnchor="middle">{app.name.length > 18 ? `${app.name.slice(0, 17)}…` : app.name}</text>}
          </g>;
        })}
      </svg>
      <figcaption className="orbital-caption">
        <span>{active ? "STARBASE İLE GİRİŞ" : "TEK HESAP · TÜM UYGULAMALAR"}</span>
        {active && <strong>{active.name}</strong>}
        {!active && registered.length > MAX_STATIONS && <small>+{registered.length - MAX_STATIONS} UYGULAMA</small>}
      </figcaption>
    </figure>
  );
}
