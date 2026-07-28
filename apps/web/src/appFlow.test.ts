import { describe, expect, it } from 'vitest';
import { parseRoute } from '@splat04/shared';
import {
  ONBOARDING_STORAGE_KEY,
  NETWORK_INITIALIZATION_SCREEN,
  RESPONSIVE_VIEWPORTS,
  initialAppFlow,
  loadOnboardingComplete,
  reduceAppFlow,
  resolveAppStage,
  saveOnboardingComplete,
  selectSceneRuntime,
  shouldHandleOnlineRoundEnd,
  shouldRenderArenaIntermission,
} from './appFlow.js';

describe('application flow state machine', () => {
  it('starts networking during loading, before target-range completion', () => {
    expect(NETWORK_INITIALIZATION_SCREEN).toBe('loading');
    const initial = initialAppFlow(parseRoute('/play/vice-estate-04'), false);
    expect(initial.screen).toBe(NETWORK_INITIALIZATION_SCREEN);
    expect(reduceAppFlow(initial, { type: 'LOADING_COMPLETE' }).screen).toBe('target-range');
  });
  it('routes root loading to the home menu', () => {
    const initial = initialAppFlow(parseRoute('/'), false);
    expect(reduceAppFlow(initial, { type: 'LOADING_COMPLETE' }).screen).toBe('home');
    expect(reduceAppFlow(initial, { type: 'SKIP_LOADING' }).screen).toBe('home');
  });

  it('routes a first direct visit through onboarding and then to the requested arena', () => {
    const initial = initialAppFlow(parseRoute('/play/vice-estate-04'), false);
    const range = reduceAppFlow(initial, { type: 'LOADING_COMPLETE' });
    expect(range.screen).toBe('target-range');
    expect(range.requestedArena).toBe('vice-estate-04');
    expect(reduceAppFlow(range, { type: 'ONBOARDING_COMPLETE' }).screen).toBe('arena');
  });

  it('lets a returning player skip onboarding without returning home', () => {
    const initial = initialAppFlow(parseRoute('/play/vice-estate-04'), true);
    expect(reduceAppFlow(initial, { type: 'LOADING_COMPLETE' }).screen).toBe('arena');
  });

  it('propagates the selected mode into application state', () => {
    const home = reduceAppFlow(initialAppFlow(parseRoute('/'), false), {
      type: 'LOADING_COMPLETE',
    });
    const selected = reduceAppFlow(home, { type: 'SELECT_MODE', mode: 'practice' });
    expect(selected.selectedMode).toBe('practice');
    expect(reduceAppFlow(selected, { type: 'PLAY', mode: 'practice' })).toMatchObject({
      screen: 'arena',
      selectedMode: 'practice',
    });
  });

  it('reducer-transitions an online arena fallback to local Practice', () => {
    const arena = {
      ...initialAppFlow(parseRoute('/play/vice-estate-04'), true),
      screen: 'arena' as const,
      selectedMode: 'coverage' as const,
    };
    const practice = reduceAppFlow(arena, { type: 'START_LOCAL_PRACTICE' });
    expect(practice).toMatchObject({ screen: 'arena', selectedMode: 'practice' });
    expect(resolveAppStage(practice)).toBe('practice');
    const localGame = { kind: 'practice' };
    expect(selectSceneRuntime(resolveAppStage(practice), { kind: 'network' }, localGame)).toEqual({
      network: null,
      local: localGame,
    });
  });

  it('selects a deterministic local simulation for target range rendering', () => {
    const range = reduceAppFlow(initialAppFlow(parseRoute('/play/vice-estate-04'), false), {
      type: 'LOADING_COMPLETE',
    });
    const rangeGame = { kind: 'range' };
    expect(selectSceneRuntime(resolveAppStage(range), { kind: 'network' }, rangeGame)).toEqual({
      network: null,
      local: rangeGame,
    });
  });

  it('renders intermission only for an arena round end, never loading, home, or range', () => {
    const loading = initialAppFlow(parseRoute('/'), false);
    const home = reduceAppFlow(loading, { type: 'LOADING_COMPLETE' });
    const directLoading = initialAppFlow(parseRoute('/play/vice-estate-04'), false);
    const range = reduceAppFlow(directLoading, { type: 'LOADING_COMPLETE' });
    const arena = reduceAppFlow(home, { type: 'PLAY', mode: 'coverage' });

    expect(shouldRenderArenaIntermission(loading, true)).toBe(false);
    expect(shouldRenderArenaIntermission(home, true)).toBe(false);
    expect(shouldRenderArenaIntermission(range, true)).toBe(false);
    expect(shouldRenderArenaIntermission(arena, false)).toBe(false);
    expect(shouldRenderArenaIntermission(arena, true)).toBe(true);
  });

  it('ignores background round rewards and claim UI outside an online arena', () => {
    const loading = initialAppFlow(parseRoute('/'), false);
    const home = reduceAppFlow(loading, { type: 'LOADING_COMPLETE' });
    const arena = reduceAppFlow(home, { type: 'PLAY', mode: 'coverage' });
    const practice = reduceAppFlow(
      { ...home, selectedMode: 'practice' },
      { type: 'PLAY', mode: 'practice' },
    );

    expect(shouldHandleOnlineRoundEnd(loading)).toBe(false);
    expect(shouldHandleOnlineRoundEnd(home)).toBe(false);
    expect(shouldHandleOnlineRoundEnd(practice)).toBe(false);
    expect(shouldHandleOnlineRoundEnd(arena)).toBe(true);
  });
});

describe('versioned onboarding storage', () => {
  it('persists and reads the current schema', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    saveOnboardingComplete(storage);
    expect(values.has(ONBOARDING_STORAGE_KEY)).toBe(true);
    expect(loadOnboardingComplete(storage)).toBe(true);
  });

  it('rejects stale and corrupt records', () => {
    expect(loadOnboardingComplete({ getItem: () => '{"version":0,"completed":true}' })).toBe(false);
    expect(loadOnboardingComplete({ getItem: () => '{broken' })).toBe(false);
  });
});

it('keeps the required responsive acceptance matrix explicit', () => {
  expect(RESPONSIVE_VIEWPORTS).toHaveLength(7);
  expect(RESPONSIVE_VIEWPORTS).toContainEqual({ width: 844, height: 390 });
  expect(RESPONSIVE_VIEWPORTS).toContainEqual({ width: 390, height: 844 });
});
