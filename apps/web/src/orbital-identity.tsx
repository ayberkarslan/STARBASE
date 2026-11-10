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

  // Aerospace Constellation Stations (viewBox: 0 0 660 420, Center: 330 210)
  const station1 = { x: 155, y: 105 }; // STARDROP (upper-left)
  const station2 = { x: 505, y: 105 }; // STARLAB (upper-right)
  const station3 = { x: 495, y: 315 }; // YRT TAKVİM (bottom-right)
  const station4 = { x: 165, y: 315 }; // ACTIVE APP / YRT LATEX (bottom-left)

  const targetCoord = isStardropTarget
    ? station1
    : isStarlabTarget
    ? station2
    : isTakvimTarget
    ? station3
    : isSlot4Target
    ? station4
    : null;

  return (
    <figure
      className="orbital-identity"
      aria-label="Yıldız Roket Takımı platform yörüngeleri"
    >
      <svg
        viewBox="0 0 660 420"
        role="img"
        aria-labelledby="orbital-title"
        className="orbital-constellation-svg"
      >
        <title id="orbital-title">Yıldız Roket Takımı Yörünge Sistemi</title>

        {/* Ambient celestial reference points */}
        <g className="stellar-starfield" fill="#ffffff">
          <circle cx="75" cy="180" r="1" opacity="0.35" />
          <circle cx="585" cy="70" r="1.1" opacity="0.3" />
          <circle cx="530" cy="390" r="1" opacity="0.25" />
          <circle cx="210" cy="405" r="0.9" opacity="0.25" />
          <circle cx="250" cy="45" r="1" opacity="0.25" />
          <circle cx="615" cy="290" r="1" opacity="0.3" />
        </g>

        {/* Dynamic Keplerian Orbital Trajectories */}
        <g className="stellar-orbit-paths" fill="none">
          {/* Inclined Trajectory Alpha */}
          <ellipse
            cx="330"
            cy="210"
            rx="230"
            ry="90"
            transform="rotate(-22 330 210)"
            className="orbit-path"
          />
          {/* Inclined Trajectory Beta */}
          <ellipse
            cx="330"
            cy="210"
            rx="230"
            ry="90"
            transform="rotate(22 330 210)"
            className="orbit-path"
          />
          {/* Equatorial Guidance Track */}
          <ellipse
            cx="330"
            cy="210"
            rx="260"
            ry="95"
            className="orbit-path-equatorial"
          />
        </g>

        {/* Active Telemetry Guidance Beam (STARBASE -> Target App) */}
        {targetCoord && (
          <g className="stellar-auth-vector">
            <line
              x1="330"
              y1="210"
              x2={targetCoord.x}
              y2={targetCoord.y}
              className="stellar-auth-beam"
            />
          </g>
        )}

        {/* ========================================================= */}
        {/* THE CENTRAL STAR EMBLEM (HEROIC & MINIMALIST)             */}
        {/* ========================================================= */}
        <g className="stellar-core-group">
          {/* Outer bezel ring */}
          <circle
            cx="330"
            cy="210"
            r="76"
            fill="none"
            stroke="rgba(255, 255, 255, 0.14)"
            strokeWidth="1"
          />

          {/* 4 Cardinal Azimuth Ticks */}
          <g stroke="rgba(255, 255, 255, 0.45)" strokeWidth="1">
            <line x1="330" y1="130" x2="330" y2="135" />
            <line x1="330" y1="285" x2="330" y2="290" />
            <line x1="250" y1="210" x2="255" y2="210" />
            <line x1="405" y1="210" x2="410" y2="210" />
          </g>

          {/* Solid Core Disc */}
          <circle
            cx="330"
            cy="210"
            r="64"
            fill="#000000"
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="1.2"
          />

          {/* Star Core Emblem (YRT Star Icon - Large & Bold) */}
          <image
            href="/brand/yrt.png"
            x="280"
            y="160"
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid meet"
            className="stellar-emblem"
          />
        </g>

        {/* ========================================================= */}
        {/* ORBITAL SUBSYSTEM STATIONS                                */}
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

/** Individual Orbital Subsystem Station Node */
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
  const shelfStartX = isLeft ? -22 : 22;
  const shelfEndX = isLeft ? -150 : 150;
  const textX = isLeft ? -30 : 30;

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

      {/* Telemetry Callout & Labels */}
      {isTarget ? (
        <g className="station-target-callout">
          {/* Horizontal dividing shelf line */}
          <line
            x1={shelfStartX}
            y1="0"
            x2={shelfEndX}
            y2="0"
            className="station-shelf-line"
          />
          {/* Shelf end terminator tick */}
          <line
            x1={shelfEndX}
            y1="-3"
            x2={shelfEndX}
            y2="3"
            className="station-shelf-tick"
          />

          {/* Target Status Tag (Above shelf) */}
          <text
            className="station-target-tag"
            x={textX}
            y="-7"
            textAnchor={textAnchor}
          >
            [ GİRİŞ YAPILAN UYGULAMA ]
          </text>

          {/* Target Application Title (Below shelf) */}
          <text
            className="station-title is-target"
            x={textX}
            y="15"
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
            x2={isLeft ? -32 : 32}
            y2="0"
            className="station-leader"
          />
          <text
            className="station-title"
            x={isLeft ? -38 : 38}
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
