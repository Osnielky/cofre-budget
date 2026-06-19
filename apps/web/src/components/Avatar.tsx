'use client';

import { useState } from 'react';

interface AvatarProps {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  /** Pixel size of the (square) avatar. */
  size?: number;
  /** Override the corner radius. Defaults to a rounded-square. */
  rounded?: number | string;
  className?: string;
}

/**
 * Renders the user's picture (e.g. their Google photo) when available,
 * falling back to an initials chip when there's no image or it fails to load.
 */
export default function Avatar({ name, email, src, size = 32, rounded, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  const display  = name || email?.split('@')[0] || '';
  const initials  = display.slice(0, 2).toUpperCase() || '?';
  const radius    = rounded ?? Math.round(size * 0.3);

  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    overflow: 'hidden',
  };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={display || 'Avatar'}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={className}
        style={{ ...base, objectFit: 'cover' }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        ...base,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 900,
        fontSize: Math.round(size * 0.4),
        color: '#fff',
        background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-violet) 100%)',
      }}
    >
      {initials}
    </div>
  );
}
