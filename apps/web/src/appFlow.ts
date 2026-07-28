import type { Route } from '@splat04/shared';

export type AppScreen = 'loading' | 'home' | 'target-range' | 'arena';
export type GameModeSelection = 'coverage' | 'coreball' | 'practice';
export type AppStage = 'range' | 'online' | 'practice';

export interface AppFlowState {
  screen: AppScreen;
  loadingDestination: Exclude<AppScreen, 'loading'>;
  requestedArena: string | null;
  selectedMode: GameModeSelection;
}

export type AppFlowEvent =
  | { type: 'LOADING_COMPLETE' }
  | { type: 'SKIP_LOADING' }
  | { type: 'SELECT_MODE'; mode: GameModeSelection }
  | { type: 'PLAY'; mode: GameModeSelection }
  | { type: 'START_LOCAL_PRACTICE' }
  | { type: 'ONBOARDING_COMPLETE' };

export const ONBOARDING_STORAGE_KEY = 'splat04.onboarding.v1';
export const NETWORK_INITIALIZATION_SCREEN: AppScreen = 'loading';
const ONBOARDING_SCHEMA_VERSION = 1;

interface OnboardingRecord {
  version: typeof ONBOARDING_SCHEMA_VERSION;
  completed: boolean;
}

export function initialAppFlow(route: Route, onboardingComplete: boolean): AppFlowState {
  const requestedArena = route.kind === 'arena' ? route.slug : null;
  const isDirectPlay =
    route.kind === 'arena' || route.kind === 'crew' || route.kind === 'challenge';

  return {
    screen: 'loading',
    loadingDestination: isDirectPlay ? (onboardingComplete ? 'arena' : 'target-range') : 'home',
    requestedArena,
    selectedMode: 'coverage',
  };
}

export function reduceAppFlow(state: AppFlowState, event: AppFlowEvent): AppFlowState {
  switch (event.type) {
    case 'LOADING_COMPLETE':
    case 'SKIP_LOADING':
      if (state.screen !== 'loading') return state;
      return { ...state, screen: state.loadingDestination };
    case 'SELECT_MODE':
      if (state.screen !== 'home') return state;
      return { ...state, selectedMode: event.mode };
    case 'PLAY':
      if (state.screen !== 'home') return state;
      return {
        ...state,
        screen: 'arena',
        selectedMode: event.mode,
      };
    case 'START_LOCAL_PRACTICE':
      if (state.screen !== 'home' && state.screen !== 'arena') return state;
      return {
        ...state,
        screen: 'arena',
        selectedMode: 'practice',
      };
    case 'ONBOARDING_COMPLETE':
      if (state.screen !== 'target-range') return state;
      return { ...state, screen: 'arena' };
  }
}

export function resolveAppStage(state: AppFlowState): AppStage {
  if (state.screen === 'target-range') return 'range';
  if (state.screen === 'arena' && state.selectedMode === 'practice') return 'practice';
  return 'online';
}

export function selectSceneRuntime<TNetwork, TLocal>(
  stage: AppStage,
  network: TNetwork | null,
  local: TLocal | null,
): { network: TNetwork | null; local: TLocal | null } {
  return stage === 'online' ? { network, local: null } : { network: null, local };
}

export function shouldRenderArenaIntermission(state: AppFlowState, hasRoundEnd: boolean): boolean {
  return state.screen === 'arena' && hasRoundEnd;
}

/** Background room packets may arrive while networking warms behind the front door. */
export function shouldHandleOnlineRoundEnd(state: AppFlowState): boolean {
  return state.screen === 'arena' && state.selectedMode !== 'practice';
}

export function loadOnboardingComplete(storage: Pick<Storage, 'getItem'> | null): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return false;
    const record = JSON.parse(raw) as Partial<OnboardingRecord>;
    return record.version === ONBOARDING_SCHEMA_VERSION && record.completed === true;
  } catch {
    return false;
  }
}

export function saveOnboardingComplete(storage: Pick<Storage, 'setItem'> | null): void {
  if (!storage) return;
  const record: OnboardingRecord = {
    version: ONBOARDING_SCHEMA_VERSION,
    completed: true,
  };
  try {
    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Private browsing and storage-denied browsers still get a playable session.
  }
}

export const RESPONSIVE_VIEWPORTS = [
  { width: 1672, height: 941 },
  { width: 1600, height: 900 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
] as const;
