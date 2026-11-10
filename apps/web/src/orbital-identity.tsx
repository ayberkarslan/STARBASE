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

  // Precision station positions in viewBox 0 0 680 440 (Center: 340, 220)
  const station1 = { x: 190, y: 105 }; // STARDROP (top-left)
  const station2 = { x: 490, y: 105 }; // STARLAB (top-right)
  const station3 = { x: 480, y: 330 }; // YRT TAKVİM (bottom-right)
  const station4 = { x: 200, y: 330 }; // SLOT 4 / ACTIVE APP (bottom-left)

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
      aria-label="Yıldız Roket Takımı merkezi yıldızı ve çevresindeki platform yörüngeleri"
    >
      <svg
        viewBox="0 0 680 440"
        role="img"
        aria-labelledby="orbital-title"
        className="orbital-constellation-svg"
      >
        <title id="orbital-title">Yıldız Roket Takımı Uygulama Yörüngesi</title>

        {/* Ambient Distant Stars */}
        <g className="stellar-starfield" fill="#ffffff">
          <circle cx="70" cy="180" r="1" opacity="0.3" />
          <circle cx="610" cy="75" r="1" opacity="0.35" />
          <circle cx="520" cy="405" r="1.1" opacity="0.25" />
          <circle cx="210" cy="425" r="0.9" opacity="0.25" />
          <circle cx="250" cy="45" r="1" opacity="0.25" />
          <circle cx="630" cy="315" r="1" opacity="0.3" />
        </g>

        {/* Aerospace Coordinate Crosshairs */}
        <g className="stellar-crosshairs">
          <line x1="120" y1="220" x2="560" y2="220" />
          <line x1="340" y1="50" x2="340" y2="390" />
        </g>

        {/* Orbital Trajectories */}
        <g className="stellar-orbit-paths">
          {/* Primary orbital track framing all 4 stations */}
          <ellipse
            cx="340"
            cy="220"
            rx="235"
            ry="125"
            className="orbit-primary"
          />
          {/* Inner secondary telemetry orbit */}
          <ellipse
            cx="340"
            cy="220"
            rx="155"
            ry="80"
            className="orbit-secondary"
          />
        </g>

        {/* Active Auth Data Vector (STARBASE -> Target App) */}
        {targetCoord && (
          <g className="stellar-auth-vector">
            <line
              x1="340"
              y1="220"
              x2={targetCoord.x}
              y2={targetCoord.y}
              className="stellar-auth-beam"
            />
          </g>
        )}

        {/* ========================================================= */}
        {/* THE CENTRAL STARBASE CORE EMBLEM                          */}
        {/* ========================================================= */}
        <g className="stellar-core-group">
          {/* Outer telemetry ring */}
          <circle cx="340" cy="220" r="48" className="stellar-core-ring" />

          {/* Precision Cardinal Tick Marks */}
          <g stroke="#ffffff" strokeWidth="1" opacity="0.5">
            <line x1="340" y1="168" x2="340" y2="173" />
            <line x1="340" y1="267" x2="340" y2="272" />
            <line x1="288" y1="220" x2="293" y2="220" />
            <line x1="387" y1="220" x2="392" y2="220" />
          </g>

          {/* Core Solid Celestial Disc */}
          <circle cx="340" cy="220" r="38" className="stellar-core-disc" />

          {/* Star Core Emblem (YRT Star Icon) */}
          <image
            href="/brand/yrt.png"
            x="308"
            y="188"
            width="64"
            height="64"
            preserveAspectRatio="xMidYMid meet"
            className="stellar-emblem"
          />

          {/* Core Telemetry Micro Label */}
          <text x="340" y="278" textAnchor="middle" className="stellar-core-label">
            STARBASE // MERKEZ
          </text>
        </g>

        {/* ========================================================= */}
        {/* ORBITAL APPLICATION STATIONS                              */}
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
  const leaderStartX = isLeft ? -22 : 22;
  const leaderEndX = isLeft ? -46 : 46;
  const textX = isLeft ? -52 : 52;
  const textAnchor = isLeft ? "end" : "start";
  const shelfEndX = isLeft ? -195 : 195;

  return (
    <g
      className={`orbital-station ${isTarget ? "is-target-locked" : ""}`}
      transform={`translate(${x} ${y})`}
    >
      {/* Target Aerospace HUD Lock-On Reticle */}
      {isTarget && (
        <g className="target-hud-reticle">
          {/* Subtle radar sonar wave */}
          <circle className="station-sonar-ping" r="16" />

          {/* 4 Sharp Aerospace Corner Brackets [ ] */}
          <path
            d="M -22 -14 v -8 h 8 M 22 -14 v -8 h -8 M -22 14 v 8 h 8 M 22 14 v 8 h -8"
            className="hud-corner-brackets"
          />
        </g>
      )}

      {/* Connecting Leader Line */}
      {isTarget ? (
        <g className="station-target-callout">
          {/* Horizontal leader from bracket to vertical telemetry bar */}
          <line
            x1={leaderStartX}
            y1="0"
            x2={leaderEndX}
            y2="0"
            className="station-leader"
          />

          {/* Vertical telemetry bracket */}
          <line
            x1={leaderEndX}
            y1="-12"
            x2={leaderEndX}
            y2="18"
            className="station-bracket-line"
          />

          {/* Underline shelf beneath app name */}
          <line
            x1={leaderEndX}
            y1="22"
            x2={shelfEndX}
            y2="22"
            className="station-shelf-line"
          />

          {/* Target Status Tag */}
          <text
            className="station-target-tag"
            x={textX}
            y="-3"
            textAnchor={textAnchor}
          >
            [ GİRİŞ YAPILAN UYGULAMA ]
          </text>

          {/* Target Application Title */}
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
          {/* Clean minimal leader line */}
          <line
            x1={isLeft ? -18 : 18}
            y1="0"
            x2={isLeft ? -38 : 38}
            y2="0"
            className="station-leader"
          />

          {/* Application Title */}
          <text
            className="station-title"
            x={isLeft ? -44 : 44}
            y="4"
            textAnchor={textAnchor}
          >
            {name}
          </text>
        </g>
      )}

      {/* Station Node Disc */}
      <circle className="station-core-node" r="15" />

      {/* Station Inner Rim */}
      <circle className="station-inner-ring" r="12" />

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
