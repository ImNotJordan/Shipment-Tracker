export function GateMark() {
  return (
        <svg
          className="gate-mark"
          viewBox="0 0 340 340"
          role="img"
          aria-label="Shipment tracking mark"
        >
          <defs>
            <linearGradient id="chromeB" gradientUnits="userSpaceOnUse" x1="-20" y1="-102" x2="18" y2="-22">
              <stop offset="0" stopColor="#fdfdfe" />
              <stop offset="0.22" stopColor="#c6cbd1" />
              <stop offset="0.42" stopColor="#767d85" />
              <stop offset="0.58" stopColor="#eef1f4" />
              <stop offset="0.78" stopColor="#98a0a8" />
              <stop offset="1" stopColor="#565d64" />
            </linearGradient>
            <linearGradient id="redB" gradientUnits="userSpaceOnUse" x1="-20" y1="-102" x2="18" y2="-22">
              <stop offset="0" stopColor="#ff7a72" />
              <stop offset="0.26" stopColor="#d81f22" />
              <stop offset="0.5" stopColor="#7e0a10" />
              <stop offset="0.7" stopColor="#ff5a4e" />
              <stop offset="1" stopColor="#6d070c" />
            </linearGradient>
            <linearGradient id="arcB" gradientUnits="userSpaceOnUse" x1="46" y1="170" x2="232" y2="62">
              <stop offset="0" stopColor="#b81318" />
              <stop offset="1" stopColor="#f0362c" />
            </linearGradient>
            <filter id="softB" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0b1116" floodOpacity="0.26" />
            </filter>
          </defs>

          <circle
            className="mark-ring"
            cx="170"
            cy="170"
            r="124"
            fill="none"
            stroke="#aab1b9"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray="0.1 19"
          />

          <path
            className="mark-route"
            pathLength="100"
            d="M46,170 A124,124 0 0 1 232,62.6"
            fill="none"
            stroke="url(#arcB)"
            strokeWidth="7"
            strokeLinecap="round"
          />

          <circle className="mark-origin" cx="46" cy="170" r="8" fill="#8d949c" />

          <g className="mark-dest">
            <circle cx="232" cy="62.6" r="13" fill="url(#arcB)" />
            <circle cx="232" cy="62.6" r="4.5" fill="#ffffff" />
          </g>

          <g className="mark-bloom">
            <g
              className="mark-petals"
              transform="translate(170,170) scale(0.85)"
              fill="none"
              strokeWidth="12"
              strokeLinejoin="round"
              filter="url(#softB)"
            >
            <path
              d="M0,-22 C-24,-48 -24,-80 0,-102 C24,-80 24,-48 0,-22 Z"
              stroke="url(#chromeB)"
              transform="rotate(0)"
            />
            <path
              d="M0,-22 C-24,-48 -24,-80 0,-102 C24,-80 24,-48 0,-22 Z"
              stroke="url(#chromeB)"
              transform="rotate(72)"
            />
            <path
              d="M0,-22 C-24,-48 -24,-80 0,-102 C24,-80 24,-48 0,-22 Z"
              stroke="url(#chromeB)"
              transform="rotate(144)"
            />
            <path
              d="M0,-22 C-24,-48 -24,-80 0,-102 C24,-80 24,-48 0,-22 Z"
              stroke="url(#chromeB)"
              transform="rotate(216)"
            />
            <path
              d="M0,-22 C-24,-48 -24,-80 0,-102 C24,-80 24,-48 0,-22 Z"
              stroke="url(#redB)"
              transform="rotate(288)"
            />
            </g>
          </g>
        </svg>
  );
}
