'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBackTarget, recordInternalRoute } from '@/lib/nav-history';
import { ArrowLeft } from 'lucide-react';

interface SmartBackButtonProps {
  currentPath: string;
  label?: string;
  fallbackHref?: string;
  className?: string;
}

export default function SmartBackButton({
  currentPath,
  label = 'Voltar',
  fallbackHref = '/?view=editor',
  className = 'inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-sax-400 hover:text-sax-300 transition',
}: SmartBackButtonProps) {
  const router = useRouter();

  useEffect(() => {
    recordInternalRoute(currentPath);
  }, [currentPath]);

  const handleBack = () => {
    const target = getBackTarget(currentPath, fallbackHref);
    router.push(target);
  };

  return (
    <button type="button" onClick={handleBack} className={className}>
      <ArrowLeft className="w-4 h-4 shrink-0" />
      <span>{label}</span>
    </button>
  );
}
