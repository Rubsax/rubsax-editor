'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isOfficialDemoHash } from '@/lib/demo-score';
import {
  type SavedWorkspaceSession,
  deleteRecentProject,
  getActiveTabProjectHash,
  loadRecentProjects,
  setActiveTabProjectHash,
} from '@/lib/workspace-storage';
import { Clock, FolderOpen, Loader2, Music, Trash2 } from 'lucide-react';

interface RecentProjectsPanelProps {
  projectsOverride?: SavedWorkspaceSession[];
  onOpenProject?: (project: SavedWorkspaceSession) => void;
  onProjectsChanged?: (updated: SavedWorkspaceSession[]) => void;
  onGoToEditor?: () => void;
}

function formatSavedDateLabel(ts: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function RecentProjectsPanel({
  projectsOverride,
  onOpenProject,
  onProjectsChanged,
  onGoToEditor,
}: RecentProjectsPanelProps) {
  const router = useRouter();
  const [localProjects, setLocalProjects] = useState<SavedWorkspaceSession[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(!projectsOverride);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (projectsOverride) {
      setLoadingList(false);
      return;
    }
    let cancelled = false;
    setLoadingList(true);
    void loadRecentProjects()
      .then((list) => {
        if (cancelled) return;
        setLocalProjects(list.filter((p) => !isOfficialDemoHash(p.fileHash)));
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectsOverride]);

  const projects = useMemo(
    () =>
      (projectsOverride ?? localProjects).filter(
        (p) => !isOfficialDemoHash(p.fileHash)
      ),
    [projectsOverride, localProjects]
  );

  const handleOpen = (proj: SavedWorkspaceSession) => {
    const key = proj.fileHash || `name:${proj.fileName}`;
    if (busyKey) return;
    setBusyKey(key);
    if (onOpenProject) {
      onOpenProject(proj);
      return;
    }
    setActiveTabProjectHash(key);
    router.push('/?view=editor');
  };

  const handleDelete = async (proj: SavedWorkspaceSession) => {
    const key = proj.fileHash || `name:${proj.fileName}`;
    if (busyKey) return;
    setBusyKey(key);
    try {
      const updated = (await deleteRecentProject(key)).filter(
        (p) => !isOfficialDemoHash(p.fileHash)
      );
      if (getActiveTabProjectHash() === key || getActiveTabProjectHash() === proj.fileHash) {
        setActiveTabProjectHash(null);
      }
      setLocalProjects(updated);
      onProjectsChanged?.(updated);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-studio-950 border border-zinc-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-sax-400 shrink-0" />
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-sax-400">
            Meus Projetos (neste dispositivo)
          </span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
          {projects.length}/5 salvos
        </span>
      </div>

      <p className="text-[11px] text-zinc-400 leading-relaxed">
        Os últimos 5 arquivos que você editou ficam guardados localmente neste navegador para
        reabrir instantaneamente com suas transposições, quebras e cifras preservadas.
      </p>

      {loadingList ? (
        <div className="py-6 flex items-center justify-center gap-2 text-xs text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin text-sax-400" />
          <span>Carregando projetos salvos...</span>
        </div>
      ) : projects.length === 0 ? (
        <div className="p-5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center space-y-3">
          <Music className="w-6 h-6 text-zinc-500 mx-auto" />
          <p className="text-xs text-zinc-400">
            Nenhum projeto salvo neste dispositivo ainda. Envie uma partitura no Editor para ela
            aparecer aqui automaticamente.
          </p>
          <button
            type="button"
            onClick={() => {
              if (onGoToEditor) {
                onGoToEditor();
              } else {
                router.push('/?view=editor');
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sax-500 hover:bg-sax-400 text-studio-950 text-xs font-extrabold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Ir para o Editor</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.map((proj) => {
            const pKey = proj.fileHash || `name:${proj.fileName}`;
            const displayTitle = proj.headers?.title?.text?.trim() || proj.fileName;
            const isBusy = busyKey === pKey;

            return (
              <div
                key={pKey}
                className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 p-3 rounded-xl bg-studio-900 border border-zinc-800 hover:border-zinc-700 transition"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-zinc-100 truncate">{displayTitle}</p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {proj.fileName}
                    {proj.savedAt ? ` • Salvo em ${formatSavedDateLabel(proj.savedAt)}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={() => handleOpen(proj)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs font-extrabold disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    {isBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FolderOpen className="w-3.5 h-3.5" />
                    )}
                    <span>Abrir no Editor</span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={() => void handleDelete(proj)}
                    title="Excluir projeto deste dispositivo"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-950/70 hover:text-red-300 border border-zinc-700 hover:border-red-500/40 text-zinc-400 text-xs font-bold disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
