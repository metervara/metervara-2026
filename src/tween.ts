export type EasingFn = (t: number) => number;

export const easings = {
  linear: (t: number) => t,

  // Quadratic
  easeInQuad: (t: number) => t * t,
  easeOutQuad: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t: number) =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,

  // Cubic
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  // Quartic
  easeInQuart: (t: number) => t * t * t * t,
  easeOutQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  easeInOutQuart: (t: number) =>
    t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,

  // Quintic
  easeInQuint: (t: number) => t * t * t * t * t,
  easeOutQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  easeInOutQuint: (t: number) =>
    t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2,
};

type Hooks = {
  onStart?: (from: number, to: number) => void;
  onUpdate?: (value: number, progress: number) => void;
  onComplete?: (value: number) => void;
};

export type TweenOptions = {
  durationMs?: number;
  easing?: EasingFn;
} & Hooks;

type ValueDefaults = Hooks & {
  defaultDurationMs?: number;
  easing?: EasingFn;
};

type ActiveTween = {
  from: number;
  to: number;
  durationMs: number;
  easing: EasingFn;
  startTime: number | null;
  cancelled: boolean;
  valueRef: (value: number) => void;
  onStart?: (from: number, to: number) => void;
  onUpdate?: (value: number, progress: number) => void;
  onComplete?: (value: number) => void;
  clearOwner: () => void;
};

export type TweenHandle = {
  to: (target: number, options?: TweenOptions) => void;
  stop: (complete?: boolean) => void;
  set: (value: number, fireHooks?: boolean) => void;
  get: () => number;
  isRunning: () => boolean;
};

export type TweenManager = {
  createValue: (initial: number, defaults?: ValueDefaults) => TweenHandle;
  stopAll: () => void;
};

export const createTweenManager = (): TweenManager => {
  let activeTweens: ActiveTween[] = [];
  let rafId: number | null = null;

  const tick = (time: number) => {
    activeTweens = activeTweens.filter((tween) => {
      if (tween.cancelled) {
        tween.clearOwner();
        return false;
      }

      if (tween.startTime === null) {
        tween.startTime = time;
      }

      const progress = Math.min(1, (time - tween.startTime) / tween.durationMs);
      const eased = tween.easing(progress);
      const value = tween.from + (tween.to - tween.from) * eased;

      tween.valueRef(value);
      tween.onUpdate?.(value, progress);

      if (progress >= 1) {
        tween.onComplete?.(value);
        tween.clearOwner();
        return false;
      }

      return true;
    });

    if (activeTweens.length > 0) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  };

  const ensureLoop = () => {
    if (rafId === null && activeTweens.length > 0) {
      rafId = requestAnimationFrame(tick);
    }
  };

  const createValue = (
    initial: number,
    defaults: ValueDefaults = {},
  ): TweenHandle => {
    let current = initial;
    let ownerTween: ActiveTween | null = null;

    const stop = (complete = false) => {
      if (!ownerTween) return;

      if (complete) {
        current = ownerTween.to;
        ownerTween.valueRef(current);
        ownerTween.onUpdate?.(current, 1);
        ownerTween.onComplete?.(current);
      }

      ownerTween.cancelled = true;
      ownerTween = null;
    };

    const to = (target: number, options: TweenOptions = {}) => {
      // If we're already moving toward this exact target, do nothing.
      if (ownerTween && !ownerTween.cancelled && ownerTween.to === target) {
        return;
      }
      // If we're already at (or extremely close to) the target, snap and exit.
      if (Math.abs(current - target) < 1e-6) {
        set(target, false);
        return;
      }

      // Cancel any running tween but don't trigger its completion hooks.
      stop(false);

      const easing = options.easing ?? defaults.easing ?? easings.easeInOutQuad;
      const durationMs =
        options.durationMs ?? defaults.defaultDurationMs ?? 300;

      const tween: ActiveTween = {
        from: current,
        to: target,
        durationMs,
        easing,
        startTime: null,
        cancelled: false,
        valueRef: (value: number) => {
          current = value;
        },
        onStart: options.onStart ?? defaults.onStart,
        onUpdate: options.onUpdate ?? defaults.onUpdate,
        onComplete: options.onComplete ?? defaults.onComplete,
        clearOwner: () => {
          if (ownerTween === tween) {
            ownerTween = null;
          }
        },
      };

      ownerTween = tween;
      tween.onStart?.(tween.from, tween.to);
      activeTweens.push(tween);
      ensureLoop();
    };

    const set = (value: number, fireHooks = false) => {
      stop(false);
      const prev = current;
      current = value;
      if (fireHooks) {
        defaults.onStart?.(prev, value);
        defaults.onUpdate?.(value, 1);
        defaults.onComplete?.(value);
      }
    };

    const get = () => current;
    const isRunning = () => ownerTween !== null;

    return { to, stop, set, get, isRunning };
  };

  const stopAll = () => {
    activeTweens.forEach((tween) => {
      tween.cancelled = true;
      tween.clearOwner();
    });
    activeTweens = [];

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  return { createValue, stopAll };
};

