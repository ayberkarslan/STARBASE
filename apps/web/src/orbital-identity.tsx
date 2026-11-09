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
        viewBox="0 0 640 440"
        role="img"
        aria-labelledby="orbital-title"
        className="orbital-constellation-svg"
      >
        <title id="orbital-title">Yıldız Roket Takımı Uygulama Yörüngesi</title>

        <defs>
          {/* Deep Stellar Corona Gradients */}
          <radialGradient id="stellar-outer-corona" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="80%" stopColor="#ffffff" stopOpacity="0.01" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="stellar-mid-corona" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="85%" stopColor="#ffffff" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="stellar-core-dense" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="75%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          {/* Local Flare Diamond Gradients (confined strictly to core zone) */}
          <linearGradient id="flare-vertical" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="flare-horizontal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Ambient Distant Stars (clean, no clutter) */}
        <g className="stellar-starfield" fill="#ffffff">
          <circle cx="70" cy="180" r="1.1" opacity="0.4" />
          <circle cx="560" cy="75" r="1.2" opacity="0.5" />
          <circle cx="490" cy="380" r="1.0" opacity="0.4" />
          <circle cx="210" cy="410" r="1.1" opacity="0.4" />
          <circle cx="230" cy="50" r="1.0" opacity="0.3" />
          <circle cx="580" cy="310" r="1.1" opacity="0.45" />
        </g>

        {/* Orbital Trajectories (Keplerian Ellipses) */}
        <g className="stellar-orbit-paths" fill="none">
          <ellipse
            cx="320"
            cy="220"
            rx="230"
            ry="85"
            transform="rotate(-25 320 220)"
            className="orbit-path orbit-alpha"
          />
          <ellipse
            cx="320"
            cy="220"
            rx="230"
            ry="85"
            transform="rotate(25 320 220)"
            className="orbit-path orbit-beta"
          />
          <ellipse
            cx="320"
            cy="220"
            rx="180"
            ry="70"
            transform="rotate(90 320 220)"
            className="orbit-path orbit-gamma"
          />
          <ellipse
            cx="320"
            cy="220"
            rx="140"
            ry="52"
            className="orbit-path orbit-inner"
            strokeDasharray="3 7"
          />
        </g>

        {/* ========================================================= */}
        {/* THE CENTRAL STELLAR CORE ("HARBİDEN YILDIZ")               */}
        {/* ========================================================= */}
        <g className="stellar-core-group" transform="translate(0, 0)">
          {/* Outer Atmospheric Corona Halo */}
          <circle
            cx="320"
            cy="220"
            r="150"
            fill="url(#stellar-outer-corona)"
            className="stellar-outer-halo"
          />

          {/* Middle Energetic Corona */}
          <circle
            cx="320"
            cy="220"
            r="105"
            fill="url(#stellar-mid-corona)"
            className="stellar-mid-halo"
          />

          {/* Authentic Star Diffraction Flares (Confined within radius <= 85px) */}
          <g className="stellar-diffraction-spikes">
            {/* Cardinal Vertical Diamond Flare */}
            <polygon
              points="320,135 323,220 320,305 317,220"
              fill="url(#flare-vertical)"
              opacity="0.85"
            />
            {/* Cardinal Horizontal Diamond Flare */}
            <polygon
              points="235,220 320,223 405,220 320,217"
              fill="url(#flare-horizontal)"
              opacity="0.85"
            />
            {/* Subtle Diagonal 45-degree Flare Ticks */}
            <line
              x1="285"
              y1="185"
              x2="355"
              y2="255"
              stroke="#ffffff"
              strokeWidth="0.8"
              opacity="0.35"
            />
            <line
              x1="285"
              y1="255"
              x2="355"
              y2="185"
              stroke="#ffffff"
              strokeWidth="0.8"
              opacity="0.35"
            />
          </g>

          {/* Slow-rotating Celestial Coordinate Ring */}
          <g className="stellar-coordinate-ring" transform-origin="320 220">
            <circle
              cx="320"
              cy="220"
              r="68"
              fill="none"
              stroke="#ffffff"
              strokeWidth="0.9"
              strokeDasharray="2 6"
              opacity="0.3"
            />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                x1="320"
                y1="149"
                x2="320"
                y2="153"
                stroke="#ffffff"
                strokeWidth="1.1"
                opacity="0.5"
                transform={`rotate(${deg} 320 220)`}
              />
            ))}
          </g>

          {/* Dense White Plasma Core */}
          <circle
            cx="320"
            cy="220"
            r="66"
            fill="url(#stellar-core-dense)"
            className="stellar-plasma-core"
          />

          {/* Core Solid Celestial Disc & Rim */}
          <circle
            cx="320"
            cy="220"
            r="54"
            fill="#000000"
            stroke="#ffffff"
            strokeWidth="1.4"
            className="stellar-core-disc"
          />
          <circle
            cx="320"
            cy="220"
            r="50"
            fill="none"
            stroke="#ffffff"
            strokeWidth="0.6"
            opacity="0.3"
          />

          {/* Star Core Emblem (YRT Star Icon) */}
          <image
            href="/brand/yrt.png"
            x="277"
            y="177"
            width="86"
            height="86"
            preserveAspectRatio="xMidYMid meet"
            className="stellar-emblem"
          />
        </g>

        {/* ========================================================= */}
        {/* ORBITAL APPLICATION STATIONS                              */}
        {/* ========================================================= */}

        {/* 1. STARDROP (Upper Left) */}
        <OrbitalStationNode
          x={125}
          y={105}
          name="STARDROP"
          isTarget={isStardropTarget}
          align="top-left"
          logoUrl={findLogo("STARDROP", 0)}
          iconType="star"
        />

        {/* 2. STARLAB (Mid Right) */}
        <OrbitalStationNode
          x={515}
          y={145}
          name="STARLAB"
          isTarget={isStarlabTarget}
          align="top-right"
          logoUrl={findLogo("STARLAB", 1)}
          iconType="rocket"
        />

        {/* 3. YRT TAKVİM (Bottom Right) */}
        <OrbitalStationNode
          x={360}
          y={375}
          name="YRT TAKVİM"
          isTarget={isTakvimTarget}
          align="bottom-right"
          logoUrl={findLogo("TAKVİM", 2) || findLogo("TAKVIM", 2)}
          iconType="calendar"
        />

        {/* 4. ACTIVE TARGET APP or YRT LATEX (Lower Left) */}
        <OrbitalStationNode
          x={125}
          y={325}
          name={slot4Name}
          isTarget={isSlot4Target}
          align="bottom-left"
          logoUrl={slot4Logo}
          iconType="satellite"
        />
      </svg>
    </figure>
  );
}

