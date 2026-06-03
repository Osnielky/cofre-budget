import Image from 'next/image';

interface LogoProps {
  size?: number;
  className?: string;
}

export default function Logo({ size = 48, className }: LogoProps) {
  return (
    <Image
      src="/logo-chest.png"
      alt="Cofre"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: '50%', objectFit: 'cover' }}
      priority
      unoptimized
    />
  );
}
