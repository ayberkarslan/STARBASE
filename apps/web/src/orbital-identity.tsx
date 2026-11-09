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
        viewBox="0 0 660 480"
        role="img"
        aria-labelledby="orbital-title"
        className="orbital-constellation-svg"
      >
        <title id="orbital-title">Yıldız Roket Takımı Uygulama Yörüngesi</title>

        <defs>
          {/* Deep Stellar Corona Gradients */}
          <radialGradient id="stellar-outer-corona" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="75%" stopColor="#ffffff" stopOpacity="0.015" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="stellar-mid-corona" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.10" />
            <stop offset="85%" stopColor="#ffffff" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="stellar-core-dense" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.3" />
            <stop offset="70%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          {/* Optical Diffraction Spike Gradients */}
          <linearGradient id="spike-vertical" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="25%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="75%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="spike-horizontal" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="25%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="75%" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="spike-diagonal-1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="65%" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="spike-diagonal-2" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.85" />
            <stop offset="65%" stopColor="#ffffff" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Ambient Distant Starfield & Navigational Crosshairs */}
        <g className="stellar-starfield" fill="#ffffff">
          <circle cx="70" cy="190" r="1.1" opacity="0.45" />
          <circle cx="560" cy="80" r="1.2" opacity="0.6" />
          <circle cx="490" cy="380" r="1.0" opacity="0.4" />
          <circle cx="210" cy="430" r="1.2" opacity="0.5" />
          <circle cx="230" cy="50" r="1.0" opacity="0.35" />
          <circle cx="590" cy="310" r="1.1" opacity="0.5" />
          {/* Micro navigational crosshairs */}
          <path d="M190 60v8m-4-4h8" stroke="#ffffff" strokeWidth="0.7" opacity="0.35" />
          <path d="M480 340v8m-4-4h8" stroke="#ffffff" strokeWidth="0.7" opacity="0.35" />
        </g>

        {/* Orbital Trajectories (Keplerian Ellipses) */}
        <g className="stellar-orbit-paths" fill="none">
          {/* Orbit Alpha (tilted -27 deg) */}
          <ellipse
            cx="330"
            cy="240"
            rx="245"
            ry="92"
            transform="rotate(-27 330 240)"
            className="orbit-path orbit-alpha"
          />
          {/* Orbit Beta (tilted +27 deg) */}
          <ellipse
            cx="330"
            cy="240"
            rx="245"
            ry="92"
            transform="rotate(27 330 240)"
            className="orbit-path orbit-beta"
          />
          {/* Orbit Gamma (Polar inclination 90 deg) */}
          <ellipse
            cx="330"
            cy="240"
            rx="195"
            ry="75"
            transform="rotate(90 330 240)"
            className="orbit-path orbit-gamma"
          />
          {/* Equatorial resonance ring */}
          <ellipse
            cx="330"
            cy="240"
            rx="155"
            ry="58"
            className="orbit-path orbit-inner"
            strokeDasharray="4 8"
          />
        </g>

        {/* ========================================================= */}
        {/* THE CENTRAL STELLAR CORE ("HARBİDEN YILDIZ")               */}
        {/* ========================================================= */}
        <g className="stellar-core-group" transform="translate(0, 0)">
          {/* Outer Atmospheric Corona */}
          <circle
            cx="330"
            cy="240"
            r="195"
            fill="url(#stellar-outer-corona)"
            className="stellar-outer-halo"
          />

          {/* Middle Energetic Corona */}
          <circle
            cx="330"
            cy="240"
            r="125"
            fill="url(#stellar-mid-corona)"
            className="stellar-mid-halo"
          />

          {/* Astronomical Diffraction Spikes (Telescopic Star Flares) */}
          <g className="stellar-diffraction-spikes">
            {/* Major Vertical Spike */}
            <line
              x1="330"
              y1="30"
              x2="330"
              y2="450"
              stroke="url(#spike-vertical)"
              strokeWidth="1.5"
            />
            {/* Tapered Vertical Diamond Flare */}
            <polygon
              points="330,140 334,240 330,340 326,240"
              fill="url(#spike-vertical)"
              opacity="0.8"
            />

            {/* Major Horizontal Spike */}
            <line
              x1="70"
              y1="240"
              x2="590"
              y2="240"
              stroke="url(#spike-horizontal)"
              strokeWidth="1.5"
            />
            {/* Tapered Horizontal Diamond Flare */}
            <polygon
              points="230,240 330,244 430,240 330,236"
              fill="url(#spike-horizontal)"
              opacity="0.8"
            />

            {/* Diagonal Secondary Diamond Spikes (45 degrees) */}
            <line
              x1="225"
              y1="135"
              x2="435"
              y2="345"
              stroke="url(#spike-diagonal-1)"
              strokeWidth="1"
            />
            <line
              x1="225"
              y1="345"
              x2="435"
              y2="135"
              stroke="url(#spike-diagonal-2)"
              strokeWidth="1"
            />
          </g>

          {/* Celestial Telemetry Coordinate Ring (Rotates slowly) */}
          <g className="stellar-coordinate-ring" transform-origin="330 240">
            <circle
              cx="330"
              cy="240"
              r="102"
              fill="none"
              stroke="#ffffff"
              strokeWidth="1"
              strokeDasharray="2 7"
              opacity="0.32"
            />
            {/* 8 Cardinal Navigation Marks */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                x1="330"
                y1="134"
                x2="330"
                y2="139"
                stroke="#ffffff"
                strokeWidth="1.2"
                opacity="0.6"
                transform={`rotate(${deg} 330 240)`}
              />
            ))}
          </g>

          {/* Inner Dense Star Plasma */}
          <circle
            cx="330"
            cy="240"
            r="72"
            fill="url(#stellar-core-dense)"
            className="stellar-plasma-core"
          />

          {/* Core Solid Celestial Body & Rim */}
          <circle
            cx="330"
            cy="240"
            r="64"
            fill="#000000"
            stroke="#ffffff"
            strokeWidth="1.6"
            className="stellar-core-disc"
          />
          <circle
            cx="330"
            cy="240"
            r="60"
            fill="none"
            stroke="#ffffff"
            strokeWidth="0.8"
            opacity="0.4"
          />

          {/* Star Core Emblem (YRT Star Icon) */}
          <image
            href="/brand/yrt.png"
            x="276"
            y="186"
            width="108"
            height="108"
            preserveAspectRatio="xMidYMid meet"
            className="stellar-emblem"
          />
        </g>

        {/* ========================================================= */}
        {/* ORBITAL APPLICATION STATIONS                              */}
        {/* ========================================================= */}

        {/* 1. STARDROP (Upper Left) */}
        <OrbitalStationNode
          x={130}
          y={105}
          name="STARDROP"
          subtitle="TASARIM SİSTEMİ"
          isTarget={isStardropTarget}
          leaderPath="M 0 0 L -25 -25 L -85 -25"
          labelX={-85}
          labelY={-34}
          textAnchor="start"
          badgeX={-85}
          badgeY={-60}
          logoUrl={findLogo("STARDROP", 0)}
          iconType="star"
        />

        {/* 2. STARLAB (Mid Right) */}
        <OrbitalStationNode
          x={530}
          y={180}
          name="STARLAB"
          subtitle="UÇUŞ SİMÜLASYONU"
          isTarget={isStarlabTarget}
          leaderPath="M 0 0 L 25 -25 L 90 -25"
          labelX={90}
          labelY={-34}
          textAnchor="end"
          badgeX={-70}
          badgeY={-60}
          logoUrl={findLogo("STARLAB", 1)}
          iconType="rocket"
        />

        {/* 3. YRT TAKVİM (Bottom Center-Right) */}
        <OrbitalStationNode
          x={355}
          y={415}
          name="YRT TAKVİM"
          subtitle="TEST TAKVİMİ"
          isTarget={isTakvimTarget}
          leaderPath="M 0 0 L 28 22 L 95 22"
          labelX={95}
          labelY={14}
          textAnchor="end"
          badgeX={-65}
          badgeY={-12}
          logoUrl={findLogo("TAKVİM", 2) || findLogo("TAKVIM", 2)}
          iconType="calendar"
        />

        {/* 4. SLOT 4: TARGET APP or YRT LATEX (Lower Left) */}
        <OrbitalStationNode
          x={140}
          y={335}
          name={slot4Name}
          subtitle={
            isSlot4Target
              ? "Starbase oturumu ile bağlanılıyor"
              : "TEKNİK RAPORLAMA"
          }
          isTarget={isSlot4Target}
          leaderPath="M 0 0 L -25 24 L -85 24"
          labelX={-85}
          labelY={14}
          textAnchor="start"
          badgeX={-85}
          badgeY={-12}
          logoUrl={slot4Logo}
          iconType="satellite"
        />
      </svg>
    </figure>
  );
}

