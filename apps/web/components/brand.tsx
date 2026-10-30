import Image from 'next/image';

export function BrandLogo({ className }: { className?: string }) {
  return <Image src="/brand/altikod-logo.png" alt="Altıkod Digital Solutions" width={563} height={285} loading="eager" className={className} />;
}
