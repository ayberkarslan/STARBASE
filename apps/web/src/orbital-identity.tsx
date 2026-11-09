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

  return (
    <figure
      className="orbital-identity"
      aria-label="Yıldız Roket Takımı merkezi yıldızı ve çevresindeki platform yörüngeleri"
    >
      <svg
        viewBox="0 0 680 460"
        role="img"
        aria-labelledby="orbital-title"
        className="orbital-constellation-svg"
      >
        <title id="orbital-title">Yıldız Roket Takımı Uygulama Yörüngesi</title>

        <defs>
          {/* Deep Stellar Corona Gradients */}
          <radialGradient id="stellar-outer-corona" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="stellar-mid-corona" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.30" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="stellar-core-dense" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          {/* Sharp Star Flare Diamonds (Confined strictly around the central core) */}
          <linearGradient id="flare-vertical" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="flare-horizontal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Ambient Distant Stars (clean & sparse) */}
        <g className="stellar-starfield" fill="#ffffff">
          <circle cx="80" cy="190" r="1" opacity="0.35" />
          <circle cx="600" cy="80" r="1.1" opacity="0.45" />
          <circle cx="510" cy="400" r="1" opacity="0.35" />
          <circle cx="220" cy="430" r="1" opacity="0.35" />
          <circle cx="250" cy="50" r="1" opacity="0.3" />
          <circle cx="620" cy="320" r="1.1" opacity="0.4" />
        </g>

        {/* Orbital Trajectories (Keplerian Ellipses) */}
        <g className="stellar-orbit-paths" fill="none">
          <ellipse
            cx="340"
            cy="230"
            rx="245"
            ry="90"
            transform="rotate(-26 340 230)"
            className="orbit-path orbit-alpha"
          />
          <ellipse
            cx="340"
            cy="230"
            rx="245"
            ry="90"
            transform="rotate(26 340 230)"
            className="orbit-path orbit-beta"
          />
          <ellipse
            cx="340"
            cy="230"
            rx="195"
            ry="72"
            transform="rotate(90 340 230)"
            className="orbit-path orbit-gamma"
          />
          <ellipse
            cx="340"
            cy="230"
            rx="145"
            ry="54"
            className="orbit-path orbit-inner"
            strokeDasharray="3 6"
          />
        </g>

        {/* ========================================================= */}
        {/* THE CENTRAL STELLAR CORE                                  */}
        {/* ========================================================= */}
        <g className="stellar-core-group">
          {/* Outer Atmospheric Corona Halo */}
          <circle
            cx="340"
            cy="230"
            r="125"
            fill="url(#stellar-outer-corona)"
            className="stellar-outer-halo"
          />

          {/* Middle Energetic Corona */}
          <circle
            cx="340"
            cy="230"
            r="85"
            fill="url(#stellar-mid-corona)"
            className="stellar-mid-halo"
          />

          {/* Sharp Star Flare Diamonds (max radius 75px, strictly inside core zone) */}
          <g className="stellar-diffraction-spikes">
            <polygon
              points="340,155 342.5,230 340,305 337.5,230"
              fill="url(#flare-vertical)"
              opacity="0.85"
            />
            <polygon
              points="265,230 340,232.5 415,230 340,227.5"
              fill="url(#flare-horizontal)"
              opacity="0.85"
            />
          </g>

          {/* Precision Navigation Tick Ring */}
          <g className="stellar-coordinate-ring" transform-origin="340 230">
            <circle
              cx="340"
              cy="230"
              r="60"
              fill="none"
              stroke="#ffffff"
              strokeWidth="0.8"
              strokeDasharray="2 6"
              opacity="0.3"
            />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                x1="340"
                y1="166"
                x2="340"
                y2="170"
                stroke="#ffffff"
                strokeWidth="1"
                opacity="0.45"
                transform={`rotate(${deg} 340 230)`}
              />
            ))}
          </g>

          {/* Dense White Plasma Core */}
          <circle
            cx="340"
            cy="230"
            r="55"
            fill="url(#stellar-core-dense)"
            className="stellar-plasma-core"
          />

          {/* Core Solid Celestial Disc */}
          <circle
            cx="340"
            cy="230"
            r="48"
            fill="#000000"
            stroke="#ffffff"
            strokeWidth="1.2"
            className="stellar-core-disc"
          />

          {/* Star Core Emblem (YRT Star Icon) */}
          <image
            href="/brand/yrt.png"
            x="298"
            y="188"
            width="84"
            height="84"
            preserveAspectRatio="xMidYMid meet"
            className="stellar-emblem"
          />
        </g>

        {/* ========================================================= */}
        {/* ORBITAL APPLICATION STATIONS                              */}
        {/* ========================================================= */}

        {/* 1. STARDROP (Upper Left) */}
        <OrbitalStationNode
          x={140}
          y={115}
          name="STARDROP"
          isTarget={isStardropTarget}
          quadrant="top-left"
          logoUrl={findLogo("STARDROP", 0)}
          iconType="star"
        />

        {/* 2. STARLAB (Upper Right) */}
        <OrbitalStationNode
          x={540}
          y={150}
          name="STARLAB"
          isTarget={isStarlabTarget}
          quadrant="top-right"
          logoUrl={findLogo("STARLAB", 1)}
          iconType="rocket"
        />

        {/* 3. YRT TAKVİM (Bottom Right) */}
        <OrbitalStationNode
          x={390}
          y={395}
          name="YRT TAKVİM"
          isTarget={isTakvimTarget}
          quadrant="bottom-right"
          logoUrl={findLogo("TAKVİM", 2) || findLogo("TAKVIM", 2)}
          iconType="calendar"
        />

        {/* 4. ACTIVE TARGET APP or YRT LATEX (Lower Left) */}
        <OrbitalStationNode
          x={140}
          y={335}
          name={slot4Name}
          isTarget={isSlot4Target}
          quadrant="bottom-left"
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
  quadrant,
  logoUrl,
  iconType,
}: {
  x: number;
  y: number;
  name: string;
  isTarget: boolean;
  quadrant: "top-left" | "top-right" | "bottom-right" | "bottom-left";
  logoUrl?: string;
  iconType: "star" | "rocket" | "calendar" | "satellite";
}) {
  const isLeft = quadrant === "top-left" || quadrant === "bottom-left";
  const isTop = quadrant === "top-left" || quadrant === "top-right";

  // Angular leader line extending away from the star:
  // Node is at (0,0). Leader extends outward 25px diagonally and 100px horizontally.
  const shelfLength = 100;
  const diagX = isLeft ? -25 : 25;
  const diagY = isTop ? -25 : 25;
  const endX = isLeft ? diagX - shelfLength : diagX + shelfLength;
  const leaderPath = `M 0 0 L ${diagX} ${diagY} H ${endX}`;

  // Text anchor: left-align for left side, right-align for right side.
  // Both title and tag align at the very end of the shelf (endX).
  const textAnchor = isLeft ? "start" : "end";

  // Vertical placement strictly stacked with the shelf line:
  // Top quadrant:
  //   - Shelf line at y = -25
  //   - Title at y = -31 (sits 6px above shelf)
  //   - Tag at y = -47 (sits 16px above title)
  // Bottom quadrant:
  //   - Tag at y = 5
  //   - Title at y = 19
  //   - Shelf line at y = 25 (sits 6px below title)
  const titleY = isTop ? -31 : 19;
  const tagY = isTop ? -47 : 5;

  return (
    <g
      className={`orbital-station ${isTarget ? "is-target-locked" : ""}`}
      transform={`translate(${x} ${y})`}
    >
      {/* Target Aerospace HUD Lock-On Cursor */}
      {isTarget && (
        <g className="target-hud-reticle">
          {/* Subtle radar sonar wave */}
          <circle className="station-sonar-ping" r="18" />

          {/* 4 Sharp Aerospace Corner Brackets [ ] */}
          <path
            d="M -23 -16 v -7 h 7 M 23 -16 v -7 h -7 M -23 16 v 7 h 7 M 23 16 v 7 h -7"
            className="hud-corner-brackets"
          />
        </g>
      )}

      {/* Connecting Leader Line (Shelf) */}
      <path className="station-leader" d={leaderPath} />

      {/* Station Node Disc */}
      <circle className="station-core-node" r="18" />

      {/* Station Inner Rim */}
      <circle className="station-inner-ring" r="15" />

      {/* Node Emblem / Logo or Vector Icon */}
      {logoUrl ? (
        <image
          className="station-logo"
          href={logoUrl}
          x="-12"
          y="-12"
          width="24"
          height="24"
          preserveAspectRatio="xMidYMid meet"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <StationIcon iconType={iconType} />
      )}

      {/* Active Target Indicator Tag (Aerospace typography, NO overlapping box) */}
      {isTarget && (
        <text
          className="station-target-tag"
          x={endX}
          y={tagY}
          textAnchor={textAnchor}
        >
          [ GİRİŞ YAPILAN UYGULAMA ]
        </text>
      )}

      {/* Application Title ONLY */}
      <text
        className="station-title"
        x={endX}
        y={titleY}
        textAnchor={textAnchor}
      >
        {name}
      </text>
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
        <polygon points="0,-10 2.8,-2.8 10,0 2.8,2.8 0,10 -2.8,2.8 -10,0 -2.8,-2.8" fill="#ffffff" fillOpacity="0.25" />
        <circle cx="0" cy="0" r="1.8" fill="#ffffff" />
      </g>
    );
  }
  if (iconType === "rocket") {
    return (
      <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
        <path d="M 0 -10 C 3 -5 3.5 2 2.5 7 L -2.5 7 C -3.5 2 -3 -5 0 -10 Z" fill="#ffffff" fillOpacity="0.25" />
        <path d="M -2.5 4 L -6 8 L -2.5 7 M 2.5 4 L 6 8 L 2.5 7" />
        <circle cx="0" cy="-2" r="1.2" fill="#ffffff" />
      </g>
    );
  }
  if (iconType === "calendar") {
    return (
      <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
        <rect x="-7" y="-6" width="14" height="13" rx="1.5" fill="#ffffff" fillOpacity="0.2" />
        <line x1="-7" y1="-2" x2="7" y2="-2" />
        <line x1="-3" y1="-8" x2="-3" y2="-6" />
        <line x1="3" y1="-8" x2="3" y2="-6" />
        <circle cx="-2.5" cy="1.5" r="0.8" fill="#ffffff" />
        <circle cx="2.5" cy="1.5" r="0.8" fill="#ffffff" />
        <circle cx="0" cy="4" r="0.8" fill="#ffffff" />
      </g>
    );
  }
  // Satellite
  return (
    <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
      <rect x="-4" y="-5" width="8" height="10" rx="1" fill="#ffffff" fillOpacity="0.25" />
      <path d="M -12 -2.5 h 6 v 5 h -6 Z M 6 -2.5 h 6 v 5 h -6 Z" fill="#ffffff" fillOpacity="0.15" />
      <line x1="-4" y1="0" x2="-6" y2="0" />
      <line x1="4" y1="0" x2="6" y2="0" />
      <line x1="0" y1="-5" x2="0" y2="-8" />
      <circle cx="0" cy="-8" r="0.9" fill="#ffffff" />
    </g>
  );
}