/** Individual Orbital Application Node with HUD & Radar Locking */
function OrbitalStationNode({
  x,
  y,
  name,
  subtitle,
  isTarget,
  leaderPath,
  labelX,
  labelY,
  textAnchor,
  badgeX,
  badgeY,
  logoUrl,
  iconType,
}: {
  x: number;
  y: number;
  name: string;
  subtitle: string;
  isTarget: boolean;
  leaderPath: string;
  labelX: number;
  labelY: number;
  textAnchor: "start" | "end";
  badgeX: number;
  badgeY: number;
  logoUrl?: string;
  iconType: "star" | "rocket" | "calendar" | "satellite";
}) {
  return (
    <g
      className={`orbital-station ${isTarget ? "is-target-locked" : ""}`}
      transform={`translate(${x} ${y})`}
    >
      {/* Sonar Beacon Ring (Target lock animation) */}
      <circle className="station-beacon" r="24" />
      {isTarget && (
        <>
          <circle className="station-sonar-ping station-sonar-1" r="24" />
          <circle className="station-sonar-ping station-sonar-2" r="24" />
        </>
      )}

      {/* Target Reticle Crosshair & HUD Brackets */}
      {isTarget && (
        <g className="target-reticle-group">
          {/* Outer rotating dashed lock ring */}
          <circle className="reticle-ring-dash" r="35" />
          {/* Inner counter-rotating ring */}
          <circle className="reticle-ring-inner" r="30" />
          {/* 4 Crosshair Aim Ticks */}
          <path
            d="M -41 0 h 7 M 34 0 h 7 M 0 -41 v 7 M 0 34 v 7"
            className="reticle-cross-ticks"
          />
          {/* 4 Corner L-Brackets */}
          <path
            d="M -26 -33 h -6 v 6 M 26 -33 h 6 v 6 M -26 33 h -6 v -6 M 26 33 h 6 v -6"
            className="reticle-corner-brackets"
          />
        </g>
      )}

      {/* Connecting Leader Line */}
      <path className="station-leader" d={leaderPath} />

      {/* Station Node Body (Dark disc with crisp border) */}
      <circle className="station-core-node" r="22" />

      {/* Node Emblem / Icon */}
      {logoUrl ? (
        <image
          className="station-logo"
          href={logoUrl}
          x="-15"
          y="-15"
          width="30"
          height="30"
          preserveAspectRatio="xMidYMid meet"
          onError={(e) => {
            // If image fails to load, hide image and fallback to icon
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <StationIcon iconType={iconType} />
      )}

      {/* Target Indicator HUD Badge */}
      {isTarget && (
        <g
          className="target-hud-badge-group"
          transform={`translate(${labelX + (textAnchor === "end" ? badgeX : 0)} ${labelY + badgeY})`}
        >
          <rect
            className="target-hud-rect"
            x="0"
            y="0"
            width="168"
            height="18"
            rx="2"
          />
          <circle className="target-hud-dot" cx="10" cy="9" r="3" />
          <text className="target-hud-text" x="20" y="12.5">
            GİRİŞ YAPILAN UYGULAMA
          </text>
        </g>
      )}

      {/* Labels & Telemetry */}
      <g
        className="station-telemetry"
        transform={`translate(${labelX} ${labelY})`}
        textAnchor={textAnchor}
      >
        <text className="station-title" x="0" y="0">
          {name}
        </text>
        <text className="station-subtitle" x="0" y="16">
          {subtitle}
        </text>
      </g>
    </g>
  );
}

/** Vector icons for orbital stations */
function StationIcon({
  iconType,
}: {
  iconType: "star" | "rocket" | "calendar" | "satellite";
}) {
  if (iconType === "star") {
    // Geometric octagram star
    return (
      <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
        <polygon points="0,-12 3,-3 12,0 3,3 0,12 -3,3 -12,0 -3,-3" fill="#ffffff" fillOpacity="0.2" />
        <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
      </g>
    );
  }
  if (iconType === "rocket") {
    // Sleek rocket silhouette
    return (
      <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
        <path d="M 0 -13 C 4 -7 5 3 4 10 L -4 10 C -5 3 -4 -7 0 -13 Z" fill="#ffffff" fillOpacity="0.15" />
        <path d="M -4 6 L -9 11 L -4 10 M 4 6 L 9 11 L 4 10" />
        <circle cx="0" cy="-2" r="1.8" fill="#ffffff" />
      </g>
    );
  }
  if (iconType === "calendar") {
    // Orbital schedule grid
    return (
      <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
        <rect x="-9" y="-8" width="18" height="17" rx="1.5" fill="#ffffff" fillOpacity="0.15" />
        <line x1="-9" y1="-3" x2="9" y2="-3" />
        <line x1="-5" y1="-11" x2="-5" y2="-8" />
        <line x1="5" y1="-11" x2="5" y2="-8" />
        <circle cx="-3" cy="2" r="1" fill="#ffffff" />
        <circle cx="3" cy="2" r="1" fill="#ffffff" />
        <circle cx="0" cy="5" r="1" fill="#ffffff" />
      </g>
    );
  }
  // Default: Satellite with solar panels
  return (
    <g className="station-vector-icon" fill="none" stroke="#ffffff" strokeWidth="1.2">
      <rect x="-5" y="-7" width="10" height="14" rx="1" fill="#ffffff" fillOpacity="0.2" />
      <path d="M -16 -4 h 9 v 8 h -9 Z M 7 -4 h 9 v 8 h -9 Z" fill="#ffffff" fillOpacity="0.1" />
      <line x1="-5" y1="0" x2="-7" y2="0" />
      <line x1="5" y1="0" x2="7" y2="0" />
      <line x1="0" y1="-7" x2="0" y2="-11" />
      <circle cx="0" cy="-11" r="1" fill="#ffffff" />
    </g>
  );
}
