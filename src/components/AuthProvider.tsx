'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import type { AccessLevel, FreePassStatus } from '@/lib/access';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/lib/settings';
import type { SingleUnlockRow, SubscriptionRow } from '@/lib/supabase/admin';
import type { ClientAuthUser } from '@/lib/supabase/client';

export interface InitialAuthPayload {
  user: ClientAuthUser | null;
  isDev: boolean;
  accessLevel: AccessLevel;
  activeSubscription: SubscriptionRow | null;
  activeSingleUnlocks: SingleUnlockRow[];
  freePassStatus: FreePassStatus | null;
  settings: AppSettings;
}

interface AuthContextValue extends InitialAuthPayload {
  isAuthLoading: boolean;
  refreshAuth: (fileHash?: string) => Promise<InitialAuthPayload | null>;
  setAuthUserImmediate: (user: ClientAuthUser | null) => void;
  clearAuthSession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mergeSafeSettings(prev: AppSettings, incoming?: Partial<AppSettings> | null): AppSettings {
  if (!incoming) return prev;
  return {
    ...prev,
    pricing: incoming.pricing || prev.pricing,
    paywall: incoming.paywall || prev.paywall,
    announcement: incoming.announcement || prev.announcement,
    operations: { ...prev.operations, ...(incoming.operations || {}) },
    support_links: incoming.support_links || prev.support_links,
    tutorial: { ...prev.tutorial, ...(incoming.tutorial || {}) },
    free_pass: { ...prev.free_pass, ...(incoming.free_pass || {}) },
  };
}

export function AuthProvider({
  initialAuth,
  children,
}: {
  initialAuth: InitialAuthPayload;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<ClientAuthUser | null>(initialAuth.user);
  const [isDev, setIsDev] = useState<boolean>(initialAuth.isDev);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(initialAuth.accessLevel);
  const [activeSubscription, setActiveSubscription] = useState<SubscriptionRow | null>(
    initialAuth.activeSubscription
  );
  const [activeSingleUnlocks, setActiveSingleUnlocks] = useState<SingleUnlockRow[]>(
    initialAuth.activeSingleUnlocks
  );
  const [freePassStatus, setFreePassStatus] = useState<FreePassStatus | null>(
    initialAuth.freePassStatus
  );
  const [settings, setSettings] = useState<AppSettings>(initialAuth.settings);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(false);
  const settingsRef = React.useRef<AppSettings>(initialAuth.settings);
  settingsRef.current = settings;

  const refreshAuth = useCallback(async (fileHash?: string): Promise<InitialAuthPayload | null> => {
    setIsAuthLoading(true);
    try {
      const qs = fileHash ? `?fileHash=${encodeURIComponent(fileHash)}` : '';
      const res = await fetch(`/api/auth/me${qs}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();

      const nextUser: ClientAuthUser | null = data.user || null;
      const nextIsDev = Boolean(data.isDev);
      const nextAccessLevel: AccessLevel = data.access?.level || 'preview';
      const nextSub: SubscriptionRow | null = data.activeSubscription || null;
      const nextUnlocks: SingleUnlockRow[] = data.activeSingleUnlocks || [];
      const nextFreePass: FreePassStatus | null = data.freePassStatus || null;

      setUser(nextUser);
      setIsDev(nextIsDev);
      setAccessLevel(nextAccessLevel);
      setActiveSubscription(nextSub);
      setActiveSingleUnlocks(nextUnlocks);
      setFreePassStatus(nextFreePass);

      const nextSettings = mergeSafeSettings(settingsRef.current, data.settings);
      settingsRef.current = nextSettings;
      setSettings(nextSettings);

      return {
        user: nextUser,
        isDev: nextIsDev,
        accessLevel: nextAccessLevel,
        activeSubscription: nextSub,
        activeSingleUnlocks: nextUnlocks,
        freePassStatus: nextFreePass,
        settings: nextSettings,
      };
    } catch {
      return null;
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const setAuthUserImmediate = useCallback((nextUser: ClientAuthUser | null) => {
    setUser(nextUser);
  }, []);

  const clearAuthSession = useCallback(() => {
    setUser(null);
    setIsDev(false);
    setAccessLevel('preview');
    setActiveSubscription(null);
    setActiveSingleUnlocks([]);
    setFreePassStatus(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isDev,
        accessLevel,
        activeSubscription,
        activeSingleUnlocks,
        freePassStatus,
        settings,
        isAuthLoading,
        refreshAuth,
        setAuthUserImmediate,
        clearAuthSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      isDev: false,
      accessLevel: 'preview',
      activeSubscription: null,
      activeSingleUnlocks: [],
      freePassStatus: null,
      settings: DEFAULT_APP_SETTINGS,
      isAuthLoading: false,
      refreshAuth: async () => null,
      setAuthUserImmediate: () => {},
      clearAuthSession: () => {},
    };
  }
  return ctx;
}
