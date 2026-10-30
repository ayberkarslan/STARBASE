/** Team identity at the center of the shared application ecosystem. */
export function OrbitalIdentity() {
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
        <g className="orbital-satellite" transform="translate(111 89)">
          <path className="satellite-leader" d="M0 0l-19-19h-38" />
          <g transform="rotate(-26)">
            <path d="M-19-5h11v10h-11zm27 0h11v10H8z" />
            <rect x="-5" y="-8" width="10" height="16" rx="1" />
            <path d="M-8 0h3m10 0h3M0-8v-5m0 0 4-3" />
          </g>
          <text x="-58" y="-29">
            STARDROP
          </text>
          <circle className="satellite-beacon" r="25" />
        </g>
        <g className="orbital-satellite" transform="translate(465 168)">
          <path className="satellite-leader" d="M0 0l18-21h30" />
          <g transform="rotate(26)">
            <path d="M-19-5h11v10h-11zm27 0h11v10H8z" />
            <rect x="-5" y="-8" width="10" height="16" rx="1" />
            <path d="M-8 0h3m10 0h3M0-8v-5m0 0 4-3" />
          </g>
          <text x="48" y="-32" textAnchor="end">
            STARLAB
          </text>
          <circle className="satellite-beacon" r="25" />
        </g>
        <g className="orbital-satellite" transform="translate(273 369)">
          <path className="satellite-leader" d="M0 0l-28-20h-58" />
          <g transform="rotate(-8)">
            <path d="M-19-5h11v10h-11zm27 0h11v10H8z" />
            <rect x="-5" y="-8" width="10" height="16" rx="1" />
            <path d="M-8 0h3m10 0h3M0-8v-5m0 0 4-3" />
          </g>
          <text x="-137" y="-29">
            YRT TAKVİM
          </text>
          <circle className="satellite-beacon" r="25" />
        </g>
      </svg>
    </figure>
  );
}
