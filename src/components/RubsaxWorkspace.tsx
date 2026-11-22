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
import { loadWorkspaceSession, saveWorkspaceSession } from '@/lib/workspace-storage';
import { recordInternalRoute } from '@/lib/nav-history';
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
} from 'lucide-react';

const LOCKED_PRO_BANNER_TEXT =
  'Recurso PRO (Avulso ou Mensal) • O Modo Gratuito libera apenas Transposição & Oitava';

type TransposeDirectionMode = 'closest' | 'up' | 'down';
type SystemBreakMode = 'initial' | 'auto' | 'every-x' | 'custom';
type MobileTabId = 'transpose' | 'display' | 'headers' | 'layout' | 'staves';

const STAFF_SCALE_PILLS = [80, 85, 90, 95, 100, 105, 110] as const;

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

export default function RubsaxWorkspace() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Aceite obrigatório de Direitos Autorais (persistido em localStorage)
  const [copyrightAccepted, setCopyrightAccepted] = useState<boolean>(false);
  const [copyrightError, setCopyrightError] = useState<boolean>(false);

  // Sessão Auth, Modo Dev, Configurações Dinâmicas & Controle de Acesso
  const [authUser, setAuthUser] = useState<ClientAuthUser | null>(null);
  const [isDev, setIsDev] = useState<boolean>(false);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('preview');
  const [activeSubscription, setActiveSubscription] = useState<SubscriptionRow | null>(null);
  const [activeSingleUnlocks, setActiveSingleUnlocks] = useState<SingleUnlockRow[]>([]);
  const [freePassStatus, setFreePassStatus] = useState<FreePassStatus | null>(null);
  const [isClaimingFreePass, setIsClaimingFreePass] = useState<boolean>(false);
  const [freePassError, setFreePassError] = useState<string | null>(null);
  const [plansModalReason, setPlansModalReason] = useState<'fullscreen' | 'pro' | 'default'>(
    'default'
  );
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
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
  const [tutorialModalOpen, setTutorialModalOpen] = useState<boolean>(false);
  const [pendingPlanIntent, setPendingPlanIntent] =
    useState<PlanCheckoutKind | null>(null);

  // Separação entre Tela Inicial ('welcome') e Área do Editor ('editor') + Motivo do Loading
  const [workspaceView, setWorkspaceView] = useState<'welcome' | 'editor'>('welcome');
  const [loadingReason, setLoadingReason] = useState<ScoreLoadingReason>('initial');
  const [isRestoringSession, setIsRestoringSession] = useState<boolean>(true);

  const fileHashRef = useRef<string>('');
  const accessLevelRef = useRef<AccessLevel>('preview');
  const analysisRef = useRef<ScoreAnalysis | null>(null);
  const hasExplicitViewChoiceRef = useRef<boolean>(false);
  const isSessionHydratedRef = useRef<boolean>(false);

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
  const [transposeDirection, setTransposeDirection] =
    useState<TransposeDirectionMode>('closest');
  const [octaveShift, setOctaveShift] = useState<number>(0);
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

  // Quebra de Compasso (Sistema) e Tamanho da Pauta (Escala <Spatium>)
  const [lineBreakMeasures, setLineBreakMeasures] = useState<number[]>([]);
  const [systemBreakMode, setSystemBreakMode] = useState<SystemBreakMode>('initial');
  const [measuresPerLineInput, setMeasuresPerLineInput] = useState<number>(4);
  const [staffScalePercent, setStaffScalePercent] = useState<number>(100);

  // Edição de Cifras Existentes & Caixas de Texto Flutuantes
  const [chordOverrides, setChordOverrides] = useState<Record<string, string>>({});
  const [editingChordKey, setEditingChordKey] = useState<string | null>(null);
  const [editingChordValue, setEditingChordValue] = useState<string>('');
  const [chordEditMode, setChordEditMode] = useState<'symbol' | 'occurrence'>('symbol');
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
        const qs = effectiveHash ? `?fileHash=${encodeURIComponent(effectiveHash)}` : '';
        const res = await fetch(`/api/auth/me${qs}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json();
        const prevLevel = accessLevelRef.current;
        const nextLevel: AccessLevel = data.access?.level || 'preview';

        setAuthUser(data.user || null);
        setIsDev(Boolean(data.isDev));
        accessLevelRef.current = nextLevel;
        setAccessLevel(nextLevel);
        setActiveSubscription(data.activeSubscription || null);
        setActiveSingleUnlocks(data.activeSingleUnlocks || []);
        setFreePassStatus(data.freePassStatus || null);

        if (data.settings) {
          setAppSettings((prev) => ({
            ...prev,
            pricing: data.settings.pricing || prev.pricing,
            paywall: data.settings.paywall || prev.paywall,
            announcement: data.settings.announcement || prev.announcement,
            operations: { ...prev.operations, ...(data.settings.operations || {}) },
            support_links: data.settings.support_links || prev.support_links,
            tutorial: { ...prev.tutorial, ...(data.settings.tutorial || {}) },
            free_pass: { ...prev.free_pass, ...(data.settings.free_pass || {}) },
          }));
        }

        const accessChanged = prevLevel !== nextLevel;

        if (
          analysisRef.current &&
          (reloadMode === 'force' ||
            (reloadMode === 'if-access-changed' && accessChanged))
        ) {
          setLoadingReason(nextLevel !== 'preview' ? 'unlocking' : 'logout');
          setRenderVersion((v) => v + 1);
        }

        return data;
      } catch {
        return null;
      }
    },
    []
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

      // Alinha visualmente as quebras automáticas no cliente sem disparar duplo render
      skipNextAutoTransformRef.current = true;
      setLineBreakMeasures([]);
      setSystemBreakMode('auto');
      setPlansModalOpen(false);
      setLoadingReason('unlocking');
      await refreshAuthAndSettings(fileHashRef.current, 'force');
    } finally {
      setIsClaimingFreePass(false);
    }
  }, [isClaimingFreePass, refreshAuthAndSettings]);

  // Bootstrap inicial: restaura localStorage, sessão salva no IndexedDB e autenticação do usuário
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

      const savedSession = await loadWorkspaceSession();
      if (cancelled) return;

      let restoredHash = '';
      if (savedSession) {
        try {
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
          const validRestoredStaffIds = new Set(restoredAnalysis.staves.map((s) => s.staffId));
          const filteredSavedStaffIds = (savedSession.selectedStaffIds || []).filter((id) =>
            validRestoredStaffIds.has(id)
          );
          const restoredStaffIds: string[] =
            filteredSavedStaffIds.length > 0
              ? filteredSavedStaffIds
              : [restoredAnalysis.staves[0]?.staffId || '1'];
          const restoredOptions: ScoreTransformOptions = {
            semitoneShift: savedSession.semitoneShift ?? 0,
            octaveShift: savedSession.octaveShift ?? 0,
            targetInstrumentId:
              savedSession.targetInstrumentId || restoredAnalysis.detectedInstrumentId,
            selectedStaffId: restoredStaffIds[0] || '1',
            selectedStaffIds: restoredStaffIds,
            viewMode: savedSession.viewMode || 'portrait',
            convertBbEbChordsToWritten: Boolean(savedSession.convertBbEbChordsToWritten),
            showChords: savedSession.showChords ?? true,
            showLyrics: savedSession.showLyrics ?? true,
            headers: savedSession.headers || restoredAnalysis.headers,
            chordOverrides: savedSession.chordOverrides || {},
            floatingTexts: [],
            lineBreakMeasures:
              savedSession.lineBreakMeasures || restoredAnalysis.initialLineBreakMeasures,
            staffScalePercent: savedSession.staffScalePercent ?? 100,
          };

          const restoredTransform = transformScoreXml(
            savedSession.originalMscx,
            restoredAnalysis,
            restoredOptions
          );

          restoredHash = savedSession.fileHash || '';
          skipNextAutoTransformRef.current = true;
          setFileHash(restoredHash);
          fileHashRef.current = restoredHash;
          setOriginalBase64(savedSession.originalBase64);
          setOriginalMscx(savedSession.originalMscx);
          setAnalysis(restoredAnalysis);
          analysisRef.current = restoredAnalysis;

          setSemitoneShift(restoredOptions.semitoneShift);
          setOctaveShift(restoredOptions.octaveShift);
          setTargetInstrumentId(restoredOptions.targetInstrumentId);
          setSelectedStaffIds(restoredStaffIds);
          setViewMode(restoredOptions.viewMode);
          setConvertBbEbChordsToWritten(restoredOptions.convertBbEbChordsToWritten);
          setShowChords(restoredOptions.showChords);
          setShowLyrics(restoredOptions.showLyrics);
          setHeaders(restoredOptions.headers);
          setLineBreakMeasures(restoredOptions.lineBreakMeasures || []);
          setSystemBreakMode(savedSession.systemBreakMode || 'initial');
          setMeasuresPerLineInput(savedSession.measuresPerLineInput || 4);
          setStaffScalePercent(restoredOptions.staffScalePercent || 100);
          setChordOverrides(restoredOptions.chordOverrides);
          setFloatingTexts(savedSession.floatingTexts || []);
          setCanvasTheme(savedSession.canvasTheme || 'parchment');
          setTransformResult(restoredTransform);
          renderedSnapshotMscxRef.current = restoredTransform.modifiedMscx;
          setRenderedSnapshotMscx(restoredTransform.modifiedMscx);
          setLoadingReason('initial');
          setRenderVersion((v) => v + 1);
          if (urlView !== 'home' && !hasExplicitViewChoiceRef.current) {
            setWorkspaceView('editor');
          }
        } catch {
          // Sessão salva incompatível; ignora e segue limpo
        }
      } else if (urlView === 'editor' && !hasExplicitViewChoiceRef.current) {
        setWorkspaceView('editor');
      }

      const meData = await refreshAuthAndSettings(restoredHash, 'none');
      if (cancelled) return;

      if (!hasExplicitViewChoiceRef.current) {
        if (urlView === 'home') {
          setWorkspaceView('welcome');
        } else if (urlView === 'editor' || savedSession || meData?.user) {
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
  }, [refreshAuthAndSettings]);

  // Registra navegação interna para o botão inteligente "Voltar"
  useEffect(() => {
    if (isRestoringSession) return;
    recordInternalRoute(workspaceView === 'editor' ? '/?view=editor' : '/?view=home');
  }, [workspaceView, isRestoringSession]);

  // Auto-salva a partitura e edições atuais no IndexedDB para sobreviver a reloads (F5) e trocas de página
  useEffect(() => {
    if (!isSessionHydratedRef.current || !analysis || !originalBase64 || !originalMscx) {
      return;
    }
    const timer = setTimeout(() => {
      void saveWorkspaceSession({
        fileName: analysis.fileName,
        fileFormat: analysis.fileFormat,
        originalBase64,
        originalMscx,
        fileHash,
        semitoneShift,
        octaveShift,
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
        systemBreakMode,
        measuresPerLineInput,
        staffScalePercent,
        canvasTheme,
        savedAt: Date.now(),
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [
    analysis,
    originalBase64,
    originalMscx,
    fileHash,
    semitoneShift,
    octaveShift,
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
    systemBreakMode,
    measuresPerLineInput,
    staffScalePercent,
    canvasTheme,
  ]);

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
  }, []);

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
    async (arrayBuf: ArrayBuffer, fileName: string) => {
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

      setIsLoadingFile(true);
      try {
        const computedHash = await computeFileSha256Hex(arrayBuf);
        setFileHash(computedHash);
        fileHashRef.current = computedHash;

        // Registra aceite de direitos autorais vinculado ao hash do arquivo
        void fetch('/api/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consentType: 'copyright_upload',
            termsVersion: 'v1.3',
            fileHash: computedHash,
          }),
        }).catch(() => {});

        void refreshAuthAndSettings(computedHash, 'none');

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

        const firstStaffId = scoreAnalysis.staves[0]?.staffId || '1';
        const initialOptions: ScoreTransformOptions = {
          semitoneShift: 0,
          octaveShift: 0,
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
          lineBreakMeasures: scoreAnalysis.initialLineBreakMeasures,
          staffScalePercent: 100,
        };

        const initialTransform = transformScoreXml(
          unpacked.mscxContent,
          scoreAnalysis,
          initialOptions
        );

        skipNextAutoTransformRef.current = true;
        setOriginalBase64(b64);
        setOriginalMscx(unpacked.mscxContent);
        setAnalysis(scoreAnalysis);

        setSemitoneShift(0);
        setOctaveShift(0);
        setTargetInstrumentId(scoreAnalysis.detectedInstrumentId);
        setSelectedStaffIds([firstStaffId]);
        setViewMode('portrait');
        setConvertBbEbChordsToWritten(false);
        setShowChords(true);
        setShowLyrics(true);
        setHeaders(scoreAnalysis.headers);
        setLineBreakMeasures(scoreAnalysis.initialLineBreakMeasures);
        setSystemBreakMode(
          scoreAnalysis.initialLineBreakMeasures.length > 0 ? 'initial' : 'auto'
        );
        setMeasuresPerLineInput(4);
        setStaffScalePercent(100);
        setChordOverrides({});
        setEditingChordKey(null);
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
        setIsLoadingFile(false);
      }
    },
    [appSettings.operations.maintenance_message, appSettings.operations.maintenance_mode, isDev, refreshAuthAndSettings]
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

  const handleSelectTargetConcertPitchClass = (targetPc: number) => {
    if (!analysis || isSvgLoading) return;
    const origPc = analysis.originalConcertPitchClass;
    const rawDiff = (((targetPc - origPc) % 12) + 12) % 12;

    let shift = rawDiff;
    if (transposeDirection === 'closest') {
      if (rawDiff > 6) shift = rawDiff - 12;
    } else if (transposeDirection === 'up') {
      shift = rawDiff;
    } else if (transposeDirection === 'down') {
      shift = rawDiff === 0 ? 0 : rawDiff - 12;
    }
    if (shift === semitoneShift) return;
    scheduleScoreAction('tonality-select', 60);
    setSemitoneShift(shift);
  };

  // Opções para a visualização em tela (sem duplicar textos flutuantes que já são arrastáveis na tela)
  const screenTransformOptions: ScoreTransformOptions = useMemo(
    () => ({
      semitoneShift,
      octaveShift,
      targetInstrumentId,
      selectedStaffId: selectedStaffIds[0] || '1',
      selectedStaffIds,
      viewMode,
      convertBbEbChordsToWritten,
      showChords,
      showLyrics,
      headers,
      chordOverrides,
      floatingTexts: [],
      lineBreakMeasures,
      staffScalePercent,
    }),
    [
      semitoneShift,
      octaveShift,
      targetInstrumentId,
      selectedStaffIds,
      viewMode,
      convertBbEbChordsToWritten,
      showChords,
      showLyrics,
      headers,
      chordOverrides,
      lineBreakMeasures,
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

  // Cálculo instantâneo de 0ms em memória pura para pautas & tonalidades exibidas no visor
  const activeInstrument = useMemo(
    () => getInstrumentById(targetInstrumentId),
    [targetInstrumentId]
  );

  const selectedStavesList = useMemo(() => {
    if (!analysis) return [];
    const effectiveIds =
      viewMode === 'full-score'
        ? analysis.staves.map((s) => s.staffId)
        : selectedStaffIds;
    return analysis.staves.filter((s) => effectiveIds.includes(s.staffId));
  }, [analysis, selectedStaffIds, viewMode]);

  const activeStaffSummary = useMemo(() => {
    if (!analysis) return null;
    return selectedStavesList[0] || analysis.staves[0] || null;
  }, [analysis, selectedStavesList]);

  const currentConcertTonality = useMemo(() => {
    if (!analysis) return getTonalityByPitchClass(0);
    const concertPc =
      ((analysis.originalConcertPitchClass + semitoneShift) % 12 + 12) % 12;
    return getTonalityByPitchClass(concertPc);
  }, [analysis, semitoneShift]);

  const currentWrittenTonality = useMemo(() => {
    if (!analysis) return getTonalityByPitchClass(0);
    const offset = activeStaffSummary?.writtenSemitoneOffset ?? 0;
    const writtenPc =
      ((currentConcertTonality.pitchClass + offset) % 12 + 12) % 12;
    return getTonalityByPitchClass(writtenPc);
  }, [analysis, currentConcertTonality, activeStaffSummary]);

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

  const executeExportPdf = async () => {
    if (!analysis || !originalMscx || !originalBase64) return;
    setIsExportingPdf(true);
    setUploadError(null);
    try {
      const pdfTransform = transformScoreXml(
        originalMscx,
        analysis,
        pdfTransformOptions
      );

      const cleanTitle = (
        headers.title.text ||
        analysis.headers.title.text ||
        'Partitura'
      )
        .replace(/[<>:"/\\|?*]+/g, '')
        .trim();

      const allStavesSelected =
        analysis.staves.length > 1 &&
        selectedStavesList.length === analysis.staves.length;

      const partLabel =
        viewMode === 'full-score' || allStavesSelected
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
          semitoneShift,
          octaveShift,
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
      setIsExportingPdf(false);
    }
  };

  const isPreviewLocked =
    !isDev &&
    appSettings.paywall.paywall_enabled !== false &&
    accessLevel === 'preview';

  const areProDrawersLocked =
    !isDev &&
    appSettings.paywall.paywall_enabled !== false &&
    (accessLevel === 'preview' || accessLevel === 'free_pass');

  const maintenanceBlocked =
    Boolean(appSettings.operations.maintenance_mode) && !isDev;

  const firstVisibleStaffId = analysis?.staves[0]?.staffId || '1';
  const isTransposeModified = semitoneShift !== 0 || octaveShift !== 0;
  const isChordsModified =
    !showChords ||
    !showLyrics ||
    convertBbEbChordsToWritten ||
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
  const isBreaksModified = analysis
    ? lineBreakMeasures.length !== analysis.initialLineBreakMeasures.length ||
      lineBreakMeasures.some((m, i) => m !== analysis.initialLineBreakMeasures[i])
    : lineBreakMeasures.length > 0;
  const isStavesModified =
    viewMode !== 'portrait' ||
    selectedStaffIds.length !== 1 ||
    selectedStaffIds[0] !== firstVisibleStaffId;

  const handleResetTranspose = () => {
    if (isSvgLoading || !isTransposeModified) return;
    scheduleScoreAction('transpose-reset', 45);
    setSemitoneShift(0);
    setOctaveShift(0);
  };

  const handleResetChords = () => {
    if (isSvgLoading || !isChordsModified || areProDrawersLocked) return;
    scheduleScoreAction('chords-drawer-reset', 45);
    setShowChords(true);
    setShowLyrics(true);
    setConvertBbEbChordsToWritten(false);
    setChordOverrides({});
    setEditingChordKey(null);
  };

  const handleResetHeaders = () => {
    if (!analysis || isSvgLoading || !isHeadersModified || areProDrawersLocked) return;
    if (areXmlHeadersModified) {
      scheduleScoreAction('headers-drawer-reset', 45);
    }
    setHeaders(analysis.headers);
    setFloatingTexts([]);
  };

  const handleResetScale = () => {
    if (isSvgLoading || !isScaleModified || areProDrawersLocked) return;
    handleChangeStaffScale(100, 'scale-drawer-reset', 45);
  };

  const handleResetBreaks = () => {
    if (!analysis || isSvgLoading || !isBreaksModified || areProDrawersLocked) return;
    scheduleScoreAction('breaks-drawer-reset', 45);
    setLineBreakMeasures(analysis.initialLineBreakMeasures);
    setSystemBreakMode(
      analysis.initialLineBreakMeasures.length > 0 ? 'initial' : 'auto'
    );
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
    if (isExportingPdf) return;
    if (isPreviewLocked) {
      openPlansModal('pro');
      return;
    }
    if (isProcessing || hasUnrenderedChanges) {
      setShowUnappliedChangesModal(true);
      return;
    }
    void executeExportPdf();
  };

  const isBbOrEbActive =
    (activeStaffSummary?.writtenSemitoneOffset ?? 0) !== 0 ||
    activeInstrument.groupId === 'BB_TREBLE' ||
    activeInstrument.groupId === 'EB_TREBLE';

  const transposingShortLabel =
    activeStaffSummary?.fifthsOffset === 2 || activeInstrument.groupId === 'BB_TREBLE'
      ? 'Sib'
      : 'Mib';

  const allStavesSelectedInUi =
    Boolean(analysis) &&
    analysis!.staves.length > 1 &&
    selectedStavesList.length === analysis!.staves.length;

  const activePartLabelInTopBar =
    viewMode === 'full-score' || allStavesSelectedInUi
      ? 'Grade Completa'
      : selectedStavesList.length > 1
      ? selectedStavesList.map((s) => s.displayName).join(' + ')
      : activeStaffSummary?.displayName || analysis?.detectedInstrumentName || activeInstrument.name;

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
                  v1.3
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                Transposição precisa com fidelidade original • Formatos aceitos: .mscz, .mscx, .xml
              </p>
            </div>
          </button>

          {/* Botões do Ecossistema Rubsax + Tutorial + Editor + Conta / Modo Dev */}
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
                          setAccountModalOpen(true);
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-zinc-800 text-zinc-200 font-semibold flex items-center gap-2 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation"
                      >
                        <User className="w-3.5 h-3.5 text-sax-400" />
                        <span>Minha Conta</span>
                      </button>
                      <Link
                        href="/conta"
                        onClick={() => setUserMenuOpen(false)}
                        className="w-full px-3.5 py-2 hover:bg-zinc-800 text-zinc-300 font-medium flex items-center gap-2"
                      >
                        <Crown className="w-3.5 h-3.5 text-sax-400" />
                        <span>Meu Plano &amp; Avulsos</span>
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
                  Na pauta ({activePartLabelInTopBar}):
                </span>
                <span className="font-extrabold text-sax-400">
                  {currentWrittenTonality.majorName}
                </span>
              </div>
            </div>
          )}

          {/* Ações Rápidas no Topo */}
          {analysis && workspaceView === 'editor' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSvgLoading}
                onClick={() => {
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
                  isPreviewLocked
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
                    {isPreviewLocked ? (
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
                    RUBSAX TRANSPOSER v1.3
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
                  <span>Selecionar Arquivo (.mscz, .mscx, .xml)</span>
                </button>

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
                  {areProDrawersLocked && <Lock className="w-2.5 h-2.5 text-sax-400" />}
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

                <button
                  type="button"
                  disabled={isSvgLoading}
                  onClick={() => {
                    if (!ensureCopyrightAccepted()) return;
                    fileInputRef.current?.click();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-zinc-800/90 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-700 text-xs text-zinc-200 flex items-center justify-center gap-2 font-semibold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                >
                  <Upload className="w-4 h-4 text-sax-400" />
                  <span>
                    {analysis
                      ? 'Enviar outro arquivo (.mscz, .mscx, .xml)'
                      : 'Enviar partitura (.mscz, .mscx, .xml)'}
                  </span>
                </button>
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
                  <div className="flex items-center justify-between text-xs gap-1">
                    <label className="text-zinc-300 font-semibold">
                      Ir para Tonalidade (Piano Dó):
                    </label>
                    <div className="flex items-center gap-1 text-[10px]">
                      {(
                        [
                          { id: 'closest', label: 'Mais Próximo' },
                          { id: 'up', label: 'Acima' },
                          { id: 'down', label: 'Abaixo' },
                        ] as const
                      ).map((dir) => (
                        <button
                          key={dir.id}
                          type="button"
                          onClick={() => setTransposeDirection(dir.id)}
                          className={`px-1.5 py-0.5 rounded active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation ${
                            transposeDirection === dir.id
                              ? 'bg-[#D97706] text-studio-950 font-extrabold shadow-sm'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {dir.label}
                        </button>
                      ))}
                    </div>
                  </div>

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

                {/* Botões de Oitava (estritamente limitados entre -2 e +2 oitavas) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs gap-1">
                    <span className="text-zinc-300 font-semibold">
                      Oitava (±12 st • máx. ±2):
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-sky-300">
                      {octaveShift > 0 ? `+${octaveShift}` : octaveShift} 8va (
                      {octaveShift * 12 > 0 ? `+${octaveShift * 12}` : octaveShift * 12} st)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={octaveShift <= -2 || isSvgLoading}
                      onClick={() => {
                        if (octaveShift <= -2 || isSvgLoading) return;
                        scheduleScoreAction('octave-down', 320);
                        setOctaveShift((o) => Math.max(-2, o - 1));
                      }}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed ${
                        (isProcessing && activeActionId === 'octave-down') ||
                        octaveShift < 0
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
                      disabled={octaveShift >= 2 || isSvgLoading}
                      onClick={() => {
                        if (octaveShift >= 2 || isSvgLoading) return;
                        scheduleScoreAction('octave-up', 320);
                        setOctaveShift((o) => Math.min(2, o + 1));
                      }}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold border active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed ${
                        (isProcessing && activeActionId === 'octave-up') ||
                        octaveShift > 0
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
                    {isBbOrEbActive && (
                      <>
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
                              if (!convertBbEbChordsToWritten || isSvgLoading) return;
                              scheduleScoreAction('chords-concert', 40);
                              setConvertBbEbChordsToWritten(false);
                            }}
                            className={`py-1.5 px-2 rounded-lg font-semibold border flex items-center justify-center gap-1 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                              !convertBbEbChordsToWritten
                                ? 'bg-[#D97706] border-sax-400 text-studio-950 font-extrabold shadow-sm'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                            }`}
                          >
                            {isProcessing && activeActionId === 'chords-concert' && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            <span>Tom do Piano (Dó)</span>
                          </button>
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (convertBbEbChordsToWritten || isSvgLoading) return;
                              scheduleScoreAction('chords-written', 40);
                              setConvertBbEbChordsToWritten(true);
                            }}
                            className={`py-1.5 px-2 rounded-lg font-semibold border flex items-center justify-center gap-1 active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${
                              convertBbEbChordsToWritten
                                ? 'bg-[#D97706] text-studio-950 border-sax-400 font-extrabold shadow-sm'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                            }`}
                          >
                            {isProcessing && activeActionId === 'chords-written' && (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            <span>Converter p/ {transposingShortLabel}</span>
                          </button>
                        </div>
                      </>
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
                                setEditingChordKey(null);
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
                              const isSelected =
                                chordEditMode === 'symbol' && editingChordKey === item.original;
                              const isModified = item.current !== item.original;
                              return (
                                <button
                                  key={item.original}
                                  type="button"
                                  onClick={() => {
                                    setChordEditMode('symbol');
                                    setEditingChordKey(item.original);
                                    setEditingChordValue(item.current);
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

                        {/* Caixa de edição da cifra selecionada */}
                        {editingChordKey !== null && (
                          <div className="p-2.5 rounded-xl bg-studio-950 border border-sax-500/40 space-y-2 animate-fadeIn">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-zinc-300 font-semibold">
                                Editar cifra{' '}
                                <strong className="text-sax-400 font-mono">
                                  {editingChordKey}
                                </strong>
                                :
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setChordEditMode((m) =>
                                    m === 'symbol' ? 'occurrence' : 'symbol'
                                  )
                                }
                                className="text-[10px] text-sky-400 hover:underline active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                              >
                                {chordEditMode === 'symbol'
                                  ? 'Editar por compasso'
                                  : 'Editar todas iguais'}
                              </button>
                            </div>

                            {chordEditMode === 'occurrence' && (
                              <select
                                value={editingChordKey}
                                onChange={(e) => {
                                  const k = e.target.value;
                                  setEditingChordKey(k);
                                  const found = transformResult.chordOccurrences.find(
                                    (o) => `#${o.occurrenceIndex}` === k
                                  );
                                  if (found) setEditingChordValue(found.currentSymbol);
                                }}
                                className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-200"
                              >
                                {transformResult.chordOccurrences.map((occ) => (
                                  <option
                                    key={occ.occurrenceIndex}
                                    value={`#${occ.occurrenceIndex}`}
                                  >
                                    Compasso {occ.measureNumber}: {occ.currentSymbol} (orig:{' '}
                                    {occ.originalSymbol})
                                  </option>
                                ))}
                              </select>
                            )}

                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingChordValue}
                                onChange={(e) => setEditingChordValue(e.target.value)}
                                placeholder="Ex: Dm7(9), A7/C#, Bb9"
                                className="flex-1 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs font-mono text-white focus:outline-none focus:border-sax-500"
                              />
                              <button
                                type="button"
                                disabled={isSvgLoading}
                                onClick={() => {
                                  if (!editingChordValue.trim() || isSvgLoading) return;
                                  scheduleScoreAction('chord-edit-apply', 40);
                                  setChordOverrides((prev) => ({
                                    ...prev,
                                    [editingChordKey]: editingChordValue.trim(),
                                  }));
                                  setEditingChordKey(null);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-sax-500 hover:bg-sax-400 disabled:opacity-50 text-studio-950 text-xs font-bold active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                              >
                                Aplicar
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingChordKey(null)}
                                className="px-2 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs active:scale-[0.97] active:brightness-90 transition-all duration-75 touch-manipulation"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        )}
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

                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300">
                      Atualização instantânea
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
                      Edite, oculte ou remova os textos de cabeçalho (atualiza instantaneamente no
                      visor; fonte e tamanho originais travados):
                    </p>

                    {/* Título */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-semibold text-zinc-300">Título:</label>
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
                      <input
                        type="text"
                        readOnly={isSvgLoading}
                        disabled={headers.title.removed}
                        value={headers.title.text}
                        onChange={(e) => {
                          scheduleScoreAction('header-title-text', 350);
                          setHeaders((h) => ({
                            ...h,
                            title: { ...h.title, text: e.target.value },
                          }));
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-studio-950 border border-zinc-700 text-zinc-100 disabled:opacity-40"
                      />
                    </div>

                    {/* Subtítulo */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-semibold text-zinc-300">Subtítulo:</label>
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
                      <input
                        type="text"
                        readOnly={isSvgLoading}
                        disabled={headers.subtitle.removed}
                        placeholder="Ex: Artista / Cantor"
                        value={headers.subtitle.text}
                        onChange={(e) => {
                          scheduleScoreAction('header-sub-text', 350);
                          setHeaders((h) => ({
                            ...h,
                            subtitle: {
                              ...h.subtitle,
                              text: e.target.value,
                              visible: true,
                              removed: false,
                            },
                          }));
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-studio-950 border border-zinc-700 text-zinc-100 disabled:opacity-40"
                      />
                    </div>

                    {/* Compositor / Instrumento (Canto Superior Direito) */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-semibold text-zinc-300">
                          Instrumento (Canto Sup. Direito):
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              scheduleScoreAction('header-comp-auto', 120);
                              setHeaders((h) => ({
                                ...h,
                                composer: {
                                  ...h.composer,
                                  autoSyncInstrument: !h.composer.autoSyncInstrument,
                                },
                              }));
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
                      <input
                        type="text"
                        readOnly={isSvgLoading}
                        disabled={headers.composer.removed}
                        value={
                          headers.composer.autoSyncInstrument
                            ? activePartLabelInTopBar
                            : headers.composer.text
                        }
                        onChange={(e) => {
                          scheduleScoreAction('header-comp-text', 350);
                          setHeaders((h) => ({
                            ...h,
                            composer: {
                              ...h.composer,
                              text: e.target.value,
                              autoSyncInstrument: false,
                            },
                          }));
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-studio-950 border border-zinc-700 text-zinc-100 disabled:opacity-40"
                      />
                    </div>

                    {/* Letrista / Indicador Tom para Piano */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-semibold text-zinc-300">
                          Tom para Piano (Canto Sup. Esquerdo):
                        </label>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isSvgLoading}
                            onClick={() => {
                              if (isSvgLoading) return;
                              scheduleScoreAction('header-lyr-auto', 120);
                              setHeaders((h) => ({
                                ...h,
                                lyricist: {
                                  ...h.lyricist,
                                  autoSyncPianoKey: !h.lyricist.autoSyncPianoKey,
                                },
                              }));
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
                      <input
                        type="text"
                        readOnly={isSvgLoading}
                        disabled={headers.lyricist.removed}
                        value={
                          headers.lyricist.autoSyncPianoKey
                            ? `Tom para Piano: ${currentConcertTonality.majorName}`
                            : headers.lyricist.text
                        }
                        onChange={(e) => {
                          scheduleScoreAction('header-lyr-text', 350);
                          setHeaders((h) => ({
                            ...h,
                            lyricist: {
                              ...h.lyricist,
                              text: e.target.value,
                              autoSyncPianoKey: false,
                            },
                          }));
                        }}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-studio-950 border border-zinc-700 text-zinc-100 disabled:opacity-40"
                      />
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

              {/* 5. NOVO PAINEL: QUEBRA DE COMPASSO (QUEBRA DE SISTEMA NO XML) */}
              <section
                className={`${
                  mobileTab === 'layout' ? 'block' : 'hidden lg:block'
                } rounded-2xl bg-studio-950/80 border border-zinc-800 p-4 space-y-3 text-xs`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold uppercase tracking-wider text-sax-400 flex items-center gap-1.5">
                    <SplitSquareVertical className="w-4 h-4" />
                    <span>Quebra de Compasso (Sistema)</span>
                  </h2>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                      {accessLevel === 'free_pass' || lineBreakMeasures.length === 0
                        ? 'Automático'
                        : `${lineBreakMeasures.length} quebras`}
                    </span>
                    {renderDrawerCornerAction({
                      proLocked: areProDrawersLocked,
                      modified: isBreaksModified,
                      actionId: 'breaks-drawer-reset',
                      onReset: handleResetBreaks,
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
                      <span>
                        {accessLevel === 'free_pass'
                          ? 'No Modo Gratuito a quebra de compasso é automática • PRO libera controle manual'
                          : LOCKED_PRO_BANNER_TEXT}
                      </span>
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
                <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-semibold text-zinc-300">
                      Compassos por linha (1 a 12):
                    </label>
                    <select
                      value={measuresPerLineInput}
                      onChange={(e) =>
                        setMeasuresPerLineInput(parseInt(e.target.value, 10) || 4)
                      }
                      className="px-2.5 py-1 rounded-lg bg-studio-950 border border-zinc-700 text-xs font-mono font-bold text-sax-300 focus:outline-none focus:border-sax-500"
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
                      Clique no número do compasso para ativar/desativar uma quebra de linha após
                      ele:
                    </p>
                    <div className="max-h-40 overflow-y-auto grid grid-cols-6 sm:grid-cols-8 gap-1 p-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
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
                  clique em &ldquo;Só esta&rdquo; para isolar uma única parte):
                </p>

                <div className="space-y-1.5">
                  {(analysis?.staves || []).map((st) => {
                    const isActiveInSelection =
                      viewMode === 'full-score' || selectedStaffIds.includes(st.staffId);
                    const isIsolatedOnly =
                      viewMode !== 'full-score' &&
                      selectedStaffIds.length === 1 &&
                      selectedStaffIds[0] === st.staffId;
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
                              ? 'Clique para ocultar esta pauta'
                              : 'Clique para ativar esta pauta junto com as selecionadas'
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
                            Pauta {st.staffId}: {st.displayName}
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
                          title="Exibir apenas esta pauta isolada"
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
                        viewMode === 'full-score'
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
                              viewMode === 'full-score' ? 'text-studio-950' : 'text-sax-400'
                            }`}
                          />
                        )}
                        <span className="font-semibold text-xs">
                          Grade Completa ({analysis?.staves.length || 0} pautas empilhadas)
                        </span>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          viewMode === 'full-score'
                            ? 'bg-black/20 text-studio-950'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {viewMode === 'full-score' ? 'Ativa' : 'Empilhar'}
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
                className="flex-1 flex items-center justify-center p-4 sm:p-8"
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
                      <code className="text-sax-300">.mscx</code> ou{' '}
                      <code className="text-sax-300">.xml</code> para liberar o visor vetorial e
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
                    <span>Enviar Partitura (.mscz, .mscx, .xml)</span>
                  </button>
                </div>
              </div>
            ) : (
              <ScoreViewer
                modifiedMscx={
                  renderedSnapshotMscx || transformResult?.modifiedMscx || ''
                }
                originalBase64={originalBase64}
                fileName={analysis.fileName}
                semitoneShift={semitoneShift}
                octaveShift={octaveShift}
                canvasTheme={canvasTheme}
                onThemeChange={setCanvasTheme}
                viewMode={viewMode}
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
                  setAccountModalOpen(true);
                }}
                className="w-full px-3.5 py-3 rounded-xl text-left hover:bg-zinc-800 text-zinc-100 font-bold flex items-center gap-2.5 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                <User className="w-4 h-4 text-sax-400" />
                <span>Minha Conta</span>
              </button>
              <Link
                href="/conta"
                onClick={() => setUserMenuOpen(false)}
                className="w-full px-3.5 py-3 rounded-xl hover:bg-zinc-800 text-zinc-200 font-semibold flex items-center gap-2.5 active:scale-[0.98] active:brightness-90 transition-all duration-75 touch-manipulation"
              >
                <Crown className="w-4 h-4 text-sax-400" />
                <span>Meu Plano &amp; Músicas Avulsas</span>
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

      {/* MODAL CENTRALIZADO DE CONFERÊNCIA: PROCESSAMENTO EM ANDAMENTO ANTES DE EXPORTAR PDF */}
      {showUnappliedChangesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-studio-900 border-2 border-sax-500/50 shadow-2xl overflow-hidden text-zinc-100">
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
                A visualização na tela ainda está finalizando a última alteração automática. Deseja
                aguardar na tela ou gerar o PDF imediatamente?
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
          </div>
        </div>
      )}
    </div>
  );
}
