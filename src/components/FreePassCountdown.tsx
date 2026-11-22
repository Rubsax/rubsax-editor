'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Clock, Sparkles } from 'lucide-react';

interface FreePassCountdownProps {
  targetIso: string;
  mode: 'active' | 'cooldown';
  className?: string;
  onExpire?: () => void;
}

function formatRemaining(diffMs: number): string {
  if (diffMs <= 0) return '0s';
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours >= 1) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export default function FreePassCountdown({
  targetIso,
  mode,
  className = '',
  onExpire,
}: FreePassCountdownProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const expiredFiredRef = useRef<boolean>(false);

  useEffect(() => {
    expiredFiredRef.current = false;
    setNowMs(Date.now());
  }, [targetIso]);

  const parsedTargetMs = new Date(targetIso).getTime();
  const isSubHour =
    Number.isFinite(parsedTargetMs) &&
    parsedTargetMs - nowMs > 0 &&
    parsedTargetMs - nowMs < 3600_000;

  useEffect(() => {
    const targetMs = new Date(targetIso).getTime();
    if (!Number.isFinite(targetMs)) return;

    const tick = () => {
      const current = Date.now();
      setNowMs(current);
      if (targetMs - current <= 0 && !expiredFiredRef.current) {
        expiredFiredRef.current = true;
        onExpire?.();
      }
    };

    const diffMs = targetMs - Date.now();
    if (diffMs <= 0) {
      if (!expiredFiredRef.current) {
        expiredFiredRef.current = true;
        onExpire?.();
      }
      return;
    }

    // Atualiza a cada segundo na última hora, ou a cada 30s acima de 1h
    const intervalMs = diffMs < 3600_000 ? 1000 : 30_000;
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [targetIso, isSubHour, onExpire]);

  const targetMs = new Date(targetIso).getTime();
  const diffMs = Number.isFinite(targetMs) ? Math.max(0, targetMs - nowMs) : 0;

  if (diffMs <= 0) {
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono font-bold ${className}`}>
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>
          {mode === 'active'
            ? 'Passe Gratuito expirado'
            : 'Passe Gratuito disponível agora!'}
        </span>
      </span>
    );
  }

  const formatted = formatRemaining(diffMs);

  if (mode === 'active') {
    return (
      <span className={`inline-flex items-center gap-1.5 font-semibold ${className}`}>
        <Sparkles className="w-3.5 h-3.5 shrink-0" />
        <span>
          Passe Gratuito ativo • <strong className="font-mono">{formatted}</strong> restantes
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${className}`}>
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>
        Próxima transposição gratuita em <strong className="font-mono">{formatted}</strong>
      </span>
    </span>
  );
}
