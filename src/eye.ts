/**
 * Add moods. Blink interval and eye movement is more frequent in some moods. Squint can be connected here to
 */
import { createTweenManager, easings } from './tween';
import { clampToDiamond, lerp } from './utils';

const BLINK_DURATION = 300;
const BLINK_INTERVAL_MIN = 1000;
const BLINK_INTERVAL_MAX = 3000;

const EYELID_MIN = 20;
const EYELID_GAZE_OFFSET = 25;
const EYELID_SQUINT_OFFSET = 15;

const BLINK_OFF_CENTER = 10;

const FOLLOW_SCALE = 0.25;

const IDLE_MOVE_INTERVAL_MIN = 1300;
const IDLE_MOVE_INTERVAL_MAX = 3000;
const IDLE_MOVE_RANGE_RATIO = 0.22; // relative to eye width (diamond-clamped)
const IDLE_MOVE_DURATION = 450;

const IDLE_JITTER_INTERVAL_MIN = 300;
const IDLE_JITTER_INTERVAL_MAX = 520;
const IDLE_JITTER_RANGE_RATIO = 0.025; // relative to eye width
const IDLE_JITTER_DURATION = 200;

type Point = { x: number; y: number };

// EYELID POINTS
// Point 3 is the moving point
// When y is 0 it is open
// When y is 50 it is closed
const points: Point[] = [
  { x: 0,   y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 50,  y: 0 }, // Moving point, index = 3
  { x: 0,   y: 50 }
];

// Straight-line path builder (matches the previous polygon shape)
const buildEyelidPath = (p: Point[]) => {
  const handleLength = 25;
  const [p0, p1, p2, p3, p4] = p;
  const h0 = { x: p2.x, y: p2.y };
  const h1 = { x: p3.x + handleLength, y: p3.y };

  const h2 = { x: p3.x - handleLength, y: p3.y };
  const h3 = { x: p4.x, y: p4.y };
  
  // check if any value is NaN or otherwise invalid
  // if (isNaN(p0.x) || isNaN(p0.y) || isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y) || isNaN(p3.x) || isNaN(p3.y) || isNaN(p4.x) || isNaN(p4.y)) {
  //   console.error('Invalid points', p);
  //   return '';
  // }
  return `M ${p0.x},${p0.y}` +
         `L ${p1.x},${p1.y} ` +
         `L ${p2.x},${p2.y} ` +
         `C ${h0.x},${h0.y} ${h1.x}, ${h1.y} ${p3.x},${p3.y}` + 
         `C ${h2.x},${h2.y} ${h3.x}, ${h3.y} ${p4.x},${p4.y}` +
         `Z`;
};

