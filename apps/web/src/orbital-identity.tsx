/** Team identity at the center of the shared application ecosystem. */
export type OrbitalApp = {
  id: string;
  name: string;
  logoUrl?: string;
};

export function OrbitalIdentity({
  activeApp,
  apps = [],
}: {
  activeApp?: { id?: string; name?: string; logoUrl?: string } | null;
  apps?: OrbitalApp[];
} = {}) {
  const activeNorm = (activeApp?.name || activeApp?.id || "").toUpperCase();
  const hasActiveApp = Boolean(activeApp && (activeApp.name || activeApp.id));

  const isStardropTarget = hasActiveApp && activeNorm.includes("STARDROP");
  const isStarlabTarget = hasActiveApp && activeNorm.includes("STARLAB");
  const isTakvimTarget =
    hasActiveApp &&
    (activeNorm.includes("TAKVİM") ||
      activeNorm.includes("TAKVIM") ||
      activeNorm.includes("CALENDAR"));
  const isSlot4Target =
    hasActiveApp && !isStardropTarget && !isStarlabTarget && !isTakvimTarget;

  const findLogo = (keyword: string, fallbackSlot: number) => {
    const fromApps = apps.find((a) =>
      `${a.name} ${a.id}`.toUpperCase().includes(keyword),
    )?.logoUrl;
    if (fromApps) return fromApps;
    if (activeApp && `${activeApp.name} ${activeApp.id}`.toUpperCase().includes(keyword)) {
      return activeApp.logoUrl || "";
    }
    return apps[fallbackSlot]?.logoUrl || "";
  };

  const slot4Name = isSlot4Target
    ? (activeApp?.name || activeApp?.id || "YRT LATEX").toUpperCase()
    : "YRT LATEX";
  const slot4Logo = isSlot4Target
    ? activeApp?.logoUrl || findLogo("LATEX", 3)
    : findLogo("LATEX", 3);

  // Stations positioned on orbital ellipses in viewBox 0 0 700 460 (Center: 350, 230)
  const station1 = { x: 195, y: 115 }; // STARDROP (top-left)
  const station2 = { x: 505, y: 115 }; // STARLAB (top-right)
  const station3 = { x: 500, y: 345 }; // YRT TAKVİM (bottom-right)
  const station4 = { x: 200, y: 345 }; // SLOT 4 / ACTIVE APP (bottom-left)

  return (
    <figure
      className="orbital-identity"
      aria-label="Yıldız Roket Takımı merkezi ve çevresindeki platform yörüngeleri"
    >
      <svg
        viewBox="0 0 700 460"
        role="img"
        aria-labelledby="orbital-title"
        className="orbital-constellation-svg"
      >
        <title id="orbital-title">Yıldız Roket Takımı Uygulama Yörüngesi</title>

        {/* Ambient subtle stars */}
        <g className="stellar-starfield" fill="#ffffff">
          <circle cx="80" cy="190" r="1" opacity="0.3" />
          <circle cx="620" cy="80" r="1.1" opacity="0.35" />
          <circle cx="530" cy="415" r="1" opacity="0.25" />
          <circle cx="215" cy="435" r="0.9" opacity="0.25" />
          <circle cx="260" cy="45" r="1" opacity="0.25" />
          <circle cx="640" cy="320" r="1" opacity="0.3" />
        </g>

        {/* Elegant Orbital Paths */}
        <g className="stellar-orbit-paths" fill="none">
          <ellipse
            cx="350"
            cy="230"
            rx="245"
            ry="95"
            transform="rotate(-24 350 230)"
            className="orbit-path"
          />
          <ellipse
            cx="350"
            cy="230"
            rx="245"
            ry="95"
            transform="rotate(24 350 230)"
            className="orbit-path"
          />
          <ellipse
            cx="350"
            cy="230"
            rx="180"
            ry="70"
            transform="rotate(90 350 230)"
            className="orbit-path orbit-path-vertical"
          />
        </g>

        {/* ========================================================= */}
        {/* THE CENTRAL CORE LOGO (PROMINENT & HEROIC)                */}
        {/* ========================================================= */}
        <g className="stellar-core-group">
          {/* Outer orbit boundary */}
          <circle
            cx="350"
            cy="230"
            r="82"
            fill="none"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="1"
          />

          {/* Core Solid Celestial Disc */}
          <circle
            cx="350"
            cy="230"
            r="72"
            fill="#000000"
            stroke="rgba(255, 255, 255, 0.35)"
            strokeWidth="1.2"
          />

          {/* Star Core Emblem (YRT Star Icon - Large & Crisp) */}
          <image
            href="/brand/yrt.png"
            x="292"
            y="172"
            width="116"
            height="116"
            preserveAspectRatio="xMidYMid meet"
            className="stellar-emblem"
          />
        </g>

        {/* ========================================================= */}
        {/* APPLICATION NODES                                         */}
        {/* ========================================================= */}

        {/* 1. STARDROP (Upper Left) */}
        <OrbitalStationNode
          x={station1.x}
          y={station1.y}
          name="STARDROP"
          isTarget={isStardropTarget}
          isLeft={true}
          logoUrl={findLogo("STARDROP", 0)}
          iconType="star"
        />

        {/* 2. STARLAB (Upper Right) */}
        <OrbitalStationNode
          x={station2.x}
          y={station2.y}
          name="STARLAB"
          isTarget={isStarlabTarget}
          isLeft={false}
          logoUrl={findLogo("STARLAB", 1)}
          iconType="rocket"
        />

        {/* 3. YRT TAKVİM (Bottom Right) */}
        <OrbitalStationNode
          x={station3.x}
          y={station3.y}
          name="YRT TAKVİM"
          isTarget={isTakvimTarget}
          isLeft={false}
          logoUrl={findLogo("TAKVİM", 2) || findLogo("TAKVIM", 2)}
          iconType="calendar"
        />

        {/* 4. ACTIVE TARGET APP or YRT LATEX (Lower Left) */}
        <OrbitalStationNode
          x={station4.x}
          y={station4.y}
          name={slot4Name}
          isTarget={isSlot4Target}
          isLeft={true}
          logoUrl={slot4Logo}
          iconType="satellite"
        />
      </svg>
    </figure>
  );
}

