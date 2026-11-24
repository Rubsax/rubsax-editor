'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  TONALITIES,
  getInstrumentById,
  getTonalityByPitchClass,
} from '@/lib/music/constants';
import {
  FloatingTextBox,
  ScoreAnalysis,
  ScoreHeadersState,
  ScoreLayoutViewMode,
  ScoreTransformOptions,
  TransformResult,
  UNSUPPORTED_FORMAT_MESSAGE,
  analyzeScoreXml,
  transformScoreXml,
  unpackScoreBuffer,
  validateUploadFileName,
} from '@/lib/music/mscz-engine';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@/lib/settings';
import type { SingleUnlockRow, SubscriptionRow } from '@/lib/supabase/admin';
import {
  type ClientAuthUser,
  computeFileSha256Hex,
  signOutUser,
} from '@/lib/supabase/client';
import type { AccessLevel, FreePassStatus } from '@/lib/access';
import ScoreViewer, { CanvasThemeMode, ScoreLoadingReason } from './ScoreViewer';
import EcosystemFooter from './EcosystemFooter';
import AuthModal from './AuthModal';
import PlansModal, { type PlanCheckoutKind } from './PlansModal';
import AccountModal from './AccountModal';
import TutorialModal from './TutorialModal';
import { extractYouTubeVideoId, getYouTubeEmbedUrl, getYouTubeWatchUrl } from '@/lib/youtube';
import {
  type SavedWorkspaceSession,
  deleteRecentProject,
  getActiveTabProjectHash,
  loadRecentProjects,
  saveWorkspaceSession,
  setActiveTabProjectHash,
} from '@/lib/workspace-storage';
import {
  DEMO_SCORE_FILE_NAME,
  DEMO_SCORE_PUBLIC_URL,
  isOfficialDemoHash,
} from '@/lib/demo-score';
import { recordInternalRoute } from '@/lib/nav-history';
import { useAuth } from './AuthProvider';
import FreePassCountdown from './FreePassCountdown';
import {
  Upload,
  FileDown,
  Plus,
  Minus,
  Eye,
  EyeOff,
  Type,
  Sliders,
  AlertCircle,
  Check,
  RotateCcw,
  Layers,
  Trash2,
  RefreshCw,
  Loader2,
  FolderOpen,
  Edit3,
  Move,
  FileText,
  BookOpen,
  ShoppingCart,
  SplitSquareVertical,
  Scaling,
  ShieldAlert,
  LogIn,
  Crown,
  User,
  Shield,
  Lock,
  Megaphone,
  Wrench,
  X,
  PlayCircle,
  Music,
  ExternalLink,
  HelpCircle,
  ChevronDown,
  Clock,
  CreditCard,
  FileSpreadsheet,
  Sparkles,
} from 'lucide-react';

const LOCKED_PRO_BANNER_TEXT =
  'Recurso PRO (Avulso ou Mensal) • O Modo Gratuito libera Transposição, Oitava e Quebras';

type SystemBreakMode = 'initial' | 'auto' | 'every-x' | 'custom';
type MobileTabId = 'transpose' | 'display' | 'headers' | 'layout' | 'staves';