/** Individual Orbital Application Node with Non-Colliding Layout & High-Visibility Target Locking */
function OrbitalStationNode({
  x,
  y,
  name,
  isTarget,
  align,
  logoUrl,
  iconType,
}: {
  x: number;
  y: number;
  name: string;
  isTarget: boolean;
  align: "top-left" | "top-right" | "bottom-right" | "bottom-left";
  logoUrl?: string;
  iconType: "star" | "rocket" | "calendar" | "satellite";
}) {
  const isLeft = align === "top-left" || align === "bottom-left";
  const isTop = align === "top-left" || align === "top-right";

  const leaderPath = isTop
    ? isLeft
      ? "M 0 0 L -22 -22 H -85"
      : "M 0 0 L 22 -22 H 85"
    : isLeft
      ? "M 0 0 L -22 22 H -85"
      : "M 0 0 L 22 22 H 85";

  const textAnchor = isLeft ? "start" : "end";
  const titleX = isLeft ? -85 : 85;
  const titleY = isTop ? -28 : 16;

  const badgeWidth = 154;
  const badgeHeight = 18;
  const badgeX = isLeft ? -85 : 85 - badgeWidth;
  const badgeY = isTop ? -52 : -8;

  return (
    <g
      className={`orbital-station ${isTarget ? "is-target-locked" : ""}`}
      transform={`translate(${x} ${y})`}
    >
      {/* Target Radar Reticle & Glowing Lock Rings */}
      {isTarget && (
        <g className="target-reticle-group">
          {/* Sonar Radar Wave Ripples */}
          <circle className="station-sonar-ping station-sonar-1" r="20" />
          <circle className="station-sonar-ping station-sonar-2" r="20" />

          {/* Rotating Dashed Locking Ring */}
          <circle className="reticle-ring-dash" r="30" />
          {/* Inner Counter-Rotating Ring */}
          <circle className="reticle-ring-inner" r="25" />

          {/* 4 Crosshair Aim Ticks */}
          <path
            d="M -34 0 h 5 M 29 0 h 5 M 0 -34 v 5 M 0 29 v 5"
            className="reticle-cross-ticks"
          />
          {/* 4 Corner L-Brackets */}
          <path
            d="M -22 -28 h -5 v 5 M 22 -28 h 5 v 5 M -22 28 h -5 v -5 M 22 28 h 5 v -5"
            className="reticle-corner-brackets"
          />
        </g>
      )}

      {/* Connecting Leader Line (Shelf) */}
      <path className="station-leader" d={leaderPath} />

      {/* Station Node Disc */}
      <circle className="station-core-node" r="20" />

      {/* Node Emblem / Logo or Vector Icon */}
      {logoUrl ? (
        <image
          className="station-logo"
          href={logoUrl}
          x="-13"
          y="-13"
          width="26"
          height="26"
          preserveAspectRatio="xMidYMid meet"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <StationIcon iconType={iconType} />
      )}

      {/* High-Visibility Target HUD Badge (Only for active app, cleanly separated) */}
      {isTarget && (
        <g className="target-hud-badge-group">
          <rect
            className="target-hud-rect"
            x={badgeX}
            y={badgeY}
            width={badgeWidth}
            height={badgeHeight}
            rx="2"
          />
          <circle
            className="target-hud-dot"
            cx={badgeX + 10}
            cy={badgeY + badgeHeight / 2}
            r="2.5"
          />
          <text
            className="target-hud-text"
            x={badgeX + 19}
            y={badgeY + badgeHeight / 2 + 3}
          >
            GİRİŞ YAPILAN UYGULAMA
          </text>
        </g>
      )}

      {/* Application Title ONLY (No subtitles / descriptions) */}
      <text
        className="station-title"
        x={titleX}
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
        <polygon points="0,-11 3,-3 11,0 3,3 0,11 -3,3 -11,0 -3,-3" fill="#ffffff" fillOpacity="0.2" />
        <circle cx="0" cy="0" r="2" fill="#ffffff" />
      </g>
    );
  }
  if (iconType === "rocket") {
    return (
      <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
        <path d="M 0 -11 C 3.5 -6 4 2 3 8 L -3 8 C -4 2 -3.5 -6 0 -11 Z" fill="#ffffff" fillOpacity="0.2" />
        <path d="M -3 5 L -7 9 L -3 8 M 3 5 L 7 9 L 3 8" />
        <circle cx="0" cy="-2" r="1.5" fill="#ffffff" />
      </g>
    );
  }
  if (iconType === "calendar") {
    return (
      <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
        <rect x="-8" y="-7" width="16" height="15" rx="1.5" fill="#ffffff" fillOpacity="0.2" />
        <line x1="-8" y1="-3" x2="8" y2="-3" />
        <line x1="-4" y1="-9" x2="-4" y2="-7" />
        <line x1="4" y1="-9" x2="4" y2="-7" />
        <circle cx="-3" cy="1.5" r="1" fill="#ffffff" />
        <circle cx="3" cy="1.5" r="1" fill="#ffffff" />
        <circle cx="0" cy="4.5" r="1" fill="#ffffff" />
      </g>
    );
  }
  // Satellite
  return (
    <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
      <rect x="-4.5" y="-6" width="9" height="12" rx="1" fill="#ffffff" fillOpacity="0.25" />
      <path d="M -14 -3 h 7 v 6 h -7 Z M 7 -3 h 7 v 6 h -7 Z" fill="#ffffff" fillOpacity="0.15" />
      <line x1="-4.5" y1="0" x2="-7" y2="0" />
      <line x1="4.5" y1="0" x2="7" y2="0" />
      <line x1="0" y1="-6" x2="0" y2="-9" />
      <circle cx="0" cy="-9" r="1" fill="#ffffff" />
    </g>
  );
}
