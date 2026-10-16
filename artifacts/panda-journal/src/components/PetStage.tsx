import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { DeveloperEvent, DeveloperPose, PerformanceAction, PetEffect } from '@/lib/companion-types';
import {
  blendRoomPoint,
  gaitProgress,
  projectDesktopPoint,
  projectRoomPoint,
  projectScreenPoint,
  quadraticRoomPoint,
  randomRoomControlPoint,
  randomRoomPoint,
  roomFloorBoundsPercent,
  roomFurnitureZIndex,
  unprojectRoomPoint,
  unprojectScreenPoint,
  type RoomPoint,
} from '@/lib/room-plane';
import {
  chooseRestActivity,
  isMouseBehindOnTurn,
  scheduleActivityReset,
  type RoomActivityState,
} from '@/lib/room-activity';
import {
  createGrabMotionStats,
  qualifiesAsWildGrab,
  recordGrabMotion,
  type GrabMotionStats,
} from '@/lib/panda-grab-motion';
import animationManifest from '@/lib/panda-animation-manifest.json';
import './PetStage.css';

const DOUBLE_CLICK_WINDOW_MS = 3000;
const REACTION_DURATION_MS = 1400;
const CHAT_IDLE_TIMEOUT_MS = 30000;
const DIRECTION_EPSILON = 0.0001;
const GRAB_HOLD_MS = 420;
const GRAB_CLICK_SUPPRESS_MOVE_PX = 10;
const WAKE_CLICK_COOLDOWN_MS = 500;
const STARTLE_DURATION_MS = 720;
const ACTIVITY_SETTLE_MS = 320;
const ACTIVITY_POSE_MS = 360;
const WORLD_FALL_CHANCE = 0.1;
const WORLD_FALL_ANIMATION_MS = 1100;
const WORLD_FALL_MESSAGE_MS = 1800;
const WORLD_AWAY_MS = 5000;
const WORLD_RETURN_MS = 2500;
const WORLD_FALL_COOLDOWN_MS = 120000;
const DIRTY_FLY_DELAY_MS = 3 * 60 * 1000;
const DIRTY_FLY_DURATION_MS = 6200;
const DIRTY_FLY_RETRY_MS = 15000;
const DIRTY_FLY_REPEAT_MIN_MS = 90000;
const DIRTY_FLY_REPEAT_RANGE_MS = 90000;
const DIRTY_PLEA_FIRST_DELAY_MS = 700;
const DIRTY_PLEA_DURATION_MS = 4600;
const DIRTY_PLEA_RETRY_MS = 10000;
const DIRTY_PLEA_REPEAT_MIN_MS = 45000;
const DIRTY_PLEA_REPEAT_RANGE_MS = 30000;
const DIRTY_PLEAS = [
  '脏脏的……小熊猫想洗澡澡啦。',
  '呜……小熊猫想洗香香。',
  '身上脏脏的，想泡个澡澡……',
];
const ROOM_TRANSITION_FRAME_MS = 80;
const pandaStaticUrl = (path: string) => `${import.meta.env.BASE_URL}static/panda/${path}`;
const CHEW_FRAME_COUNT = 14;
const DIZZY_FRAME_COUNT = animationManifest.frameCountBySprite.dizzy;
const DIZZY_DROP_MS = DIZZY_FRAME_COUNT * animationManifest.frameIntervalMs.dizzy;
const DIZZY_HOLD_MS = 2400;
const BAMBOO_DROP_MS = 780;
const BATH_DROP_MS = 680;
const BATH_BALL_DROP_MS = 720;
const BATHING_FRAME_COUNT = 8;
const BATHING_FRAME_INTERVAL_MS = 160;
const bathingFrameUrl = (frame: number) => pandaStaticUrl(`bathing-wash/${frame}.png?v=bath-wash-pixellab-1`);
const bathingRubbingFrameUrl = (frame: number) => pandaStaticUrl(`bathing-soap/${frame}.png?v=bath-soap-pixellab-1`);
const dirtyBathingFrameUrl = (frame: number) => pandaStaticUrl(`bathing-dirty/${frame}.png?v=dirty-bath-pixellab-1`);
const dirtyBathingRubbingFrameUrl = (frame: number) => pandaStaticUrl(`bathing-dirty-soap/${frame}.png?v=dirty-bath-soap-pixellab-1`);
const BATH_PUFF_SPRITE = `${import.meta.env.BASE_URL}static/room/bath-puff.png?v=bath-puff-1`;
const chewFrameUrl = (frame: number) => pandaStaticUrl(
  frame === 0 ? 'chew.png?v=chew-feed-4' : `frames/chew-${frame}.png?v=chew-feed-4`,
);
const BAMBOO_SNACK_SPRITE = pandaStaticUrl('snack.png?v=chew-feed-2');
const LYING_SPRITE = pandaStaticUrl('lying.png?v=lying-pose-2');
const PEEKING_SPRITE = pandaStaticUrl('peeking.png?v=look-back-1');
const ROOM_FURNITURE_POINT: RoomPoint = { u: 0.72, v: 0.7 };
type TransitionKey = 'idle' | 'chew' | 'jump' | 'cuddle' | 'lying' | 'sleep' | 'peeking';
const PIXELLAB_TRANSITION_FRAMES: Record<TransitionKey, string[]> = Object.fromEntries(
  (['idle', 'chew', 'jump', 'cuddle', 'lying', 'sleep', 'peeking'] as const).map((name) => [
    name,
    Array.from({ length: 5 }, (_, index) =>
      pandaStaticUrl(`transitions/pixellab-walk-to-${name}-${index + 1}.png?v=${name === 'chew' ? 'chew-feed-1' : 'pixellab-transition-1'}`)),
  ]),
) as Record<TransitionKey, string[]>;
const ACTION_TRANSITION_KEY: Record<PerformanceAction, TransitionKey> = {
  bamboo: 'chew',
  roll: 'idle',
  jump: 'jump',
  spin: 'idle',
  somersault: 'jump',
  tail: 'cuddle',
  tumble: 'idle',
  cuddle: 'cuddle',
};
const DEVELOPER_POSE_TRANSITION_KEY: Record<DeveloperPose, TransitionKey> = {
  idle: 'idle',
  lying: 'lying',
  sleeping: 'sleep',
  peeking: 'peeking',
};
const performanceTransitionKey = (action: PerformanceAction | 'idle'): TransitionKey =>
  action === 'idle' ? 'idle' : ACTION_TRANSITION_KEY[action];
const DEVELOPER_POSE_SPRITES: Record<DeveloperPose, string> = {
  idle: animationManifest.motionSprites.idle,
  lying: 'lying',
  sleeping: animationManifest.motionSprites.sleep,
  peeking: 'peeking',
};

type PandaDragPointer = {
  pointerId: number;
  pointerType: React.PointerEvent<HTMLButtonElement>['pointerType'];
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  offsetX: number;
  offsetY: number;
  holdTimer: number;
  grabbed: boolean;
  grabbedAt: number;
  motion: GrabMotionStats;
  movedBeforeGrab: boolean;
};

type WorldFallPhase = 'none' | 'falling' | 'away' | 'returning' | 'dirty';
type BathPhase = 'none' | 'falling' | 'bathing';
type ScreenPosition = { x: number; y: number };
type BathBallPointer = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