const STAFF_SCALE_PILLS = [80, 85, 90, 95, 100, 105, 110] as const;

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export default function RubsaxWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    user: ctxAuthUser,
    isDev: ctxIsDev,
    accessLevel: ctxAccessLevel,
    activeSubscription: ctxActiveSubscription,
    activeSingleUnlocks: ctxActiveSingleUnlocks,
    freePassStatus: ctxFreePassStatus,
    settings: ctxAppSettings,
    refreshAuth,
    setAuthUserImmediate,
    clearAuthSession,
  } = useAuth();

  // Aceite obrigatório de Direitos Autorais (persistido em localStorage)
  const [copyrightAccepted, setCopyrightAccepted] = useState<boolean>(false);
  const [copyrightError, setCopyrightError] = useState<boolean>(false);

  // Sessão Auth, Modo Dev, Configurações Dinâmicas & Controle de Acesso (já hidratados no servidor via AuthProvider)
  const [authUser, setAuthUser] = useState<ClientAuthUser | null>(ctxAuthUser);
  const [isDev, setIsDev] = useState<boolean>(ctxIsDev);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(ctxAccessLevel);
  const [activeSubscription, setActiveSubscription] = useState<SubscriptionRow | null>(
    ctxActiveSubscription
  );
  const [activeSingleUnlocks, setActiveSingleUnlocks] = useState<SingleUnlockRow[]>(
    ctxActiveSingleUnlocks
  );
  const [freePassStatus, setFreePassStatus] = useState<FreePassStatus | null>(
    ctxFreePassStatus
  );
  const [isClaimingFreePass, setIsClaimingFreePass] = useState<boolean>(false);
  const [freePassError, setFreePassError] = useState<string | null>(null);
  const [plansModalReason, setPlansModalReason] = useState<'fullscreen' | 'pro' | 'default'>(
    'default'
  );
  const [appSettings, setAppSettings] = useState<AppSettings>(ctxAppSettings);
  const [fileHash, setFileHash] = useState<string>('');
  const [viewerPreviewState, setViewerPreviewState] = useState<{
    isPreview: boolean;
    totalPages: number;
  }>({ isPreview: true, totalPages: 1 });
  const [devBadgeHidden, setDevBadgeHidden] = useState<boolean>(false);
  const [announcementDismissed, setAnnouncementDismissed] = useState<boolean>(false);
  const [userMenuOpen, setUserMenuOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [plansModalOpen, setPlansModalOpen] = useState<boolean>(false);
  const [accountModalOpen, setAccountModalOpen] = useState<boolean>(false);
  const [accountModalInitialTab, setAccountModalInitialTab] =
    useState<'account' | 'projects'>('account');
  const [tutorialModalOpen, setTutorialModalOpen] = useState<boolean>(false);
  const [isLoadingDemo, setIsLoadingDemo] = useState<boolean>(false);
  const [showDemoPdfBlockedModal, setShowDemoPdfBlockedModal] =
    useState<boolean>(false);
  const [pendingPlanIntent, setPendingPlanIntent] =
    useState<PlanCheckoutKind | null>(null);

  // Separação entre Tela Inicial ('welcome') e Área do Editor ('editor') + Projetos Recentes sob demanda
  const [workspaceView, setWorkspaceView] = useState<'welcome' | 'editor'>('welcome');
  const [loadingReason, setLoadingReason] = useState<ScoreLoadingReason>('initial');
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);
  const [recentProjects, setRecentProjects] = useState<SavedWorkspaceSession[]>([]);
  const [openingRecentHash, setOpeningRecentHash] = useState<string | null>(null);

  const fileHashRef = useRef<string>('');
  const accessLevelRef = useRef<AccessLevel>(ctxAccessLevel);
  const analysisRef = useRef<ScoreAnalysis | null>(null);
  const hasExplicitViewChoiceRef = useRef<boolean>(false);
  const isSessionHydratedRef = useRef<boolean>(false);
  const isUploadingLockRef = useRef<boolean>(false);
  const isExportingLockRef = useRef<boolean>(false);

  const tutorialVideoId = useMemo(() => {
    if (!appSettings.tutorial?.enabled) return null;
    return extractYouTubeVideoId(appSettings.tutorial.youtube_input || '');
  }, [appSettings.tutorial]);

  // Raw file state (Upload First: starts empty with no sample loaded)
  const [originalBase64, setOriginalBase64] = useState<string>('');
  const [originalMscx, setOriginalMscx] = useState<string>('');
  const [analysis, setAnalysis] = useState<ScoreAnalysis | null>(null);

  fileHashRef.current = fileHash;
  accessLevelRef.current = accessLevel;
  analysisRef.current = analysis;

  // Upload & Error feedback
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isLoadingFile, setIsLoadingFile] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Transform controls state (atualizados sincronamente em 0ms)
  const [semitoneShift, setSemitoneShift] = useState<number>(0);
  const [octaveShiftsByPart, setOctaveShiftsByPart] = useState<Record<string, number>>({});
  const [octaveBlockedWarning, setOctaveBlockedWarning] = useState<boolean>(false);
  const [targetInstrumentId, setTargetInstrumentId] = useState<string>('alto-sax');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>(['1']);
  const [viewMode, setViewMode] = useState<ScoreLayoutViewMode>('portrait');
  const [convertBbEbChordsToWritten, setConvertBbEbChordsToWritten] =
    useState<boolean>(false);
  const [showChords, setShowChords] = useState<boolean>(true);
  const [showLyrics, setShowLyrics] = useState<boolean>(true);
  const [headers, setHeaders] = useState<ScoreHeadersState>({
    showAllHeaders: true,
    title: { text: '', visible: true, removed: false },
    subtitle: { text: '', visible: true, removed: false },
    composer: { text: '', visible: true, removed: false, autoSyncInstrument: true },
    lyricist: { text: '', visible: true, removed: false, autoSyncPianoKey: true },
  });
  const [headerDrafts, setHeaderDrafts] = useState<{
    title: string;
    subtitle: string;
    composer: string;
    lyricist: string;
  }>({
    title: '',
    subtitle: '',
    composer: '',
    lyricist: '',
  });

  // Quebras (Compasso e Página em subgavetas retráteis) e Tamanho da Pauta (Escala <Spatium>)
  const [lineBreakMeasures, setLineBreakMeasures] = useState<number[]>([]);
  const [pageBreakMeasures, setPageBreakMeasures] = useState<number[]>([]);
  const [systemBreakMode, setSystemBreakMode] = useState<SystemBreakMode>('initial');
  const [measuresPerLineInput, setMeasuresPerLineInput] = useState<number>(4);
  const [selectedPageBreakMeasureInput, setSelectedPageBreakMeasureInput] = useState<number>(1);
  const [openSystemAccordions, setOpenSystemAccordions] = useState<{
    line: boolean;
    page: boolean;
  }>({
    line: true,
    page: false,
  });
  const [staffScalePercent, setStaffScalePercent] = useState<number>(100);

  // Edição de Cifras Existentes (duas caixas simultâneas) & Caixas de Texto Flutuantes
  const [chordOverrides, setChordOverrides] = useState<Record<string, string>>({});
  const [selectedChordSymbol, setSelectedChordSymbol] = useState<string | null>(null);
  const [globalChordInput, setGlobalChordInput] = useState<string>('');
  const [selectedOccurrenceKey, setSelectedOccurrenceKey] = useState<string>('');
  const [measureChordInput, setMeasureChordInput] = useState<string>('');
  const [floatingTexts, setFloatingTexts] = useState<FloatingTextBox[]>([]);

  // Optimistic UI & Async Transform / SVG Status
  const [transformResult, setTransformResult] = useState<TransformResult | null>(null);
  const [isTransformComputing, setIsTransformComputing] = useState<boolean>(false);
  const [isSvgLoading, setIsSvgLoading] = useState<boolean>(false);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);

  // Viewer & Modals
  const [canvasTheme, setCanvasTheme] = useState<CanvasThemeMode>('parchment');
  const [showUnappliedChangesModal, setShowUnappliedChangesModal] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<MobileTabId>('transpose');
  const [renderVersion, setRenderVersion] = useState<number>(0);
  const [renderedSnapshotMscx, setRenderedSnapshotMscx] = useState<string>('');

  const renderedSnapshotMscxRef = useRef<string>('');
  const skipNextAutoTransformRef = useRef<boolean>(false);
  const pendingApplyDelayRef = useRef<number | null>(null);
  const wasSvgLoadingRef = useRef<boolean>(false);

  const isProcessing = isSvgLoading || isTransformComputing;

  const openPlansModal = useCallback(
    (reason: 'fullscreen' | 'pro' | 'default' = 'default') => {
      setPlansModalReason(reason);
      setPlansModalOpen(true);
    },
    []
  );

  const refreshAuthAndSettings = useCallback(
    async (
      hashToCheck?: string,
      reloadMode: 'none' | 'if-access-changed' | 'force' = 'none'
    ) => {
      try {
        const effectiveHash = hashToCheck ?? fileHashRef.current;
        const payload = await refreshAuth(effectiveHash || undefined);
        if (!payload) return null;

        const prevLevel = accessLevelRef.current;
        const nextLevel: AccessLevel = payload.accessLevel || 'preview';

        setAuthUser(payload.user);
        setIsDev(payload.isDev);
        accessLevelRef.current = nextLevel;
        setAccessLevel(nextLevel);
        setActiveSubscription(payload.activeSubscription);
        setActiveSingleUnlocks(payload.activeSingleUnlocks);
        setFreePassStatus(payload.freePassStatus);
        setAppSettings(payload.settings);

        const accessChanged = prevLevel !== nextLevel;

        if (
          analysisRef.current &&
          (reloadMode === 'force' ||
            (reloadMode === 'if-access-changed' && accessChanged))
        ) {
          setLoadingReason(nextLevel !== 'preview' ? 'unlocking' : 'logout');
          setRenderVersion((v) => v + 1);
        }

        return payload;
      } catch {
        return null;
      }
    },
    [refreshAuth]
  );

  const handleClaimFreePass = useCallback(async () => {
    if (!fileHashRef.current || isClaimingFreePass) return;
    setFreePassError(null);
    setIsClaimingFreePass(true);
    try {
      const res = await fetch('/api/free-pass/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileHash: fileHashRef.current,
          fileName: analysisRef.current?.fileName || 'Partitura',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setAuthModalOpen(true);
        return;
      }
      if (!res.ok) {
        setFreePassError(data.error || 'Não foi possível liberar o Passe Gratuito.');
        await refreshAuthAndSettings(fileHashRef.current, 'none');
        return;
      }

      setPlansModalOpen(false);
      setLoadingReason('unlocking');
      await refreshAuthAndSettings(fileHashRef.current, 'force');
    } finally {
      setIsClaimingFreePass(false);
    }
  }, [isClaimingFreePass, refreshAuthAndSettings]);

  const restoreSessionObject = useCallback(
    async (
      savedSession: SavedWorkspaceSession,
      options?: { switchToEditor?: boolean; markActiveTab?: boolean }
    ) => {
      const lowerName = savedSession.fileName.toLowerCase();
      const resolvedFormat: 'mscz' | 'mscx' | 'xml' | 'mxl' =
        savedSession.fileFormat ||
        (lowerName.endsWith('.mscx')
          ? 'mscx'
          : lowerName.endsWith('.mxl')
          ? 'mxl'
          : lowerName.endsWith('.xml') || lowerName.endsWith('.musicxml')
          ? 'xml'
          : 'mscz');

      const restoredAnalysis = analyzeScoreXml(
        savedSession.originalMscx,
        savedSession.fileName,
        resolvedFormat
      );

      const mappedRestoredIds = (savedSession.selectedStaffIds || [])
        .map((id) => {
          const found = restoredAnalysis.staves.find(
            (s) => s.staffId === id || s.xmlStaffIds.includes(id)
          );
          return found ? found.staffId : null;
        })
        .filter((id): id is string => Boolean(id));

      const dedupedIds = Array.from(new Set(mappedRestoredIds));
      const restoredStaffIds: string[] =
        dedupedIds.length > 0
          ? dedupedIds
          : [restoredAnalysis.staves[0]?.staffId || '1'];

      const restoredOctaveMap: Record<string, number> =
        savedSession.octaveShiftsByPart && typeof savedSession.octaveShiftsByPart === 'object'
          ? { ...savedSession.octaveShiftsByPart }
          : savedSession.octaveShift
          ? { [restoredStaffIds[0] || '1']: savedSession.octaveShift }
          : {};

      const restoredLineBreaks =
        savedSession.lineBreakMeasures !== undefined
          ? savedSession.lineBreakMeasures
          : restoredAnalysis.initialLineBreakMeasures;
      const restoredPageBreaks =
        savedSession.pageBreakMeasures !== undefined
          ? savedSession.pageBreakMeasures
          : restoredAnalysis.initialPageBreakMeasures;

      const restoredHeaders = savedSession.headers || restoredAnalysis.headers;
      const restoredOptions: ScoreTransformOptions = {
        semitoneShift: savedSession.semitoneShift ?? 0,
        octaveShift: restoredOctaveMap[restoredStaffIds[0] || '1'] ?? 0,
        octaveShiftsByPart: restoredOctaveMap,
        targetInstrumentId:
          savedSession.targetInstrumentId || restoredAnalysis.detectedInstrumentId,
        selectedStaffId: restoredStaffIds[0] || '1',
        selectedStaffIds: restoredStaffIds,
        viewMode: savedSession.viewMode || 'portrait',
        convertBbEbChordsToWritten: Boolean(savedSession.convertBbEbChordsToWritten),
        showChords: savedSession.showChords ?? true,
        showLyrics: savedSession.showLyrics ?? true,
        headers: restoredHeaders,
        chordOverrides: savedSession.chordOverrides || {},
        floatingTexts: [],
        lineBreakMeasures: restoredLineBreaks,
        pageBreakMeasures: restoredPageBreaks,
        staffScalePercent: savedSession.staffScalePercent ?? 100,
      };

      const restoredTransform = transformScoreXml(
        savedSession.originalMscx,
        restoredAnalysis,
        restoredOptions
      );

      const restoredHash =
        savedSession.fileHash ||
        (await computeFileSha256Hex(base64ToArrayBuffer(savedSession.originalBase64)));

      skipNextAutoTransformRef.current = true;
      setFileHash(restoredHash);
      fileHashRef.current = restoredHash;
      if (options?.markActiveTab !== false) {
        setActiveTabProjectHash(restoredHash || `name:${savedSession.fileName}`);
      }
      setOriginalBase64(savedSession.originalBase64);
      setOriginalMscx(savedSession.originalMscx);
      setAnalysis(restoredAnalysis);
      analysisRef.current = restoredAnalysis;

      setSemitoneShift(restoredOptions.semitoneShift);
      setOctaveShiftsByPart(restoredOctaveMap);
      setOctaveBlockedWarning(false);
      setTargetInstrumentId(restoredOptions.targetInstrumentId);
      setSelectedStaffIds(restoredStaffIds);
      setViewMode(restoredOptions.viewMode);
      setConvertBbEbChordsToWritten(restoredOptions.convertBbEbChordsToWritten);
      setShowChords(restoredOptions.showChords);
      setShowLyrics(restoredOptions.showLyrics);
      setHeaders(restoredHeaders);

      const concertPc =
        ((restoredAnalysis.originalConcertPitchClass + restoredOptions.semitoneShift) % 12 + 12) % 12;
      const concertTon = getTonalityByPitchClass(concertPc);
      const selectedParts = restoredAnalysis.staves.filter((s) =>
        restoredStaffIds.includes(s.staffId)
      );
      const partLbl =
        restoredOptions.viewMode === 'full-score' ||
        (restoredAnalysis.staves.length > 1 &&
          selectedParts.length === restoredAnalysis.staves.length)
          ? 'Grade Completa'
          : selectedParts.length > 1
          ? selectedParts.map((s) => s.displayName).join(' + ')
          : selectedParts[0]?.displayName || restoredAnalysis.detectedInstrumentName;

      setHeaderDrafts({
        title: restoredHeaders.title.text,
        subtitle: restoredHeaders.subtitle.text,
        composer: restoredHeaders.composer.autoSyncInstrument
          ? partLbl
          : restoredHeaders.composer.text,
        lyricist: restoredHeaders.lyricist.autoSyncPianoKey
          ? `Tom para Piano: ${concertTon.majorName}`
          : restoredHeaders.lyricist.text,
      });

      setLineBreakMeasures(restoredLineBreaks);
      setPageBreakMeasures(restoredPageBreaks);
      setSelectedPageBreakMeasureInput(1);
      setSystemBreakMode(
        savedSession.systemBreakMode ||
          (restoredLineBreaks.length > 0 ? 'initial' : 'auto')
      );
      setMeasuresPerLineInput(savedSession.measuresPerLineInput || 4);
      setStaffScalePercent(restoredOptions.staffScalePercent || 100);
      setChordOverrides(restoredOptions.chordOverrides);
      setSelectedChordSymbol(null);
      setGlobalChordInput('');
      setSelectedOccurrenceKey('');
      setMeasureChordInput('');
      setFloatingTexts(savedSession.floatingTexts || []);
      setCanvasTheme(savedSession.canvasTheme || 'parchment');
      setTransformResult(restoredTransform);
      renderedSnapshotMscxRef.current = restoredTransform.modifiedMscx;
      setRenderedSnapshotMscx(restoredTransform.modifiedMscx);
      setLoadingReason('initial');
      setRenderVersion((v) => v + 1);

      if (options?.switchToEditor) {
        hasExplicitViewChoiceRef.current = true;
        setWorkspaceView('editor');
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', '/?view=editor');
        }
      }

      return restoredHash;
    },
    []
  );

  // Bootstrap inicial: lê Projetos Recentes no IndexedDB (sem auto-renderizar ao entrar do zero!)
  useEffect(() => {
    let cancelled = false;

    const bootstrapWorkspace = async () => {
      let urlView: string | null = null;
      try {
        if (localStorage.getItem('rubsax_copyright_accepted') === 'true') {
          setCopyrightAccepted(true);
        }
        if (localStorage.getItem('rubsax_hide_dev_badge') === 'true') {
          setDevBadgeHidden(true);
        }
        const params = new URLSearchParams(window.location.search);
        urlView = params.get('view');
        const authErr = params.get('auth_error');
        if (authErr) {
          setUploadError(`Não foi possível concluir o login (${authErr}). Tente novamente.`);
        }
      } catch {
        // Ignora caso localStorage não esteja disponível
      }

      const recent = await loadRecentProjects();
      if (cancelled) return;
      setRecentProjects(recent);

      // Só restaura e renderiza automaticamente se esta aba já estava editando um projeto (F5 / fluxo de login)
      const activeTabHash = getActiveTabProjectHash();
      const matchingActiveProject = activeTabHash
        ? recent.find(
            (p) =>
              p.fileHash === activeTabHash ||
              `name:${p.fileName}` === activeTabHash
          )
        : undefined;

      let restoredHash = '';
      if (matchingActiveProject) {
        try {
          restoredHash = await restoreSessionObject(matchingActiveProject, {
            switchToEditor: urlView !== 'home' && !hasExplicitViewChoiceRef.current,
            markActiveTab: true,
          });
        } catch {
          setActiveTabProjectHash(null);
        }
      }

      await refreshAuthAndSettings(restoredHash, 'none');
      if (cancelled) return;

      if (!hasExplicitViewChoiceRef.current) {
        if (urlView === 'home') {
          setWorkspaceView('welcome');
        } else if (urlView === 'editor' || matchingActiveProject) {
          setWorkspaceView('editor');
        } else {
          setWorkspaceView('welcome');
        }
      }

      isSessionHydratedRef.current = true;
      setIsRestoringSession(false);
    };

    void bootstrapWorkspace();
    return () => {
      cancelled = true;
    };
  }, [refreshAuthAndSettings, restoreSessionObject]);

  // Registra navegação interna para o botão inteligente "Voltar"
  useEffect(() => {
    if (isRestoringSession) return;
    recordInternalRoute(workspaceView === 'editor' ? '/?view=editor' : '/?view=home');
  }, [workspaceView, isRestoringSession]);

  // Auto-salva a partitura e edições atuais na lista de Projetos Recentes do IndexedDB (nunca salva o arquivo Demo)
  useEffect(() => {
    if (
      !isSessionHydratedRef.current ||
      !analysis ||
      !originalBase64 ||
      !originalMscx ||
      isOfficialDemoHash(fileHash)
    ) {
      return;
    }
    const timer = setTimeout(() => {
      const primaryId = selectedStaffIds[0] || analysis.staves[0]?.staffId || '1';
      void saveWorkspaceSession({
        fileName: analysis.fileName,
        fileFormat: analysis.fileFormat,
        originalBase64,
        originalMscx,
        fileHash,
        semitoneShift,
        octaveShift: octaveShiftsByPart[primaryId] ?? 0,
        octaveShiftsByPart,
        targetInstrumentId,
        selectedStaffIds,
        viewMode,
        convertBbEbChordsToWritten,
        showChords,
        showLyrics,
        headers,
        chordOverrides,
        floatingTexts,
        lineBreakMeasures,
        pageBreakMeasures,
        systemBreakMode,
        measuresPerLineInput,
        staffScalePercent,
        canvasTheme,
        savedAt: Date.now(),
      }).then((updatedList) => {
        setRecentProjects(updatedList);
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [
    analysis,
    originalBase64,
    originalMscx,
    fileHash,
    semitoneShift,
    octaveShiftsByPart,
    targetInstrumentId,
    selectedStaffIds,
    viewMode,
    convertBbEbChordsToWritten,
    showChords,
    showLyrics,
    headers,
    chordOverrides,
    floatingTexts,
    lineBreakMeasures,
    pageBreakMeasures,
    systemBreakMode,
    measuresPerLineInput,
    staffScalePercent,
    canvasTheme,
  ]);

  const handleOpenRecentProject = useCallback(
    async (project: SavedWorkspaceSession) => {
      const key = project.fileHash || `name:${project.fileName}`;
      if (openingRecentHash || isLoadingFile) return;
      setUploadError(null);
      setOpeningRecentHash(key);
      try {
        await yieldToMainThread();
        const restoredHash = await restoreSessionObject(project, {
          switchToEditor: true,
          markActiveTab: true,
        });
        await refreshAuthAndSettings(restoredHash, 'if-access-changed');
      } catch {
        setUploadError('Não foi possível reabrir este projeto salvo.');
      } finally {
        setOpeningRecentHash(null);
      }
    },
    [isLoadingFile, openingRecentHash, refreshAuthAndSettings, restoreSessionObject]
  );

  const handleDeleteRecentProject = useCallback(async (project: SavedWorkspaceSession) => {
    const key = project.fileHash || `name:${project.fileName}`;
    const updated = await deleteRecentProject(key);
    setRecentProjects(updated);
    if (getActiveTabProjectHash() === key || getActiveTabProjectHash() === project.fileHash) {
      setActiveTabProjectHash(null);
    }
  }, []);

  const handleCloseCurrentScore = useCallback(() => {
    setActiveTabProjectHash(null);
    setAnalysis(null);
    analysisRef.current = null;
    setOriginalBase64('');
    setOriginalMscx('');
    setFileHash('');
    fileHashRef.current = '';
    setTransformResult(null);
    renderedSnapshotMscxRef.current = '';
    setRenderedSnapshotMscx('');
    setSelectedChordSymbol(null);
    setOctaveBlockedWarning(false);
  }, []);

  const handleGoWelcome = useCallback(() => {
    hasExplicitViewChoiceRef.current = true;
    setWorkspaceView('welcome');
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/?view=home');
    }
  }, []);

  const handleGoEditor = useCallback(() => {
    hasExplicitViewChoiceRef.current = true;
    setWorkspaceView('editor');
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/?view=editor');
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    const hadFullAccess = accessLevelRef.current !== 'preview';
    setUserMenuOpen(false);
    setAccountModalOpen(false);
    await signOutUser();
    clearAuthSession();
    setAuthUser(null);
    setIsDev(false);
    accessLevelRef.current = 'preview';
    setAccessLevel('preview');
    setActiveSubscription(null);
    setActiveSingleUnlocks([]);
    setFreePassStatus(null);
    setFreePassError(null);
    if (hadFullAccess && analysisRef.current) {
      setLoadingReason('logout');
      setRenderVersion((v) => v + 1);
    }
  }, [clearAuthSession]);

  const handleToggleDevBadgeHidden = () => {
    setDevBadgeHidden((prev) => {
      const next = !prev;
      try {
        if (next) {
          localStorage.setItem('rubsax_hide_dev_badge', 'true');
        } else {
          localStorage.removeItem('rubsax_hide_dev_badge');
        }
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const scheduleScoreAction = useCallback(
    (actionId: string, delayMs = 45) => {
      setLoadingReason('editing');
      setActiveActionId(actionId);
      pendingApplyDelayRef.current = delayMs;
      setIsTransformComputing(true);
    },
    []
  );

  const handleToggleCopyright = (checked: boolean) => {
    setCopyrightAccepted(checked);
    if (checked) {
      setCopyrightError(false);
      setUploadError(null);
      try {
        localStorage.setItem('rubsax_copyright_accepted', 'true');
      } catch {
        // Ignore
      }
    } else {
      try {
        localStorage.removeItem('rubsax_copyright_accepted');
      } catch {
        // Ignore
      }
    }
  };

  const ensureCopyrightAccepted = useCallback((): boolean => {
    if (copyrightAccepted) return true;
    setCopyrightError(true);
    setUploadError(
      'Aceite o termo de responsabilidade de direitos autorais abaixo para liberar o envio do arquivo.'
    );
    return false;
  }, [copyrightAccepted]);

  const loadScoreFromBuffer = useCallback(
    async (
      arrayBuf: ArrayBuffer,
      fileName: string,
      loadOptions?: { skipConsentAndRecent?: boolean }
    ) => {
      if (isUploadingLockRef.current) return;
      setUploadError(null);
      if (appSettings.operations.maintenance_mode && !isDev) {
        setUploadError(
          appSettings.operations.maintenance_message ||
            'Sistema em manutenção temporária. Voltamos em instantes.'
        );
        return;
      }

      const validation = validateUploadFileName(fileName);
      if (!validation.valid) {
        setUploadError(validation.error || UNSUPPORTED_FORMAT_MESSAGE);
        return;
      }

      isUploadingLockRef.current = true;
      setIsLoadingFile(true);
      try {
        await yieldToMainThread();
        const computedHash = await computeFileSha256Hex(arrayBuf);
        const isDemoModeFile =
          Boolean(loadOptions?.skipConsentAndRecent) || isOfficialDemoHash(computedHash);
        setFileHash(computedHash);
        fileHashRef.current = computedHash;

        // Registra aceite de direitos autorais vinculado ao hash do arquivo real (não para a demo oficial)
        if (!isDemoModeFile) {
          void fetch('/api/consent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              consentType: 'copyright_upload',
              termsVersion: 'v1.4',
              fileHash: computedHash,
            }),
          }).catch(() => {});
        }

        const authPromise = refreshAuthAndSettings(computedHash, 'none');

        const b64 = arrayBufferToBase64(arrayBuf);
        let serverConvertedMscx: string | undefined;

        // Se for .xml, .musicxml ou .mxl (Finale/Sibelius), tenta conversão nativa via MuseScore 3 no servidor
        if (
          validation.extension === '.xml' ||
          validation.extension === '.musicxml' ||
          validation.extension === '.mxl'
        ) {
          try {
            const convRes = await fetch('/api/convert-xml', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                originalBase64: b64,
                fileName,
              }),
            });
            if (convRes.ok) {
              const convData = await convRes.json();
              if (convData.mscxContent) {
                serverConvertedMscx = convData.mscxContent;
              }
            }
          } catch {
            // Fallback automático para o conversor interno caso falhe
          }
        }

        const unpacked = await unpackScoreBuffer(
          arrayBuf,
          fileName,
          serverConvertedMscx
        );
        const scoreAnalysis = analyzeScoreXml(
          unpacked.mscxContent,
          fileName,
          unpacked.fileFormat
        );

        const mePayload = await authPromise;
        const resolvedLevel = mePayload?.accessLevel || accessLevelRef.current;
        const startInAutoBreakMode =
          !isDemoModeFile &&
          !isDev &&
          appSettings.paywall.paywall_enabled !== false &&
          (resolvedLevel === 'preview' || resolvedLevel === 'free_pass');

        const defaultLineBreaks = startInAutoBreakMode
          ? []
          : scoreAnalysis.initialLineBreakMeasures;
        const defaultPageBreaks = startInAutoBreakMode
          ? []
          : scoreAnalysis.initialPageBreakMeasures;

        const firstStaffId = scoreAnalysis.staves[0]?.staffId || '1';
        const initialOptions: ScoreTransformOptions = {
          semitoneShift: 0,
          octaveShift: 0,
          octaveShiftsByPart: {},
          targetInstrumentId: scoreAnalysis.detectedInstrumentId,
          selectedStaffId: firstStaffId,
          selectedStaffIds: [firstStaffId],
          viewMode: 'portrait',
          convertBbEbChordsToWritten: false,
          showChords: true,
          showLyrics: true,
          headers: scoreAnalysis.headers,
          chordOverrides: {},
          floatingTexts: [],
          lineBreakMeasures: defaultLineBreaks,
          pageBreakMeasures: defaultPageBreaks,
          staffScalePercent: 100,
        };

        const initialTransform = transformScoreXml(
          unpacked.mscxContent,
          scoreAnalysis,
          initialOptions
        );

        skipNextAutoTransformRef.current = true;
        setActiveTabProjectHash(isDemoModeFile ? null : computedHash || `name:${fileName}`);
        setOriginalBase64(b64);
        setOriginalMscx(unpacked.mscxContent);
        setAnalysis(scoreAnalysis);
        analysisRef.current = scoreAnalysis;

        setSemitoneShift(0);
        setOctaveShiftsByPart({});
        setOctaveBlockedWarning(false);
        setTargetInstrumentId(scoreAnalysis.detectedInstrumentId);
        setSelectedStaffIds([firstStaffId]);
        setViewMode('portrait');
        setConvertBbEbChordsToWritten(false);
        setShowChords(true);
        setShowLyrics(true);
        setHeaders(scoreAnalysis.headers);

        const firstPartDisplay =
          scoreAnalysis.staves[0]?.displayName || scoreAnalysis.detectedInstrumentName;
        setHeaderDrafts({
          title: scoreAnalysis.headers.title.text,
          subtitle: scoreAnalysis.headers.subtitle.text,
          composer: scoreAnalysis.headers.composer.autoSyncInstrument
            ? firstPartDisplay
            : scoreAnalysis.headers.composer.text,
          lyricist: scoreAnalysis.headers.lyricist.autoSyncPianoKey
            ? `Tom para Piano: ${scoreAnalysis.originalConcertTonality.majorName}`
            : scoreAnalysis.headers.lyricist.text,
        });

        setLineBreakMeasures(defaultLineBreaks);
        setPageBreakMeasures(defaultPageBreaks);
        setSelectedPageBreakMeasureInput(1);
        setSystemBreakMode(defaultLineBreaks.length > 0 ? 'initial' : 'auto');
        setMeasuresPerLineInput(4);
        setStaffScalePercent(100);
        setChordOverrides({});
        setSelectedChordSymbol(null);
        setGlobalChordInput('');
        setSelectedOccurrenceKey('');
        setMeasureChordInput('');
        setFloatingTexts([]);
        setActiveActionId(null);
        setIsTransformComputing(false);

        setTransformResult(initialTransform);
        renderedSnapshotMscxRef.current = initialTransform.modifiedMscx;
        setRenderedSnapshotMscx(initialTransform.modifiedMscx);
        hasExplicitViewChoiceRef.current = true;
        setFreePassError(null);
        setWorkspaceView('editor');
        setLoadingReason('initial');
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', '/?view=editor');
        }
        setRenderVersion((v) => v + 1);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : UNSUPPORTED_FORMAT_MESSAGE;
        setUploadError(msg);
      } finally {
        isUploadingLockRef.current = false;
        setIsLoadingFile(false);
      }
    },
    [
      appSettings.operations.maintenance_message,
      appSettings.operations.maintenance_mode,
      appSettings.paywall.paywall_enabled,
      isDev,
      refreshAuthAndSettings,
    ]
  );

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!ensureCopyrightAccepted()) {
        return;
      }
      const validation = validateUploadFileName(file.name);
      if (!validation.valid) {
        setUploadError(validation.error || UNSUPPORTED_FORMAT_MESSAGE);
        return;
      }
      const buf = await file.arrayBuffer();
      await loadScoreFromBuffer(buf, file.name);
    },
    [ensureCopyrightAccepted, loadScoreFromBuffer]
  );

  const handleLoadOfficialDemo = useCallback(async () => {
    if (isLoadingDemo || isUploadingLockRef.current || isLoadingFile) return;
    setUploadError(null);
    setIsLoadingDemo(true);
    try {
      const res = await fetch(DEMO_SCORE_PUBLIC_URL, { cache: 'force-cache' });
      if (!res.ok) {
        throw new Error('Não foi possível baixar a partitura de demonstração agora.');
      }
      const buf = await res.arrayBuffer();
      await loadScoreFromBuffer(buf, DEMO_SCORE_FILE_NAME, {
        skipConsentAndRecent: true,
      });
    } catch (err: unknown) {
      setUploadError(
        err instanceof Error
          ? err.message
          : 'Erro ao abrir a partitura de demonstração.'
      );
    } finally {
      setIsLoadingDemo(false);
    }
  }, [isLoadingDemo, isLoadingFile, loadScoreFromBuffer]);

  const handleStartOwnUploadFromDemo = useCallback(() => {
    setShowDemoPdfBlockedModal(false);
    if (copyrightAccepted) {
      fileInputRef.current?.click();
      return;
    }
    handleCloseCurrentScore();
    setWorkspaceView('editor');
    setCopyrightError(true);
    setUploadError(
      'Para enviar sua própria partitura, aceite a declaração de direitos autorais (Lei nº 9.610/98) abaixo.'
    );
  }, [copyrightAccepted, handleCloseCurrentScore]);

  const handleSelectTargetConcertPitchClass = (targetPc: number) => {
    if (!analysis || isSvgLoading) return;
    const origPc = analysis.originalConcertPitchClass;
    const rawDiff = (((targetPc - origPc) % 12) + 12) % 12;
    // Sempre menor distância ("Mais Próximo")
    const shift = rawDiff > 6 ? rawDiff - 12 : rawDiff;
    if (shift === semitoneShift) return;
    scheduleScoreAction('tonality-select', 60);
    setSemitoneShift(shift);
  };

  const isDemoScore = isOfficialDemoHash(fileHash);
  const areProDrawersLocked =
    !isDemoScore &&
    !isDev &&
    appSettings.paywall.paywall_enabled !== false &&
    (accessLevel === 'preview' || accessLevel === 'free_pass');

  const firstVisibleStaffId = analysis?.staves[0]?.staffId || '1';
  const effectiveViewMode: ScoreLayoutViewMode = areProDrawersLocked ? 'portrait' : viewMode;
  const effectiveSelectedStaffIds = useMemo(
    () => (areProDrawersLocked ? [firstVisibleStaffId] : selectedStaffIds),
    [areProDrawersLocked, firstVisibleStaffId, selectedStaffIds]
  );

  // Cálculo instantâneo de 0ms em memória pura para partes & tonalidades exibidas no visor
  const activeInstrument = useMemo(
    () => getInstrumentById(targetInstrumentId),
    [targetInstrumentId]
  );

  const selectedStavesList = useMemo(() => {
    if (!analysis) return [];
    const effectiveIds =
      effectiveViewMode === 'full-score'
        ? analysis.staves.map((s) => s.staffId)
        : effectiveSelectedStaffIds;
    return analysis.staves.filter((s) => effectiveIds.includes(s.staffId));
  }, [analysis, effectiveSelectedStaffIds, effectiveViewMode]);

  const multipleInstrumentsActive = Boolean(
    analysis &&
      (effectiveViewMode === 'full-score'
        ? analysis.staves.length > 1
        : selectedStavesList.length > 1)
  );

  useEffect(() => {
    if (!multipleInstrumentsActive && octaveBlockedWarning) {
      setOctaveBlockedWarning(false);
    }
  }, [multipleInstrumentsActive, octaveBlockedWarning]);

  const activeStaffSummary = useMemo(() => {
    if (!analysis) return null;
    return selectedStavesList[0] || analysis.staves[0] || null;
  }, [analysis, selectedStavesList]);

  const activePartId = activeStaffSummary?.staffId || firstVisibleStaffId;
  const currentPartOctaveShift = multipleInstrumentsActive
    ? 0
    : octaveShiftsByPart[activePartId] ?? 0;

  // Transpositores universais na tela (oculto se só houver instrumentos em Dó; travado se mistura de afinações)
  const pitchedActiveParts = useMemo(
    () => selectedStavesList.filter((s) => !s.isPercussion),
    [selectedStavesList]
  );
  const transposingActiveParts = useMemo(
    () => pitchedActiveParts.filter((s) => s.isTransposing),
    [pitchedActiveParts]
  );
  const hasAnyTransposingActive = transposingActiveParts.length > 0;
  const uniqueWrittenOffsetsActive = useMemo(
    () => new Set(pitchedActiveParts.map((s) => s.writtenSemitoneOffset)),
    [pitchedActiveParts]
  );
  const isMixedTransposition =
    hasAnyTransposingActive && uniqueWrittenOffsetsActive.size > 1;
  const detectedTuningLabel =
    !isMixedTransposition && transposingActiveParts[0]
      ? transposingActiveParts[0].transpositionLabel
      : 'Transpositor';
  const effectiveConvertChordsToWritten = Boolean(
    convertBbEbChordsToWritten && hasAnyTransposingActive && !isMixedTransposition
  );

  // Opções para a visualização em tela (sem duplicar textos flutuantes que já são arrastáveis na tela)
  const screenTransformOptions: ScoreTransformOptions = useMemo(
    () => ({
      semitoneShift,
      octaveShift: currentPartOctaveShift,
      octaveShiftsByPart,
      targetInstrumentId,
      selectedStaffId: effectiveSelectedStaffIds[0] || firstVisibleStaffId,
      selectedStaffIds: effectiveSelectedStaffIds,
      viewMode: effectiveViewMode,
      convertBbEbChordsToWritten: effectiveConvertChordsToWritten,
      showChords,
      showLyrics,
      headers,
      chordOverrides,
      floatingTexts: [],
      lineBreakMeasures,
      pageBreakMeasures,
      staffScalePercent,
    }),
    [
      semitoneShift,
      currentPartOctaveShift,
      octaveShiftsByPart,
      targetInstrumentId,
      effectiveSelectedStaffIds,
      firstVisibleStaffId,
      effectiveViewMode,
      effectiveConvertChordsToWritten,
      showChords,
      showLyrics,
      headers,
      chordOverrides,
      lineBreakMeasures,
      pageBreakMeasures,
      staffScalePercent,
    ]
  );

  // Opções completas para exportação do PDF (injetando os textos flutuantes dentro do XML .mscx)
  const pdfTransformOptions: ScoreTransformOptions = useMemo(
    () => ({
      ...screenTransformOptions,
      floatingTexts,
    }),
    [screenTransformOptions, floatingTexts]
  );

  const currentConcertTonality = useMemo(() => {
    if (!analysis) return getTonalityByPitchClass(0);
    const concertPc =
      ((analysis.originalConcertPitchClass + semitoneShift) % 12 + 12) % 12;
    return getTonalityByPitchClass(concertPc);
  }, [analysis, semitoneShift]);

  const currentWrittenTonality = useMemo(() => {
    if (!analysis) return getTonalityByPitchClass(0);
    // Com múltiplos instrumentos na tela, prevalece o Tom Original (Piano / Dó)
    const offset = multipleInstrumentsActive
      ? 0
      : activeStaffSummary?.writtenSemitoneOffset ?? 0;
    const writtenPc =
      ((currentConcertTonality.pitchClass + offset) % 12 + 12) % 12;
    return getTonalityByPitchClass(writtenPc);
  }, [analysis, currentConcertTonality, activeStaffSummary, multipleInstrumentsActive]);

  const allStavesSelectedInUi =
    Boolean(analysis) &&
    analysis!.staves.length > 1 &&
    selectedStavesList.length === analysis!.staves.length;

  const activePartLabelInTopBar =
    effectiveViewMode === 'full-score' || allStavesSelectedInUi
      ? 'Grade Completa'
      : selectedStavesList.length > 1
      ? selectedStavesList.map((s) => s.displayName).join(' + ')
      : activeStaffSummary?.displayName ||
        analysis?.detectedInstrumentName ||
        activeInstrument.name;

  // Sincronização inteligente dos rascunhos de cabeçalho com os textos renderizados (sem disparar chamadas durante digitação)
  const renderedHeaderTexts = useMemo(
    () => ({
      title: headers.title.text,
      subtitle: headers.subtitle.text,
      composer: headers.composer.autoSyncInstrument
        ? activePartLabelInTopBar
        : headers.composer.text,
      lyricist: headers.lyricist.autoSyncPianoKey
        ? `Tom para Piano: ${currentConcertTonality.majorName}`
        : headers.lyricist.text,
    }),
    [headers, activePartLabelInTopBar, currentConcertTonality.majorName]
  );

  const prevRenderedHeaderTextsRef = useRef(renderedHeaderTexts);
  useEffect(() => {
    const prev = prevRenderedHeaderTextsRef.current;
    setHeaderDrafts((drafts) => ({
      title: drafts.title === prev.title ? renderedHeaderTexts.title : drafts.title,
      subtitle:
        drafts.subtitle === prev.subtitle ? renderedHeaderTexts.subtitle : drafts.subtitle,
      composer:
        drafts.composer === prev.composer ? renderedHeaderTexts.composer : drafts.composer,
      lyricist:
        drafts.lyricist === prev.lyricist ? renderedHeaderTexts.lyricist : drafts.lyricist,
    }));
    prevRenderedHeaderTextsRef.current = renderedHeaderTexts;
  }, [renderedHeaderTexts]);

  // Executa a transformação XML em segundo plano APÓS o browser pintar a resposta otimista em 0ms
  useEffect(() => {
    if (!analysis || !originalMscx) return;

    if (skipNextAutoTransformRef.current) {
      skipNextAutoTransformRef.current = false;
      setIsTransformComputing(false);
      return;
    }

    const delay = pendingApplyDelayRef.current ?? 160;
    pendingApplyDelayRef.current = null;
    setIsTransformComputing(true);

    const timer = setTimeout(() => {
      try {
        const res = transformScoreXml(originalMscx, analysis, screenTransformOptions);
        setTransformResult(res);
        if (res.modifiedMscx !== renderedSnapshotMscxRef.current) {
          renderedSnapshotMscxRef.current = res.modifiedMscx;
          setRenderedSnapshotMscx(res.modifiedMscx);
          setRenderVersion((v) => v + 1);
        } else {
          setActiveActionId(null);
        }
      } catch (err) {
        console.error('Erro ao transformar XML:', err);
        setActiveActionId(null);
      } finally {
        setIsTransformComputing(false);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [analysis, originalMscx, screenTransformOptions]);

  // Limpa o micro-spinner do botão recém-acionado assim que o servidor conclui a renderização do SVG
  useEffect(() => {
    if (wasSvgLoadingRef.current && !isSvgLoading && !isTransformComputing) {
      setActiveActionId(null);
    }
    wasSvgLoadingRef.current = isSvgLoading;
  }, [isSvgLoading, isTransformComputing]);

  const hasUnrenderedChanges = Boolean(
    transformResult &&
      renderedSnapshotMscx &&
      transformResult.modifiedMscx !== renderedSnapshotMscx
  );

  const handleTriggerPreview = useCallback(() => {
    if (!analysis || !originalMscx || isSvgLoading) return;
    setLoadingReason('editing');
    if (transformResult && transformResult.modifiedMscx !== renderedSnapshotMscxRef.current) {
      renderedSnapshotMscxRef.current = transformResult.modifiedMscx;
      setRenderedSnapshotMscx(transformResult.modifiedMscx);
      setRenderVersion((v) => v + 1);
      return;
    }
    setActiveActionId('manual-apply');
    setIsTransformComputing(true);
    setTimeout(() => {
      try {
        const res = transformScoreXml(originalMscx, analysis, screenTransformOptions);
        setTransformResult(res);
        renderedSnapshotMscxRef.current = res.modifiedMscx;
        setRenderedSnapshotMscx(res.modifiedMscx);
        setRenderVersion((v) => v + 1);
      } finally {
        setIsTransformComputing(false);
      }
    }, 16);
  }, [analysis, isSvgLoading, originalMscx, screenTransformOptions, transformResult]);

  const handleShiftActiveOctave = (delta: -1 | 1) => {
    if (isSvgLoading) return;
    if (multipleInstrumentsActive) {
      setOctaveBlockedWarning(true);
      return;
    }
    setOctaveBlockedWarning(false);
    const nextVal = Math.max(-2, Math.min(2, currentPartOctaveShift + delta));
    if (nextVal === currentPartOctaveShift) return;
    scheduleScoreAction(delta < 0 ? 'octave-down' : 'octave-up', 260);
    setOctaveShiftsByPart((prev) => ({
      ...prev,
      [activePartId]: nextVal,
    }));
  };

  const handleChangeViewMode = (mode: ScoreLayoutViewMode) => {
    if (viewMode === mode || isSvgLoading) return;
    const actionId = mode === 'portrait' ? 'view-portrait' : 'view-full-score';
    scheduleScoreAction(actionId, 30);
    setViewMode(mode);
  };

  const handleSelectSingleStaff = (staffId: string) => {
    if (isSvgLoading) return;
    if (
      viewMode !== 'full-score' &&
      selectedStaffIds.length === 1 &&
      selectedStaffIds[0] === staffId
    ) {
      return;
    }
    const actionId = `staff-solo-${staffId}`;
    scheduleScoreAction(actionId, 30);
    setSelectedStaffIds([staffId]);
    if (viewMode === 'full-score') {
      setViewMode('portrait');
    }
  };

  const handleToggleStaffActive = (staffId: string) => {
    if (!analysis || isSvgLoading) return;
    const actionId = `staff-toggle-${staffId}`;

    const baseIds =
      viewMode === 'full-score'
        ? analysis.staves.map((s) => s.staffId)
        : selectedStaffIds;

    let nextIds: string[];
    if (baseIds.includes(staffId)) {
      if (baseIds.length <= 1) {
        return;
      }
      nextIds = baseIds.filter((id) => id !== staffId);
    } else {
      nextIds = analysis.staves
        .map((s) => s.staffId)
        .filter((id) => baseIds.includes(id) || id === staffId);
    }

    scheduleScoreAction(actionId, 30);
    setSelectedStaffIds(nextIds);
    if (viewMode === 'full-score') {
      setViewMode('portrait');
    }
  };

  // Handlers de Quebra de Compasso (Sistema)
  const handleAutoSystemBreaks = () => {
    if (isSvgLoading) return;
    if (lineBreakMeasures.length === 0) {
      setSystemBreakMode('auto');
      return;
    }
    scheduleScoreAction('break-auto', 30);
    setSystemBreakMode('auto');
    setLineBreakMeasures([]);
  };

  const handleApplyEveryXMeasures = () => {
    if (!analysis || isSvgLoading) return;
    const step = Math.max(1, Math.min(12, measuresPerLineInput || 4));
    const nextBreaks: number[] = [];
    for (let m = step; m < analysis.measureCount; m += step) {
      nextBreaks.push(m);
    }
    setSystemBreakMode('every-x');
    const changed =
      nextBreaks.length !== lineBreakMeasures.length ||
      nextBreaks.some((v, idx) => v !== lineBreakMeasures[idx]);
    if (!changed) return;
    scheduleScoreAction('break-every-x', 30);
    setLineBreakMeasures(nextBreaks);
  };

  const handleToggleMeasureBreak = (measureNumber: number) => {
    if (isSvgLoading) return;
    const actionId = `break-measure-${measureNumber}`;
    scheduleScoreAction(actionId, 30);
    setSystemBreakMode('custom');
    setLineBreakMeasures((prev) => {
      if (prev.includes(measureNumber)) {
        return prev.filter((n) => n !== measureNumber);
      }
      return [...prev, measureNumber].sort((a, b) => a - b);
    });
  };

  // Handlers de Quebra de Página
  const handleClearPageBreaks = () => {
    if (isSvgLoading) return;
    if (pageBreakMeasures.length === 0) return;
    scheduleScoreAction('page-break-clear', 30);
    setPageBreakMeasures([]);
  };

  const handleTogglePageBreakMeasure = (measureNumber: number) => {
    if (isSvgLoading) return;
    const actionId = `page-break-measure-${measureNumber}`;
    scheduleScoreAction(actionId, 30);
    setPageBreakMeasures((prev) => {
      if (prev.includes(measureNumber)) {
        return prev.filter((n) => n !== measureNumber);
      }
      return [...prev, measureNumber].sort((a, b) => a - b);
    });
  };

  // Handler de Escala Vetorial (<Spatium>)
  const handleChangeStaffScale = (nextPercent: number, actionId: string, delayMs = 45) => {
    if (isSvgLoading) return;
    const clamped = Math.max(70, Math.min(130, nextPercent));
    if (clamped === staffScalePercent) return;
    scheduleScoreAction(actionId, delayMs);
    setStaffScalePercent(clamped);
  };

  const handleAddFloatingText = () => {
    const newBox: FloatingTextBox = {
      id: `ft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: 'Texto personalizado',
      xPercent: 35,
      yPercent: 14,
      fontSize: 14,
      pageIndex: 0,
    };
    setFloatingTexts((prev) => [...prev, newBox]);
  };

  const handleUpdateFloatingTextPosition = useCallback(
    (id: string, xPercent: number, yPercent: number) => {
      setFloatingTexts((prev) =>
        prev.map((ft) =>
          ft.id === id ? { ...ft, xPercent, yPercent } : ft
        )
      );
    },
    []
  );

  // Handlers explícitos de Aplicar em Textos/Cabeçalho (sem envio enquanto digita)
  const handleApplyHeaderField = (field: 'title' | 'subtitle' | 'composer' | 'lyricist') => {
    if (isSvgLoading || areProDrawersLocked) return;
    const draftVal = headerDrafts[field];
    if (draftVal === renderedHeaderTexts[field]) return;
    scheduleScoreAction(`header-apply-${field}`, 30);
    setHeaders((h) => {
      if (field === 'title') {
        return { ...h, title: { ...h.title, text: draftVal } };
      }
      if (field === 'subtitle') {
        return {
          ...h,
          subtitle: {
            ...h.subtitle,
            text: draftVal,
            visible: Boolean(draftVal.trim()),
            removed: false,
          },
        };
      }
      if (field === 'composer') {
        return {
          ...h,
          composer: { ...h.composer, text: draftVal, autoSyncInstrument: false },
        };
      }
      return {
        ...h,
        lyricist: { ...h.lyricist, text: draftVal, autoSyncPianoKey: false },
      };
    });
  };

  const executeExportPdf = async (overrideOptions?: Partial<ScoreTransformOptions>) => {
    if (!analysis || !originalMscx || !originalBase64 || isExportingLockRef.current) return;
    isExportingLockRef.current = true;
    setIsExportingPdf(true);
    setUploadError(null);
    try {
      await yieldToMainThread();
      const effectivePdfOptions: ScoreTransformOptions = {
        ...pdfTransformOptions,
        ...(overrideOptions || {}),
      };

      const pdfTransform = transformScoreXml(
        originalMscx,
        analysis,
        effectivePdfOptions
      );

      const cleanTitle = (
        effectivePdfOptions.headers.title.text ||
        analysis.headers.title.text ||
        'Partitura'
      )
        .replace(/[<>:"/\\|?*]+/g, '')
        .trim();

      const partLabel =
        effectivePdfOptions.viewMode === 'full-score' || allStavesSelectedInUi
          ? 'Grade Completa'
          : selectedStavesList.length > 1
          ? selectedStavesList.map((s) => s.displayName).join(' + ')
          : pdfTransform.activeStaff.displayName;

      const customPdfName = `${cleanTitle} - ${partLabel} (${pdfTransform.writtenTonality.majorName}) - Rubsax.pdf`;

      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalBase64,
          fileName: analysis.fileName,
          modifiedMscx: pdfTransform.modifiedMscx,
          customPdfName,
          semitoneShift: effectivePdfOptions.semitoneShift,
          octaveShift: effectivePdfOptions.octaveShift,
          lineBreakMeasures: effectivePdfOptions.lineBreakMeasures,
          pageBreakMeasures: effectivePdfOptions.pageBreakMeasures,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 403 && errData.error === 'PAYWALL_REQUIRED') {
          setPlansModalOpen(true);
          return;
        }
        if (res.status === 429 && errData.supportUrl) {
          throw new Error(`${errData.error} (${errData.supportUrl})`);
        }
        throw new Error(errData.error || 'Erro ao exportar PDF no servidor.');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = customPdfName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Falha ao exportar o PDF.';
      setUploadError(msg);
    } finally {
      isExportingLockRef.current = false;
      setIsExportingPdf(false);
    }
  };

  const isPreviewLocked =
    !isDev &&
    appSettings.paywall.paywall_enabled !== false &&
    accessLevel === 'preview';

  const maintenanceBlocked =
    Boolean(appSettings.operations.maintenance_mode) && !isDev;

  const isTransposeModified =
    semitoneShift !== 0 ||
    (multipleInstrumentsActive
      ? Object.values(octaveShiftsByPart).some((v) => v !== 0)
      : currentPartOctaveShift !== 0);
  const isChordsModified =
    !showChords ||
    !showLyrics ||
    effectiveConvertChordsToWritten ||
    Object.keys(chordOverrides).length > 0;
  const areXmlHeadersModified = analysis
    ? headers.showAllHeaders !== analysis.headers.showAllHeaders ||
      headers.title.text !== analysis.headers.title.text ||
      headers.title.visible !== analysis.headers.title.visible ||
      headers.title.removed !== analysis.headers.title.removed ||
      headers.subtitle.text !== analysis.headers.subtitle.text ||
      headers.subtitle.visible !== analysis.headers.subtitle.visible ||
      headers.subtitle.removed !== analysis.headers.subtitle.removed ||
      headers.composer.text !== analysis.headers.composer.text ||
      headers.composer.visible !== analysis.headers.composer.visible ||
      headers.composer.removed !== analysis.headers.composer.removed ||
      headers.composer.autoSyncInstrument !== analysis.headers.composer.autoSyncInstrument ||
      headers.lyricist.text !== analysis.headers.lyricist.text ||
      headers.lyricist.visible !== analysis.headers.lyricist.visible ||
      headers.lyricist.removed !== analysis.headers.lyricist.removed ||
      headers.lyricist.autoSyncPianoKey !== analysis.headers.lyricist.autoSyncPianoKey
    : false;
  const isHeadersModified = floatingTexts.length > 0 || areXmlHeadersModified;
  const isScaleModified = staffScalePercent !== 100;

  const initialLineBreaksForMode = areProDrawersLocked
    ? []
    : analysis?.initialLineBreakMeasures || [];
  const initialPageBreaksForMode = areProDrawersLocked
    ? []
    : analysis?.initialPageBreakMeasures || [];

  const isLineBreaksModified =
    lineBreakMeasures.length !== initialLineBreaksForMode.length ||
    lineBreakMeasures.some((m, i) => m !== initialLineBreaksForMode[i]);
  const isPageBreaksModified =
    pageBreakMeasures.length !== initialPageBreaksForMode.length ||
    pageBreakMeasures.some((m, i) => m !== initialPageBreaksForMode[i]);

  const isStavesModified =
    viewMode !== 'portrait' ||
    selectedStaffIds.length !== 1 ||
    selectedStaffIds[0] !== firstVisibleStaffId;

  // Detecção exata de rascunhos digitados e não aplicados em Textos/Cabeçalho e Cifras
  const isTitleDraftDirty =
    !headers.title.removed && headerDrafts.title !== renderedHeaderTexts.title;
  const isSubtitleDraftDirty =
    !headers.subtitle.removed && headerDrafts.subtitle !== renderedHeaderTexts.subtitle;
  const isComposerDraftDirty =
    !headers.composer.removed && headerDrafts.composer !== renderedHeaderTexts.composer;
  const isLyricistDraftDirty =
    !headers.lyricist.removed && headerDrafts.lyricist !== renderedHeaderTexts.lyricist;

  const selectedChordCurrentDisplay = useMemo(() => {
    if (!selectedChordSymbol || !transformResult) return '';
    const found = transformResult.chordOccurrences.find(
      (o) => o.originalSymbol === selectedChordSymbol
    );
    return found?.currentSymbol || selectedChordSymbol;
  }, [selectedChordSymbol, transformResult]);

  const selectedOccurrenceObj = useMemo(() => {
    if (!selectedOccurrenceKey || !transformResult) return null;
    return (
      transformResult.chordOccurrences.find(
        (o) => o.occurrenceKey === selectedOccurrenceKey
      ) || null
    );
  }, [selectedOccurrenceKey, transformResult]);

  const isGlobalChordDraftDirty = Boolean(
    selectedChordSymbol &&
      globalChordInput.trim() &&
      globalChordInput.trim() !== selectedChordCurrentDisplay
  );
  const isMeasureChordDraftDirty = Boolean(
    selectedChordSymbol &&
      selectedOccurrenceObj &&
      measureChordInput.trim() &&
      measureChordInput.trim() !== selectedOccurrenceObj.currentSymbol
  );

  const pendingUnappliedItems = useMemo(() => {
    const items: Array<{ id: string; label: string }> = [];
    if (!areProDrawersLocked) {
      if (isTitleDraftDirty) items.push({ id: 'title', label: 'Textos > Título' });
      if (isSubtitleDraftDirty) items.push({ id: 'subtitle', label: 'Textos > Subtítulo' });
      if (isComposerDraftDirty) items.push({ id: 'composer', label: 'Textos > Instrumento' });
      if (isLyricistDraftDirty) items.push({ id: 'lyricist', label: 'Textos > Tom para Piano' });
      if (isGlobalChordDraftDirty && selectedChordSymbol) {
        items.push({
          id: 'chord-global',
          label: `Cifras > ${selectedChordSymbol} (Editar todas iguais)`,
        });
      }
      if (isMeasureChordDraftDirty && selectedOccurrenceObj) {
        items.push({
          id: 'chord-measure',
          label: `Cifras > Compasso ${selectedOccurrenceObj.measureNumber} (${selectedOccurrenceObj.currentSymbol})`,
        });
      }
    }
    return items;
  }, [
    areProDrawersLocked,
    isTitleDraftDirty,
    isSubtitleDraftDirty,
    isComposerDraftDirty,
    isLyricistDraftDirty,
    isGlobalChordDraftDirty,
    selectedChordSymbol,
    isMeasureChordDraftDirty,
    selectedOccurrenceObj,
  ]);

  const handleApplyAllPendingAndExportPdf = () => {
    const nextHeaders: ScoreHeadersState = {
      ...headers,
      title: isTitleDraftDirty
        ? { ...headers.title, text: headerDrafts.title }
        : headers.title,
      subtitle: isSubtitleDraftDirty
        ? {
            ...headers.subtitle,
            text: headerDrafts.subtitle,
            visible: Boolean(headerDrafts.subtitle.trim()),
            removed: false,
          }
        : headers.subtitle,
      composer: isComposerDraftDirty
        ? { ...headers.composer, text: headerDrafts.composer, autoSyncInstrument: false }
        : headers.composer,
      lyricist: isLyricistDraftDirty
        ? { ...headers.lyricist, text: headerDrafts.lyricist, autoSyncPianoKey: false }
        : headers.lyricist,
    };

    const nextChordOverrides: Record<string, string> = { ...chordOverrides };
    if (isGlobalChordDraftDirty && selectedChordSymbol) {
      nextChordOverrides[selectedChordSymbol] = globalChordInput.trim();
    }
    if (isMeasureChordDraftDirty && selectedOccurrenceObj) {
      nextChordOverrides[selectedOccurrenceObj.occurrenceKey] = measureChordInput.trim();
    }

    setHeaders(nextHeaders);
    setChordOverrides(nextChordOverrides);
    setSelectedChordSymbol(null);
    setShowUnappliedChangesModal(false);
    void executeExportPdf({
      headers: nextHeaders,
      chordOverrides: nextChordOverrides,
    });
  };

  const handleResetTranspose = () => {
    if (isSvgLoading || !isTransposeModified) return;
    scheduleScoreAction('transpose-reset', 45);
    setSemitoneShift(0);
    setOctaveBlockedWarning(false);
    if (!multipleInstrumentsActive) {
      setOctaveShiftsByPart((prev) => ({
        ...prev,
        [activePartId]: 0,
      }));
    }
  };

  const handleResetChords = () => {
    if (isSvgLoading || !isChordsModified || areProDrawersLocked) return;
    scheduleScoreAction('chords-drawer-reset', 45);
    setShowChords(true);
    setShowLyrics(true);
    setConvertBbEbChordsToWritten(false);
    setChordOverrides({});
    setSelectedChordSymbol(null);
    setGlobalChordInput('');
    setSelectedOccurrenceKey('');
    setMeasureChordInput('');
  };

  const handleResetHeaders = () => {
    if (!analysis || isSvgLoading || !isHeadersModified || areProDrawersLocked) return;
    if (areXmlHeadersModified) {
      scheduleScoreAction('headers-drawer-reset', 45);
    }
    setHeaders(analysis.headers);
    setHeaderDrafts({
      title: analysis.headers.title.text,
      subtitle: analysis.headers.subtitle.text,
      composer: analysis.headers.composer.autoSyncInstrument
        ? activePartLabelInTopBar
        : analysis.headers.composer.text,
      lyricist: analysis.headers.lyricist.autoSyncPianoKey
        ? `Tom para Piano: ${currentConcertTonality.majorName}`
        : analysis.headers.lyricist.text,
    });
    setFloatingTexts([]);
  };

  const handleResetScale = () => {
    if (isSvgLoading || !isScaleModified || areProDrawersLocked) return;
    handleChangeStaffScale(100, 'scale-drawer-reset', 45);
  };

  const handleResetLineBreaks = () => {
    if (!analysis || isSvgLoading || !isLineBreaksModified) return;
    scheduleScoreAction('breaks-drawer-reset', 45);
    setLineBreakMeasures(initialLineBreaksForMode);
    setSystemBreakMode(initialLineBreaksForMode.length > 0 ? 'initial' : 'auto');
  };

  const handleResetPageBreaks = () => {
    if (!analysis || isSvgLoading || !isPageBreaksModified) return;
    scheduleScoreAction('page-breaks-drawer-reset', 45);
    setPageBreakMeasures(initialPageBreaksForMode);
  };

  const handleResetStaves = () => {
    if (isSvgLoading || !isStavesModified || areProDrawersLocked) return;
    scheduleScoreAction('staves-drawer-reset', 45);
    setViewMode('portrait');
    setSelectedStaffIds([firstVisibleStaffId]);
  };

  const renderDrawerCornerAction = (params: {
    proLocked?: boolean;
    modified: boolean;
    actionId: string;
    onReset: () => void;
  }) => {
    if (params.proLocked) {
      return (
        <button
          type="button"
          onClick={() => openPlansModal('pro')}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sax-500/15 hover:bg-sax-500/25 border border-sax-500/40 text-sax-300 text-[10px] font-extrabold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
          title="Desbloqueie os planos PRO para usar esta gaveta"
        >
          <Lock className="w-3 h-3" />
          <span>PRO</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        disabled={!params.modified || isSvgLoading}
        onClick={params.onReset}
        title={
          params.modified
            ? 'Restaurar esta gaveta para o original do arquivo'
            : 'Esta gaveta está no padrão original'
        }
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
          params.modified
            ? 'bg-sax-500/15 hover:bg-sax-500/25 border-sax-500/45 text-sax-300'
            : 'bg-zinc-900/60 border-zinc-800 text-zinc-500 opacity-55 cursor-default'
        }`}
      >
        {isProcessing && activeActionId === params.actionId ? (
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
        ) : (
          <RotateCcw className="w-2.5 h-2.5" />
        )}
        <span>Resetar</span>
      </button>
    );
  };

  const handleRequestExportPdf = () => {
    if (isExportingPdf || isExportingLockRef.current) return;
    if (isDemoScore) {
      setShowDemoPdfBlockedModal(true);
      return;
    }
    if (isPreviewLocked) {
      openPlansModal('pro');
      return;
    }
    if (pendingUnappliedItems.length > 0 || isProcessing || hasUnrenderedChanges) {
      setShowUnappliedChangesModal(true);
      return;
    }
    void executeExportPdf();
  };

  const formatSavedDateLabel = (ts: number): string => {
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
  };

  const renderRecentProjectsSection = () => {
    if (recentProjects.length === 0) return null;
    return (
      <section className="w-full max-w-2xl rounded-3xl bg-studio-900/85 border border-zinc-800 p-4 sm:p-5 shadow-xl space-y-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sax-400 shrink-0" />
            <h3 className="text-xs sm:text-sm font-extrabold text-white">
              Projetos Recentes (neste dispositivo)
            </h3>
          </div>
          <span className="text-[10px] font-mono text-zinc-400">
            {recentProjects.length}/5 salvos
          </span>
        </div>

        <div className="space-y-2">
          {recentProjects.map((proj) => {
            const pKey = proj.fileHash || `name:${proj.fileName}`;
            const isOpeningThis = openingRecentHash === pKey;
            const displayTitle =
              proj.headers?.title?.text?.trim() || proj.fileName;
            return (
              <div
                key={pKey}
                className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-studio-950/90 border border-zinc-800 hover:border-zinc-700 transition"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-zinc-100 truncate">
                    {displayTitle}
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {proj.fileName}
                    {proj.savedAt ? ` • Salvo em ${formatSavedDateLabel(proj.savedAt)}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={Boolean(openingRecentHash) || isLoadingFile}
                    onClick={() => void handleOpenRecentProject(proj)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs font-extrabold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50"
                  >
                    {isOpeningThis ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FolderOpen className="w-3.5 h-3.5" />
                    )}
                    <span>Abrir</span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(openingRecentHash) || isLoadingFile}
                    onClick={() => void handleDeleteRecentProject(proj)}
                    title="Excluir projeto deste dispositivo"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-red-950/70 hover:text-red-300 border border-zinc-700 hover:border-red-500/40 text-zinc-400 text-xs font-bold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Excluir</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-studio-950 text-zinc-100 selection:bg-sax-500 selection:text-studio-950">
      {/* Input oculto global de Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mscz,.mscx,.xml,.musicxml,.mxl"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFileUpload(f);
          e.target.value = '';
        }}
      />

      {/* BANNER GLOBAL DE AVISO (Lido de app_settings.announcement) */}
      {appSettings.announcement.enabled &&
        appSettings.announcement.message.trim() &&
        !announcementDismissed && (
          <div
            className={`px-4 py-2 text-xs sm:text-sm border-b flex items-center justify-between gap-3 ${
              appSettings.announcement.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/50 text-amber-100'
                : appSettings.announcement.type === 'promo'
                ? 'bg-gradient-to-r from-[#D97706]/30 via-sax-500/20 to-[#D97706]/30 border-sax-500/50 text-sax-100'
                : 'bg-sky-950/80 border-sky-500/40 text-sky-100'
            }`}
          >
            <div className="flex items-center gap-2 mx-auto text-center flex-wrap justify-center">
              <Megaphone className="w-4 h-4 text-sax-400 shrink-0" />
              <span className="font-semibold">{appSettings.announcement.message}</span>
              {appSettings.announcement.link_url && (
                <a
                  href={appSettings.announcement.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-extrabold text-sax-300 hover:text-sax-200"
                >
                  {appSettings.announcement.link_label || 'Saiba mais'}
                </a>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAnnouncementDismissed(true)}
              className="p-1 rounded-lg hover:bg-black/25 text-current shrink-0 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
              aria-label="Fechar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

      {/* BANNER DE MANUTENÇÃO PARA USUÁRIOS COMUNS */}
      {maintenanceBlocked && (
        <div className="bg-amber-950/95 border-b border-amber-500/60 px-4 py-3 text-amber-100 text-xs sm:text-sm flex items-center justify-center gap-2.5 text-center">
          <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-bold">
            {appSettings.operations.maintenance_message ||
              'Estamos realizando uma melhoria rápida. Voltamos em instantes!'}
          </span>
        </div>
      )}

      {/* BARRA SUPERIOR PRINCIPAL: RUBSAX TRANSPOSER v1.3 + Ecossistema + Auth/Dev + Tonalidade + Ações */}
      <header className="sticky top-0 z-30 bg-studio-900/95 backdrop-blur-md border-b border-zinc-800 px-3 sm:px-5 py-2.5 shadow-lg">
        <div className="max-w-[1800px] mx-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
          {/* Logo & Marca Oficial (clicável para ir à Tela Inicial sem perder a partitura) */}
          <button
            type="button"
            onClick={handleGoWelcome}
            title="Ir para a Tela Inicial"
            className="flex items-center gap-2.5 text-left rounded-xl hover:opacity-90 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation focus:outline-none"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sax-400 to-sax-600 p-1 flex items-center justify-center shadow-md shadow-sax-500/20 overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon.png"
                alt="Rubsax Logo"
                className="w-full h-full object-contain rounded-lg"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                  RUBSAX <span className="text-sax-400">TRANSPOSER</span>
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sax-500/15 text-sax-300 border border-sax-500/30">
                  v1.4
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                Transposição precisa com fidelidade original • Formatos aceitos: .mscz, .mscx, .xml, .mxl
              </p>
            </div>
          </button>

          {/* Botões do Ecossistema Rubsax + Tutorial + Planos + Ajuda + Conta / Modo Dev */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {workspaceView === 'welcome' && (
              <button
                type="button"
                onClick={handleGoEditor}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs font-extrabold shadow-sm active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{analysis ? 'Voltar ao Editor' : 'Ir ao Editor'}</span>
              </button>
            )}

            {tutorialVideoId && (
              <button
                type="button"
                onClick={() => setTutorialModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-200 text-xs font-extrabold border border-red-500/40 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                <PlayCircle className="w-3.5 h-3.5 text-red-400" />
                <span>Tutorial</span>
              </button>
            )}

            <Link
              href="/planos"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700 hover:border-sax-500/50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
            >
              <CreditCard className="w-3.5 h-3.5 text-sax-400" />
              <span>Planos</span>
            </Link>

            <Link
              href="/ajuda"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700 hover:border-sax-500/50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
            >
              <HelpCircle className="w-3.5 h-3.5 text-sax-400" />
              <span>Ajuda / FAQ</span>
            </Link>

            <a
              href={appSettings.support_links.catalog_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-100 text-xs font-bold border border-zinc-700 hover:border-sax-500/50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
            >
              <BookOpen className="w-3.5 h-3.5 text-sax-400" />
              <span>Catálogo</span>
            </a>

            <a
              href={appSettings.support_links.store_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-sax-500/20 hover:bg-sax-500/30 text-sax-300 text-xs font-extrabold border border-sax-500/50 shadow-sm active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
            >
              <ShoppingCart className="w-3.5 h-3.5 text-sax-400" />
              <span>Loja Oficial</span>
            </a>

            {/* Badge Modo Dev com botão rápido de olho/ocultar para gravações no YouTube */}
            {isDev && (
              <div className="inline-flex items-center gap-1">
                {!devBadgeHidden && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-extrabold">
                    <Crown className="w-3 h-3" />
                    <span>Modo Dev</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleToggleDevBadgeHidden}
                  className="p-1.5 rounded-lg bg-zinc-800/70 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700/70 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  title={
                    devBadgeHidden
                      ? 'Mostrar badge Modo Dev'
                      : 'Ocultar badge Modo Dev (ideal para gravar tela)'
                  }
                >
                  {devBadgeHidden ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}

            {/* Login ("Entrar") ou Menu do Usuário */}
            {!authUser ? (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-white hover:bg-zinc-100 text-slate-900 text-xs font-extrabold shadow-sm active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Entrar</span>
              </button>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-bold text-zinc-100 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                >
                  {authUser.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={authUser.avatar_url}
                      alt={authUser.full_name || authUser.email}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-3.5 h-3.5 text-sax-400" />
                  )}
                  <span className="max-w-[110px] truncate hidden sm:inline">
                    {authUser.full_name?.split(' ')[0] || authUser.email.split('@')[0]}
                  </span>
                </button>

                {userMenuOpen && (
                  <>
                    <div
                      className="hidden sm:block fixed inset-0 z-40"
                      onClick={() => setUserMenuOpen(false)}
                    />
                    <div
                      className="hidden sm:block absolute right-0 top-full mt-2 w-56 rounded-2xl bg-studio-900 border border-zinc-700 shadow-2xl py-1.5 z-50 text-xs"
                      onMouseLeave={() => setUserMenuOpen(false)}
                    >
                      <div className="px-3.5 py-2 border-b border-zinc-800">
                        <p className="font-bold text-white truncate">
                          {authUser.full_name || 'Músico Rubsax'}
                        </p>
                        <p className="text-[11px] text-zinc-400 truncate">{authUser.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setAccountModalInitialTab('account');
                          setAccountModalOpen(true);
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-zinc-800 text-zinc-200 font-semibold flex items-center gap-2 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation"
                      >
                        <User className="w-3.5 h-3.5 text-sax-400" />
                        <span>Minha Conta</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setAccountModalInitialTab('projects');
                          setAccountModalOpen(true);
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-zinc-800 text-zinc-200 font-semibold flex items-center justify-between gap-2 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation"
                      >
                        <span className="inline-flex items-center gap-2">
                          <FolderOpen className="w-3.5 h-3.5 text-sax-400" />
                          <span>Meus Projetos</span>
                        </span>
                        {recentProjects.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-sax-300">
                            {recentProjects.length}
                          </span>
                        )}
                      </button>
                      <Link
                        href="/conta"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full px-3.5 py-2 hover:bg-zinc-800 text-zinc-300 font-medium flex items-center gap-2"
                      >
                        <Crown className="w-3.5 h-3.5 text-sax-400" />
                        <span>Área do Cliente &amp; Planos</span>
                      </Link>
                      {isDev && (
                        <Link
                          href="/admin"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full px-3.5 py-2 hover:bg-zinc-800 text-sax-300 font-bold flex items-center gap-2"
                        >
                          <Shield className="w-3.5 h-3.5 text-sax-400" />
                          <span>Painel /admin</span>
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleSignOut()}
                        className="w-full px-3.5 py-2 text-left hover:bg-red-950/40 text-red-300 font-semibold border-t border-zinc-800 mt-1 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation"
                      >
                        Sair da Conta
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* VISOR CENTRAL DE TONALIDADE */}
          {analysis && workspaceView === 'editor' && (
            <div className="flex-1 min-w-[260px] max-w-2xl mx-auto px-3.5 py-1.5 rounded-xl bg-studio-950/90 border border-zinc-700/80 shadow-inner flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs sm:text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 font-medium">Tom Base (Piano):</span>
                <span className="font-extrabold text-sky-300">
                  {currentConcertTonality.majorName}
                </span>
                <span className="text-xs text-zinc-400">
                  ({currentConcertTonality.minorName})
                </span>
              </div>

              <span className="text-zinc-600 font-bold">|</span>

              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 font-medium">
                  {multipleInstrumentsActive
                    ? `Referência (${activePartLabelInTopBar}):`
                    : `Na pauta (${activePartLabelInTopBar}):`}
                </span>
                <span
                  className={`font-extrabold ${
                    multipleInstrumentsActive ? 'text-sky-300' : 'text-sax-400'
                  }`}
                >
                  {multipleInstrumentsActive
                    ? `Tom Original (${currentConcertTonality.majorName})`
                    : currentWrittenTonality.majorName}
                </span>
              </div>
            </div>
          )}

          {/* Ações Rápidas no Topo */}
          {analysis && workspaceView === 'editor' && (
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleCloseCurrentScore}
                title="Fechar partitura atual e voltar para a tela limpa do Editor / Projetos Recentes"
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-red-950/45 hover:bg-red-900/60 text-red-200 text-xs font-bold border border-red-500/40 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                <X className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden sm:inline">Fechar Partitura</span>
                <span className="sm:hidden">Fechar</span>
              </button>

              <button
                type="button"
                disabled={isSvgLoading}
                onClick={() => {
                  if (isDemoScore && !copyrightAccepted) {
                    handleStartOwnUploadFromDemo();
                    return;
                  }
                  if (!ensureCopyrightAccepted()) return;
                  fileInputRef.current?.click();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 text-xs font-semibold border border-zinc-700 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                <Upload className="w-3.5 h-3.5 text-sax-400" />
                <span className="hidden sm:inline">Enviar .mscz / .xml</span>
                <span className="sm:hidden">Upload</span>
              </button>

              <button
                type="button"
                disabled={isExportingPdf}
                onClick={handleRequestExportPdf}
                title={
                  isDemoScore
                    ? 'Exportar PDF fica bloqueado apenas na partitura de demonstração'
                    : isPreviewLocked
                    ? 'Modo Prévia: desbloqueie a partitura para exportar em PDF'
                    : 'Exportar PDF fiel pelo MuseScore 3'
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sax-500 to-sax-600 hover:from-sax-400 hover:to-sax-500 disabled:opacity-50 disabled:cursor-not-allowed text-studio-950 text-xs sm:text-sm font-extrabold shadow-lg shadow-sax-500/20 select-none active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                {isExportingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gerando PDF...</span>
                  </>
                ) : (
                  <>
                    {isPreviewLocked || isDemoScore ? (
                      <Lock className="w-4 h-4" />
                    ) : (
                      <FileDown className="w-4 h-4" />
                    )}
                    <span>Exportar PDF</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* FAIXA DE CONTAGEM REGRESSIVA DO MODO GRATUITO (quando em cooldown e sem plano mensal) */}
      {authUser &&
        !isDev &&
        !activeSubscription &&
        freePassStatus?.state === 'cooldown' &&
        freePassStatus.cooldownUntil && (
          <div className="bg-amber-950/35 border-b border-amber-500/30 px-4 py-2 text-xs flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
            <FreePassCountdown
              mode="cooldown"
              targetIso={freePassStatus.cooldownUntil}
              onExpire={() => void refreshAuthAndSettings(fileHash, 'if-access-changed')}
            />
            <Link
              href="/planos"
              className="text-[11px] font-extrabold text-sax-300 hover:text-sax-200 underline underline-offset-2"
            >
              Liberar agora com Avulso ou Mensal PRO
            </Link>
          </div>
        )}

      {/* ALERTA DE ERRO OU FORMATO NÃO SUPORTADO */}
      {uploadError && (
        <div className="bg-red-950/90 border-b border-red-500/50 px-4 py-3 text-red-100 text-xs sm:text-sm flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2.5 max-w-4xl">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="font-semibold">{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="px-2.5 py-1 rounded-lg bg-red-900/60 hover:bg-red-800 text-xs font-semibold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
          >
            Fechar
          </button>
        </div>
      )}

      {/* TELA INICIAL ("WELCOME / UPLOAD FIRST") OU ÁREA DE EDIÇÃO */}
      {workspaceView === 'welcome' ? (
        <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 gap-8">
          {maintenanceBlocked ? (
            <div className="w-full max-w-xl rounded-3xl border-2 border-amber-500/40 bg-studio-900/90 p-8 sm:p-12 text-center shadow-2xl space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
                <Wrench className="w-8 h-8 text-amber-400" />
              </div>
              <h2 className="text-xl font-extrabold text-white">
                Manutenção Programada
              </h2>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {appSettings.operations.maintenance_message ||
                  'Estamos realizando uma melhoria rápida. Voltamos em instantes!'}
              </p>
            </div>
          ) : (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (!ensureCopyrightAccepted()) return;
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFileUpload(f);
                }}
                onClick={() => {
                  if (isLoadingFile) return;
                  if (!ensureCopyrightAccepted()) return;
                  fileInputRef.current?.click();
                }}
                className={`w-full max-w-2xl rounded-3xl border-2 border-dashed p-6 sm:p-12 text-center cursor-pointer transition-all shadow-2xl ${
                  isDragging
                    ? 'border-sax-400 bg-sax-500/10 scale-[1.01]'
                    : 'border-zinc-700/80 bg-studio-900/80 hover:border-sax-500/60 hover:bg-studio-900'
                }`}
              >
                {isLoadingFile ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-4">
                    <Loader2 className="w-12 h-12 text-sax-400 animate-spin" />
                    <div className="space-y-1">
                      <p className="text-lg sm:text-xl font-extrabold text-white">
                    Processando sua partitura...
                  </p>
                  <p className="text-xs sm:text-sm text-zinc-400">
                    Extraindo estrutura musical, pautas internas e diagramação original do MuseScore 3.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                {analysis && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-xl p-3 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-emerald-200 font-semibold truncate">
                      Partitura aberta: <strong className="text-white">{analysis.fileName}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={handleGoEditor}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-studio-950 font-extrabold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation shrink-0"
                    >
                      Voltar para esta partitura
                    </button>
                  </div>
                )}

                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-sax-400/20 to-sax-600/20 border border-sax-500/40 flex items-center justify-center shadow-inner">
                  <Upload className="w-10 h-10 text-sax-400" />
                </div>

                <div className="space-y-2 max-w-lg">
                  <span className="inline-block text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-sax-500/15 text-sax-300 border border-sax-500/30">
                    RUBSAX TRANSPOSER v1.4
                  </span>
                  <h2 className="text-sm sm:text-base font-bold text-sax-300 tracking-wide">
                    Transpositor de Partituras e Extrator de Partes Online
                  </h2>
                  <p className="text-xl sm:text-2xl font-extrabold text-white">
                    Envie sua Partitura para Começar
                  </p>
                  <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                    Arraste e solte o arquivo aqui ou clique para selecionar do seu celular ou
                    computador. Transponha o tom, edite cifras/cabeçalhos, extraia partes ocultas
                    e exporte o PDF 100% fiel ao MuseScore 3.
                  </p>
                </div>

                {/* CHECKBOX OBRIGATÓRIO DE DIREITOS AUTORAIS */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className={`w-full max-w-xl text-left rounded-2xl p-3.5 sm:p-4 border transition ${
                    copyrightError
                      ? 'bg-red-950/40 border-red-500 ring-2 ring-red-500/30'
                      : copyrightAccepted
                      ? 'bg-sax-500/10 border-sax-500/45'
                      : 'bg-studio-950/90 border-zinc-700 hover:border-sax-500/50'
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={copyrightAccepted}
                      onChange={(e) => handleToggleCopyright(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-[#D97706] cursor-pointer shrink-0"
                    />
                    <span className="text-xs text-zinc-200 leading-relaxed">
                      Declaro possuir os direitos ou autorização para editar e transpor o material
                      enviado, responsabilizando-me integralmente pelo uso do arquivo nos termos
                      da Lei de Direitos Autorais (<strong>Lei nº 9.610/98</strong>).
                    </span>
                  </label>
                  {copyrightError && !copyrightAccepted && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-red-300">
                      <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span>
                        Marque a declaração acima para liberar o envio da sua partitura.
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center gap-2.5 w-full">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!ensureCopyrightAccepted()) return;
                      fileInputRef.current?.click();
                    }}
                    className={`inline-flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-extrabold text-sm shadow-xl active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                      copyrightAccepted
                        ? 'bg-gradient-to-r from-sax-500 to-sax-600 hover:from-sax-400 hover:to-sax-500 text-studio-950 shadow-sax-500/20'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-600 shadow-none'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span>Selecionar Arquivo (.mscz, .mscx, .xml, .mxl)</span>
                  </button>

                  <button
                    type="button"
                    disabled={isLoadingDemo || isLoadingFile}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleLoadOfficialDemo();
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/45 text-emerald-200 text-xs sm:text-sm font-extrabold shadow-sm disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    {isLoadingDemo ? (
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-300" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-emerald-300" />
                    )}
                    <span>Testar App Agora (Partitura Demo Completa)</span>
                  </button>
                  <p className="text-[11px] text-emerald-300/80 max-w-md">
                    Experimente grátis todas as 5 gavetas, 10 instrumentos e Tela Cheia com
                    &ldquo;Parabéns pra Você&rdquo; — sem precisar enviar arquivo.
                  </p>
                </div>

                <div className="pt-1 flex flex-wrap items-center justify-center gap-2 text-[11px] text-zinc-400">
                  <span className="px-2.5 py-1 rounded-lg bg-studio-950 border border-zinc-800 font-mono text-zinc-300">
                    .mscz (MuseScore 3/4)
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-studio-950 border border-zinc-800 font-mono text-zinc-300">
                    .mscx
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-studio-950 border border-zinc-800 font-mono text-zinc-300">
                    .xml / .mxl (MusicXML)
                  </span>
                </div>
              </div>
            )}
          </div>
          {renderRecentProjectsSection()}
            </>
          )}

          {/* VÍDEO TUTORIAL INCORPORADO NA TELA INICIAL (configurado via /admin) */}
          {tutorialVideoId && !maintenanceBlocked && (
            <section className="w-full max-w-2xl rounded-3xl bg-studio-900/90 border border-zinc-800 p-5 sm:p-6 shadow-2xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PlayCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <h3 className="text-sm sm:text-base font-extrabold text-white">
                    {appSettings.tutorial.title || 'Como usar o Rubsax Transposer'}
                  </h3>
                </div>
                <a
                  href={getYouTubeWatchUrl(tutorialVideoId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-sax-400 hover:underline"
                >
                  <span>Assistir no YouTube</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="aspect-video w-full rounded-2xl overflow-hidden border border-zinc-800 bg-black">
                <iframe
                  src={getYouTubeEmbedUrl(tutorialVideoId)}
                  title={appSettings.tutorial.title || 'Tutorial Rubsax Transposer'}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </section>
          )}
        </main>
      ) : (
        /* INTERFACE COMPLETA DE EDIÇÃO, TRANSPOSIÇÃO E VISUALIZAÇÃO */
        <div className="flex-1 flex flex-col lg:flex-row max-w-[1800px] w-full mx-auto lg:min-h-[calc(100vh-68px)]">
          {/* PAINEL LATERAL DE CONTROLES */}
          <aside className="w-full lg:w-[400px] xl:w-[430px] shrink-0 bg-studio-900 border-b lg:border-b-0 lg:border-r border-zinc-800 flex flex-col overflow-y-auto order-2 lg:order-1 max-h-[54vh] lg:max-h-[calc(100vh-68px)] lg:sticky lg:top-[68px]">
            {/* Abas Mobile */}
            <div className="grid grid-cols-5 lg:hidden bg-studio-950 border-b border-zinc-800 text-[10px] sm:text-[11px] font-semibold sticky top-0 z-20">
              <button
                type="button"
                onClick={() => setMobileTab('transpose')}
                className={`py-2.5 flex flex-col items-center gap-1 border-b-2 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                  mobileTab === 'transpose'
                    ? 'border-sax-500 text-sax-400 bg-sax-500/5'
                    : 'border-transparent text-zinc-400'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Tom/8va</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('display')}
                className={`py-2.5 flex flex-col items-center gap-1 border-b-2 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                  mobileTab === 'display'
                    ? 'border-sax-500 text-sax-400 bg-sax-500/5'
                    : 'border-transparent text-zinc-400'
                }`}
              >
                <span className="inline-flex items-center gap-0.5">
                  <Eye className="w-3.5 h-3.5" />
                  {areProDrawersLocked && <Lock className="w-2.5 h-2.5 text-sax-400" />}
                </span>
                <span>Cifras</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('headers')}
                className={`py-2.5 flex flex-col items-center gap-1 border-b-2 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                  mobileTab === 'headers'
                    ? 'border-sax-500 text-sax-400 bg-sax-500/5'
                    : 'border-transparent text-zinc-400'
                }`}
              >
                <span className="inline-flex items-center gap-0.5">
                  <Type className="w-3.5 h-3.5" />
                  {areProDrawersLocked && <Lock className="w-2.5 h-2.5 text-sax-400" />}
                </span>
                <span>Textos</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('layout')}
                className={`py-2.5 flex flex-col items-center gap-1 border-b-2 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                  mobileTab === 'layout'
                    ? 'border-sax-500 text-sax-400 bg-sax-500/5'
                    : 'border-transparent text-zinc-400'
                }`}
              >
                <span className="inline-flex items-center gap-0.5">
                  <SplitSquareVertical className="w-3.5 h-3.5" />
                </span>
                <span>Sistema</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('staves')}
                className={`py-2.5 flex flex-col items-center gap-1 border-b-2 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                  mobileTab === 'staves'
                    ? 'border-sax-500 text-sax-400 bg-sax-500/5'
                    : 'border-transparent text-zinc-400'
                }`}
              >
                <span className="inline-flex items-center gap-0.5">
                  <Layers className="w-3.5 h-3.5" />
                  {areProDrawersLocked && <Lock className="w-2.5 h-2.5 text-sax-400" />}
                </span>
                <span>Pautas</span>
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* 1. ARQUIVO DA PARTITURA (sempre disponível no Desktop; mobile usa barra ou empty state) */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFileUpload(f);
                }}
                className="hidden lg:block rounded-2xl border border-zinc-800 bg-studio-950/70 p-3.5 transition"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                    <FolderOpen className="w-4 h-4 text-sax-400" />
                    <span>Arquivo da Partitura</span>
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono truncate max-w-[190px]">
                    {analysis ? analysis.fileName : 'Aguardando envio'}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={isSvgLoading}
                    onClick={() => {
                      if (isDemoScore && !copyrightAccepted) {
                        handleStartOwnUploadFromDemo();
                        return;
                      }
                      if (!ensureCopyrightAccepted()) return;
                      fileInputRef.current?.click();
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-700 text-xs text-zinc-200 flex items-center justify-center gap-2 font-semibold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    <Upload className="w-4 h-4 text-sax-400" />
                    <span>
                      {analysis
                        ? 'Enviar outro arquivo (.mscz, .mscx, .xml, .mxl)'
                        : 'Enviar partitura (.mscz, .mscx, .xml, .mxl)'}
                    </span>
                  </button>
                  {analysis && (
                    <button
                      type="button"
                      onClick={handleCloseCurrentScore}
                      className="w-full py-2 px-3 rounded-xl bg-red-950/35 hover:bg-red-900/50 border border-red-500/35 text-xs text-red-200 flex items-center justify-center gap-1.5 font-bold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                    >
                      <X className="w-3.5 h-3.5 text-red-400" />
                      <span>Fechar / Tirar partitura da tela</span>
                    </button>
                  )}
                </div>
              </div>

              {!analysis && (
                <div className="p-3 rounded-xl bg-sax-500/10 border border-sax-500/30 text-[11px] text-sax-200 font-semibold text-center">
                  Envie uma partitura para habilitar as ferramentas abaixo.
                </div>
              )}

              <div className={!analysis ? 'space-y-4 opacity-40 pointer-events-none select-none' : 'space-y-4'}>

              {/* 2. TRANSPOSIÇÃO & OITAVA */}
              <section
                className={`${
                  mobileTab === 'transpose' ? 'block' : 'hidden lg:block'
                } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-3.5`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4" />
                    <span>Transposição &amp; Oitava</span>
                  </h2>
                  {renderDrawerCornerAction({
                    modified: isTransposeModified,
                    actionId: 'transpose-reset',
                    onReset: handleResetTranspose,
                  })}
                </div>

                {/* Seletor Direto de Tonalidade */}
                <div className="space-y-1.5">
                  <label className="block text-xs text-zinc-300 font-semibold">
                    Mudar tonalidade
                  </label>
                  {multipleInstrumentsActive && (
                    <p className="text-[11px] text-sky-300/90 leading-snug">
                      Grade / Múltiplos instrumentos: referência fixa no Tom Original (Piano / Dó).
                    </p>
                  )}

                  <div className="relative">
                    <select
                      disabled={isSvgLoading}
                      value={currentConcertTonality.pitchClass}
                      onChange={(e) =>
                        handleSelectTargetConcertPitchClass(parseInt(e.target.value, 10))
                      }
                      className={`w-full px-3 py-2 rounded-xl bg-zinc-900 border text-xs sm:text-sm font-semibold text-white focus:outline-none focus:border-sax-500 disabled:opacity-50 disabled:cursor-not-allowed ${
                        activeActionId === 'tonality-select' && isProcessing
                          ? 'border-[#D97706] ring-1 ring-sax-400'
                          : 'border-zinc-700'
                      }`}
                    >
                      {TONALITIES.map((t) => (
                        <option key={t.pitchClass} value={t.pitchClass}>
                          {t.fullLabel}
                        </option>
                      ))}
                    </select>
                    {activeActionId === 'tonality-select' && isProcessing && (
                      <Loader2 className="w-3.5 h-3.5 text-sax-400 animate-spin absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none" />
                    )}
                  </div>
                </div>

                {/* Botões Rápidos de Semitom */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 font-semibold">Salto por Semitom:</span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-sax-300">
                      {semitoneShift > 0 ? `+${semitoneShift}` : semitoneShift} semitons
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={semitoneShift <= -12 || isSvgLoading}
                      onClick={() => {
                        if (semitoneShift <= -12 || isSvgLoading) return;
                        scheduleScoreAction('semitone-down', 320);
                        setSemitoneShift((s) => Math.max(-12, s - 1));
                      }}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed ${
                        (isProcessing && activeActionId === 'semitone-down') ||
                        semitoneShift < 0
                          ? 'bg-[#D97706] text-studio-950 border-sax-400 font-extrabold shadow-sm'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                      }`}
                    >
                      {isProcessing && activeActionId === 'semitone-down' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
                      <span>-1 Semitom</span>
                    </button>

                    <button
                      type="button"
                      disabled={semitoneShift >= 12 || isSvgLoading}
                      onClick={() => {
                        if (semitoneShift >= 12 || isSvgLoading) return;
                        scheduleScoreAction('semitone-up', 320);
                        setSemitoneShift((s) => Math.min(12, s + 1));
                      }}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed ${
                        (isProcessing && activeActionId === 'semitone-up') ||
                        semitoneShift > 0
                          ? 'bg-[#D97706] text-studio-950 border-sax-400 font-extrabold shadow-sm'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                      }`}
                    >
                      {isProcessing && activeActionId === 'semitone-up' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      <span>+1 Semitom</span>
                    </button>
                  </div>
                </div>

                {/* Botões de Oitava (estritamente limitados entre -2 e +2 oitavas; apenas 1 instrumento por vez) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs gap-1">
                    <span className="text-zinc-300 font-semibold">
                      Oitava (±12 st • máx. ±2):
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-sky-300">
                      {currentPartOctaveShift > 0
                        ? `+${currentPartOctaveShift}`
                        : currentPartOctaveShift}{' '}
                      8va (
                      {currentPartOctaveShift * 12 > 0
                        ? `+${currentPartOctaveShift * 12}`
                        : currentPartOctaveShift * 12}{' '}
                      st)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={(!multipleInstrumentsActive && currentPartOctaveShift <= -2) || isSvgLoading}
                      onClick={() => handleShiftActiveOctave(-1)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed ${
                        multipleInstrumentsActive
                          ? 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:border-amber-500/40'
                          : (isProcessing && activeActionId === 'octave-down') ||
                              currentPartOctaveShift < 0
                            ? 'bg-[#D97706] text-studio-950 border-sax-400 font-extrabold shadow-sm'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                      }`}
                    >
                      {isProcessing && activeActionId === 'octave-down' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Minus className="w-4 h-4" />
                      )}
                      <span>-1 Oitava</span>
                    </button>

                    <button
                      type="button"
                      disabled={(!multipleInstrumentsActive && currentPartOctaveShift >= 2) || isSvgLoading}
                      onClick={() => handleShiftActiveOctave(1)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed ${
                        multipleInstrumentsActive
                          ? 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:border-amber-500/40'
                          : (isProcessing && activeActionId === 'octave-up') ||
                              currentPartOctaveShift > 0
                            ? 'bg-[#D97706] text-studio-950 border-sax-400 font-extrabold shadow-sm'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                      }`}
                    >
                      {isProcessing && activeActionId === 'octave-up' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      <span>+1 Oitava</span>
                    </button>
                  </div>
                  {octaveBlockedWarning && multipleInstrumentsActive && (
                    <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/45 text-[11px] font-semibold text-amber-200 flex items-start gap-2 animate-fadeIn">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>Só é possível alterar a oitava com um instrumento por vez.</span>
                    </div>
                  )}
                </div>

                {/* Ação Direta: Baixar PDF */}
                <div className="pt-2 border-t border-zinc-800/80">
                  <button
                    type="button"
                    disabled={isExportingPdf}
                    onClick={handleRequestExportPdf}
                    title={
                      isPreviewLocked
                        ? 'Desbloqueie para baixar PDF fiel'
                        : 'Baixar PDF fiel'
                    }
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-sax-500 hover:bg-sax-400 disabled:opacity-50 disabled:cursor-not-allowed text-studio-950 text-xs font-extrabold shadow-md select-none active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    {isExportingPdf ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Gerando PDF...</span>
                      </>
                    ) : isPreviewLocked ? (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Baixar PDF</span>
                      </>
                    ) : (
                      <>
                        <FileDown className="w-3.5 h-3.5" />
                        <span>Baixar PDF</span>
                      </>
                    )}
                  </button>
                </div>
              </section>

              {/* 3A. GAVETA DE CIFRAS, LETRAS & TEXTOS DE PAUTA (separada no mobile) */}
              <section
                className={`${
                  mobileTab === 'display' ? 'block' : 'hidden lg:block'
                } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-3`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                    <Eye className="w-4 h-4" />
                    <span>Cifras, Letras &amp; Pauta</span>
                  </h2>
                  {renderDrawerCornerAction({
                    proLocked: areProDrawersLocked,
                    modified: isChordsModified,
                    actionId: 'chords-drawer-reset',
                    onReset: handleResetChords,
                  })}
                </div>

                {areProDrawersLocked && (
                  <button
                    type="button"
                    onClick={() => openPlansModal('pro')}
                    className="w-full p-2.5 rounded-xl bg-sax-500/10 hover:bg-sax-500/20 border border-sax-500/40 text-left flex items-center justify-between gap-2 text-[11px] text-sax-200 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    <span className="flex items-center gap-1.5 font-semibold leading-snug">
                      <Lock className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                      <span>{LOCKED_PRO_BANNER_TEXT}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#D97706] text-studio-950 font-extrabold shrink-0">
                      PRO
                    </span>
                  </button>
                )}

                <div
                  onClick={areProDrawersLocked ? () => openPlansModal('pro') : undefined}
                  className={areProDrawersLocked ? 'cursor-pointer' : ''}
                >
                <div
                  className={
                    areProDrawersLocked
                      ? 'space-y-3 opacity-40 pointer-events-none select-none'
                      : 'space-y-3'
                  }
                >
                {/* Toggles de Visibilidade de Cifras e Letras/Textos de Pauta */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isSvgLoading}
                    onClick={() => {
                      if (isSvgLoading) return;
                      scheduleScoreAction('toggle-chords', 40);
                      setShowChords((v) => !v);
                    }}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold border active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                      showChords
                        ? 'bg-[#D97706] border-sax-400 text-studio-950 font-extrabold shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {isProcessing && activeActionId === 'toggle-chords' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : showChords ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-zinc-500" />
                      )}
                      Cifras
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        showChords ? 'bg-black/20 text-studio-950 font-bold' : 'bg-black/30'
                      }`}
                    >
                      {showChords ? 'Visíveis' : 'Ocultas'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isSvgLoading}
                    onClick={() => {
                      if (isSvgLoading) return;
                      scheduleScoreAction('toggle-lyrics', 40);
                      setShowLyrics((v) => !v);
                    }}
                    title="Ocultar/mostrar letras cantadas e textos de pauta (mantém cabeçalho e textos de sistema)"
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold border active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                      showLyrics
                        ? 'bg-[#D97706] border-sax-400 text-studio-950 font-extrabold shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {isProcessing && activeActionId === 'toggle-lyrics' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : showLyrics ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-zinc-500" />
                      )}
                      Letras/Pauta
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        showLyrics ? 'bg-black/20 text-studio-950 font-bold' : 'bg-black/30'
                      }`}
                    >
                      {showLyrics ? 'Visíveis' : 'Ocultas'}
                    </span>
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 leading-snug">
                  &ldquo;Letras/Pauta&rdquo; também oculta textos inseridos na pauta, mantendo fixos
                  os textos de sistema e o cabeçalho.
                </p>

                {/* Afinação das Cifras Visíveis e Edição de Cifras Existentes */}
                {analysis?.hasChords && (
                  <div className="p-3 rounded-xl bg-zinc-900/90 border border-sax-500/30 space-y-2.5">
                    {hasAnyTransposingActive && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-sax-300">
                            Afinação das Cifras Visíveis ({activePartLabelInTopBar}):
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (!effectiveConvertChordsToWritten || isSvgLoading) return;
                              scheduleScoreAction('chords-concert', 40);
                              setConvertBbEbChordsToWritten(false);
                            }}
                            className={`py-1.5 px-2 rounded-lg font-semibold border flex items-center justify-center gap-1 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                              !effectiveConvertChordsToWritten
                                ? 'bg-[#D97706] border-sax-400 text-studio-950 font-extrabold shadow-sm'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                            }`}
                          >
                            {isProcessing && activeActionId === 'chords-concert' && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            <span>Tom Original (Piano)</span>
                          </button>
                          <button
                            type="button"
                            disabled={isSvgLoading || isMixedTransposition}
                            onClick={() => {
                              if (
                                isMixedTransposition ||
                                effectiveConvertChordsToWritten ||
                                isSvgLoading
                              ) {
                                return;
                              }
                              scheduleScoreAction('chords-written', 40);
                              setConvertBbEbChordsToWritten(true);
                            }}
                            className={`py-1.5 px-2 rounded-lg font-semibold border flex items-center justify-center gap-1 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed ${
                              effectiveConvertChordsToWritten
                                ? 'bg-[#D97706] text-studio-950 border-sax-400 font-extrabold shadow-sm'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                            }`}
                          >
                            {isProcessing && activeActionId === 'chords-written' && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            <span>
                              {detectedTuningLabel
                                ? `Tom Escrito (${detectedTuningLabel})`
                                : 'Tom Escrito (Transpositor)'}
                            </span>
                          </button>
                        </div>
                        {isMixedTransposition && (
                          <div className="p-2 rounded-lg bg-amber-950/50 border border-amber-500/40 text-[11px] font-semibold text-amber-200 flex items-start gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <span>
                              Isole um único instrumento transpositor para converter as cifras para o
                              tom escrito
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Cifras na tela (Clicáveis para Editar escrita de cifras existentes) */}
                    {transformResult && transformResult.previewChords.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-zinc-300 font-semibold flex items-center gap-1">
                            <Edit3 className="w-3 h-3 text-sax-400" />
                            Cifras na tela (clique para editar):
                          </span>
                          {Object.keys(chordOverrides).length > 0 && (
                            <button
                              type="button"
                              disabled={isSvgLoading}
                              onClick={() => {
                                if (isSvgLoading) return;
                                scheduleScoreAction('chords-reset', 40);
                                setChordOverrides({});
                                setSelectedChordSymbol(null);
                                setGlobalChordInput('');
                                setSelectedOccurrenceKey('');
                                setMeasureChordInput('');
                              }}
                              className="text-[10px] text-sax-400 hover:underline disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                            >
                              Restaurar cifras
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {transformResult.chordOccurrences
                            .reduce<Array<{ key: string; current: string; original: string }>>(
                              (acc, occ) => {
                                if (!acc.some((item) => item.original === occ.originalSymbol)) {
                                  acc.push({
                                    key: occ.originalSymbol,
                                    current: occ.currentSymbol,
                                    original: occ.originalSymbol,
                                  });
                                }
                                return acc;
                              },
                              []
                            )
                            .map((item) => {
                              const isSelected = selectedChordSymbol === item.original;
                              const isModified = item.current !== item.original;
                              return (
                                <button
                                  key={item.original}
                                  type="button"
                                  onClick={() => {
                                    setSelectedChordSymbol(item.original);
                                    setGlobalChordInput(item.current);
                                    const matchingOcc =
                                      transformResult.chordOccurrences.find(
                                        (o) => o.originalSymbol === item.original
                                      ) || transformResult.chordOccurrences[0];
                                    if (matchingOcc) {
                                      setSelectedOccurrenceKey(matchingOcc.occurrenceKey);
                                      setMeasureChordInput(matchingOcc.currentSymbol);
                                    } else {
                                      setSelectedOccurrenceKey('');
                                      setMeasureChordInput('');
                                    }
                                  }}
                                  className={`px-2 py-1 rounded-lg font-mono text-xs font-bold border active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                                    isSelected
                                      ? 'bg-sax-500 text-studio-950 border-sax-300 shadow-sm'
                                      : isModified
                                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                                      : 'bg-studio-950 hover:bg-zinc-800 border-zinc-700 text-sax-300'
                                  }`}
                                  title="Clique para alterar a escrita desta cifra na partitura"
                                >
                                  {item.current}
                                </button>
                              );
                            })}
                        </div>

                        {/* Duas caixas simultâneas de edição da cifra selecionada */}
                        {selectedChordSymbol !== null && (() => {
                          const matchingOccurrences = transformResult.chordOccurrences.filter(
                            (o) => o.originalSymbol === selectedChordSymbol
                          );
                          const occurrencesForDropdown =
                            matchingOccurrences.length > 0
                              ? matchingOccurrences
                              : transformResult.chordOccurrences;

                          return (
                            <div className="p-2.5 rounded-xl bg-studio-950 border border-sax-500/40 space-y-3 animate-fadeIn">
                              <div className="flex items-center justify-between text-[11px] border-b border-zinc-800 pb-1.5">
                                <span className="text-zinc-300 font-semibold">
                                  Editando cifra:{' '}
                                  <strong className="text-sax-400 font-mono">
                                    {selectedChordSymbol}
                                  </strong>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedChordSymbol(null);
                                    setGlobalChordInput('');
                                    setSelectedOccurrenceKey('');
                                    setMeasureChordInput('');
                                  }}
                                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                                  title="Fechar edição de cifra"
                                >
                                  ✕
                                </button>
                              </div>

                              {/* Caixa Superior: Editar todas iguais */}
                              <div className="space-y-1.5 p-2 rounded-lg bg-zinc-900/80 border border-zinc-800">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold text-zinc-100">
                                    Editar todas iguais
                                  </span>
                                  {isGlobalChordDraftDirty && (
                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                      Não aplicado
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-zinc-400 leading-snug">
                                  Altera todas as ocorrências desta cifra na partitura ao clicar em
                                  Aplicar.
                                </p>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={globalChordInput}
                                    onChange={(e) => setGlobalChordInput(e.target.value)}
                                    placeholder="Ex: Dm7(9), A7/C#, Bb9"
                                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-studio-950 border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-sax-500"
                                  />
                                  <button
                                    type="button"
                                    disabled={isSvgLoading || !globalChordInput.trim()}
                                    onClick={() => {
                                      if (!globalChordInput.trim() || isSvgLoading) return;
                                      const nextSym = globalChordInput.trim();
                                      scheduleScoreAction('chord-edit-apply', 40);
                                      setChordOverrides((prev) => ({
                                        ...prev,
                                        [selectedChordSymbol]: nextSym,
                                      }));
                                      setMeasureChordInput(nextSym);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-sax-500 hover:bg-sax-400 disabled:opacity-50 text-studio-950 text-xs font-bold shrink-0 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                                  >
                                    Aplicar
                                  </button>
                                </div>
                              </div>

                              {/* Caixa Inferior: Editar por compasso */}
                              <div className="space-y-1.5 p-2 rounded-lg bg-zinc-900/80 border border-zinc-800">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold text-zinc-100">
                                    Editar por compasso
                                  </span>
                                  {isMeasureChordDraftDirty && (
                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                      Não aplicado
                                    </span>
                                  )}
                                </div>
                                <select
                                  value={selectedOccurrenceKey}
                                  onChange={(e) => {
                                    const k = e.target.value;
                                    setSelectedOccurrenceKey(k);
                                    const found = occurrencesForDropdown.find(
                                      (o) => o.occurrenceKey === k
                                    );
                                    if (found) setMeasureChordInput(found.currentSymbol);
                                  }}
                                  className="w-full px-2 py-1.5 rounded-lg bg-studio-950 border border-zinc-700 text-[11px] text-zinc-200 focus:outline-none focus:border-sax-500"
                                >
                                  {occurrencesForDropdown.map((occ) => (
                                    <option key={occ.occurrenceKey} value={occ.occurrenceKey}>
                                      Compasso {occ.measureNumber}: {occ.currentSymbol} (orig:{' '}
                                      {occ.originalSymbol})
                                    </option>
                                  ))}
                                </select>
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={measureChordInput}
                                    onChange={(e) => setMeasureChordInput(e.target.value)}
                                    placeholder="Nova cifra neste compasso"
                                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-studio-950 border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-sax-500"
                                  />
                                  <button
                                    type="button"
                                    disabled={
                                      isSvgLoading ||
                                      !selectedOccurrenceKey ||
                                      !measureChordInput.trim()
                                    }
                                    onClick={() => {
                                      if (
                                        !selectedOccurrenceKey ||
                                        !measureChordInput.trim() ||
                                        isSvgLoading
                                      ) {
                                        return;
                                      }
                                      scheduleScoreAction('chord-occurrence-apply', 40);
                                      setChordOverrides((prev) => ({
                                        ...prev,
                                        [selectedOccurrenceKey]: measureChordInput.trim(),
                                      }));
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-sax-500 hover:bg-sax-400 disabled:opacity-50 text-studio-950 text-xs font-bold shrink-0 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                                  >
                                    Aplicar
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
                </div>
                </div>
              </section>

              {/* 3B. GAVETA EXCLUSIVA DE TEXTOS & CABEÇALHO (SEMPRE ABERTA NO MOBILE E DESKTOP) */}
              <section
                className={`${
                  mobileTab === 'headers' ? 'block' : 'hidden lg:block'
                } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-3`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                    <Type className="w-4 h-4" />
                    <span>Cabeçalho &amp; Textos Flutuantes</span>
                  </h2>
                  {renderDrawerCornerAction({
                    proLocked: areProDrawersLocked,
                    modified: isHeadersModified,
                    actionId: 'headers-drawer-reset',
                    onReset: handleResetHeaders,
                  })}
                </div>

                {areProDrawersLocked && (
                  <button
                    type="button"
                    onClick={() => openPlansModal('pro')}
                    className="w-full p-2.5 rounded-xl bg-sax-500/10 hover:bg-sax-500/20 border border-sax-500/40 text-left flex items-center justify-between gap-2 text-[11px] text-sax-200 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    <span className="flex items-center gap-1.5 font-semibold leading-snug">
                      <Lock className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                      <span>{LOCKED_PRO_BANNER_TEXT}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#D97706] text-studio-950 font-extrabold shrink-0">
                      PRO
                    </span>
                  </button>
                )}

                <div
                  onClick={areProDrawersLocked ? () => openPlansModal('pro') : undefined}
                  className={areProDrawersLocked ? 'cursor-pointer' : ''}
                >
                {/* Controles de Cabeçalho & Caixa de Texto Flutuante */}
                <div
                  className={
                    areProDrawersLocked
                      ? 'space-y-2.5 opacity-40 pointer-events-none select-none'
                      : 'space-y-2.5'
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={isSvgLoading}
                      onClick={() => {
                        if (isSvgLoading) return;
                        scheduleScoreAction('headers-toggle-all', 120);
                        setHeaders((h) => ({ ...h, showAllHeaders: !h.showAllHeaders }));
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-200 hover:text-sax-300 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                    >
                      {headers.showAllHeaders ? (
                        <Eye className="w-3.5 h-3.5 text-sax-400" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      <span>
                        Cabeçalho ({headers.showAllHeaders ? 'Visível' : 'Oculto'})
                      </span>
                    </button>

                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-zinc-800/90 border border-zinc-700 text-[10px] font-semibold text-zinc-300">
                      Confirmação manual
                    </span>
                  </div>

                  {/* Botão + Adicionar Texto Flutuante */}
                  <button
                    type="button"
                    onClick={handleAddFloatingText}
                    className="w-full py-2 px-3 rounded-xl bg-sax-500/15 hover:bg-sax-500/25 border border-sax-500/40 text-sax-300 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Adicionar Texto Flutuante</span>
                  </button>

                  {/* Lista de Caixas de Texto Flutuantes Criadas */}
                  {floatingTexts.length > 0 && (
                    <div className="space-y-2 p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-700 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="flex items-center gap-1 font-semibold text-zinc-300">
                          <Move className="w-3 h-3 text-sax-400" />
                          Textos Flutuantes (arraste na folha):
                        </span>
                      </div>
                      {floatingTexts.map((ft, idx) => (
                        <div
                          key={ft.id}
                          className="p-2 rounded-lg bg-studio-950 border border-zinc-800 space-y-1.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={ft.text}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFloatingTexts((prev) =>
                                  prev.map((item) =>
                                    item.id === ft.id ? { ...item, text: val } : item
                                  )
                                );
                              }}
                              placeholder={`Texto flutuante #${idx + 1}`}
                              className="flex-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-xs text-white"
                            />
                            <select
                              value={ft.fontSize}
                              onChange={(e) => {
                                const size = parseInt(e.target.value, 10) || 14;
                                setFloatingTexts((prev) =>
                                  prev.map((item) =>
                                    item.id === ft.id ? { ...item, fontSize: size } : item
                                  )
                                );
                              }}
                              className="px-1.5 py-1 rounded bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-200"
                              title="Tamanho da fonte"
                            >
                              {[10, 12, 14, 16, 18, 20, 24, 28].map((sz) => (
                                <option key={sz} value={sz}>
                                  {sz}pt
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() =>
                                setFloatingTexts((prev) =>
                                  prev.filter((item) => item.id !== ft.id)
                                )
                              }
                              className="p-1 rounded bg-red-950/60 text-red-300 hover:bg-red-900 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                              title="Remover texto flutuante"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] text-zinc-400">
                            <label className="flex flex-col gap-0.5">
                              <span>Horizontal (X): {Math.round(ft.xPercent)}%</span>
                              <input
                                type="range"
                                min={2}
                                max={88}
                                step={1}
                                value={ft.xPercent}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setFloatingTexts((prev) =>
                                    prev.map((item) =>
                                      item.id === ft.id ? { ...item, xPercent: val } : item
                                    )
                                  );
                                }}
                                className="accent-sax-500 h-1.5"
                              />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              <span>Vertical (Y): {Math.round(ft.yPercent)}%</span>
                              <input
                                type="range"
                                min={2}
                                max={92}
                                step={1}
                                value={ft.yPercent}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setFloatingTexts((prev) =>
                                    prev.map((item) =>
                                      item.id === ft.id ? { ...item, yPercent: val } : item
                                    )
                                  );
                                }}
                                className="accent-sax-500 h-1.5"
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Editor de Cabeçalho — Sempre aberto no Desktop e no Mobile */}
                  <div className="p-3 rounded-xl bg-zinc-900/95 border border-zinc-700 space-y-2.5 text-xs">
                    <p className="text-[11px] text-zinc-400">
                      Edite os textos de cabeçalho e clique em <strong className="text-zinc-200">Aplicar</strong> ao lado do campo para atualizar a partitura (fonte e tamanho originais travados):
                    </p>

                    {/* Título */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <label className="font-semibold text-zinc-300">Título:</label>
                          {isTitleDraftDirty && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Não aplicado
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              scheduleScoreAction('header-title-vis', 120);
                              setHeaders((h) => ({
                                ...h,
                                title: {
                                  ...h.title,
                                  visible: !h.title.visible,
                                  removed: false,
                                },
                              }));
                            }}
                            className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300 disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                          >
                            {headers.title.visible && !headers.title.removed
                              ? 'Ocultar'
                              : 'Mostrar'}
                          </button>
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              scheduleScoreAction('header-title-rm', 120);
                              setHeaders((h) => ({
                                ...h,
                                title: { ...h.title, removed: !h.title.removed },
                              }));
                            }}
                            className="p-1 rounded bg-red-950/60 text-red-300 hover:bg-red-900/60 disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                            title="Remover Título"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly={isSvgLoading}
                          disabled={headers.title.removed}
                          value={headerDrafts.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHeaderDrafts((prev) => ({ ...prev, title: val }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleApplyHeaderField('title');
                            }
                          }}
                          className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-studio-950 border text-zinc-100 disabled:opacity-40 focus:outline-none ${
                            isTitleDraftDirty
                              ? 'border-amber-500/70 ring-1 ring-amber-500/30'
                              : 'border-zinc-700 focus:border-sax-500'
                          }`}
                        />
                        <button
                          type="button"
                          disabled={isSvgLoading || headers.title.removed || !isTitleDraftDirty}
                          onClick={() => handleApplyHeaderField('title')}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed ${
                            isTitleDraftDirty
                              ? 'bg-sax-500 hover:bg-sax-400 text-studio-950 shadow-sm'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>

                    {/* Subtítulo */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <label className="font-semibold text-zinc-300">Subtítulo:</label>
                          {isSubtitleDraftDirty && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Não aplicado
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              scheduleScoreAction('header-sub-vis', 120);
                              setHeaders((h) => ({
                                ...h,
                                subtitle: {
                                  ...h.subtitle,
                                  visible: !h.subtitle.visible,
                                  removed: false,
                                },
                              }));
                            }}
                            className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300 disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                          >
                            {headers.subtitle.visible && !headers.subtitle.removed
                              ? 'Ocultar'
                              : 'Mostrar'}
                          </button>
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              scheduleScoreAction('header-sub-rm', 120);
                              setHeaders((h) => ({
                                ...h,
                                subtitle: { ...h.subtitle, removed: !h.subtitle.removed },
                              }));
                            }}
                            className="p-1 rounded bg-red-950/60 text-red-300 hover:bg-red-900/60 disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                            title="Remover Subtítulo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly={isSvgLoading}
                          disabled={headers.subtitle.removed}
                          placeholder="Ex: Artista / Cantor"
                          value={headerDrafts.subtitle}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHeaderDrafts((prev) => ({ ...prev, subtitle: val }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleApplyHeaderField('subtitle');
                            }
                          }}
                          className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-studio-950 border text-zinc-100 disabled:opacity-40 focus:outline-none ${
                            isSubtitleDraftDirty
                              ? 'border-amber-500/70 ring-1 ring-amber-500/30'
                              : 'border-zinc-700 focus:border-sax-500'
                          }`}
                        />
                        <button
                          type="button"
                          disabled={isSvgLoading || headers.subtitle.removed || !isSubtitleDraftDirty}
                          onClick={() => handleApplyHeaderField('subtitle')}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed ${
                            isSubtitleDraftDirty
                              ? 'bg-sax-500 hover:bg-sax-400 text-studio-950 shadow-sm'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>

                    {/* Compositor / Instrumento (Canto Superior Direito) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <label className="font-semibold text-zinc-300">
                            Instrumento (Canto Sup. Direito):
                          </label>
                          {isComposerDraftDirty && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Não aplicado
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              const nextAuto = !headers.composer.autoSyncInstrument;
                              scheduleScoreAction('header-comp-auto', 120);
                              setHeaders((h) => ({
                                ...h,
                                composer: {
                                  ...h.composer,
                                  autoSyncInstrument: nextAuto,
                                },
                              }));
                              if (nextAuto) {
                                setHeaderDrafts((prev) => ({
                                  ...prev,
                                  composer: activePartLabelInTopBar,
                                }));
                              } else {
                                setHeaderDrafts((prev) => ({
                                  ...prev,
                                  composer: headers.composer.text,
                                }));
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                              headers.composer.autoSyncInstrument
                                ? 'bg-sax-500/20 text-sax-300 border border-sax-500/40'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            Auto Pauta
                          </button>
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              scheduleScoreAction('header-comp-vis', 120);
                              setHeaders((h) => ({
                                ...h,
                                composer: {
                                  ...h.composer,
                                  visible: !h.composer.visible,
                                  removed: false,
                                },
                              }));
                            }}
                            className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300 disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                          >
                            {headers.composer.visible && !headers.composer.removed
                              ? 'Ocultar'
                              : 'Mostrar'}
                          </button>
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              scheduleScoreAction('header-comp-rm', 120);
                              setHeaders((h) => ({
                                ...h,
                                composer: { ...h.composer, removed: !h.composer.removed },
                              }));
                            }}
                            className="p-1 rounded bg-red-950/60 text-red-300 disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly={isSvgLoading}
                          disabled={headers.composer.removed}
                          value={headerDrafts.composer}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHeaderDrafts((prev) => ({ ...prev, composer: val }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleApplyHeaderField('composer');
                            }
                          }}
                          className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-studio-950 border text-zinc-100 disabled:opacity-40 focus:outline-none ${
                            isComposerDraftDirty
                              ? 'border-amber-500/70 ring-1 ring-amber-500/30'
                              : 'border-zinc-700 focus:border-sax-500'
                          }`}
                        />
                        <button
                          type="button"
                          disabled={isSvgLoading || headers.composer.removed || !isComposerDraftDirty}
                          onClick={() => handleApplyHeaderField('composer')}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed ${
                            isComposerDraftDirty
                              ? 'bg-sax-500 hover:bg-sax-400 text-studio-950 shadow-sm'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>

                    {/* Letrista / Indicador Tom para Piano */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <label className="font-semibold text-zinc-300">
                            Tom para Piano (Canto Sup. Esquerdo):
                          </label>
                          {isLyricistDraftDirty && (
                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Não aplicado
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              const nextAuto = !headers.lyricist.autoSyncPianoKey;
                              scheduleScoreAction('header-lyr-auto', 120);
                              setHeaders((h) => ({
                                ...h,
                                lyricist: {
                                  ...h.lyricist,
                                  autoSyncPianoKey: nextAuto,
                                },
                              }));
                              if (nextAuto) {
                                setHeaderDrafts((prev) => ({
                                  ...prev,
                                  lyricist: `Tom para Piano: ${currentConcertTonality.majorName}`,
                                }));
                              } else {
                                setHeaderDrafts((prev) => ({
                                  ...prev,
                                  lyricist: headers.lyricist.text,
                                }));
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] flex items-center gap-1 disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                              headers.lyricist.autoSyncPianoKey
                                ? 'bg-sax-500/20 text-sax-300 border border-sax-500/40'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            Auto Tom
                          </button>
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              scheduleScoreAction('header-lyr-vis', 120);
                              setHeaders((h) => ({
                                ...h,
                                lyricist: {
                                  ...h.lyricist,
                                  visible: !h.lyricist.visible,
                                  removed: false,
                                },
                              }));
                            }}
                            className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300 disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                          >
                            {headers.lyricist.visible && !headers.lyricist.removed
                              ? 'Ocultar'
                              : 'Mostrar'}
                          </button>
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              scheduleScoreAction('header-lyr-rm', 120);
                              setHeaders((h) => ({
                                ...h,
                                lyricist: { ...h.lyricist, removed: !h.lyricist.removed },
                              }));
                            }}
                            className="p-1 rounded bg-red-950/60 text-red-300 disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          readOnly={isSvgLoading}
                          disabled={headers.lyricist.removed}
                          value={headerDrafts.lyricist}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHeaderDrafts((prev) => ({ ...prev, lyricist: val }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleApplyHeaderField('lyricist');
                            }
                          }}
                          className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-studio-950 border text-zinc-100 disabled:opacity-40 focus:outline-none ${
                            isLyricistDraftDirty
                              ? 'border-amber-500/70 ring-1 ring-amber-500/30'
                              : 'border-zinc-700 focus:border-sax-500'
                          }`}
                        />
                        <button
                          type="button"
                          disabled={isSvgLoading || headers.lyricist.removed || !isLyricistDraftDirty}
                          onClick={() => handleApplyHeaderField('lyricist')}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-45 disabled:cursor-not-allowed ${
                            isLyricistDraftDirty
                              ? 'bg-sax-500 hover:bg-sax-400 text-studio-950 shadow-sm'
                              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                          }`}
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </section>

              {/* 4. NOVO PAINEL: TAMANHO DA PAUTA (ESCALA VETORIAL <Spatium>) */}
              <section
                className={`${
                  mobileTab === 'layout' ? 'block' : 'hidden lg:block'
                } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-3 text-xs`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                    <Scaling className="w-4 h-4" />
                    <span>Tamanho da Pauta (Escala)</span>
                  </h2>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-sax-500/15 text-sax-300 border border-sax-500/30 font-bold">
                      {staffScalePercent}%
                    </span>
                    {renderDrawerCornerAction({
                      proLocked: areProDrawersLocked,
                      modified: isScaleModified,
                      actionId: 'scale-drawer-reset',
                      onReset: handleResetScale,
                    })}
                  </div>
                </div>

                {areProDrawersLocked && (
                  <button
                    type="button"
                    onClick={() => openPlansModal('pro')}
                    className="w-full p-2.5 rounded-xl bg-sax-500/10 hover:bg-sax-500/20 border border-sax-500/40 text-left flex items-center justify-between gap-2 text-[11px] text-sax-200 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    <span className="flex items-center gap-1.5 font-semibold leading-snug">
                      <Lock className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                      <span>{LOCKED_PRO_BANNER_TEXT}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#D97706] text-studio-950 font-extrabold shrink-0">
                      PRO
                    </span>
                  </button>
                )}

                <div
                  onClick={areProDrawersLocked ? () => openPlansModal('pro') : undefined}
                  className={areProDrawersLocked ? 'cursor-pointer' : ''}
                >
                <div
                  className={
                    areProDrawersLocked
                      ? 'space-y-3 opacity-40 pointer-events-none select-none'
                      : 'space-y-3'
                  }
                >
                <p className="text-[11px] text-zinc-400">
                  Reduza ou amplie a escala das pautas para encaixar linhas órfãs sem diminuir os
                  textos do cabeçalho (
                  {(((analysis?.originalSpatium || 1.75) * staffScalePercent) / 100).toFixed(2)} mm).
                </p>

                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    disabled={isSvgLoading}
                    onClick={() =>
                      handleChangeStaffScale(staffScalePercent - 5, 'scale-down', 320)
                    }
                    className={`py-2 px-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                      isProcessing && activeActionId === 'scale-down'
                        ? 'bg-[#D97706] text-studio-950 border-sax-400'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                    }`}
                  >
                    {isProcessing && activeActionId === 'scale-down' && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    <span>- 5%</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSvgLoading}
                    onClick={() => handleChangeStaffScale(100, 'scale-reset', 40)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                      staffScalePercent === 100
                        ? 'bg-[#D97706] text-studio-950 border-sax-400 font-extrabold shadow-sm'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                    }`}
                  >
                    {isProcessing && activeActionId === 'scale-reset' && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    <span>100% (Original)</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSvgLoading}
                    onClick={() =>
                      handleChangeStaffScale(staffScalePercent + 5, 'scale-up', 320)
                    }
                    className={`py-2 px-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                      isProcessing && activeActionId === 'scale-up'
                        ? 'bg-[#D97706] text-studio-950 border-sax-400'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                    }`}
                  >
                    {isProcessing && activeActionId === 'scale-up' && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    <span>+ 5%</span>
                  </button>
                </div>

                {/* Pílulas de atalho direto */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {STAFF_SCALE_PILLS.map((pct) => {
                    const actionId = `scale-pill-${pct}`;
                    const isSelected = staffScalePercent === pct;
                    const isSpinning = isProcessing && activeActionId === actionId;
                    return (
                      <button
                        key={pct}
                        type="button"
                        disabled={isSvgLoading}
                        onClick={() => handleChangeStaffScale(pct, actionId, 40)}
                        className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold border inline-flex items-center gap-1 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'bg-[#D97706] text-studio-950 border-sax-400 shadow-sm'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
                        }`}
                      >
                        {isSpinning && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                        <span>{pct}%</span>
                      </button>
                    );
                  })}
                </div>
                </div>
                </div>
              </section>

              {/* 5. SISTEMA: QUEBRA DE COMPASSO E QUEBRA DE PÁGINA (SUBGAVETAS RETRÁTEIS — LIBERADO EM TODOS OS PLANOS) */}
              <section
                className={`${
                  mobileTab === 'layout' ? 'block' : 'hidden lg:block'
                } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-2.5 text-xs`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                    <SplitSquareVertical className="w-4 h-4" />
                    <span>Quebras do Sistema</span>
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-semibold">
                    Liberado
                  </span>
                </div>

                {/* Subgaveta Retrátil 1: Quebra de Compasso */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-zinc-900/80">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSystemAccordions((prev) => ({ ...prev, line: !prev.line }))
                      }
                      className="flex-1 flex items-center justify-between gap-2 text-left active:scale-[0.99] transition-transform duration-75 touch-manipulation"
                    >
                      <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-sax-400 transition-transform ${
                            openSystemAccordions.line ? 'rotate-180' : ''
                          }`}
                        />
                        <span>Quebra de Compasso</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                        {lineBreakMeasures.length === 0
                          ? 'Automático'
                          : `${lineBreakMeasures.length} quebras`}
                      </span>
                    </button>
                    {isLineBreaksModified && (
                      <button
                        type="button"
                        disabled={isSvgLoading}
                        onClick={handleResetLineBreaks}
                        className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sax-300 border border-zinc-700 font-semibold shrink-0 disabled:opacity-50"
                        title="Restaurar quebras de compasso"
                      >
                        Resetar
                      </button>
                    )}
                  </div>

                  {openSystemAccordions.line && (
                    <div className="p-3 space-y-3 border-t border-zinc-800/80">
                      {/* Opção 1 — Automático (Remover todas as quebras) */}
                      <button
                        type="button"
                        disabled={isSvgLoading}
                        onClick={handleAutoSystemBreaks}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                          systemBreakMode === 'auto' && lineBreakMeasures.length === 0
                            ? 'bg-[#D97706] text-studio-950 border-sax-400 font-extrabold shadow-sm'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                        }`}
                      >
                        {isProcessing && activeActionId === 'break-auto' && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        )}
                        <span>Automático (Padrão do Motor)</span>
                      </button>

                      {/* Opção 2 — Quebra a cada X compassos */}
                      <div className="p-2.5 rounded-xl bg-studio-950/80 border border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label className="text-[11px] font-semibold text-zinc-300">
                            Compassos por linha (1 a 12):
                          </label>
                          <select
                            value={measuresPerLineInput}
                            onChange={(e) =>
                              setMeasuresPerLineInput(parseInt(e.target.value, 10) || 4)
                            }
                            className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono font-bold text-sax-300 focus:outline-none focus:border-sax-500"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                              <option key={num} value={num}>
                                {num} {num === 1 ? 'compasso' : 'compassos'}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          disabled={isSvgLoading}
                          onClick={handleApplyEveryXMeasures}
                          className={`w-full py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                            systemBreakMode === 'every-x'
                              ? 'bg-[#D97706] text-studio-950 border-sax-400 font-extrabold shadow-sm'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                          }`}
                        >
                          {isProcessing && activeActionId === 'break-every-x' && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          )}
                          <span>Aplicar a cada {measuresPerLineInput} compassos</span>
                        </button>
                      </div>

                      {/* Opção 3 — Aplicar Quebra em Compasso Específico (Grade Interativa) */}
                      {(analysis?.measureCount || 0) > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-zinc-400 leading-snug">
                            Clique no número do compasso para ativar/desativar uma quebra de linha
                            após ele:
                          </p>
                          <div className="max-h-40 overflow-y-auto grid grid-cols-6 sm:grid-cols-8 gap-1 p-1.5 rounded-xl bg-studio-950/80 border border-zinc-800">
                            {Array.from({ length: analysis?.measureCount || 0 }, (_, idx) => {
                              const mNum = idx + 1;
                              const hasBreak = lineBreakMeasures.includes(mNum);
                              const actionId = `break-measure-${mNum}`;
                              const isSpinning = isProcessing && activeActionId === actionId;
                              return (
                                <button
                                  key={mNum}
                                  type="button"
                                  disabled={isSvgLoading}
                                  onClick={() => handleToggleMeasureBreak(mNum)}
                                  className={`h-7 rounded-md font-mono text-[11px] font-bold border flex items-center justify-center active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                                    hasBreak
                                      ? 'bg-[#D97706] text-studio-950 border-sax-400 font-extrabold shadow-sm'
                                      : 'bg-studio-950 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
                                  }`}
                                  title={
                                    hasBreak
                                      ? `Remover quebra de linha após o compasso ${mNum}`
                                      : `Inserir quebra de linha após o compasso ${mNum}`
                                  }
                                >
                                  {isSpinning ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    mNum
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Subgaveta Retrátil 2: Quebra de Página */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-zinc-900/80">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSystemAccordions((prev) => ({ ...prev, page: !prev.page }))
                      }
                      className="flex-1 flex items-center justify-between gap-2 text-left active:scale-[0.99] transition-transform duration-75 touch-manipulation"
                    >
                      <span className="font-bold text-zinc-100 flex items-center gap-1.5">
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-sky-400 transition-transform ${
                            openSystemAccordions.page ? 'rotate-180' : ''
                          }`}
                        />
                        <span>Quebra de Página</span>
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                        {pageBreakMeasures.length === 0
                          ? 'Automático'
                          : `${pageBreakMeasures.length} pág.`}
                      </span>
                    </button>
                    {isPageBreaksModified && (
                      <button
                        type="button"
                        disabled={isSvgLoading}
                        onClick={handleResetPageBreaks}
                        className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sky-300 border border-zinc-700 font-semibold shrink-0 disabled:opacity-50"
                        title="Restaurar quebras de página"
                      >
                        Resetar
                      </button>
                    )}
                  </div>

                  {openSystemAccordions.page && (
                    <div className="p-3 space-y-3 border-t border-zinc-800/80">
                      <button
                        type="button"
                        disabled={isSvgLoading}
                        onClick={handleClearPageBreaks}
                        className={`w-full py-2 px-3 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                          pageBreakMeasures.length === 0
                            ? 'bg-sky-500 text-studio-950 border-sky-400 font-extrabold shadow-sm'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                        }`}
                      >
                        {isProcessing && activeActionId === 'page-break-clear' && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        )}
                        <span>Sem quebras manuais (Automático)</span>
                      </button>

                      {(analysis?.measureCount || 0) > 0 && (
                        <>
                          <div className="p-2.5 rounded-xl bg-studio-950/80 border border-zinc-800 space-y-2">
                            <label className="block text-[11px] font-semibold text-zinc-300">
                              Quebra de página após o compasso:
                            </label>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={selectedPageBreakMeasureInput}
                                onChange={(e) =>
                                  setSelectedPageBreakMeasureInput(
                                    parseInt(e.target.value, 10) || 1
                                  )
                                }
                                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono font-bold text-sky-300 focus:outline-none focus:border-sky-500"
                              >
                                {Array.from(
                                  { length: analysis?.measureCount || 0 },
                                  (_, idx) => idx + 1
                                ).map((mNum) => {
                                  const active = pageBreakMeasures.includes(mNum);
                                  return (
                                    <option key={mNum} value={mNum}>
                                      Compasso {mNum}
                                      {active ? ' (com quebra)' : ''}
                                    </option>
                                  );
                                })}
                              </select>
                              <button
                                type="button"
                                disabled={isSvgLoading}
                                onClick={() =>
                                  handleTogglePageBreakMeasure(selectedPageBreakMeasureInput)
                                }
                                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-studio-950 text-xs font-extrabold shrink-0 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                              >
                                {pageBreakMeasures.includes(selectedPageBreakMeasureInput)
                                  ? 'Remover'
                                  : 'Inserir'}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <p className="text-[11px] text-zinc-400 leading-snug">
                              Ou clique diretamente no compasso para inserir/remover quebra de página:
                            </p>
                            <div className="max-h-40 overflow-y-auto grid grid-cols-6 sm:grid-cols-8 gap-1 p-1.5 rounded-xl bg-studio-950/80 border border-zinc-800">
                              {Array.from({ length: analysis?.measureCount || 0 }, (_, idx) => {
                                const mNum = idx + 1;
                                const hasBreak = pageBreakMeasures.includes(mNum);
                                const actionId = `page-break-measure-${mNum}`;
                                const isSpinning = isProcessing && activeActionId === actionId;
                                return (
                                  <button
                                    key={mNum}
                                    type="button"
                                    disabled={isSvgLoading}
                                    onClick={() => handleTogglePageBreakMeasure(mNum)}
                                    className={`h-7 rounded-md font-mono text-[11px] font-bold border flex items-center justify-center active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                                      hasBreak
                                        ? 'bg-sky-500 text-studio-950 border-sky-400 font-extrabold shadow-sm'
                                        : 'bg-studio-950 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
                                    }`}
                                    title={
                                      hasBreak
                                        ? `Remover quebra de página após o compasso ${mNum}`
                                        : `Inserir quebra de página após o compasso ${mNum}`
                                    }
                                  >
                                    {isSpinning ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      mNum
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* 6. PAUTAS INTERNAS (.MSCZ) — SEM O AVISO INFERIOR DE RODAPÉ BLINDADO */}
              <section
                className={`${
                  mobileTab === 'staves' ? 'block' : 'hidden lg:block'
                } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-2.5 text-xs`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Pautas Internas (.MSCZ)</span>
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-zinc-400">
                      {analysis?.measureCount || 0} comp.
                    </span>
                    {renderDrawerCornerAction({
                      proLocked: areProDrawersLocked,
                      modified: isStavesModified,
                      actionId: 'staves-drawer-reset',
                      onReset: handleResetStaves,
                    })}
                  </div>
                </div>

                {areProDrawersLocked && (
                  <button
                    type="button"
                    onClick={() => openPlansModal('pro')}
                    className="w-full p-2.5 rounded-xl bg-sax-500/10 hover:bg-sax-500/20 border border-sax-500/40 text-left flex items-center justify-between gap-2 text-[11px] text-sax-200 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    <span className="flex items-center gap-1.5 font-semibold leading-snug">
                      <Lock className="w-3.5 h-3.5 text-sax-400 shrink-0" />
                      <span>{LOCKED_PRO_BANNER_TEXT}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#D97706] text-studio-950 font-extrabold shrink-0">
                      PRO
                    </span>
                  </button>
                )}

                <div
                  onClick={areProDrawersLocked ? () => openPlansModal('pro') : undefined}
                  className={areProDrawersLocked ? 'cursor-pointer' : ''}
                >
                <div
                  className={
                    areProDrawersLocked
                      ? 'space-y-2.5 opacity-40 pointer-events-none select-none'
                      : 'space-y-2.5'
                  }
                >

                <p className="text-[11px] text-zinc-400">
                  Marque quais pautas deseja manter ativas simultaneamente na tela e no PDF (ou
                  clique em &ldquo;Só esta&rdquo; para isolar uma única parte). Pautas duplas (como
                  Piano) já vêm agrupadas juntas:
                </p>

                <div className="space-y-1.5">
                  {(analysis?.staves || []).map((st, idx) => {
                    const isActiveInSelection =
                      effectiveViewMode === 'full-score' ||
                      effectiveSelectedStaffIds.includes(st.staffId);
                    const isIsolatedOnly =
                      effectiveViewMode !== 'full-score' &&
                      effectiveSelectedStaffIds.length === 1 &&
                      effectiveSelectedStaffIds[0] === st.staffId;
                    const toggleActionId = `staff-toggle-${st.staffId}`;
                    const soloActionId = `staff-solo-${st.staffId}`;
                    const isToggling = isProcessing && activeActionId === toggleActionId;
                    const isSoloing = isProcessing && activeActionId === soloActionId;

                    return (
                      <div
                        key={st.staffId}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition ${
                          isActiveInSelection
                            ? 'bg-sax-500/20 border-sax-500 text-white shadow-sm'
                            : 'bg-zinc-900/80 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={isSvgLoading}
                          onClick={() => handleToggleStaffActive(st.staffId)}
                          className="flex items-center gap-2.5 flex-1 text-left truncate active:scale-[0.98] transition-transform duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            isActiveInSelection
                              ? 'Clique para ocultar esta parte'
                              : 'Clique para ativar esta parte junto com as selecionadas'
                          }
                        >
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition ${
                              isActiveInSelection
                                ? 'bg-[#D97706] border-sax-400 text-studio-950'
                                : 'bg-zinc-950 border-zinc-600 text-transparent'
                            }`}
                          >
                            {isToggling ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Check className="w-3 h-3 stroke-[3]" />
                            )}
                          </span>
                          <span className="font-semibold text-xs truncate">
                            Parte {idx + 1}: {st.partSelectorLabel}
                          </span>
                        </button>

                        <button
                          type="button"
                          disabled={isSvgLoading}
                          onClick={() => handleSelectSingleStaff(st.staffId)}
                          className={`text-[10px] px-2 py-1 rounded-md font-bold shrink-0 inline-flex items-center gap-1 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                            isIsolatedOnly
                              ? 'bg-[#D97706] text-studio-950 font-extrabold shadow-sm'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                          }`}
                          title="Exibir apenas esta parte isolada"
                        >
                          {isSoloing && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                          <span>{isIsolatedOnly ? 'Isolada' : 'Só esta'}</span>
                        </button>
                      </div>
                    );
                  })}

                  {(analysis?.staves.length || 0) > 1 && (
                    <button
                      type="button"
                      disabled={isSvgLoading}
                      onClick={() => handleChangeViewMode('full-score')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border text-left active:scale-[0.99] transition-transform duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                        effectiveViewMode === 'full-score'
                          ? 'bg-[#D97706] border-sax-400 text-studio-950 font-extrabold shadow-sm'
                          : 'bg-zinc-900/80 hover:bg-zinc-800/80 border-zinc-800 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isProcessing && activeActionId === 'view-full-score' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <FileText
                            className={`w-3.5 h-3.5 ${
                              effectiveViewMode === 'full-score' ? 'text-studio-950' : 'text-sax-400'
                            }`}
                          />
                        )}
                        <span className="font-semibold text-xs">
                          Grade Completa ({analysis?.staves.length || 0} instrumentos empilhados)
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          effectiveViewMode === 'full-score'
                            ? 'bg-black/20 text-studio-950'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {effectiveViewMode === 'full-score' ? 'Ativa' : 'Empilhar'}
                      </span>
                    </button>
                  )}
                </div>
                </div>
                </div>
              </section>
              </div>
            </div>
          </aside>

          {/* ÁREA PRINCIPAL DE VISUALIZAÇÃO DA PARTITURA (Motor Vetorial MuseScore SVG) */}
          <main className="flex-1 flex flex-col order-1 lg:order-2 min-h-[54vh] lg:h-[calc(100vh-68px)] overflow-hidden">
            {isLoadingFile ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-zinc-400">
                <Loader2 className="w-8 h-8 text-sax-400 animate-spin" />
                <p className="text-sm font-semibold text-zinc-200">
                  Processando pacote .mscz e diagramação original...
                </p>
              </div>
            ) : !analysis ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (!ensureCopyrightAccepted()) return;
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFileUpload(f);
                }}
                className="flex-1 flex flex-col items-center justify-center gap-6 p-4 sm:p-8 overflow-y-auto"
              >
                <div
                  className={`w-full max-w-xl rounded-3xl border-2 border-dashed p-6 sm:p-10 text-center transition-all shadow-2xl space-y-5 ${
                    isDragging
                      ? 'border-sax-400 bg-sax-500/10 scale-[1.01]'
                      : 'border-zinc-700/80 bg-studio-900/70'
                  }`}
                >
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-sax-500/15 border border-sax-500/40 flex items-center justify-center">
                    <Music className="w-8 h-8 text-sax-400" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-lg sm:text-xl font-extrabold text-white">
                      Nenhuma partitura carregada ainda
                    </h2>
                    <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                      Envie ou arraste um arquivo <code className="text-sax-300">.mscz</code>,{' '}
                      <code className="text-sax-300">.mscx</code>,{' '}
                      <code className="text-sax-300">.xml</code> ou{' '}
                      <code className="text-sax-300">.mxl</code> para liberar o visor vetorial e
                      todas as ferramentas do estúdio.
                    </p>
                  </div>

                  {!copyrightAccepted && (
                    <div
                      className={`w-full text-left rounded-2xl p-3.5 border transition ${
                        copyrightError
                          ? 'bg-red-950/40 border-red-500 ring-2 ring-red-500/30'
                          : 'bg-studio-950/90 border-zinc-700 hover:border-sax-500/50'
                      }`}
                    >
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={copyrightAccepted}
                          onChange={(e) => handleToggleCopyright(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded accent-[#D97706] cursor-pointer shrink-0"
                        />
                        <span className="text-xs text-zinc-200 leading-relaxed">
                          Declaro possuir direitos ou autorização sobre o material enviado (
                          <strong>Lei nº 9.610/98</strong>).
                        </span>
                      </label>
                    </div>
                  )}

                  <div className="flex flex-col items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (!ensureCopyrightAccepted()) return;
                        fileInputRef.current?.click();
                      }}
                      className={`inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-extrabold text-sm shadow-xl active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                        copyrightAccepted
                          ? 'bg-gradient-to-r from-sax-500 to-sax-600 hover:from-sax-400 hover:to-sax-500 text-studio-950 shadow-sax-500/20'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-600'
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      <span>Enviar Partitura (.mscz, .mscx, .xml, .mxl)</span>
                    </button>

                    <button
                      type="button"
                      disabled={isLoadingDemo || isLoadingFile}
                      onClick={() => void handleLoadOfficialDemo()}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/45 text-emerald-200 text-xs font-extrabold disabled:opacity-50 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                    >
                      {isLoadingDemo ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                      )}
                      <span>Testar App com &ldquo;Parabéns pra Você&rdquo; (Demo Completa)</span>
                    </button>
                  </div>
                </div>

                {renderRecentProjectsSection()}
              </div>
            ) : (
              <ScoreViewer
                modifiedMscx={
                  renderedSnapshotMscx || transformResult?.modifiedMscx || ''
                }
                originalBase64={originalBase64}
                fileName={analysis.fileName}
                semitoneShift={semitoneShift}
                octaveShift={currentPartOctaveShift}
                lineBreakMeasures={lineBreakMeasures}
                pageBreakMeasures={pageBreakMeasures}
                totalPartsCount={analysis.staves.length}
                firstPartNoticeLabel={
                  analysis.staves[0]?.partSelectorLabel || analysis.detectedInstrumentName
                }
                isDemoScore={isDemoScore}
                onUploadOwnScore={handleStartOwnUploadFromDemo}
                canvasTheme={canvasTheme}
                onThemeChange={setCanvasTheme}
                viewMode={effectiveViewMode}
                onViewModeChange={handleChangeViewMode}
                floatingTexts={floatingTexts}
                onUpdateFloatingTextPosition={handleUpdateFloatingTextPosition}
                renderVersion={renderVersion}
                onRequestPreview={handleTriggerPreview}
                onLoadingChange={setIsSvgLoading}
                activeActionId={activeActionId}
                loadingReason={loadingReason}
                ctaButtonText={appSettings.paywall.cta_button_text}
                accessLevel={accessLevel}
                freePassSettings={appSettings.free_pass}
                freePassStatus={freePassStatus}
                isAuthenticated={Boolean(authUser)}
                isClaimingFreePass={isClaimingFreePass}
                freePassError={freePassError}
                onRequireLoginForFreePass={() => setAuthModalOpen(true)}
                onClaimFreePass={() => void handleClaimFreePass()}
                onFreePassExpired={() =>
                  void refreshAuthAndSettings(fileHash, 'if-access-changed')
                }
                onOpenPlansModal={(reason) => openPlansModal(reason || 'default')}
                onPreviewStateChange={setViewerPreviewState}
              />
            )}
          </main>
        </div>
      )}

      {/* RODAPÉ INSTITUCIONAL COMPLETO E LINKS LEGAIS */}
      <EcosystemFooter supportLinks={appSettings.support_links} />

      {/* MENU MOBILE DA CONTA (Renderizado na raiz para nunca ser cortado nas bordas da tela) */}
      {authUser && userMenuOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end justify-center p-3 animate-fadeIn"
          onClick={() => setUserMenuOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-studio-900 border border-zinc-700 shadow-2xl overflow-hidden text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3.5 border-b border-zinc-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-extrabold text-white truncate">
                  {authUser.full_name || 'Músico Rubsax'}
                </p>
                <p className="text-xs text-zinc-400 truncate">{authUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setUserMenuOpen(false)}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                aria-label="Fechar menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2 space-y-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  setAccountModalInitialTab('account');
                  setAccountModalOpen(true);
                }}
                className="w-full px-3.5 py-3 rounded-xl text-left hover:bg-zinc-800 text-zinc-100 font-bold flex items-center gap-2.5 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                <User className="w-4 h-4 text-sax-400" />
                <span>Minha Conta</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  setAccountModalInitialTab('projects');
                  setAccountModalOpen(true);
                }}
                className="w-full px-3.5 py-3 rounded-xl text-left hover:bg-zinc-800 text-zinc-100 font-bold flex items-center justify-between gap-2.5 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                <span className="inline-flex items-center gap-2.5">
                  <FolderOpen className="w-4 h-4 text-sax-400" />
                  <span>Meus Projetos</span>
                </span>
                {recentProjects.length > 0 && (
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-sax-300">
                    {recentProjects.length}/5
                  </span>
                )}
              </button>
              <Link
                href="/conta"
                onClick={() => setUserMenuOpen(false)}
                className="w-full px-3.5 py-3 rounded-xl hover:bg-zinc-800 text-zinc-200 font-semibold flex items-center gap-2.5 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                <Crown className="w-4 h-4 text-sax-400" />
                <span>Área do Cliente &amp; Planos</span>
              </Link>
              {isDev && (
                <Link
                  href="/admin"
                  onClick={() => setUserMenuOpen(false)}
                  className="w-full px-3.5 py-3 rounded-xl hover:bg-zinc-800 text-sax-300 font-extrabold flex items-center gap-2.5 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation"
                >
                  <Shield className="w-4 h-4 text-sax-400" />
                  <span>Painel /admin</span>
                </Link>
              )}
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full px-3.5 py-3 rounded-xl text-left hover:bg-red-950/40 text-red-300 font-bold border-t border-zinc-800 mt-1 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                Sair da Conta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAIS DE AUTENTICAÇÃO, PLANOS, TUTORIAL E ÁREA DO CLIENTE */}
      <AuthModal
        open={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setPendingPlanIntent(null);
        }}
        googleNextPath={workspaceView === 'editor' ? '/?view=editor' : '/'}
        onAuthenticated={(u) => {
          setAuthUser(u);
          setAuthUserImmediate(u);
          void refreshAuthAndSettings(fileHash, 'if-access-changed');
          if (pendingPlanIntent) {
            openPlansModal('pro');
          }
        }}
      />

      <PlansModal
        open={plansModalOpen}
        onClose={() => {
          setPlansModalOpen(false);
          setPendingPlanIntent(null);
          setPlansModalReason('default');
        }}
        user={authUser}
        pricing={appSettings.pricing}
        paywall={appSettings.paywall}
        fileHash={fileHash}
        fileName={analysis?.fileName}
        initialPlanToStart={pendingPlanIntent}
        freePassSettings={appSettings.free_pass}
        freePassStatus={freePassStatus}
        isClaimingFreePass={isClaimingFreePass}
        freePassError={freePassError}
        modalContextReason={plansModalReason}
        onClaimFreePass={() => void handleClaimFreePass()}
        onRequireLoginForFreePass={() => setAuthModalOpen(true)}
        onFreePassExpired={() =>
          void refreshAuthAndSettings(fileHash, 'if-access-changed')
        }
        onRequireLogin={(pendingPlan) => {
          setPendingPlanIntent(pendingPlan || null);
          setAuthModalOpen(true);
        }}
        onPaymentApproved={() => {
          setPendingPlanIntent(null);
          void refreshAuthAndSettings(fileHash, 'if-access-changed');
        }}
      />

      <AccountModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        user={authUser}
        isDev={isDev}
        activeSubscription={activeSubscription}
        activeSingleUnlocks={activeSingleUnlocks}
        freePassSettings={appSettings.free_pass}
        freePassStatus={freePassStatus}
        initialTab={accountModalInitialTab}
        recentProjectsOverride={recentProjects}
        onOpenRecentProject={(proj) => {
          setAccountModalOpen(false);
          void handleOpenRecentProject(proj);
        }}
        onRecentProjectsChanged={setRecentProjects}
        onOpenPlans={() => {
          setAccountModalOpen(false);
          openPlansModal('pro');
        }}
        onFreePassExpired={() =>
          void refreshAuthAndSettings(fileHash, 'if-access-changed')
        }
        onSignOut={handleSignOut}
        onAccountDeleted={() => {
          setAccountModalOpen(false);
          setAuthUser(null);
          setAuthUserImmediate(null);
          setIsDev(false);
          accessLevelRef.current = 'preview';
          setAccessLevel('preview');
          setActiveSubscription(null);
          setActiveSingleUnlocks([]);
          setFreePassStatus(null);
          setFreePassError(null);
          if (analysis) {
            setLoadingReason('logout');
            setRenderVersion((v) => v + 1);
          }
        }}
        onSubscriptionUpdated={() => {
          void refreshAuthAndSettings(fileHash, 'if-access-changed');
        }}
        onRenewMonthlyPix={() => {
          setAccountModalOpen(false);
          setPendingPlanIntent('monthly_pix');
          openPlansModal('pro');
        }}
      />

      <TutorialModal
        open={tutorialModalOpen}
        onClose={() => setTutorialModalOpen(false)}
        title={appSettings.tutorial.title || 'Como usar o Rubsax Transposer'}
        videoId={tutorialVideoId}
      />

      {/* OVERLAY CENTRALIZADO E GRANDE: GERANDO PDF */}
      {isExportingPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-studio-900 border-2 border-sax-500/60 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-sax-500/15 border border-sax-500/40 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-sax-400 animate-spin" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                Gerando PDF da Partitura...
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                O motor do MuseScore 3 está preparando seu arquivo PDF em alta definição. O
                download começará automaticamente em instantes...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CENTRALIZADO DE CONFERÊNCIA: ALTERAÇÕES PENDENTES OU PROCESSAMENTO ANTES DE EXPORTAR PDF */}
      {showUnappliedChangesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-studio-900 border-2 border-sax-500/50 shadow-2xl overflow-hidden text-zinc-100">
            {pendingUnappliedItems.length > 0 ? (
              <>
                <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-amber-600/25 via-sax-500/15 to-transparent border-b border-zinc-800">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 mb-0.5">
                      Alterações Não Aplicadas
                    </span>
                    <h3 className="text-base sm:text-lg font-extrabold text-white">
                      Confirme suas edições antes do PDF
                    </h3>
                  </div>
                </div>

                <div className="p-5 text-sm text-zinc-300 leading-relaxed space-y-3">
                  <p>
                    Há edições digitadas que ainda não foram aplicadas na visualização da partitura:
                  </p>
                  <ul className="rounded-xl bg-studio-950 border border-zinc-800 divide-y divide-zinc-800/80 text-xs font-semibold text-amber-200">
                    {pendingUnappliedItems.map((item) => (
                      <li key={item.id} className="px-3.5 py-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        <span>{item.label}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-zinc-400">
                    Você pode aplicar todas essas alterações automaticamente e exportar o PDF em
                    seguida, ou voltar para revisar na tela.
                  </p>
                </div>

                <div className="px-5 py-4 bg-studio-950 border-t border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUnappliedChangesModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-zinc-700 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    Voltar para revisar
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyAllPendingAndExportPdf}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-sax-500 hover:bg-sax-400 text-studio-950 text-xs font-extrabold shadow-lg shadow-sax-500/20 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>Aplicar tudo e Exportar PDF</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-sax-600/25 via-sax-500/15 to-transparent border-b border-zinc-800">
                  <div className="p-2.5 rounded-xl bg-sax-500/20 border border-sax-500/40 text-sax-400">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sax-500/20 text-sax-300 border border-sax-500/30 mb-0.5">
                      Conferência Antes do Download
                    </span>
                    <h3 className="text-base sm:text-lg font-extrabold text-white">
                      Atualização Visual em Andamento
                    </h3>
                  </div>
                </div>

                <div className="p-5 text-sm text-zinc-300 leading-relaxed space-y-2">
                  <p>
                    A visualização na tela ainda está finalizando a última alteração automática.
                    Deseja aguardar na tela ou gerar o PDF imediatamente?
                  </p>
                </div>

                <div className="px-5 py-4 bg-studio-950 border-t border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUnappliedChangesModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-zinc-700 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    Aguardar na Tela
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowUnappliedChangesModal(false);
                      void executeExportPdf();
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-sax-500 hover:bg-sax-400 text-studio-950 text-xs font-extrabold shadow-lg shadow-sax-500/20 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>Gerar PDF Agora</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE BLOQUEIO DO PDF APENAS NA PARTITURA DE DEMONSTRAÇÃO */}
      {showDemoPdfBlockedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowDemoPdfBlockedModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-studio-900 border-2 border-emerald-500/50 shadow-2xl overflow-hidden text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-emerald-600/20 via-sax-500/10 to-transparent border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 mb-0.5">
                    Partitura Demo Interativa
                  </span>
                  <h3 className="text-base font-extrabold text-white">
                    Exportar PDF bloqueado no teste
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDemoPdfBlockedModal(false)}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 text-xs sm:text-sm text-zinc-300 leading-relaxed space-y-3">
              <p>
                Na música demonstrativa <strong className="text-white">Parabéns pra Você</strong>,
                você tem acesso total à visualização e às 5 gavetas de edição para testar o app
                livremente.
              </p>
              <p className="text-zinc-400 text-xs">
                Para gerar e baixar um arquivo PDF, envie a sua própria partitura (você poderá usar
                inclusive seu <strong>Modo Gratuito</strong> ou planos PRO).
              </p>
            </div>

            <div className="px-5 py-4 bg-studio-950 border-t border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDemoPdfBlockedModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold border border-zinc-700"
              >
                Continuar Testando
              </button>
              <Link
                href="/planos"
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sax-300 text-xs font-bold border border-zinc-700 text-center"
              >
                Ver Planos
              </Link>
              <button
                type="button"
                onClick={handleStartOwnUploadFromDemo}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#D97706] hover:bg-sax-400 text-studio-950 text-xs font-extrabold shadow-lg shadow-sax-500/20"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Enviar Minha Partitura</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