export const createEye = (_target: HTMLElement) => {
  // console.log('create eye', target)
  const target = _target;
  const pupil = target.querySelector('.pupil') as HTMLElement;
  const highlight = pupil.querySelector('.highlight') as HTMLElement;
  const topEyelid = target.querySelector('.eyelid-top') as SVGPathElement;
  const bottomEyelid = target.querySelector('.eyelid-bottom') as SVGPathElement;

  const idlePosition = {x: 0, y: 0};
  const eyePosition = {x: 0, y: 0};
  const mousePosition = {x: 0, y: 0};
  let followPosition = {x: 1, y: 1};
  let eyeClamp: number = 1000;

  let requestAnimationFrameId: number | null = null;
  let followIdleTimeout: number | null = null;
  let idleMoveTimeout: number | null = null;
  let idleJitterTimeout: number | null = null;
  let blinkTimeout: number | null = null;

  let eyeRect: DOMRect | null = null;
  // let eyeCenterX: number;
  // let eyeCenterY: number;

  let pupilRect: DOMRect | null = null;
  
  const transitions = createTweenManager();

  const blinkValue = transitions.createValue(0.5, {
    // onStart: () => {
    //   console.log('blink start');
    // },
    onComplete: () => {
      blinkValue.set(0);
      blinkTimeout = window.setTimeout(() => {
        blinkValue.to(1);
      }, Math.random() * (BLINK_INTERVAL_MAX - BLINK_INTERVAL_MIN) + BLINK_INTERVAL_MIN);
    },
    easing: easings.easeInOutQuad,
    defaultDurationMs: BLINK_DURATION,
  });
  const squintValue = transitions.createValue(0, {
    easing: easings.easeOutQuad,
    defaultDurationMs: 500,
  });
  const followValue = transitions.createValue(0, {
    easing: easings.easeOutQuad,
    defaultDurationMs: 300,
  });
  const idleTargetX = transitions.createValue(0, {
    easing: easings.easeInOutQuad,
    defaultDurationMs: IDLE_MOVE_DURATION,
  });
  const idleTargetY = transitions.createValue(0, {
    easing: easings.easeInOutQuad,
    defaultDurationMs: IDLE_MOVE_DURATION,
  });
  const idleJitterX = transitions.createValue(0, {
    easing: easings.easeOutQuad,
    defaultDurationMs: IDLE_JITTER_DURATION,
  });
  const idleJitterY = transitions.createValue(0, {
    easing: easings.easeOutQuad,
    defaultDurationMs: IDLE_JITTER_DURATION,
  });

  const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

  const getIdleBaseRange = () => (eyeRect ? eyeRect.width * IDLE_MOVE_RANGE_RATIO : 0);
  const getIdleJitterRange = () => (eyeRect ? eyeRect.width * IDLE_JITTER_RANGE_RATIO : 0);

  const buildRandomTarget = (range: number) => {
    if (!eyeRect) return { x: 0, y: 0 };
    const raw = {
      x: (Math.random() * 2 - 1) * range,
      y: (Math.random() * 2 - 1) * range,
    };
    const diamond = clampToDiamond(raw, range * 2);
    const clampedY = Math.max(-eyeClamp, Math.min(eyeClamp, diamond.y));
    return { x: diamond.x, y: clampedY };
  };

  const setIdleTarget = () => {
    const baseRange = getIdleBaseRange();
    const next = buildRandomTarget(baseRange);
    idleTargetX.to(next.x);
    idleTargetY.to(next.y);
  };

  const setIdleJitter = () => {
    const jitterRange = getIdleJitterRange();
    const next = buildRandomTarget(jitterRange);
    idleJitterX.to(next.x);
    idleJitterY.to(next.y);
  };

  const scheduleIdleMove = () => {
    if (idleMoveTimeout !== null) {
      clearTimeout(idleMoveTimeout);
    }
    const delay = randomInRange(IDLE_MOVE_INTERVAL_MIN, IDLE_MOVE_INTERVAL_MAX);
    idleMoveTimeout = window.setTimeout(() => {
      setIdleTarget();
      scheduleIdleMove();
    }, delay);
  };

  const scheduleIdleJitter = () => {
    if (idleJitterTimeout !== null) {
      clearTimeout(idleJitterTimeout);
    }
    const delay = randomInRange(IDLE_JITTER_INTERVAL_MIN, IDLE_JITTER_INTERVAL_MAX);
    idleJitterTimeout = window.setTimeout(() => {
      setIdleJitter();
      scheduleIdleJitter();
    }, delay);
  };

  const scheduleFollowIdle = () => {
    if (followIdleTimeout !== null) {
      clearTimeout(followIdleTimeout);
    }
    followIdleTimeout = window.setTimeout(() => {
      followValue.to(0);
      followIdleTimeout = null;
    }, 2000);
  };

  const handleMouseMove = (_e: MouseEvent) => {
    mousePosition.x = _e.clientX;
    mousePosition.y = _e.clientY;
    followValue.to(1);
    scheduleFollowIdle();
  };

  const handleResize = () => {
    eyeRect = target.getBoundingClientRect(); 
    pupilRect = pupil.getBoundingClientRect();
    eyeClamp = (eyeRect.height * 0.5) * 0.6;
  }

  const hasValidRects = () => (
    eyeRect !== null &&
    pupilRect !== null &&
    eyeRect.width > 0 &&
    eyeRect.height > 0 &&
    pupilRect.width > 0 &&
    pupilRect.height > 0
  );

  const update = (_time: number) => {
    // If the portal is closing or layout is zeroed (e.g. on resize),
    // refresh geometry and skip this frame to avoid NaN in SVG points.
    if (!hasValidRects()) {
      handleResize();
      if (!hasValidRects()) {
        requestAnimationFrameId = requestAnimationFrame(update);
        return;
      }
    }
    const currentEyeRect = eyeRect!;
    const currentPupilRect = pupilRect!;
    
    //FOLLOW POSITION
    // position centered around eye container
    followPosition.x = mousePosition.x - (currentEyeRect.left + currentEyeRect.width / 2);
    followPosition.y = mousePosition.y - (currentEyeRect.top + currentEyeRect.height / 2);
    // Scale down
    followPosition.x *= FOLLOW_SCALE;
    followPosition.y *= FOLLOW_SCALE;
    // diamond clamp
    followPosition = clampToDiamond(followPosition, currentEyeRect.width);
    followPosition.y = Math.max(-eyeClamp,  Math.min(eyeClamp, followPosition.y));

    //IDLE POSITION
    const idleRange = getIdleBaseRange();
    const jitterRange = getIdleJitterRange();
    const combinedIdle = clampToDiamond(
      { x: idleTargetX.get() + idleJitterX.get(), y: idleTargetY.get() + idleJitterY.get() },
      (idleRange + jitterRange) * 2 || currentEyeRect.width,
    );
    idlePosition.x = combinedIdle.x;
    idlePosition.y = Math.max(-eyeClamp, Math.min(eyeClamp, combinedIdle.y));

    //FINAL EYE POSITION
    // Interpolate between idle and follow positions
    eyePosition.x = lerp(idlePosition.x, followPosition.x, followValue.get());
    eyePosition.y = lerp(idlePosition.y, followPosition.y, followValue.get());
    const normalizedEyePosition = {x: eyePosition.x / (currentEyeRect.width * 0.5), y: eyePosition.y / (currentEyeRect.height * 0.5) };

    //GAZE & squint
    // const gazeOffset = normalizedEyePosition.y * lerp(EYELID_MIN_OFFSET, EYELID_SQUINT_OFFSET, squintValue.get());
    const gazeOffset = normalizedEyePosition.y * EYELID_GAZE_OFFSET;
    const squintOffset = squintValue.get() * EYELID_SQUINT_OFFSET;

    // SQUINT
    //BLINK 
    const blinkProgress = Math.max(0, 1 - Math.abs(blinkValue.get() - 0.5) * 2);
    // console.log('blinkProgress', blinkProgress);

    // UPDATE DOM
    // Place eye (pupil) 
    pupil.style.setProperty('--pupil-posX', `${eyePosition.x + currentEyeRect.width / 2 - currentPupilRect.width / 2}px`);
    pupil.style.setProperty('--pupil-posY', `${eyePosition.y + currentEyeRect.height / 2 - currentPupilRect.height / 2}px`);

    // Place highlight
    highlight.style.setProperty('--highlight-posX', `${-normalizedEyePosition.x}`);
    highlight.style.setProperty('--highlight-posY', `${-normalizedEyePosition.y}`);

    // Move eyelids (blink and squint)
    // points[3].y = blinkProgress * (50 + offcenterAmount); // Adjust for gaze
    points[3].y = lerp(Math.max(EYELID_MIN, EYELID_GAZE_OFFSET + gazeOffset + squintOffset), 50 + BLINK_OFF_CENTER, blinkProgress); // Adjust for gaze
    topEyelid.setAttribute('d', buildEyelidPath(points));

    // points[3].y = blinkProgress * (50 - offcenterAmount); // Adjust for gaze
    points[3].y = lerp(Math.max(EYELID_MIN, EYELID_GAZE_OFFSET - gazeOffset + squintOffset), 50 - BLINK_OFF_CENTER, blinkProgress); // Adjust for gaze

    bottomEyelid.setAttribute('d', buildEyelidPath(points));
  
    requestAnimationFrameId = requestAnimationFrame(update);
  }

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('resize', handleResize);
  // Recompute geometry when the page scrolls so eyeRect stays aligned to viewport
  window.addEventListener('scroll', handleResize, { passive: true });

  handleResize();
  setIdleTarget();
  setIdleJitter();
  scheduleIdleMove();
  scheduleIdleJitter();
  requestAnimationFrameId = requestAnimationFrame(update);
  blinkTimeout = window.setTimeout(() => {
    blinkValue.to(1, { durationMs: BLINK_DURATION });
  }, 500);
  
  return {
    destroy: () => {
      console.log('destroy eye');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
      if (requestAnimationFrameId) {
        cancelAnimationFrame(requestAnimationFrameId);
        requestAnimationFrameId = null;
      }
      if (followIdleTimeout !== null) {
        clearTimeout(followIdleTimeout);
        followIdleTimeout = null;
      }
      if (idleMoveTimeout !== null) {
        clearTimeout(idleMoveTimeout);
        idleMoveTimeout = null;
      }
      if (idleJitterTimeout !== null) {
        clearTimeout(idleJitterTimeout);
        idleJitterTimeout = null;
      }
      if (blinkTimeout !== null) {
        clearTimeout(blinkTimeout);
        blinkTimeout = null;
      }
    
      transitions.stopAll();
    }
  }
}