/**
 * Add moods. Blink interval and eye movement is more frequent in some moods. Squint can be connected here to
 */
import { createTweenManager, easings } from './tween';
import { clampToDiamond, lerp } from './utils';

const BLINK_INTERVAL_MIN = 1000;
const BLINK_INTERVAL_MAX = 3000;

const EYELID_MIN = 10;
const EYELID_MIN_OFFSET = 25;
const EYELID_MAX_OFFSET = 50;

// EYELID POINTS
// Point 3 is the moving point
// When y is 0 it is open
// When y is 50 it is closed
const points = [
  { x: 0,   y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 50,  y: 0 }, // Moving point, index = 3
  { x: 0,   y: 50 }
];

export const createEye = (_target: HTMLElement) => {
  // console.log('create eye', target)
  const target = _target;
  const pupil = target.querySelector('.pupil') as HTMLElement;
  const highlight = pupil.querySelector('.highlight') as HTMLElement;
  const topEyelid = target.querySelector('.eyelid-top') as SVGPolygonElement  ;
  const bottomEyelid = target.querySelector('.eyelid-bottom') as SVGPolygonElement;

  const idlePosition = {x: 0, y: 0};
  const eyePosition = {x: 0, y: 0};
  const mousePosition = {x: 0, y: 0};
  let followPosition = {x: 1, y: 1};

  let requestAnimationFrameId: number | null = null;
  let followIdleTimeout: number | null = null;
  let blinkTimeout: number | null = null;

  let eyeRect: DOMRect | null = null;
  // let eyeCenterX: number;
  // let eyeCenterY: number;

  let pupilRect: DOMRect | null = null;
  
  const transitions = createTweenManager();

  const blinkValue = transitions.createValue(0, {
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
    defaultDurationMs: 500,
  });
  const squintValue = transitions.createValue(0, {
    easing: easings.easeOutQuad,
    defaultDurationMs: 500,
  });
  const followValue = transitions.createValue(0, {
    easing: easings.easeOutQuad,
    defaultDurationMs: 200,
  });

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
    followPosition.x *= 0.3;
    followPosition.y *= 0.3;
    // diamond clamp
    followPosition = clampToDiamond(followPosition, currentEyeRect.width);

    //IDLE POSITION

    //FINAL EYE POSITION
    // Interpolate between idle and follow positions
    eyePosition.x = lerp(idlePosition.x, followPosition.x, followValue.get());
    eyePosition.y = lerp(idlePosition.y, followPosition.y, followValue.get());
    const normalizedEyePosition = {x: eyePosition.x / (currentEyeRect.width * 0.5), y: eyePosition.y / (currentEyeRect.height * 0.5) };

    //GAZE & squint
    const gazeOffset = normalizedEyePosition.y * lerp(EYELID_MIN_OFFSET, EYELID_MAX_OFFSET, squintValue.get());

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
    const offcenterAmount = 20;
    // points[3].y = blinkProgress * (50 + offcenterAmount); // Adjust for gaze
    points[3].y = lerp(Math.max(EYELID_MIN, EYELID_MIN_OFFSET + gazeOffset), 50 + offcenterAmount, blinkProgress); // Adjust for gaze
    let eyelidPoints = points
      .map(p => `${p.x},${p.y}`)
      .join(" ");
    topEyelid.setAttribute('points', eyelidPoints);

    // points[3].y = blinkProgress * (50 - offcenterAmount); // Adjust for gaze
    points[3].y = lerp(Math.max(EYELID_MIN, EYELID_MIN_OFFSET - gazeOffset), 50 - offcenterAmount, blinkProgress); // Adjust for gaze

    eyelidPoints = points
      .map(p => `${p.x},${p.y}`)
      .join(" ");
    bottomEyelid.setAttribute('points', eyelidPoints);
  
    requestAnimationFrameId = requestAnimationFrame(update);
  }

  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('resize', handleResize);
  // Recompute geometry when the page scrolls so eyeRect stays aligned to viewport
  window.addEventListener('scroll', handleResize, { passive: true });

  handleResize();
  requestAnimationFrameId = requestAnimationFrame(update);
  blinkValue.to(1);
  
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
      if (blinkTimeout !== null) {
        clearTimeout(blinkTimeout);
        blinkTimeout = null;
      }
    
      transitions.stopAll();
    }
  }
}