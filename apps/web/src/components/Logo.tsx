interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 48, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logo-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#B388FF"/>
          <stop offset="100%" stopColor="#6B21E8"/>
        </linearGradient>
        <linearGradient id="logo-bolt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F5C842"/>
          <stop offset="100%" stopColor="#F07A3E"/>
        </linearGradient>
        <linearGradient id="logo-handle" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE08A"/>
          <stop offset="100%" stopColor="#F07A3E"/>
        </linearGradient>
        <filter id="logo-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <rect x="4" y="4" width="92" height="92" rx="24" fill="url(#logo-body)"/>
      <rect x="10" y="10" width="80" height="80" rx="19" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5"/>

      <circle cx="50" cy="50" r="28" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5"/>
      <circle cx="50" cy="50" r="20" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>

      <rect x="44" y="10" width="12" height="9" rx="3.5" fill="url(#logo-bolt)" filter="url(#logo-glow)"/>
      <rect x="44" y="81" width="12" height="9" rx="3.5" fill="url(#logo-bolt)" filter="url(#logo-glow)"/>
      <rect x="10" y="44" width="9" height="12" rx="3.5" fill="url(#logo-bolt)" filter="url(#logo-glow)"/>
      <rect x="81" y="44" width="9" height="12" rx="3.5" fill="url(#logo-bolt)" filter="url(#logo-glow)"/>

      <line x1="50" y1="25" x2="50" y2="29" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="50" y1="71" x2="50" y2="75" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="25" y1="50" x2="29" y2="50" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="71" y1="50" x2="75" y2="50" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round"/>

      <circle cx="50" cy="50" r="12" fill="url(#logo-handle)" filter="url(#logo-glow)"/>
      <circle cx="50" cy="50" r="12" stroke="rgba(255,255,255,0.25)" strokeWidth="1"/>
      <circle cx="50" cy="50" r="4.5" fill="rgba(255,255,255,0.30)"/>
      <circle cx="50" cy="50" r="2" fill="rgba(255,255,255,0.55)"/>
      <line x1="50" y1="41" x2="50" y2="45" stroke="rgba(80,30,0,0.4)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
