'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Clock, Sparkles } from 'lucide-react';

interface FreePassCountdownProps {
  targetIso: string;
  mode: 'active' | 'cooldown';
  className?: string;
  onExpire?: () => void;
}

function formatActiveRemaining(diffMs: number): string {
  if (diffMs <= 0) return '0m 00s';
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatCooldownMessage(diffMs: number): string {
  if (diffMs >= 24 * 3600 * 1000) {
    const days = Math.ceil(diffMs / 86_400_000);
    return `Sua partitura volta a ficar grátis em ${days} ${days === 1 ? 'dia' : 'dias'}`;
  }
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours >= 1) {
    return `Sua partitura volta a ficar grátis em ${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `Sua partitura volta a ficar grátis em ${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export default function FreePassCountdown({
  targetIso,
  mode,
  className = '',
  onExpire,
}: FreePassCountdownProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const expiredFiredRef = useRef<boolean>(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    expiredFiredRef.current = false;
    setNowMs(Date.now());

    const targetMs = new Date(targetIso).getTime();
    if (!Number.isFinite(targetMs)) return;

    const tick = () => {
      const current = Date.now();
      setNowMs(current);
      if (targetMs - current <= 0 && !expiredFiredRef.current) {
        expiredFiredRef.current = true;
        onExpireRef.current?.();
      }
    };

    if (targetMs - Date.now() <= 0) {
      if (!expiredFiredRef.current) {
        expiredFiredRef.current = true;
        onExpireRef.current?.();
      }
      return;
    }

    const id = setInterval(tick, 1000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [targetIso]);

  const targetMs = new Date(targetIso).getTime();
  const diffMs = Number.isFinite(targetMs) ? Math.max(0, targetMs - nowMs) : 0;

  if (diffMs <= 0) {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono font-bold tabular-nums ${className}`}>
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>
          {mode === 'active'
            ? 'Passe Gratuito expirado'
            : 'Passe Gratuito disponível agora!'}
        </span>
      </span>
    );
  }

  if (mode === 'active') {
    return (
      <span className={`inline-flex items-center gap-1.5 font-semibold ${className}`}>
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        <span>
          Passe Gratuito ativo •{' '}
          <strong className="font-mono tabular-nums">{formatActiveRemaining(diffMs)}</strong>{' '}
          restantes
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold tabular-nums ${className}`}>
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>{formatCooldownMessage(diffMs)}</span>
    </span>
  );
}
