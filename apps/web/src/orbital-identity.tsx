/** Team identity at the center of the shared application ecosystem. */
export function OrbitalIdentity({
  activeApp,
  apps = [],
}: {
  activeApp?: { id?: string; name?: string; logoUrl?: string } | null;
  apps?: { id: string; name: string; logoUrl?: string }[];
} = {}) {
  const normalized = (activeApp?.name || activeApp?.id || "").toUpperCase();
  const isStardrop = normalized.includes("STARDROP");
  const isStarlab = normalized.includes("STARLAB");
  const isTakvim = normalized.includes("TAKVİM") || normalized.includes("TAKVIM") || normalized.includes("CALENDAR");
  const isCustomApp = !!activeApp && !isStardrop && !isStarlab && !isTakvim;
  const customAppName = activeApp?.name || activeApp?.id || "UYGULAMA";
  const logoFor = (name: string) =>
    apps.find((app) => app.name.toUpperCase().includes(name))?.logoUrl ||
    (activeApp?.name?.toUpperCase().includes(name) ? activeApp.logoUrl ?? "" : "");
  const SatelliteMark = ({ logo, rotate }: { logo: string; rotate: number }) =>
    logo ? <image className="satellite-logo" href={logo} x="-15" y="-15" width="30" height="30" preserveAspectRatio="xMidYMid meet" /> : <g transform={`rotate(${rotate})`}><path d="M-19-5h11v10h-11zm27 0h11v10H8z" /><rect x="-5" y="-8" width="10" height="16" rx="1" /><path d="M-8 0h3m10 0h3M0-8v-5m0 0 4-3" /></g>;

  return (
    <figure
      className="orbital-identity"
      aria-label="Yıldız Roket Takımı çevresinde STARDROP, STARLAB ve YRT TAKVİM uygulamaları"
    >
      <svg viewBox="0 0 560 400" role="img" aria-labelledby="orbital-title">
        <title id="orbital-title">Yıldız’ın uygulama yörüngesi</title>
        <defs>
          <radialGradient id="planet-halo">
            <stop offset="0" stopColor="#fff" stopOpacity=".045" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="280" cy="202" r="168" fill="url(#planet-halo)" />
        <g className="orbit-paths" fill="none">
          <ellipse
            cx="280"
            cy="202"
            rx="214"
            ry="78"
            transform="rotate(-26 280 202)"
          />
          <ellipse
            cx="280"
            cy="202"
            rx="214"
            ry="78"
            transform="rotate(26 280 202)"
          />
          <ellipse
            cx="280"
            cy="202"
            rx="168"
            ry="65"
            transform="rotate(90 280 202)"
          />
        </g>
        <g className="orbit-star" fill="white">
          <circle cx="89" cy="255" r="1.2" />
          <circle cx="444" cy="69" r="1" />
          <circle cx="362" cy="361" r="1.2" />
          <path
            d="M170 28v8m-4-4h8"
            fill="none"
            stroke="white"
            strokeWidth=".7"
          />
        </g>
        <circle cx="280" cy="202" r="82" fill="#000" stroke="#ffffff26" />
        <image href="/brand/yrt.png" x="216" y="138" width="128" height="128" />

        <g className={`orbital-satellite ${isStardrop ? "is-target-active" : ""}`} transform="translate(111 89)">
          <path className="satellite-leader" d="M0 0l-19-19h-38" />
          <SatelliteMark logo={logoFor("STARDROP")} rotate={-26} />
          <text x="-58" y="-29">
            STARDROP
          </text>
          <circle className="satellite-beacon" r="25" />
          {isStardrop && (
            <g className="satellite-reticle">
              <circle className="reticle-ring" r="32" />
              <path d="M-38 0h6m64 0h6M0 -38v6m0 64v6" className="reticle-cross" />
            </g>
          )}
        </g>

        <g className={`orbital-satellite ${isStarlab ? "is-target-active" : ""}`} transform="translate(465 168)">
          <path className="satellite-leader" d="M0 0l18-21h30" />
          <SatelliteMark logo={logoFor("STARLAB")} rotate={26} />
          <text x="48" y="-32" textAnchor="end">
            STARLAB
          </text>
          <circle className="satellite-beacon" r="25" />
          {isStarlab && (
            <g className="satellite-reticle">
              <circle className="reticle-ring" r="32" />
              <path d="M-38 0h6m64 0h6M0 -38v6m0 64v6" className="reticle-cross" />
            </g>
          )}
        </g>

        <g className={`orbital-satellite ${isTakvim ? "is-target-active" : ""}`} transform="translate(273 369)">
          <path className="satellite-leader" d="M0 0l-28-20h-58" />
          <SatelliteMark logo={logoFor("TAKVİM") || logoFor("TAKVIM")} rotate={-8} />
          <text x="-137" y="-29">
            YRT TAKVİM
          </text>
          <circle className="satellite-beacon" r="25" />
          {isTakvim && (
            <g className="satellite-reticle">
              <circle className="reticle-ring" r="32" />
              <path d="M-38 0h6m64 0h6M0 -38v6m0 64v6" className="reticle-cross" />
            </g>
          )}
        </g>

        {isCustomApp && (
          <g className="orbital-satellite is-target-active is-custom-target" transform="translate(132 290)">
            <path className="satellite-leader" d="M0 0l-20 18h-48" />
            <g transform="rotate(-16)">
              <path d="M-19-5h11v10h-11zm27 0h11v10H8z" />
              <rect x="-5" y="-8" width="10" height="16" rx="1" />
              <path d="M-8 0h3m10 0h3M0-8v-5m0 0 4-3" />
            </g>
            <text x="-72" y="24">
              {customAppName.toUpperCase()}
            </text>
            <circle className="satellite-beacon" r="25" />
            <g className="satellite-reticle">
              <circle className="reticle-ring" r="32" />
              <path d="M-38 0h6m64 0h6M0 -38v6m0 64v6" className="reticle-cross" />
            </g>
          </g>
        )}
      </svg>
    </figure>
  );
}