export function PetStage({ pet, thinking = false, motion = 'idle', nightMode = false, debugClicks = false, showInteractionBubble = false, interactionBubbleText, developerPose = null, developerEvent = null, onChatModeChange }: {
  pet: PetEffect;
  thinking?: boolean;
  motion?: 'idle' | 'sleep';
  nightMode?: boolean;
  debugClicks?: boolean;
  showInteractionBubble?: boolean;
  interactionBubbleText?: string;
  developerPose?: DeveloperPose | null;
  developerEvent?: { event: DeveloperEvent; token: number } | null;
  onChatModeChange?: (isChat: boolean) => void;
}) {
  const hidden = pet.stage === 'fallen' || pet.stage === 'away';
  const seconds = Math.min(5, Math.max(2, pet.duration > 100 ? pet.duration / 1000 : pet.duration || 2));
  const requestedAction = pet.stage === 'performing' ? pet.action : 'idle';
  const action: PerformanceAction | 'idle' =
    ['roll', 'spin', 'tumble'].includes(requestedAction) ? 'idle' : requestedAction;
  const basePoseClass = developerPose ? developerPose === 'sleeping' ? 'sleep' : 'idle' : motion;
  const [interactionState, setInteractionState] = useState<'roaming' | 'chat'>('roaming');
  const [reacting, setReacting] = useState(false);
  const [roomWalking, setRoomWalking] = useState(false);
  const [activityState, setActivityState] = useState<RoomActivityState>('roaming');
  const [sleepingOnBed, setSleepingOnBed] = useState(false);
  const [activityTransition, setActivityTransition] = useState<'settling' | 'entering' | 'waking' | 'frames-entering' | 'frames-waking' | null>(null);
  const [pixelTransitionDirection, setPixelTransitionDirection] = useState<'entering' | 'waking' | null>(null);
  const [transitionFrameSrc, setTransitionFrameSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressPending, setIsPressPending] = useState(false);
  const [bathPhase, setBathPhase] = useState<BathPhase>('none');
  const [bathFrame, setBathFrame] = useState(0);
  const [bathRubbing, setBathRubbing] = useState(false);
  const [bathBallPosition, setBathBallPosition] = useState<ScreenPosition | null>(null);
  const [bathBallDragging, setBathBallDragging] = useState(false);
  const [bathBallDropping, setBathBallDropping] = useState(false);
  const [bathBallPlaced, setBathBallPlaced] = useState(false);
  const [startled, setStartled] = useState(false);
  const [developerGrab, setDeveloperGrab] = useState(false);
  const [dizzyPhase, setDizzyPhase] = useState<'none' | 'falling' | 'dazed'>('none');
  const [worldFallPhase, setWorldFallPhase] = useState<WorldFallPhase>('none');
  const [worldFallMessageVisible, setWorldFallMessageVisible] = useState(false);
  const [dirtyPleaText, setDirtyPleaText] = useState<string | null>(null);
  const [flyChaseActive, setFlyChaseActive] = useState(false);
  const [flyChaseSide, setFlyChaseSide] = useState<'left' | 'right'>('left');
  const worldAway = showInteractionBubble && worldFallPhase === 'away';
  const dirtyReturn = showInteractionBubble && (worldFallPhase === 'returning' || worldFallPhase === 'dirty');
  const isFlyChasing = flyChaseActive && bathPhase === 'none' && interactionState === 'roaming'
    && activityState === 'roaming' && !isDragging && !hidden;
  const [nightWakeOverride, setNightWakeOverride] = useState(false);
  const [debugEntries, setDebugEntries] = useState<string[]>([]);
  const previousDeveloperPoseRef = useRef<DeveloperPose | null>(null);
  const previousPetStageRef = useRef({ stage: pet.stage, token: pet.token, action: pet.action });
  const interactionStateRef = useRef<'roaming' | 'chat'>('roaming');
  const activityStateRef = useRef(activityState);
  activityStateRef.current = activityState;
  const developerPoseRef = useRef(developerPose);
  developerPoseRef.current = developerPose;
  const bathPhaseRef = useRef<BathPhase>('none');
  const bathBallDragRef = useRef<BathBallPointer | null>(null);
  const bathBallOriginRef = useRef<ScreenPosition | null>(null);
  const bathDropTimerRef = useRef(0);
  const developerEventTimerRef = useRef(0);
  const dirtyFlyTimerRef = useRef(0);
  const dirtyFlyEndTimerRef = useRef(0);
  const dirtyPleaTimerRef = useRef(0);
  const dirtyPleaHideTimerRef = useRef(0);
  const bathBallDropTimerRef = useRef(0);
  const bathTubRef = useRef<HTMLImageElement>(null);
  const bedRef = useRef<HTMLImageElement>(null);
  const bathBoxButtonRef = useRef<HTMLButtonElement>(null);
  const bathBallButtonRef = useRef<HTMLButtonElement>(null);
  const pandaButtonRef = useRef<HTMLButtonElement>(null);
  const firstActivationAtRef = useRef<number | null>(null);
  const clickExpiryTimerRef = useRef(0);
  const reactionTimerRef = useRef(0);
  const chatIdleTimerRef = useRef(0);
  const dragPointerRef = useRef<PandaDragPointer | null>(null);
  const draggingRef = useRef(false);
  const suppressClickAfterDragRef = useRef(false);
  const wakeClickIgnoreUntilRef = useRef(0);
  const startledRef = useRef(false);
  const startleTimerRef = useRef(0);
  const lastWorldFallAtRef = useRef(Number.NEGATIVE_INFINITY);
  const activityTransitionTimerRef = useRef(0);
  const activityTransitionFrameTimerRef = useRef(0);
  const activityTransitionSequenceRef = useRef(0);
  const bambooDropTimerRef = useRef(0);
  const currentImageRef = useRef('');
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const facingRef = useRef<'left' | 'right'>('right');
  const trackRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<RoomPoint>({ u: 0.5, v: 0.58 });
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const setBathPhaseNow = useCallback((next: BathPhase) => {
    bathPhaseRef.current = next;
    setBathPhase(next);
  }, []);
  const startFlyChase = useCallback(() => {
    setFlyChaseSide(Math.random() < 0.5 ? 'left' : 'right');
    setFlyChaseActive(true);
  }, []);
  const isResting = showInteractionBubble
    && (activityState === 'lying' || activityState === 'sleeping');
  const isSleeping = !startled
    && activityTransition !== 'frames-entering' && activityTransition !== 'frames-waking'
    && (developerPose === 'sleeping'
      || (showInteractionBubble && (activityState === 'sleeping' || (activityState === 'roaming' && motion === 'sleep' && !nightWakeOverride))));
  const isSleepingRef = useRef(isSleeping);
  isSleepingRef.current = isSleeping;
  const sprite = showInteractionBubble && dizzyPhase !== 'none'
    ? 'dizzy'
    : showInteractionBubble && (isDragging || developerGrab)
    ? 'grab'
    : startled && showInteractionBubble
    ? animationManifest.motionSprites.idle
    : interactionState === 'chat'
    ? animationManifest.motionSprites.idle
    : pet.stage === 'returning'
    ? animationManifest.motionSprites.walk
    : pet.stage === 'performing'
      ? animationManifest.actionSprites[action]
      : developerPose
        ? DEVELOPER_POSE_SPRITES[developerPose]
        : showInteractionBubble && activityState === 'peeking'
          ? 'peeking'
        : showInteractionBubble && activityState === 'lying'
          ? 'lying'
        : showInteractionBubble && activityState === 'daydreaming'
          ? animationManifest.motionSprites.idle
          : isResting
        ? animationManifest.motionSprites.sleep
      : showInteractionBubble
        ? motion === 'sleep' && !nightWakeOverride
          ? animationManifest.motionSprites.sleep
          : roomWalking
            ? animationManifest.motionSprites.walk
            : animationManifest.motionSprites.idle
        : animationManifest.motionSprites[motion];
  const [frame, setFrameState] = useState(0);
  const frameRef = useRef(0);
  const setFrame = useCallback((next: number) => {
    frameRef.current = next;
    setFrameState(next);
  }, []);
  const [bambooPhase, setBambooPhase] = useState<'idle' | 'entering' | 'dropping' | 'eating' | 'settling'>('idle');

  const recordDebug = useCallback((message: string) => {
    if (!import.meta.env.DEV || !debugClicks) return;
    const time = new Date().toLocaleTimeString();
    setDebugEntries((entries) => [...entries, `${time} ${message}`].slice(-10));
  }, [debugClicks]);

  const clearTransitionFrames = useCallback(() => {
    activityTransitionSequenceRef.current += 1;
    window.clearTimeout(activityTransitionFrameTimerRef.current);
    activityTransitionFrameTimerRef.current = 0;
    setTransitionFrameSrc(null);
  }, []);

  const playTransitionFrames = useCallback((frames: string[], direction: 'entering' | 'waking', onComplete: () => void) => {
    clearTransitionFrames();
    const sequence = activityTransitionSequenceRef.current;
    let index = 0;
    setActivityTransition(`frames-${direction}`);
    const showNextFrame = () => {
      if (activityTransitionSequenceRef.current !== sequence) return;
      if (index >= frames.length) {
        activityTransitionFrameTimerRef.current = 0;
        setTransitionFrameSrc(null);
        setActivityTransition(null);
        onComplete();
        return;
      }
      setTransitionFrameSrc(frames[index]);
      index += 1;
      activityTransitionFrameTimerRef.current = window.setTimeout(showNextFrame, ROOM_TRANSITION_FRAME_MS);
    };
    showNextFrame();
  }, [clearTransitionFrames]);

  const clearActivityTransition = useCallback(() => {
    window.clearTimeout(activityTransitionTimerRef.current);
    activityTransitionTimerRef.current = 0;
    clearTransitionFrames();
    setActivityTransition(null);
    setPixelTransitionDirection(null);
  }, [clearTransitionFrames]);

  const playPixelTransition = useCallback((key: TransitionKey, direction: 'entering' | 'waking', onComplete: () => void) => {
    const frames = PIXELLAB_TRANSITION_FRAMES[key];
    setPixelTransitionDirection(direction);
    playTransitionFrames(direction === 'entering' ? frames : [...frames].reverse(), direction, () => {
      setPixelTransitionDirection(null);
      onComplete();
    });
  }, [playTransitionFrames]);

  const startBambooFeeding = useCallback(() => {
    window.clearTimeout(bambooDropTimerRef.current);
    setBambooPhase('dropping');
    bambooDropTimerRef.current = window.setTimeout(() => {
      bambooDropTimerRef.current = 0;
      setBambooPhase('eating');
    }, BAMBOO_DROP_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(bambooDropTimerRef.current), []);

  useEffect(() => {
    if (dizzyPhase === 'falling') {
      const timer = window.setTimeout(() => setDizzyPhase('dazed'), DIZZY_DROP_MS);
      return () => window.clearTimeout(timer);
    }
    if (dizzyPhase === 'dazed') {
      const timer = window.setTimeout(() => setDizzyPhase('none'), DIZZY_HOLD_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [dizzyPhase]);

  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return;
    if (developerPose) {
      previousDeveloperPoseRef.current = developerPose;
      clearActivityTransition();
      setActivityState('roaming');
      setRoomWalking(false);
      if (interactionStateRef.current !== 'chat') {
        playPixelTransition(DEVELOPER_POSE_TRANSITION_KEY[developerPose], 'entering', () => {});
      }
      return;
    }
    const previousPose = previousDeveloperPoseRef.current;
    if (!previousPose) return;
    previousDeveloperPoseRef.current = null;
    clearActivityTransition();
    setActivityState('roaming');
    setRoomWalking(false);
    if (interactionStateRef.current === 'chat') return;
    playPixelTransition(DEVELOPER_POSE_TRANSITION_KEY[previousPose], 'waking', () => setRoomWalking(false));
  }, [clearActivityTransition, developerPose, playPixelTransition]);

  useLayoutEffect(() => {
    const previous = previousPetStageRef.current;
    const startedPerformance = pet.stage === 'performing'
      && (previous.stage !== 'performing' || previous.token !== pet.token);
    const finishedPerformance = previous.stage === 'performing' && pet.stage === 'present';

    if (interactionStateRef.current !== 'chat' && startedPerformance) {
      clearActivityTransition();
      setActivityState('roaming');
      setRoomWalking(false);
      window.clearTimeout(bambooDropTimerRef.current);
      bambooDropTimerRef.current = 0;
      if (pet.action === 'bamboo') setBambooPhase('entering');
      else setBambooPhase('idle');
      playPixelTransition(performanceTransitionKey(pet.action), 'entering', () => {
        if (pet.action === 'bamboo') startBambooFeeding();
      });
    } else if (interactionStateRef.current !== 'chat' && finishedPerformance) {
      clearActivityTransition();
      setRoomWalking(false);
      window.clearTimeout(bambooDropTimerRef.current);
      bambooDropTimerRef.current = 0;
      if (previous.action === 'bamboo') {
        setBambooPhase('settling');
        const currentChewFrame = Math.max(0, Math.min(CHEW_FRAME_COUNT, frameRef.current));
        const remainingBites = Array.from(
          { length: CHEW_FRAME_COUNT - currentChewFrame },
          (_, index) => chewFrameUrl(currentChewFrame + index + 1),
        );
        setPixelTransitionDirection('waking');
        playTransitionFrames([...remainingBites, ...[...PIXELLAB_TRANSITION_FRAMES.chew].reverse()], 'waking', () => {
          setPixelTransitionDirection(null);
          setBambooPhase('idle');
          setRoomWalking(false);
        });
      } else {
        setBambooPhase('idle');
        playPixelTransition(performanceTransitionKey(previous.action), 'waking', () => setRoomWalking(false));
      }
    } else if (previous.stage === 'performing' && pet.stage !== 'performing') {
      clearActivityTransition();
      window.clearTimeout(bambooDropTimerRef.current);
      bambooDropTimerRef.current = 0;
      setBambooPhase('idle');
    }

    previousPetStageRef.current = { stage: pet.stage, token: pet.token, action: pet.action };
  }, [clearActivityTransition, pet.action, pet.stage, pet.token, playPixelTransition, playTransitionFrames, startBambooFeeding]);

  const beginActivityWake = useCallback(() => {
    if (interactionStateRef.current === 'chat') return;
    clearActivityTransition();
    setRoomWalking(false);
    if (activityState === 'lying') {
      playPixelTransition('lying', 'waking', () => {
        setActivityState('roaming');
        setRoomWalking(false);
      });
      return;
    }
    if (activityState === 'sleeping') {
      playPixelTransition('sleep', 'waking', () => {
        setSleepingOnBed(false);
        setActivityState('roaming');
        setRoomWalking(false);
      });
      return;
    }
    if (activityState === 'daydreaming') {
      playPixelTransition('idle', 'waking', () => {
        setActivityState('roaming');
        setRoomWalking(false);
      });
      return;
    }
    if (activityState === 'peeking') {
      playPixelTransition('peeking', 'waking', () => {
        setActivityState('roaming');
        setRoomWalking(false);
      });
      return;
    }
    setActivityTransition('waking');
    activityTransitionTimerRef.current = window.setTimeout(() => {
      activityTransitionTimerRef.current = 0;
      setActivityState('roaming');
      setRoomWalking(false);
      setActivityTransition(null);
    }, ACTIVITY_POSE_MS);
  }, [activityState, clearActivityTransition, playPixelTransition]);

  const finishActivity = useCallback(() => {
    beginActivityWake();
  }, [beginActivityWake]);

  useEffect(() => () => {
    window.clearTimeout(activityTransitionTimerRef.current);
    window.clearTimeout(activityTransitionFrameTimerRef.current);
  }, []);

  const triggerStartle = useCallback(() => {
    if (!showInteractionBubble || hidden || interactionStateRef.current === 'chat' || startledRef.current) return;
    clearActivityTransition();
    startledRef.current = true;
    setStartled(true);
    setRoomWalking(false);
    recordDebug('受惊动作触发');
    window.clearTimeout(startleTimerRef.current);
    startleTimerRef.current = window.setTimeout(() => {
      startleTimerRef.current = 0;
      startledRef.current = false;
      setStartled(false);
    }, STARTLE_DURATION_MS);
  }, [clearActivityTransition, hidden, recordDebug, showInteractionBubble]);

  const updateFacing = useCallback((horizontalDelta: number) => {
    if (Math.abs(horizontalDelta) < DIRECTION_EPSILON) return;
    const nextFacing = horizontalDelta < 0 ? 'left' : 'right';
    if (facingRef.current === nextFacing) return;
    facingRef.current = nextFacing;
    setFacing(nextFacing);

    if (!showInteractionBubble || activityState !== 'roaming' || hidden
      || interactionStateRef.current !== 'roaming' || pet.stage !== 'present' || draggingRef.current) return;
    const mouse = mousePositionRef.current;
    const track = trackRef.current;
    if (!mouse || !track) return;
    const bounds = track.getBoundingClientRect();
    const pandaCenter = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    if (isMouseBehindOnTurn(mouse, pandaCenter, nextFacing)) triggerStartle();
  }, [activityState, hidden, pet.stage, showInteractionBubble, triggerStartle]);

  const applyRoomPoint = useCallback((point: RoomPoint) => {
    positionRef.current = point;
    const track = trackRef.current;
    if (!track) return;
    const projected = showInteractionBubble
      ? projectScreenPoint(point)
      : projectDesktopPoint(point);
    track.style.setProperty('--room-x', `${projected.x}%`);
    track.style.setProperty('--room-y', `${projected.y}%`);
    track.style.setProperty('--room-scale', projected.scale.toFixed(3));
    track.style.zIndex = String(projected.zIndex);
    track.dataset.roomU = point.u.toFixed(3);
    track.dataset.roomV = point.v.toFixed(3);
    track.dataset.roomScale = projected.scale.toFixed(3);
    if (showInteractionBubble) {
      track.style.setProperty('--room-shadow-scale', projected.shadowScale.toFixed(3));
      track.style.setProperty('--room-shadow-opacity', projected.shadowOpacity.toFixed(3));
      track.style.setProperty('--room-shadow-blur', `${projected.shadowBlur.toFixed(2)}px`);
      track.style.setProperty('--room-brightness', projected.brightness.toFixed(3));
      track.dataset.roomDepth = projected.depth.toFixed(3);
      track.dataset.roomZ = String(projected.zIndex);
    }
  }, [showInteractionBubble]);

  const startBathDropToTub = useCallback(() => {
    const tubRect = bathTubRef.current?.getBoundingClientRect();
    if (!showInteractionBubble || !tubRect || bathPhaseRef.current !== 'none') return false;
    const track = trackRef.current;
    const previous = positionRef.current;
    if (track) {
      track.style.setProperty('--bath-start-x', track.style.getPropertyValue('--room-x') || '50%');
      track.style.setProperty('--bath-start-y', track.style.getPropertyValue('--room-y') || '58%');
    }
    const target = unprojectScreenPoint(
      ((tubRect.left + tubRect.width / 2) / Math.max(1, window.innerWidth)) * 100,
      ((tubRect.top + tubRect.height * 0.86) / Math.max(1, window.innerHeight)) * 100,
    );
    updateFacing(target.u - previous.u);
    applyRoomPoint(target);
    window.clearTimeout(bathDropTimerRef.current);
    setBathPhaseNow('falling');
    bathDropTimerRef.current = window.setTimeout(() => {
      bathDropTimerRef.current = 0;
      if (bathPhaseRef.current === 'falling') setBathPhaseNow('bathing');
    }, BATH_DROP_MS);
    return true;
  }, [applyRoomPoint, setBathPhaseNow, showInteractionBubble, updateFacing]);

  const startDeveloperBathRub = useCallback(() => {
    if (bathPhaseRef.current !== 'bathing') return false;
    const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
    if (!pandaRect) return false;
    const position = {
      x: pandaRect.left + pandaRect.width * 0.62 - 20,
      y: pandaRect.top + pandaRect.height * 0.08,
    };
    bathBallOriginRef.current = position;
    setBathBallPosition(position);
    setBathBallPlaced(true);
    setBathRubbing(true);
    return true;
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || !developerEvent || !showInteractionBubble
      || interactionStateRef.current === 'chat') return;
    window.clearTimeout(developerEventTimerRef.current);
    developerEventTimerRef.current = 0;
    setDeveloperGrab(false);
    clearActivityTransition();
    setActivityState('roaming');
    setSleepingOnBed(false);
    setRoomWalking(false);

    switch (developerEvent.event) {
      case 'startle':
        triggerStartle();
        break;
      case 'grab':
        setDeveloperGrab(true);
        developerEventTimerRef.current = window.setTimeout(() => {
          developerEventTimerRef.current = 0;
          setDeveloperGrab(false);
        }, 2500);
        break;
      case 'dizzy-drop':
        setFrame(0);
        setDizzyPhase('falling');
        break;
      case 'world-fall':
        setWorldFallMessageVisible(true);
        setWorldFallPhase('falling');
        break;
      case 'bath-drop':
        startBathDropToTub();
        break;
      case 'bath-rub':
        if (bathPhaseRef.current === 'bathing') {
          startDeveloperBathRub();
        } else {
          if (bathPhaseRef.current === 'none') startBathDropToTub();
          developerEventTimerRef.current = window.setTimeout(() => {
            developerEventTimerRef.current = 0;
            startDeveloperBathRub();
          }, BATH_DROP_MS + 250);
        }
        break;
      case 'dirty-bath':
        setWorldFallPhase('dirty');
        if (bathPhaseRef.current === 'none') startBathDropToTub();
        break;
      case 'dirty-bath-rub':
        setWorldFallPhase('dirty');
        if (bathPhaseRef.current === 'bathing') {
          startDeveloperBathRub();
        } else {
          if (bathPhaseRef.current === 'none') startBathDropToTub();
          developerEventTimerRef.current = window.setTimeout(() => {
            developerEventTimerRef.current = 0;
            startDeveloperBathRub();
          }, BATH_DROP_MS + 250);
        }
        break;
      case 'dirty-fly-chase':
        setWorldFallPhase('dirty');
        startFlyChase();
        developerEventTimerRef.current = window.setTimeout(() => {
          developerEventTimerRef.current = 0;
          setFlyChaseActive(false);
        }, DIRTY_FLY_DURATION_MS);
        break;
    }
  }, [clearActivityTransition, developerEvent, setFrame, showInteractionBubble, startBathDropToTub, startDeveloperBathRub, startFlyChase, triggerStartle]);

  useEffect(() => {
    if (!showInteractionBubble) {
      if (worldFallPhase !== 'none') setWorldFallPhase('none');
      if (worldFallMessageVisible) setWorldFallMessageVisible(false);
      return undefined;
    }

    let timer = 0;
    if (worldFallPhase === 'falling') {
      timer = window.setTimeout(() => setWorldFallPhase('away'), WORLD_FALL_ANIMATION_MS);
    } else if (worldFallPhase === 'away') {
      timer = window.setTimeout(() => {
        const returnPoint = { ...positionRef.current, u: 0.08 };
        applyRoomPoint(returnPoint);
        facingRef.current = 'right';
        setFacing('right');
        setWorldFallPhase('returning');
      }, WORLD_AWAY_MS);
    } else if (worldFallPhase === 'returning') {
      timer = window.setTimeout(() => setWorldFallPhase('dirty'), WORLD_RETURN_MS);
    }

    return () => window.clearTimeout(timer);
  }, [applyRoomPoint, showInteractionBubble, worldFallPhase]);

  useEffect(() => {
    window.clearTimeout(dirtyFlyTimerRef.current);
    window.clearTimeout(dirtyFlyEndTimerRef.current);
    dirtyFlyTimerRef.current = 0;
    dirtyFlyEndTimerRef.current = 0;
    if (!showInteractionBubble || worldFallPhase !== 'dirty') {
      setFlyChaseActive(false);
      return undefined;
    }

    let alive = true;
    const scheduleNext = (delay: number) => {
      dirtyFlyTimerRef.current = window.setTimeout(() => {
        dirtyFlyTimerRef.current = 0;
        if (!alive) return;
        const canChaseNow = bathPhaseRef.current === 'none'
          && interactionStateRef.current === 'roaming'
          && activityStateRef.current === 'roaming'
          && !developerPoseRef.current
          && !isSleepingRef.current
          && !draggingRef.current
          && document.visibilityState !== 'hidden'
          && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!canChaseNow) {
          scheduleNext(DIRTY_FLY_RETRY_MS);
          return;
        }

        startFlyChase();
        dirtyFlyEndTimerRef.current = window.setTimeout(() => {
          dirtyFlyEndTimerRef.current = 0;
          setFlyChaseActive(false);
          scheduleNext(DIRTY_FLY_REPEAT_MIN_MS + Math.random() * DIRTY_FLY_REPEAT_RANGE_MS);
        }, DIRTY_FLY_DURATION_MS);
      }, delay);
    };
    scheduleNext(DIRTY_FLY_DELAY_MS);

    return () => {
      alive = false;
      window.clearTimeout(dirtyFlyTimerRef.current);
      window.clearTimeout(dirtyFlyEndTimerRef.current);
      dirtyFlyTimerRef.current = 0;
      dirtyFlyEndTimerRef.current = 0;
    };
  }, [showInteractionBubble, startFlyChase, worldFallPhase]);

  useEffect(() => {
    window.clearTimeout(dirtyPleaTimerRef.current);
    window.clearTimeout(dirtyPleaHideTimerRef.current);
    dirtyPleaTimerRef.current = 0;
    dirtyPleaHideTimerRef.current = 0;
    if (!showInteractionBubble || worldFallPhase !== 'dirty') {
      setDirtyPleaText(null);
      return undefined;
    }

    let alive = true;
    const scheduleNext = (delay: number) => {
      dirtyPleaTimerRef.current = window.setTimeout(() => {
        dirtyPleaTimerRef.current = 0;
        if (!alive) return;
        const canSpeakNow = bathPhaseRef.current === 'none'
          && interactionStateRef.current === 'roaming'
          && activityStateRef.current === 'roaming'
          && !developerPoseRef.current
          && !isSleepingRef.current
          && !draggingRef.current
          && document.visibilityState !== 'hidden';
        if (!canSpeakNow) {
          scheduleNext(DIRTY_PLEA_RETRY_MS);
          return;
        }

        const nextLine = DIRTY_PLEAS[Math.floor(Math.random() * DIRTY_PLEAS.length)];
        setDirtyPleaText(nextLine);
        dirtyPleaHideTimerRef.current = window.setTimeout(() => {
          dirtyPleaHideTimerRef.current = 0;
          setDirtyPleaText(null);
          if (alive) scheduleNext(DIRTY_PLEA_REPEAT_MIN_MS + Math.random() * DIRTY_PLEA_REPEAT_RANGE_MS);
        }, DIRTY_PLEA_DURATION_MS);
      }, delay);
    };
    scheduleNext(DIRTY_PLEA_FIRST_DELAY_MS);

    return () => {
      alive = false;
      window.clearTimeout(dirtyPleaTimerRef.current);
      window.clearTimeout(dirtyPleaHideTimerRef.current);
      dirtyPleaTimerRef.current = 0;
      dirtyPleaHideTimerRef.current = 0;
    };
  }, [showInteractionBubble, worldFallPhase]);

  useEffect(() => {
    if (!worldFallMessageVisible) return undefined;
    const timer = window.setTimeout(() => setWorldFallMessageVisible(false), WORLD_FALL_MESSAGE_MS);
    return () => window.clearTimeout(timer);
  }, [worldFallMessageVisible]);

  useEffect(() => {
    if (!showInteractionBubble) {
      if (bathPhaseRef.current !== 'none') setBathPhaseNow('none');
      window.clearTimeout(bathBallDropTimerRef.current);
      bathBallDropTimerRef.current = 0;
      setBathBallDropping(false);
      setBathBallPosition(null);
      setBathBallPlaced(false);
      setBathRubbing(false);
      bathBallDragRef.current = null;
      bathBallOriginRef.current = null;
      return;
    }
    if (bathPhase !== 'bathing') {
      window.clearTimeout(bathBallDropTimerRef.current);
      bathBallDropTimerRef.current = 0;
      setBathBallDropping(false);
      setBathBallPosition(null);
      setBathBallPlaced(false);
      setBathRubbing(false);
      bathBallDragRef.current = null;
      bathBallOriginRef.current = null;
      return;
    }
    setBathRubbing(false);
    setBathBallPosition(null);
    setBathBallPlaced(false);
  }, [bathPhase, setBathPhaseNow, showInteractionBubble]);

  useEffect(() => {
    if (bathPhase !== 'bathing') {
      setBathFrame(0);
      return undefined;
    }
    setBathFrame(0);
    const timer = window.setInterval(() => {
      setBathFrame((current) => (current + 1) % (BATHING_FRAME_COUNT + 1));
    }, BATHING_FRAME_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [bathPhase]);

  useLayoutEffect(() => {
    if (!showInteractionBubble || bathPhase !== 'bathing') return;
    const sceneRect = bathTubRef.current?.getBoundingClientRect();
    if (!sceneRect) return;
    applyRoomPoint(unprojectScreenPoint(
      ((sceneRect.left + sceneRect.width / 2) / Math.max(1, window.innerWidth)) * 100,
      ((sceneRect.top + sceneRect.height * 0.64) / Math.max(1, window.innerHeight)) * 100,
    ));
  }, [applyRoomPoint, bathPhase, showInteractionBubble, unprojectScreenPoint]);

  const maybeStartWorldFall = useCallback(() => {
    const now = performance.now();
    if (!showInteractionBubble || worldFallPhase !== 'none' || now - lastWorldFallAtRef.current < WORLD_FALL_COOLDOWN_MS
      || Math.random() >= WORLD_FALL_CHANCE) return false;
    lastWorldFallAtRef.current = now;
    setRoomWalking(false);
    setWorldFallMessageVisible(true);
    setWorldFallPhase('falling');
    return true;
  }, [showInteractionBubble, worldFallPhase]);

  const maybeEnterRest = useCallback((point: RoomPoint) => {
    if (!showInteractionBubble) return false;
    const nextActivity = chooseRestActivity(point);
    if (!nextActivity) return false;
    clearActivityTransition();
    setActivityTransition('settling');
    setRoomWalking(true);
    activityTransitionTimerRef.current = window.setTimeout(() => {
      activityTransitionTimerRef.current = 0;
      setActivityState(nextActivity);
      setRoomWalking(false);
      if (nextActivity === 'lying') {
        playPixelTransition('lying', 'entering', () => setRoomWalking(false));
        return;
      }
      if (nextActivity === 'sleeping') {
        playPixelTransition('sleep', 'entering', () => setRoomWalking(false));
        return;
      }
      if (nextActivity === 'daydreaming') {
        playPixelTransition('idle', 'entering', () => setRoomWalking(false));
        return;
      }
      if (nextActivity === 'peeking') {
        playPixelTransition('peeking', 'entering', () => setRoomWalking(false));
        return;
      }
      setActivityTransition('entering');
      activityTransitionTimerRef.current = window.setTimeout(() => {
        activityTransitionTimerRef.current = 0;
        setActivityTransition(null);
      }, ACTIVITY_POSE_MS);
    }, ACTIVITY_SETTLE_MS);
    return true;
  }, [clearActivityTransition, playPixelTransition, showInteractionBubble]);

  useEffect(() => {
    if (pet.stage === 'returning' && interactionState !== 'chat') updateFacing(1);
  }, [interactionState, pet.stage, updateFacing]);

  useEffect(() => {
    if (!showInteractionBubble) return;
    const rememberMousePosition = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      mousePositionRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointermove', rememberMousePosition, { passive: true });
    return () => window.removeEventListener('pointermove', rememberMousePosition);
  }, [showInteractionBubble]);

  useEffect(() => {
    if (motion !== 'sleep') setNightWakeOverride(false);
  }, [motion]);

  useEffect(() => {
    if (!import.meta.env.DEV || !debugClicks) return;
    recordDebug(`React 状态已提交：${interactionState}；reacting=${reacting}`);
  }, [interactionState, reacting, recordDebug]);

  useEffect(() => {
    if (!import.meta.env.DEV || !debugClicks) return;
    const describe = (element: Element | null) => {
      if (!element) return '无';
      const testId = element.getAttribute('data-testid');
      const className = typeof element.className === 'string' ? element.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return `${element.tagName.toLowerCase()}${testId ? `[${testId}]` : ''}${className ? `.${className}` : ''}`.slice(0, 80);
    };
    const onCapturedPointer = (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('[data-testid="panda-click-debug"]')) return;
      const panda = document.querySelector<HTMLElement>('[data-testid="button-panda"]');
      const rect = panda?.getBoundingClientRect();
      const x = event.clientX;
      const y = event.clientY;
      const insideButton = Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
      const nearButton = Boolean(rect && x >= rect.left - 72 && x <= rect.right + 72 && y >= rect.top - 72 && y <= rect.bottom + 72);
      const isPandaTarget = Boolean(target.closest('[data-testid="button-panda"]'));
      if (!insideButton && !nearButton && !isPandaTarget) return;
      const hitTarget = document.elementFromPoint(x, y);
      const detail = 'detail' in event ? `；detail=${(event as MouseEvent).detail}` : '';
      const point = `；坐标=(${Math.round(x)},${Math.round(y)})`;
      const box = rect
        ? `；按钮框=(${Math.round(rect.left)},${Math.round(rect.top)}) ${Math.round(rect.width)}×${Math.round(rect.height)}`
        : '；按钮不存在';
      recordDebug(
        `捕获 ${event.type}：target=${describe(target)}；熊猫按钮=${isPandaTarget ? '是' : '否'}；点在按钮框内=${insideButton ? '是' : '否'}；命中层=${describe(hitTarget)}${detail}${point}${box}`,
      );
    };
    document.addEventListener('pointerdown', onCapturedPointer, true);
    document.addEventListener('pointerup', onCapturedPointer, true);
    document.addEventListener('click', onCapturedPointer, true);
    document.addEventListener('dblclick', onCapturedPointer, true);
    return () => {
      document.removeEventListener('pointerdown', onCapturedPointer, true);
      document.removeEventListener('pointerup', onCapturedPointer, true);
      document.removeEventListener('click', onCapturedPointer, true);
      document.removeEventListener('dblclick', onCapturedPointer, true);
    };
  }, [debugClicks, recordDebug]);

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reducedMotionFrame = sprite === 'dizzy'
      ? DIZZY_FRAME_COUNT
      : sprite === 'chew' && pet.stage === 'performing' && pet.action === 'bamboo'
        && bambooPhase === 'eating' ? CHEW_FRAME_COUNT : 0;
    if (sprite === 'dizzy' && dizzyPhase === 'dazed') {
      setFrame(DIZZY_FRAME_COUNT);
      return;
    }
    let next = motionPreference.matches ? reducedMotionFrame : 0;
    setFrame(next);
    if (sprite === 'grab') return;
    const frameCount = animationManifest.frameCountBySprite[sprite as keyof typeof animationManifest.frameCountBySprite]
      ?? animationManifest.frameCount;
    const frameIntervalMs = animationManifest.frameIntervalMs[sprite as keyof typeof animationManifest.frameIntervalMs];
    let timer = 0;
    const isTransitioningFrames = activityTransition === 'frames-entering' || activityTransition === 'frames-waking';
    const waitingForSnack = pet.stage === 'performing' && pet.action === 'bamboo' && bambooPhase !== 'eating';
    const start = () => {
      if (hidden || interactionState === 'chat' || document.visibilityState === 'hidden' || motionPreference.matches || timer
        || waitingForSnack
        || (showInteractionBubble && (activityState === 'lying' || isTransitioningFrames))) return;
      timer = window.setInterval(() => {
        const isBambooEating = sprite === 'chew' && pet.stage === 'performing'
          && pet.action === 'bamboo' && bambooPhase === 'eating';
        const isDizzyFalling = sprite === 'dizzy' && dizzyPhase === 'falling';
        next = isBambooEating || isDizzyFalling
          ? Math.min(next + 1, frameCount)
          : (next + 1) % (frameCount + 1);
        setFrame(next);
        if ((isBambooEating || isDizzyFalling) && next >= frameCount) {
          window.clearInterval(timer);
          timer = 0;
        }
      }, frameIntervalMs);
    };
    const stop = () => {
      if (timer) window.clearInterval(timer);
      timer = 0;
      next = reducedMotionFrame;
      setFrame(next);
    };
    const onMotionPreferenceChange = (event: MediaQueryListEvent) => event.matches ? stop() : start();
    const onVisibilityChange = () => document.visibilityState === 'hidden' ? stop() : start();
    start();
    motionPreference.addEventListener('change', onMotionPreferenceChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      if (timer) window.clearInterval(timer);
      motionPreference.removeEventListener('change', onMotionPreferenceChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activityState, activityTransition, bambooPhase, dizzyPhase, hidden, interactionState, motion, pet.action, pet.stage, pet.token, setFrame, showInteractionBubble, sprite]);

  useEffect(() => {
    if (!showInteractionBubble || developerPose || activityState === 'roaming'
      || interactionState === 'chat' || sleepingOnBed) return;
    return scheduleActivityReset(activityState, finishActivity);
  }, [activityState, developerPose, finishActivity, interactionState, showInteractionBubble, sleepingOnBed]);

  const exitChat = () => {
    if (interactionStateRef.current !== 'chat') return;
    window.clearTimeout(chatIdleTimerRef.current);
    chatIdleTimerRef.current = 0;
    clearActivityTransition();
    setActivityState('roaming');
    interactionStateRef.current = 'roaming';
    setInteractionState('roaming');
    onChatModeChange?.(false);
  };

  const enterChat = (source: string) => {
    recordDebug(`enterChat 被调用；来源=${source}`);
    window.clearTimeout(clickExpiryTimerRef.current);
    window.clearTimeout(reactionTimerRef.current);
    firstActivationAtRef.current = null;
    clickExpiryTimerRef.current = 0;
    reactionTimerRef.current = 0;
    setReacting(false);
    clearActivityTransition();
    setActivityState('roaming');
    setRoomWalking(false);
    interactionStateRef.current = 'chat';
    setInteractionState('chat');
    onChatModeChange?.(true);
    recordDebug(`enterChat 设置完成：ref=${interactionStateRef.current}；请求状态=chat；reacting=false`);
    window.clearTimeout(chatIdleTimerRef.current);
    chatIdleTimerRef.current = window.setTimeout(exitChat, CHAT_IDLE_TIMEOUT_MS);
  };

  const handlePandaClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (worldFallPhase !== 'none' && worldFallPhase !== 'dirty') return;
    if (suppressClickAfterDragRef.current) {
      suppressClickAfterDragRef.current = false;
      recordDebug('拖拽结束，忽略随后的点击');
      return;
    }
    if (startledRef.current || dizzyPhase !== 'none') return;
    recordDebug(`熊猫按钮 onClick 已触发；detail=${event.detail}；当前状态=${interactionStateRef.current}`);
    if (interactionStateRef.current === 'chat') return;
    if (activityTransition === 'settling') {
      clearActivityTransition();
      setRoomWalking(false);
    }
    const now = performance.now();
    if (now < wakeClickIgnoreUntilRef.current) {
      recordDebug('唤醒点击的双击余波已忽略');
      return;
    }
    if (isSleeping) {
      window.clearTimeout(clickExpiryTimerRef.current);
      window.clearTimeout(reactionTimerRef.current);
      clickExpiryTimerRef.current = 0;
      reactionTimerRef.current = 0;
      firstActivationAtRef.current = null;
      wakeClickIgnoreUntilRef.current = now + WAKE_CLICK_COOLDOWN_MS;
      setReacting(false);
      clearActivityTransition();
      setRoomWalking(false);
      setSleepingOnBed(false);
      setActivityState('roaming');
      if (motion === 'sleep') setNightWakeOverride(true);
      recordDebug('睡觉中被点击：触发受惊动作，不进入聊天');
      triggerStartle();
      return;
    }
    if (event.detail >= 2) {
      recordDebug(`第二次点击已进入按钮处理；event.detail=${event.detail}；将调用 enterChat`);
      enterChat('浏览器第二次点击信号');
      return;
    }
    const firstActivationAt = firstActivationAtRef.current;
    if (firstActivationAt !== null && now - firstActivationAt <= DOUBLE_CLICK_WINDOW_MS) {
      recordDebug(`第二次点击已进入按钮处理；间隔=${Math.round(now - firstActivationAt)}ms；将调用 enterChat`);
      enterChat('3 秒点击窗口');
      return;
    }

    firstActivationAtRef.current = now;
    window.clearTimeout(clickExpiryTimerRef.current);
    window.clearTimeout(reactionTimerRef.current);
    setReacting(true);
    recordDebug('第一次点击已触发；状态=roaming；请求 reacting=true');
    reactionTimerRef.current = window.setTimeout(() => {
      reactionTimerRef.current = 0;
      setReacting(false);
      recordDebug('第一次点击反应结束；reacting=false');
    }, REACTION_DURATION_MS);
    clickExpiryTimerRef.current = window.setTimeout(() => {
      if (firstActivationAtRef.current === now) firstActivationAtRef.current = null;
      clickExpiryTimerRef.current = 0;
    }, DOUBLE_CLICK_WINDOW_MS);
  };

  const handlePandaPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!showInteractionBubble || interactionStateRef.current === 'chat' || !event.isPrimary
      || dizzyPhase !== 'none' || (worldFallPhase !== 'none' && worldFallPhase !== 'dirty') || bathPhaseRef.current === 'falling'
      || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    suppressClickAfterDragRef.current = false;
    const drag: PandaDragPointer = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      offsetX: rect.left + rect.width / 2 - event.clientX,
      offsetY: rect.bottom - event.clientY,
      holdTimer: 0,
      grabbed: false,
      grabbedAt: 0,
      motion: createGrabMotionStats(performance.now()),
      movedBeforeGrab: false,
    };
    dragPointerRef.current = drag;
    setIsPressPending(true);
    setRoomWalking(false);
    drag.holdTimer = window.setTimeout(() => {
      const activeDrag = dragPointerRef.current;
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
      activeDrag.grabbed = true;
      activeDrag.grabbedAt = performance.now();
      activeDrag.motion = createGrabMotionStats(activeDrag.grabbedAt);
      activeDrag.holdTimer = 0;
      draggingRef.current = true;
      suppressClickAfterDragRef.current = true;
      window.clearTimeout(clickExpiryTimerRef.current);
      window.clearTimeout(reactionTimerRef.current);
      clickExpiryTimerRef.current = 0;
      reactionTimerRef.current = 0;
      firstActivationAtRef.current = null;
      window.clearTimeout(startleTimerRef.current);
      startleTimerRef.current = 0;
      startledRef.current = false;
      setStartled(false);
      setReacting(false);
      setIsPressPending(false);
      setIsDragging(true);
      clearActivityTransition();
      setActivityState('roaming');
      setSleepingOnBed(false);
       if (bathPhaseRef.current === 'bathing') {
         setBathPhaseNow('none');
         if (worldFallPhase !== 'none') setWorldFallPhase('none');
       }
      if (motion === 'sleep') setNightWakeOverride(true);
      setRoomWalking(false);
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const x = ((activeDrag.currentX + activeDrag.offsetX) / width) * 100;
      const y = ((activeDrag.currentY + activeDrag.offsetY) / height) * 100;
      const point = showInteractionBubble
        ? unprojectScreenPoint(x, y)
        : unprojectRoomPoint(x, y, width, height);
      applyRoomPoint(point);
    }, GRAB_HOLD_MS);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePandaPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.grabbed) {
      drag.currentX = event.clientX;
      drag.currentY = event.clientY;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= GRAB_CLICK_SUPPRESS_MOVE_PX) {
        drag.movedBeforeGrab = true;
      }
      return;
    }
    const previousX = drag.currentX;
    const previousY = drag.currentY;
    const now = performance.now();
    drag.motion = recordGrabMotion(
      drag.motion,
      { x: previousX, y: previousY },
      { x: event.clientX, y: event.clientY },
      now,
    );
    drag.currentX = event.clientX;
    drag.currentY = event.clientY;
    event.preventDefault();
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const x = ((event.clientX + drag.offsetX) / width) * 100;
    const y = ((event.clientY + drag.offsetY) / height) * 100;
    const point = showInteractionBubble
      ? unprojectScreenPoint(x, y)
      : unprojectRoomPoint(x, y, width, height);
    updateFacing(point.u - positionRef.current.u);
    applyRoomPoint(point);
  };

  const finishPandaPointer = (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = dragPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const tubRect = bathTubRef.current?.getBoundingClientRect();
    const bedRect = bedRef.current?.getBoundingClientRect();
    const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
    const pandaCenterX = pandaRect ? pandaRect.left + pandaRect.width / 2 : Number.NaN;
    const pandaCenterY = pandaRect ? pandaRect.top + pandaRect.height / 2 : Number.NaN;
    const droppedOntoBed = drag.grabbed && !cancelled && showInteractionBubble
      && bedRect !== undefined && pandaRect !== undefined
      && pandaCenterX >= bedRect.left && pandaCenterX <= bedRect.right
      && pandaCenterY >= bedRect.top && pandaCenterY <= bedRect.bottom;
    const droppedIntoTub = drag.grabbed && !cancelled && showInteractionBubble
      && bathPhaseRef.current === 'none' && tubRect !== undefined
      && event.clientX >= tubRect.left && event.clientX <= tubRect.right
      && event.clientY >= tubRect.top && event.clientY <= tubRect.bottom;
    if (drag.holdTimer) window.clearTimeout(drag.holdTimer);
    dragPointerRef.current = null;
    setIsPressPending(false);
    if (drag.grabbed) {
      const now = performance.now();
      const triggeredDizzyDrop = showInteractionBubble && drag.pointerType === 'mouse' && !cancelled
        && qualifiesAsWildGrab(drag.motion, drag.grabbedAt, now, window.innerWidth, window.innerHeight);
      draggingRef.current = false;
      suppressClickAfterDragRef.current = !cancelled;
      setIsDragging(false);
      clearActivityTransition();
      setActivityState('roaming');
      setSleepingOnBed(false);
      setRoomWalking(false);
      if (droppedOntoBed && bedRect) {
        const target = unprojectScreenPoint(
          ((bedRect.left + bedRect.width * 0.5) / Math.max(1, window.innerWidth)) * 100,
          ((bedRect.top + bedRect.height * 0.8) / Math.max(1, window.innerHeight)) * 100,
        );
        updateFacing(target.u - positionRef.current.u);
        applyRoomPoint(target);
        setSleepingOnBed(true);
        setActivityState('sleeping');
        playPixelTransition('sleep', 'entering', () => setRoomWalking(false));
      } else if (droppedIntoTub && tubRect) {
        startBathDropToTub();
      } else if (triggeredDizzyDrop) {
        setFrame(0);
        setDizzyPhase('falling');
      }
    } else if (drag.movedBeforeGrab) {
      suppressClickAfterDragRef.current = !cancelled;
      if (!cancelled) window.setTimeout(() => { suppressClickAfterDragRef.current = false; }, 0);
    } else {
      suppressClickAfterDragRef.current = false;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePandaPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    finishPandaPointer(event);
  };

  const handlePandaPointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    finishPandaPointer(event, true);
  };

  const handleTakeBathBall = () => {
    if (bathPhaseRef.current !== 'bathing' || bathBallPosition) return;
    const boxRect = bathBoxButtonRef.current?.getBoundingClientRect();
    if (!boxRect) return;

    const origin = {
      x: boxRect.left + (boxRect.width - 40) / 2,
      y: boxRect.top - 24,
    };
    bathBallOriginRef.current = origin;
    setBathBallPosition(origin);
    setBathBallPlaced(false);
    setBathRubbing(false);
    window.clearTimeout(bathBallDropTimerRef.current);
    setBathBallDropping(true);
    bathBallDropTimerRef.current = window.setTimeout(() => {
      bathBallDropTimerRef.current = 0;
      setBathBallDropping(false);
    }, BATH_BALL_DROP_MS);
  };

  const handleBathBallPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || bathPhaseRef.current !== 'bathing' || !bathBallPosition) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setBathRubbing(false);
    bathBallDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setBathBallDragging(true);
    setBathBallPlaced(false);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleBathBallPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = bathBallDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setBathBallPosition({ x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY });
    const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
    const touchingPanda = Boolean(pandaRect
      && event.clientX >= pandaRect.left && event.clientX <= pandaRect.right
      && event.clientY >= pandaRect.top && event.clientY <= pandaRect.bottom);
    setBathRubbing(touchingPanda);
  };

  const finishBathBallPointer = (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = bathBallDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    bathBallDragRef.current = null;
    setBathBallDragging(false);
    const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
    const releasedOnPanda = !cancelled && bathPhaseRef.current === 'bathing' && pandaRect
      && event.clientX >= pandaRect.left - 12 && event.clientX <= pandaRect.right + 12
      && event.clientY >= pandaRect.top - 12 && event.clientY <= pandaRect.bottom + 12;
    if (releasedOnPanda && pandaRect) {
      setBathBallPosition({
        x: pandaRect.left + pandaRect.width * 0.62 - 20,
        y: pandaRect.top + pandaRect.height * 0.08,
      });
      setBathBallPlaced(true);
      setBathRubbing(true);
    } else {
      setBathBallPosition(bathBallOriginRef.current);
      setBathBallPlaced(false);
      setBathRubbing(false);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  useEffect(() => {
    const onRoomClick = (event: MouseEvent) => {
      if (interactionStateRef.current !== 'chat' || !(event.target instanceof Element)) return;
      if (event.target.closest(
        '[data-testid="button-panda"], .ps-bath-ball, button, input, textarea, select, a, [role="button"], [role="dialog"], .cc-top, .cc-composer, .cc-row, .cc-bubble',
      )) return;
      exitChat();
    };
    window.addEventListener('click', onRoomClick, true);
    return () => window.removeEventListener('click', onRoomClick, true);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(clickExpiryTimerRef.current);
    window.clearTimeout(reactionTimerRef.current);
    window.clearTimeout(chatIdleTimerRef.current);
    window.clearTimeout(startleTimerRef.current);
    window.clearTimeout(bathDropTimerRef.current);
    window.clearTimeout(developerEventTimerRef.current);
    window.clearTimeout(dirtyFlyTimerRef.current);
    window.clearTimeout(dirtyFlyEndTimerRef.current);
    window.clearTimeout(dirtyPleaTimerRef.current);
    window.clearTimeout(dirtyPleaHideTimerRef.current);
    if (dragPointerRef.current) window.clearTimeout(dragPointerRef.current.holdTimer);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timeout = 0;
    let raf = 0;
    let alive = true;
    let from = positionRef.current;
    let to = from;
    let control = from;
    let startedAt = 0;
    let duration = 0;
    let stepCount = 1;
    const setWalking = (walking: boolean) => {
      if (showInteractionBubble) setRoomWalking(walking);
    };

    const canRoam = () => interactionState === 'roaming' && dizzyPhase === 'none' && !reacting && !startled && !developerGrab && !startledRef.current && !hidden
      && (worldFallPhase === 'none' || worldFallPhase === 'dirty') && bathPhase === 'none'
      && pet.stage !== 'performing' && pet.stage !== 'returning'
      && !developerPose && !pixelTransitionDirection && activityState === 'roaming' && !isDragging && !isPressPending && !draggingRef.current
      && (motion !== 'sleep' || nightWakeOverride) && !preference.matches && document.visibilityState !== 'hidden';
    const schedule = () => {
      if (!alive || !canRoam() || timeout || raf) return;
      setWalking(false);
      timeout = window.setTimeout(() => {
        timeout = 0;
        if (!canRoam()) return;
        from = positionRef.current;
        to = randomRoomPoint();
          if (showInteractionBubble && flyChaseActive) {
            const escapeDirection = flyChaseSide === 'left' ? 1 : -1;
            const fleeDistance = 0.28 + Math.random() * 0.16;
            const targetU = Math.max(0.08, Math.min(0.92, from.u + escapeDirection * fleeDistance));
            const targetV = Math.max(0.08, Math.min(0.92, from.v + (Math.random() - 0.5) * 0.22));
            to = Math.abs(targetU - from.u) >= 0.12
              ? { u: targetU, v: targetV }
              : { u: targetU, v: Math.max(0.08, Math.min(0.92, from.v + (from.v < 0.5 ? 0.24 : -0.24))) };
            if (Math.hypot(to.u - from.u, to.v - from.v) < 0.12) to = randomRoomPoint();
          }
        if (showInteractionBubble && Math.hypot(to.u - from.u, to.v - from.v) < 0.22) {
          for (let attempt = 0; attempt < 8 && Math.hypot(to.u - from.u, to.v - from.v) < 0.22; attempt += 1) {
            to = randomRoomPoint();
          }
        }
        control = showInteractionBubble ? randomRoomControlPoint(from, to) : from;
        const initialHorizontalDelta = showInteractionBubble ? control.u - from.u : to.u - from.u;
        updateFacing(Math.abs(initialHorizontalDelta) > DIRECTION_EPSILON
          ? initialHorizontalDelta
          : to.u - from.u);
        if (startledRef.current) return;
        startedAt = performance.now();
        const distance = Math.hypot(to.u - from.u, to.v - from.v);
        duration = showInteractionBubble
          ? flyChaseActive ? 2000 + distance * 1800 : 6200 + distance * 6500 + Math.random() * 1100
          : 2600 + Math.random() * 1800;
        stepCount = Math.max(8, Math.round(duration / 440));
        setWalking(true);
        raf = window.requestAnimationFrame(step);
        }, showInteractionBubble
          ? flyChaseActive ? 120 + Math.random() * 180 : 1200 + Math.random() * 1600
          : 700 + Math.random() * 900);
    };
    const step = (now: number) => {
      raf = 0;
      if (!alive || !canRoam()) {
        setWalking(false);
        return;
      }
      const progress = Math.min(1, (now - startedAt) / duration);
      const point = showInteractionBubble
        ? quadraticRoomPoint(from, control, to, gaitProgress(progress, stepCount))
        : blendRoomPoint(from, to, progress);
      updateFacing(point.u - positionRef.current.u);
      if (startledRef.current) {
        setWalking(false);
        return;
      }
      applyRoomPoint(point);
      if (progress < 1) raf = window.requestAnimationFrame(step);
      else {
        setWalking(false);
         if (flyChaseActive || (!maybeEnterRest(positionRef.current) && !maybeStartWorldFall())) schedule();
      }
    };
    const pause = () => {
      window.clearTimeout(timeout);
      timeout = 0;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      setWalking(false);
    };
    const resume = () => { if (canRoam()) schedule(); };
    const onPreferenceChange = () => preference.matches ? pause() : resume();
    const onVisibilityChange = () => document.visibilityState === 'hidden' ? pause() : resume();

    applyRoomPoint(positionRef.current);
    resume();
    preference.addEventListener('change', onPreferenceChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      alive = false;
      pause();
      preference.removeEventListener('change', onPreferenceChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [
    activityState,
    bathPhase,
    applyRoomPoint,
    dizzyPhase,
    flyChaseActive,
    flyChaseSide,
    hidden,
    interactionState,
    isDragging,
    isPressPending,
    maybeEnterRest,
    maybeStartWorldFall,
    motion,
    developerPose,
    pixelTransitionDirection,
    nightWakeOverride,
    pet.stage,
    pet.token,
    reacting,
    developerGrab,
    startled,
    updateFacing,
    worldFallPhase,
  ]);

  const image = dirtyReturn && showInteractionBubble && bathPhase === 'bathing'
    ? bathRubbing ? dirtyBathingRubbingFrameUrl(bathFrame) : dirtyBathingFrameUrl(bathFrame)
    : dirtyReturn && isFlyChasing
      ? pandaStaticUrl('dirty-flee.png?v=dirty-flee-pixflux-1')
    : dirtyReturn
      ? pandaStaticUrl('dirty-return.png?v=world-fall-1')
    : showInteractionBubble && bathPhase === 'bathing'
      ? bathRubbing ? bathingRubbingFrameUrl(bathFrame) : bathingFrameUrl(bathFrame)
    : startled && showInteractionBubble
      ? pandaStaticUrl('startled.png?v=mouse-startle-pixflux-1')
    : sprite === 'lying'
    ? LYING_SPRITE
    : sprite === 'peeking'
      ? PEEKING_SPRITE
    : sprite === 'grab'
    ? `${import.meta.env.BASE_URL}static/panda/grab.png?v=scruff-grab-1`
    : sprite === 'dizzy'
      ? frame === 0
        ? `${import.meta.env.BASE_URL}static/panda/grab.png?v=scruff-grab-1`
        : pandaStaticUrl(`frames/dizzy-${Math.min(frame, DIZZY_FRAME_COUNT)}.png?v=dizzy-drop-1`)
    : frame === 0
      ? pandaStaticUrl(`${sprite}.png?v=${sprite === 'chew' ? 'chew-feed-4' : 'tail-left-3'}`)
      : pandaStaticUrl(`frames/${sprite}-${frame}.png?v=${sprite === 'chew' ? 'chew-feed-4' : 'tail-left-3'}`);
  currentImageRef.current = image;
  const roomFurniture = projectRoomPoint(ROOM_FURNITURE_POINT, window.innerWidth, window.innerHeight);
  const roomBackgroundImage = `url("${import.meta.env.BASE_URL}static/room/room-background.png")`;
  const roomFloorBounds = roomFloorBoundsPercent(window.innerWidth, window.innerHeight);
  const roomImageStyle = showInteractionBubble ? {
    backgroundImage: roomBackgroundImage,
    backgroundSize: 'min(100vw, 222.222vh) auto',
    backgroundPosition: 'center bottom',
    backgroundRepeat: 'no-repeat',
  } : undefined;
  return (
    <>
      <div className="ps-room-surface" data-night={nightMode} data-room-only={showInteractionBubble}
        aria-hidden="true" data-testid="room-surface">
        <div className="ps-room-backdrop" style={roomImageStyle && {
          ...roomImageStyle,
          clipPath: `inset(0 0 ${100 - roomFloorBounds.far}% 0)`,
        }} />
        <div className="ps-room-floor" style={roomImageStyle && {
          ...roomImageStyle,
          clipPath: `inset(${roomFloorBounds.far}% 0 0)`,
        }} />
      </div>
        <div className="ps-stage" data-stage={pet.stage} data-room-only={showInteractionBubble}
          data-bath-state={showInteractionBubble ? bathPhase : undefined}
         data-night={nightMode}
         data-interaction-state={interactionState}
          data-activity-state={showInteractionBubble ? developerPose ?? activityState : undefined}
          data-dev-pose={developerPose ?? undefined} data-transition-direction={pixelTransitionDirection ?? undefined}
          data-dragging={isDragging} data-pressing={isPressPending}
           data-world-fall-state={showInteractionBubble ? worldFallPhase : undefined}
        data-testid="panda-interaction-state" style={{ ['--ps-dur' as string]: `${seconds}s` }}>
        {showInteractionBubble && (
          <img className="ps-room-furniture" src={`${import.meta.env.BASE_URL}static/room/foreground-cabinet.svg`}
            alt="" aria-hidden="true" draggable={false} data-testid="room-foreground-furniture"
            data-room-depth={ROOM_FURNITURE_POINT.v.toFixed(3)}
            style={{
              left: `${roomFurniture.x}%`,
              top: `${roomFurniture.y}%`,
              zIndex: roomFurnitureZIndex(ROOM_FURNITURE_POINT.v),
              transform: `translate(-50%, -100%) scale(${roomFurniture.scale.toFixed(3)})`,
            }} />
        )}
        {showInteractionBubble && (
          <img ref={bedRef} className="ps-room-bed"
            src={`${import.meta.env.BASE_URL}static/room/panda-nest-bed.png?v=panda-fresh-isometric-bed-5-paw-axis-perspective`}
            alt="圆形藤编小熊猫窝，带白色后枕、爪印棕枕和流苏毯；把小熊猫拖到床上就会睡觉" draggable={false} data-testid="room-bed" />
        )}
        {showInteractionBubble && (
          <div className="ps-bath-station" data-testid="bath-station">
            <button ref={bathBoxButtonRef} type="button" className="ps-bath-box"
              disabled={bathPhase !== 'bathing' || bathBallPosition !== null}
              aria-label={bathPhase === 'bathing' && !bathBallPosition ? '打开浴球小箱子，取出浴球' : '浴球收纳箱；把小熊猫放进浴缸后可以取浴球'}
              title={bathPhase === 'bathing' && !bathBallPosition ? '点击打开小箱子，取出浴球' : bathBallPosition ? '浴球已经取出，可以拖到小熊猫身上' : '把小熊猫放进浴缸后就可以取浴球'}
              onClick={handleTakeBathBall} data-testid="bath-ball-box">
              <img className="ps-bath-box-puff" src={BATH_PUFF_SPRITE} alt="" aria-hidden="true" draggable={false} />
              <span className="ps-bath-box-label">浴球</span>
            </button>
            <img ref={bathTubRef} className="ps-room-bathtub"
              src={`${import.meta.env.BASE_URL}static/room/pet-bathtub.png?v=pet-bathtub-1`}
              alt="" aria-hidden="true" draggable={false} data-testid="room-bathtub" />
          </div>
        )}
        {!showInteractionBubble && thinking && <span className="ps-thinking" role="status">唔……</span>}
        {!hidden && (!worldAway || worldFallMessageVisible) && (
          <div ref={trackRef} className={`ps-track${pet.stage === 'returning' ? ' ps-returning' : ''}${worldFallPhase === 'returning' ? ' ps-world-returning' : ''}${worldAway ? ' ps-world-away' : ''}${bathPhase === 'falling' ? ' ps-bath-dropping' : ''}${sleepingOnBed ? ' ps-bed-sleeping' : ''}`}
            data-room-u="0.500" data-room-v="0.580" data-testid="panda-room-position" key={`${pet.token}-${pet.stage}`}>
            {showInteractionBubble && worldFallMessageVisible && (
              <span className="ps-thinking ps-room-chat-bubble ps-world-fall-bubble" role="status" aria-live="polite"
                data-testid="panda-world-fall-message">掉出去啦！</span>
            )}
            {showInteractionBubble && worldFallPhase === 'dirty' && bathPhase === 'none'
              && interactionState === 'roaming' && activityState === 'roaming' && !developerPose
              && !isSleeping && !isDragging && dirtyPleaText && (
                <span className="ps-thinking ps-room-chat-bubble ps-world-dirty-plea" role="status" aria-live="polite"
                  data-testid="panda-dirty-plea">{dirtyPleaText}</span>
            )}
            {showInteractionBubble && worldFallPhase === 'none' && !isSleeping && !startled && !isDragging && interactionBubbleText && (
              <span className="ps-thinking ps-room-chat-bubble" role="status" aria-live="polite"
                data-testid="panda-chat-bubble">{interactionBubbleText}</span>
            )}
            {showInteractionBubble && !worldAway && bathPhase !== 'bathing' && (
              <span className={`ps-ground-shadow${isSleeping ? ' ps-ground-shadow-sleeping' : ''}`}
                aria-hidden="true" />
            )}
              {!worldAway && (
              <button ref={pandaButtonRef} type="button" className={`ps-panda ps-${pet.stage === 'performing' ? action : basePoseClass}${showInteractionBubble && roomWalking ? ' ps-walking' : ''}${showInteractionBubble && activityTransition ? ` ps-transition-${activityTransition}` : ''}${pixelTransitionDirection ? ' ps-pixel-transition' : ''}${interactionState === 'chat' ? ' ps-chatting' : ''}${(showInteractionBubble && activityState === 'lying' || developerPose === 'lying') ? ' ps-lying' : ''}${(showInteractionBubble && activityState === 'peeking' || developerPose === 'peeking') ? ' ps-peeking' : ''}${isSleeping ? ' ps-sleeping' : ''}${developerPose === 'idle' ? ' ps-dev-idle' : ''}${startled ? ' ps-startled' : ''}${isPressPending ? ' ps-pressing' : ''}${reacting ? ' ps-reacting' : ''}${isDragging || developerGrab ? ' ps-dragging' : ''}${showInteractionBubble && dizzyPhase !== 'none' ? ' ps-dizzy' : ''}${worldFallPhase === 'falling' ? ' ps-world-falling' : ''}${bathPhase === 'falling' ? ' ps-bath-dropping' : ''}${bathPhase === 'bathing' ? ' ps-bathing' : ''}${dirtyReturn ? ' ps-world-dirty' : ''}${isFlyChasing ? ' ps-fly-flee' : ''}`}
              onClick={handlePandaClick}
              onPointerDown={handlePandaPointerDown}
              onPointerMove={handlePandaPointerMove}
              onPointerUp={handlePandaPointerUp}
              onPointerCancel={handlePandaPointerCancel}
                aria-label={isFlyChasing ? '脏兮兮的小熊猫被苍蝇追着跑' : bathPhase === 'falling' ? '小熊猫掉进浴缸了' : bathPhase === 'bathing' ? '小熊猫正在洗澡；长按可以提起' : worldFallPhase === 'falling' ? '小熊猫掉出房间了' : dirtyReturn ? '小熊猫灰头土脸地哭着回来了' : dizzyPhase === 'falling' ? '小熊猫松手后掉到地上' : dizzyPhase === 'dazed' ? '小熊猫坐在地上眩晕了一会儿' : isDragging ? '正在拎起小熊猫；拖动到目标位置后松手' : isPressPending ? '按住小熊猫即可拎起' : startled ? '小熊猫被吓了一跳' : isSleeping ? '小熊猫正在睡觉；点击叫醒' : interactionState === 'chat' ? '小熊猫正在聊天；点击房间空白处退出' : '点击小熊猫和它互动'}
                 data-testid="button-panda" data-bath-state={showInteractionBubble ? bathPhase : undefined} data-bath-ball-on-panda={bathBallPlaced ? 'true' : undefined} data-bath-rubbing={showInteractionBubble && bathPhase === 'bathing' ? (bathRubbing ? 'true' : 'false') : undefined} data-sleeping-on-bed={sleepingOnBed ? 'true' : 'false'} data-reacting={reacting ? 'true' : undefined} data-startled={startled ? 'true' : undefined} data-dizzy-state={showInteractionBubble ? dizzyPhase : undefined} data-facing={facing}
                 data-bamboo-phase={action === 'bamboo' ? bambooPhase : undefined}
                data-activity-state={showInteractionBubble ? developerPose ?? activityState : undefined}
                data-dev-pose={developerPose ?? undefined}
                data-activity-transition={showInteractionBubble ? activityTransition ?? 'none' : undefined}
                data-transition-direction={pixelTransitionDirection ?? undefined}
                 data-world-fall-state={showInteractionBubble ? worldFallPhase : undefined}>
                <img className="ps-body" src={image}
                 data-sprite={dirtyReturn && bathPhase === 'bathing' ? (bathRubbing ? 'dirty-bathing-soap' : 'dirty-bathing') : dirtyReturn && isFlyChasing ? 'dirty-flee' : dirtyReturn ? 'dirty-return' : bathPhase === 'bathing' ? 'bathing' : startled && showInteractionBubble ? 'startled' : sprite}
                 data-frame={showInteractionBubble && bathPhase === 'bathing' ? bathFrame : dirtyReturn ? '0' : frame}
                 width={60} height={60} alt="" draggable={false} />
               {bathPhase === 'bathing' && bathRubbing && (
                 <span className="ps-bath-foam" aria-hidden="true">
                   <i /><i /><i /><i />
                 </span>
               )}
                {isFlyChasing && (
                  <span className={`ps-fly-chaser ps-fly-chaser-${flyChaseSide}`} aria-hidden="true">🪰</span>
                )}
                {(activityTransition === 'frames-entering' || activityTransition === 'frames-waking')
                 && transitionFrameSrc && (
                 <img className="ps-transition-frame" src={transitionFrameSrc} alt="" aria-hidden="true" draggable={false} />
               )}
              {isDragging && showInteractionBubble && (
                <>
                  <span className="ps-grab-daze" aria-hidden="true">···</span>
                </>
              )}
              {startled && showInteractionBubble && <span className="ps-scared-mark" aria-hidden="true"><b>!</b><i /></span>}
              {(showInteractionBubble || developerPose === 'sleeping') && interactionState !== 'chat' && isSleeping && (
                <span className="ps-sleep-zzz" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span>
              )}
              {interactionState !== 'chat' && ((showInteractionBubble && activityState === 'daydreaming') || developerPose === 'idle') && (
                <span className="ps-daydream-dots" aria-hidden="true">···</span>
              )}
              {action === 'bamboo' && bambooPhase === 'dropping' && (
                <img className="ps-snack-drop" src={BAMBOO_SNACK_SPRITE} alt="" aria-hidden="true" draggable={false} />
              )}
              {pet.carrying && <span className="ps-gift" aria-hidden="true">{pet.carrying}</span>}
              </button>
              )}
          </div>
        )}
        {showInteractionBubble && bathPhase === 'bathing' && bathBallPosition && (
          <button ref={bathBallButtonRef} type="button"
            className={`ps-bath-ball${bathBallDragging ? ' ps-bath-ball-dragging' : ''}${bathBallDropping ? ' ps-bath-ball-dropping' : ''}${bathBallPlaced ? ' ps-bath-ball-placed' : ''}`}
            style={{ left: bathBallPosition.x, top: bathBallPosition.y }}
              aria-label="浴球；拖到小熊猫身上就会开始揉洗" title="浴球碰到小熊猫就会开始揉洗；拖开可以停止"
             data-testid="bath-ball"
            data-on-panda={bathBallPlaced ? 'true' : 'false'}
             data-dropping={bathBallDropping ? 'true' : 'false'}
            onPointerDown={handleBathBallPointerDown} onPointerMove={handleBathBallPointerMove}
            onPointerUp={finishBathBallPointer} onPointerCancel={(event) => finishBathBallPointer(event, true)}>
            <img src={BATH_PUFF_SPRITE}
              alt="" aria-hidden="true" draggable={false} />
          </button>
        )}
        {hidden && <p className="ps-away" role="status">{pet.stage === 'away' ? '小熊猫出门啦，会带礼物回来。' : '呜哇——！小熊猫掉出去啦，马上回来。'}</p>}
        {import.meta.env.DEV && debugClicks && interactionState !== 'chat' && (
          <aside className="ps-debug-panel" data-testid="panda-click-debug" aria-label="小熊猫点击诊断">
            <strong>临时点击诊断</strong>
            <span>状态：{interactionState} · reacting：{String(reacting)}</span>
            <ol>
              {debugEntries.slice(-10).reverse().map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}
            </ol>
            <small>请连续点击小熊猫两次；事件捕获目标和状态变化会记录在这里。</small>
          </aside>
        )}
      </div>
    </>
  );
}