/** Individual Orbital Application Node with Aerospace Telemetry HUD */
function OrbitalStationNode({
  x,
  y,
  name,
  isTarget,
  isLeft,
  logoUrl,
  iconType,
}: {
  x: number;
  y: number;
  name: string;
  isTarget: boolean;
  isLeft: boolean;
  logoUrl?: string;
  iconType: "star" | "rocket" | "calendar" | "satellite";
}) {
  const textAnchor = isLeft ? "end" : "start";
  const leaderStartX = isLeft ? -22 : 22;
  const leaderEndX = isLeft ? -42 : 42;
  const textX = isLeft ? -48 : 48;
  const shelfEndX = isLeft ? -190 : 190;

  return (
    <g
      className={`orbital-station ${isTarget ? "is-target-locked" : ""}`}
      transform={`translate(${x} ${y})`}
    >
      {/* Target Reticle Brackets [ ] */}
      {isTarget && (
        <g className="target-hud-reticle">
          <circle className="station-sonar-ping" r="16" />
          <path
            d="M -22 -14 v -8 h 8 M 22 -14 v -8 h -8 M -22 14 v 8 h 8 M 22 14 v 8 h -8"
            className="hud-corner-brackets"
          />
        </g>
      )}

      {/* Leader line and texts */}
      {isTarget ? (
        <g className="station-target-callout">
          <line
            x1={leaderStartX}
            y1="0"
            x2={leaderEndX}
            y2="0"
            className="station-leader"
          />
          <line
            x1={leaderEndX}
            y1="22"
            x2={shelfEndX}
            y2="22"
            className="station-shelf-line"
          />
          <text
            className="station-target-tag"
            x={textX}
            y="-4"
            textAnchor={textAnchor}
          >
            [ GİRİŞ YAPILAN UYGULAMA ]
          </text>
          <text
            className="station-title is-target"
            x={textX}
            y="14"
            textAnchor={textAnchor}
          >
            {name}
          </text>
        </g>
      ) : (
        <g className="station-normal-callout">
          <line
            x1={isLeft ? -18 : 18}
            y1="0"
            x2={isLeft ? -36 : 36}
            y2="0"
            className="station-leader"
          />
          <text
            className="station-title"
            x={isLeft ? -42 : 42}
            y="4"
            textAnchor={textAnchor}
          >
            {name}
          </text>
        </g>
      )}

      {/* Station Node Disc */}
      <circle className="station-core-node" r="16" />

      {/* Node Emblem / Logo or Vector Icon */}
      {logoUrl ? (
        <image
          className="station-logo"
          href={logoUrl}
          x="-10"
          y="-10"
          width="20"
          height="20"
          preserveAspectRatio="xMidYMid meet"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <StationIcon iconType={iconType} />
      )}
    </g>
  );
}

/** Vector icons for orbital stations when custom logo is not present */
function StationIcon({
  iconType,
}: {
  iconType: "star" | "rocket" | "calendar" | "satellite";
}) {
  if (iconType === "star") {
    return (
      <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
        <polygon points="0,-8 2.2,-2.2 8,0 2.2,2.2 0,8 -2.2,2.2 -8,0 -2.2,-2.2" fill="#ffffff" fillOpacity="0.3" />
        <circle cx="0" cy="0" r="1.5" fill="#ffffff" />
      </g>
    );
  }
  if (iconType === "rocket") {
    return (
      <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
        <path d="M 0 -8 C 2.5 -4 3 2 2 6 L -2 6 C -3 2 -2.5 -4 0 -8 Z" fill="#ffffff" fillOpacity="0.3" />
        <path d="M -2 4 L -5 7 L -2 6 M 2 4 L 5 7 L 2 6" />
        <circle cx="0" cy="-1" r="1" fill="#ffffff" />
      </g>
    );
  }
  if (iconType === "calendar") {
    return (
      <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
        <rect x="-6" y="-5" width="12" height="11" rx="1" fill="#ffffff" fillOpacity="0.25" />
        <line x1="-6" y1="-1" x2="6" y2="-1" />
        <line x1="-2.5" y1="-7" x2="-2.5" y2="-5" />
        <line x1="2.5" y1="-7" x2="2.5" y2="-5" />
        <circle cx="-2" cy="2" r="0.8" fill="#ffffff" />
        <circle cx="2" cy="2" r="0.8" fill="#ffffff" />
      </g>
    );
  }
  // Satellite
  return (
    <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
      <rect x="-3.5" y="-4" width="7" height="8" rx="1" fill="#ffffff" fillOpacity="0.3" />
      <path d="M -10 -2 h 5 v 4 h -5 Z M 5 -2 h 5 v 4 h -5 Z" fill="#ffffff" fillOpacity="0.2" />
      <line x1="-3.5" y1="0" x2="-5" y2="0" />
      <line x1="3.5" y1="0" x2="5" y2="0" />
      <circle cx="0" cy="-6" r="0.8" fill="#ffffff" />
    </g>
  );
}
