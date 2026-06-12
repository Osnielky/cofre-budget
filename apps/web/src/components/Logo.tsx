interface LogoProps {
  size?: number;
  className?: string;
}

/* Provisional brand mark — minimal golden chest (cofre) */
export default function Logo({ size = 48, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="Cofre"
    >
      {/* domed lid */}
      <path d="M3.5 10.5V9A5.5 5.5 0 0 1 9 3.5h6A5.5 5.5 0 0 1 20.5 9v1.5" />
      {/* body */}
      <rect x="3.5" y="10.5" width="17" height="10" rx="1.8" />
      {/* clasp over the seam */}
      <rect x="10" y="8.6" width="4" height="4.8" rx="1.1" />
      {/* keyhole */}
      <path d="M12 14.8v1.7" />
    </svg>
  );
}
