import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { DeveloperEvent, DeveloperPose, PerformanceAction, PetEffect, SpacePoliceLetter } from '@/lib/companion-types';
import {
  blendRoomPoint,
  gaitProgress,
  projectDesktopPoint,
  projectRoomPoint,
  isWalkableRoomPoint,
  isWalkableRoomSegment,
  nearestWalkableRoomPoint,
  planRoomWalkPath,
  pointAlongRoomWalkPath,
  randomWalkableRoomPoint,
  randomRoomPoint,
  roomImagePolygonClipPath,
  roomImageRegionClipPath,
  roomWalkPathLength,
  ROOM_IMAGE_HEIGHT,
  ROOM_IMAGE_WIDTH,
  roomFloorBoundsPercent,
  roomFurnitureZIndex,
  unprojectRoomPoint,
  type RoomPoint,
} from '@/lib/room-plane';
import {
  chooseRestActivity,
  isMouseBehindOnTurn,
  scheduleActivityReset,
  type RoomActivityState,
} from '@/lib/room-activity';
import {
  PIXELLAB_TRANSITION_FRAME_FILES,
  PIXEL_TRANSITION_FRAME_MS,
  playPixelTransitionFrames,
  type PixelTransitionKey,
  type PixelTransitionPhase,
} from '@/lib/pixel-transition';
import {
  createGrabMotionStats,
  qualifiesAsWildGrab,
  recordGrabMotion,
  type GrabMotionStats,
} from '@/lib/panda-grab-motion';
import {
  clampRoomFurnitureCenter,
  readRoomFurnitureLayout,
  writeRoomFurnitureLayout,
  type RoomFurnitureId,
  type RoomFurnitureLayout,
  type RoomFurniturePoint,
} from '@/lib/room-furniture-layout';
import { SPACE_POLICE_LETTER_EAT_DELAY_MS } from '@/lib/companion-store';
import animationManifest from '@/lib/panda-animation-manifest.json';
import { RoomPropDock, type RoomProp, type RoomToy } from './RoomPropDock';
import './PetStage.css';

const ROOM_PROPS_KEY = 'little-panda-room-props-v1';
const DOUBLE_CLICK_WINDOW_MS = 3000;
const REACTION_DURATION_MS = 1400;
const CHAT_IDLE_TIMEOUT_MS = 30000;
const DIRECTION_EPSILON = 0.0001;
const GRAB_HOLD_MS = 420;
const GRAB_CLICK_SUPPRESS_MOVE_PX = 10;
const GRAB_HAND_ANCHOR_BY_FORM = {
  regular: { x: 0.54, y: 0.045 },
  dirty: { x: 0.5, y: 0.12 },
} as const;
const SPACE_POLICE_LETTER_REMINDER_MS = 60_000;
const SPACE_POLICE_ENVELOPE_HOLD_MS = 420;
const SPACE_POLICE_ENVELOPE_STORE_MS = 190;
const ROOM_WASTE_HOLD_MS = 520;
const ROOM_WASTE_PACK_MS = 880;
const ROOM_WASTE_DISPOSE_MS = 720;
const WAKE_CLICK_COOLDOWN_MS = 500;
const STARTLE_DURATION_MS = 720;
const ACTIVITY_SETTLE_MS = 320;
const ACTIVITY_POSE_MS = 360;
const WORLD_FALL_ANIMATION_MS = 1100;
const WORLD_FALL_MESSAGE_MS = 1800;
const WORLD_AWAY_MS = 5000;
const WORLD_RETURN_MS = 2500;
const WORLD_FALL_COOLDOWN_MS = 120000;
const DAMP_RACK_DRY_MS = 5000;
const HOVER_CUDDLE_DURATION_MS = 3600;
const HOVER_CUDDLE_COOLDOWN_MS = 5000;
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
const BATHING_FRAME_COUNT = 8;
const pandaStaticUrl = (path: string) => `${import.meta.env.BASE_URL}static/panda/${path}`;
const CHEW_FRAME_COUNT = 14;
const DIZZY_FRAME_COUNT = animationManifest.frameCountBySprite.dizzy;
const DIZZY_DROP_MS = DIZZY_FRAME_COUNT * animationManifest.frameIntervalMs.dizzy;
const DIZZY_HOLD_MS = 2400;
const BAMBOO_DROP_MS = 780;
const BATH_DROP_MS = 680;
const BATH_BALL_DROP_MS = 720;
const BATH_RUB_MS = 5000;
const BATHING_FRAME_INTERVAL_MS = 160;
const bathingFrameUrl = (frame: number) => pandaStaticUrl(`bathing-wash/${frame}.png?v=bath-wash-pixellab-1`);
const bathingRubbingFrameUrl = (frame: number) => pandaStaticUrl(`bathing-soap/${frame}.png?v=bath-soap-pixellab-1`);
const dirtyBathingFrameUrl = (frame: number) => pandaStaticUrl(`bathing-dirty/${frame}.png?v=dirty-bath-pixellab-1`);
const dirtyBathingRubbingFrameUrl = (frame: number) => pandaStaticUrl(`bathing-dirty-soap/${frame}.png?v=dirty-bath-soap-pixellab-1`);
const BATH_PUFF_SPRITE = `${import.meta.env.BASE_URL}static/room/bath-puff.png?v=bath-puff-1`;
const CAPTURED_TIME_VORTEX_SPRITE = pandaStaticUrl('captured-time-portal.svg?v=room-portal-pixel-2');
const chewFrameUrl = (frame: number) => pandaStaticUrl(
  frame === 0 ? 'chew.png?v=chew-feed-4' : `frames/chew-${frame}.png?v=chew-feed-4`,
);
const BAMBOO_SNACK_SPRITE = pandaStaticUrl('snack.png?v=chew-feed-2');
const LYING_SPRITE = pandaStaticUrl('lying.png?v=lying-pose-2');
const PEEKING_SPRITE = pandaStaticUrl('peeking.png?v=look-back-1');
const SPACE_BLACK_HOLE_OCCLUDER_Z_INDEX = 121;
const ROOM_FURNITURE_OCCLUDERS: {
  id: string;
  depth: number;
  region?: { left: number; top: number; right: number; bottom: number };
  polygon?: readonly (readonly [number, number])[];
  coversBlackHole?: boolean;
}[] = [
  { id: 'cat-tree', depth: 0.05, region: { left: 300, top: 150, right: 550, bottom: 300 } },
  { id: 'armchair', depth: 0.03, region: { left: 590, top: 170, right: 790, bottom: 295 } },
  { id: 'wardrobe', depth: 0.14, region: { left: 815, top: 45, right: 975, bottom: 335 } },
  { id: 'dresser', depth: 0.22, region: { left: 925, top: 215, right: 1024, bottom: 365 } },
  {
    id: 'lower-left-plant',
    depth: 0.82,
    coversBlackHole: true,
    polygon: [[0, 390], [15, 393], [29, 404], [43, 408], [56, 420], [73, 424], [88, 436], [101, 441], [92, 448], [74, 446], [61, 440], [47, 446], [31, 440], [16, 448], [0, 444]],
  },
  {
    id: 'lower-right-plant',
    depth: 0.92,
    coversBlackHole: true,
    polygon: [[880, 478], [884, 465], [894, 456], [906, 449], [922, 444], [938, 446], [950, 435], [968, 436], [981, 445], [1001, 449], [1014, 460], [1024, 461], [1024, 576], [931, 576], [921, 560], [905, 548], [895, 531], [883, 518], [875, 502], [879, 490]],
  },
];
type TransitionKey = PixelTransitionKey;
type RoomWastePoint = { x: number; y: number };
type RoomWastePointer = {
  pointerId: number;
  deliveredAt: number;
  kind: 'pack' | 'drag';
  holdTimer: number;
};
const TRANSITION_ASSET_VERSIONS: Record<TransitionKey, string> = {
  idle: 'pixellab-transition-1',
  chew: 'chew-feed-1',
  jump: 'pixellab-transition-1',
  cuddle: 'pixellab-transition-1',
  tail: 'tail-chase-ccw-3',
  somersault: 'roll-to-lie-pose-2',
  lying: 'pixellab-transition-1',
  sleep: 'sleep-transition-2',
  peeking: 'pixellab-transition-1',
  'captured-homecoming': 'captured-homecoming-exit-1',
};
const PIXELLAB_TRANSITION_FRAMES = Object.fromEntries(
  Object.entries(PIXELLAB_TRANSITION_FRAME_FILES).map(([key, files]) => [
    key,
    files.map(file => `${pandaStaticUrl(file)}?v=${TRANSITION_ASSET_VERSIONS[key as TransitionKey]}`),
  ]),
) as Record<TransitionKey, string[]>;
const ACTION_TRANSITION_KEY: Record<PerformanceAction, TransitionKey> = {
  bamboo: 'chew',
  roll: 'idle',
  jump: 'jump',
  spin: 'idle',
  somersault: 'somersault',
  tail: 'tail',
  tumble: 'idle',
  cuddle: 'lying',
  'captured-homecoming': 'captured-homecoming',
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
  liftedFromBath: boolean;
};

type WorldFallPhase = 'none' | 'falling' | 'away' | 'returning' | 'dirty';
type FurniturePointer = {
  id: RoomFurnitureId;
  pointerId: number;
  element: HTMLElement;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  holdTimer: number;
  active: boolean;
  moved: boolean;
};
type BathPhase = 'none' | 'falling' | 'bathing';
type ScreenPosition = { x: number; y: number };
type SpacePoliceEnvelopePointer = {
  pointerId: number;
  startX: number;
  startY: number;
  holdTimer: number;
  dragging: boolean;
  movedBeforeHold: boolean;
};
type BathBallPointer = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

export function PetStage({ pet, thinking = false, motion = 'idle', nightMode = false, debugClicks = false, showInteractionBubble = false, interactionBubbleText, developerPose = null, developerEvent = null, onChatModeChange, onCapturedHomecomingInteraction, spacePoliceLetter, spacePoliceLetters, spacePoliceMailCount = 0, spacePoliceUnreadCount = 0, onOpenSpacePoliceLetter, onFileSpacePoliceLetter, onEatSpacePoliceLetter, onPlaceSpacePolicePoop, onPackSpacePolicePoop, onMoveSpacePolicePoopBag, onDisposeSpacePolicePoopBag, onFinishSpacePolicePoopDisposal, onOpenSpacePoliceMailbox }: {
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
  onCapturedHomecomingInteraction?: () => void;
  spacePoliceLetter?: { deliveredAt: number; openedAt?: number; filedAt?: number; eatenAt?: number; eatAfterAt?: number; poop?: SpacePoliceLetter['poop'] };
  spacePoliceLetters?: SpacePoliceLetter[];
  spacePoliceMailCount?: number;
  spacePoliceUnreadCount?: number;
  onOpenSpacePoliceLetter?: () => void;
  onFileSpacePoliceLetter?: (deliveredAt: number) => void;
  onEatSpacePoliceLetter?: (deliveredAt: number) => void;
  onPlaceSpacePolicePoop?: (deliveredAt: number, x: number, y: number) => void;
  onPackSpacePolicePoop?: (deliveredAt: number) => void;
  onMoveSpacePolicePoopBag?: (deliveredAt: number, x: number, y: number) => void;
  onDisposeSpacePolicePoopBag?: (deliveredAt: number, x: number, y: number) => void;
  onFinishSpacePolicePoopDisposal?: (deliveredAt: number) => void;
  onOpenSpacePoliceMailbox?: () => void;
}) {
  const hidden = pet.stage === 'fallen' || pet.stage === 'away';
  const seconds = Math.min(5, Math.max(2, pet.duration > 100 ? pet.duration / 1000 : pet.duration || 2));
  const requestedAction = pet.stage === 'performing' ? pet.action : 'idle';
  const action: PerformanceAction | 'idle' =
    ['roll', 'tumble'].includes(requestedAction) ? 'idle' : requestedAction;
  const capturedHomecoming = pet.stage === 'performing' && action === 'captured-homecoming';
  const basePoseClass = developerPose ? developerPose === 'sleeping' ? 'sleep' : 'idle' : motion;
  const [interactionState, setInteractionState] = useState<'roaming' | 'chat'>('roaming');
  const [reacting, setReacting] = useState(false);
  const [hoverCuddleActive, setHoverCuddleActive] = useState(false);
  const [roomWalking, setRoomWalking] = useState(false);
  const [activityState, setActivityState] = useState<RoomActivityState>('roaming');
  const [sleepingOnBed, setSleepingOnBed] = useState(false);
  const [hangingOnRack, setHangingOnRack] = useState(false);
  const [dirtyGrabLiftComplete, setDirtyGrabLiftComplete] = useState(false);
  const [activityTransition, setActivityTransition] = useState<'settling' | 'entering' | 'waking' | 'frames-entering' | 'frames-waking' | null>(null);
  const [pixelTransitionDirection, setPixelTransitionDirection] = useState<'entering' | 'waking' | null>(null);
  const [transitionFrameSrc, setTransitionFrameSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressPending, setIsPressPending] = useState(false);
  const [bathPhase, setBathPhase] = useState<BathPhase>('none');
  const [dampAfterBath, setDampAfterBath] = useState(false);
  const [dampDryingReady, setDampDryingReady] = useState(false);
  const [dampDrySecondsRemaining, setDampDrySecondsRemaining] = useState(DAMP_RACK_DRY_MS / 1000);
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
  const worldFallPhaseRef = useRef(worldFallPhase);
  worldFallPhaseRef.current = worldFallPhase;
  const [worldFallMessageVisible, setWorldFallMessageVisible] = useState(false);
  const [spaceBlackHolePosition, setSpaceBlackHolePosition] = useState<RoomWastePoint>({ x: 17, y: 36 });
  const [packingPoopDeliveredAt, setPackingPoopDeliveredAt] = useState<number | null>(null);
  const [draggingPoopDeliveredAt, setDraggingPoopDeliveredAt] = useState<number | null>(null);
  const [poopDragPosition, setPoopDragPosition] = useState<RoomWastePoint | null>(null);
  const [capturedHomecomingArrived, setCapturedHomecomingArrived] = useState(false);
  const [spacePoliceEnvelopePosition, setSpacePoliceEnvelopePosition] = useState<{ x: number; y: number } | null>(null);
  const [spacePoliceEnvelopeDragging, setSpacePoliceEnvelopeDragging] = useState(false);
  const [spacePoliceEnvelopeStoring, setSpacePoliceEnvelopeStoring] = useState(false);
  const [spacePoliceLetterReminderVisible, setSpacePoliceLetterReminderVisible] = useState(false);
  const [roomFurnitureLayout, setRoomFurnitureLayout] = useState<RoomFurnitureLayout>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    try {
      return readRoomFurnitureLayout(window.localStorage);
    } catch { return {}; }
  });
  const roomFurnitureLayoutRef = useRef(roomFurnitureLayout);
  roomFurnitureLayoutRef.current = roomFurnitureLayout;
  const [draggingFurnitureId, setDraggingFurnitureId] = useState<RoomFurnitureId | null>(null);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1 : window.innerWidth,
    height: typeof window === 'undefined' ? 1 : window.innerHeight,
  }));
  const [placedProps, setPlacedProps] = useState<Record<RoomProp, boolean>>(() => {
    const defaults = { bed: true, rack: true, tub: true };
    try {
      const raw = window.localStorage.getItem(ROOM_PROPS_KEY);
      return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Record<RoomProp, boolean>>) } : defaults;
    } catch { return defaults; }
  });
  const [equippedToy, setEquippedToy] = useState<RoomToy | null>(null);
  const equippedToyRef = useRef<RoomToy | null>(null);
  equippedToyRef.current = equippedToy;
  const [toyPointer, setToyPointer] = useState<{ x: number; y: number } | null>(null);
  const toyPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [toyPose, setToyPose] = useState<'swat' | 'pounce' | null>(null);
  const capturedHomecomingArrivedRef = useRef(false);
  const capturedHomecomingTokenRef = useRef<number | null>(null);
  const positionedSpacePoliceLetterRef = useRef<number | null>(null);
  const [dirtyPleaText, setDirtyPleaText] = useState<string | null>(null);
  const [flyChaseActive, setFlyChaseActive] = useState(false);
  const [flyChaseSide, setFlyChaseSide] = useState<'left' | 'right'>('left');
  const worldAway = showInteractionBubble && worldFallPhase === 'away';
  const dirtyReturn = showInteractionBubble && (worldFallPhase === 'returning' || worldFallPhase === 'dirty');
  const dirtyGrab = dirtyReturn && (isDragging || developerGrab || hangingOnRack);
  const roomWasteLetters = useMemo(() => spacePoliceLetters ?? (spacePoliceLetter?.poop
    ? [{ id: `legacy-space-police-${spacePoliceLetter.deliveredAt}`, ...spacePoliceLetter }]
    : []), [spacePoliceLetter, spacePoliceLetters]);
  const activeWasteLetters = useMemo(
    () => roomWasteLetters.filter(letter => letter.poop && letter.poop.phase !== 'disposed'),
    [roomWasteLetters],
  );
  const visibleWasteLetters = useMemo(
    () => activeWasteLetters.filter(letter => ['fresh', 'bagged', 'disposing'].includes(letter.poop!.phase)),
    [activeWasteLetters],
  );
  const spaceBlackHoleVisible = showInteractionBubble
    && (activeWasteLetters.length > 0 || developerEvent?.event === 'world-fall');
  const isFlyChasing = flyChaseActive && bathPhase === 'none' && interactionState === 'roaming'
    && activityState === 'roaming' && !isDragging && !hangingOnRack && !hidden;
  const [nightWakeOverride, setNightWakeOverride] = useState(false);
  const [debugEntries, setDebugEntries] = useState<string[]>([]);
  const previousDeveloperPoseRef = useRef<DeveloperPose | null>(null);
  const previousPetStageRef = useRef({
    stage: pet.stage,
    token: pet.token,
    action: pet.action,
    actionPreview: pet.actionPreview,
  });
  const interactionStateRef = useRef<'roaming' | 'chat'>('roaming');
  const activityStateRef = useRef(activityState);
  activityStateRef.current = activityState;
  const hangingOnRackRef = useRef(hangingOnRack);
  hangingOnRackRef.current = hangingOnRack;
  const developerPoseRef = useRef(developerPose);
  developerPoseRef.current = developerPose;
  const bathPhaseRef = useRef<BathPhase>('none');
  const dampAfterBathRef = useRef(dampAfterBath);
  const dampDryingReadyRef = useRef(dampDryingReady);
  dampAfterBathRef.current = dampAfterBath;
  dampDryingReadyRef.current = dampDryingReady;
  const bathBallDragRef = useRef<BathBallPointer | null>(null);
  const bathBallOriginRef = useRef<ScreenPosition | null>(null);
  const bathDropTimerRef = useRef(0);
  const developerEventTimerRef = useRef(0);
  const dirtyFlyTimerRef = useRef(0);
  const dirtyFlyEndTimerRef = useRef(0);
  const dirtyPleaTimerRef = useRef(0);
  const dirtyPleaHideTimerRef = useRef(0);
  const bathBallDropTimerRef = useRef(0);
  const bathRubMsRef = useRef(0);
  const bathTubRef = useRef<HTMLImageElement>(null);
  const bathStationRef = useRef<HTMLDivElement>(null);
  const bedRef = useRef<HTMLImageElement>(null);
  const clothesRackRef = useRef<HTMLImageElement>(null);
  const spacePoliceMailboxRef = useRef<HTMLButtonElement>(null);
  const spaceBlackHoleRef = useRef<HTMLDivElement>(null);
  const bathBallButtonRef = useRef<HTMLButtonElement>(null);
  const pandaButtonRef = useRef<HTMLButtonElement>(null);
  const firstActivationAtRef = useRef<number | null>(null);
  const clickExpiryTimerRef = useRef(0);
  const reactionTimerRef = useRef(0);
  const chatIdleTimerRef = useRef(0);
  const dragPointerRef = useRef<PandaDragPointer | null>(null);
  const spacePoliceEnvelopePointerRef = useRef<SpacePoliceEnvelopePointer | null>(null);
  const suppressSpacePoliceEnvelopeClickRef = useRef(false);
  const spacePoliceEnvelopeStoreTimerRef = useRef(0);
  const poopPackStartTimerRef = useRef(0);
  const poopPackFinishTimerRef = useRef(0);
  const packingPoopRef = useRef<number | null>(null);
  const roomWastePointerRef = useRef<RoomWastePointer | null>(null);
  const furniturePointerRef = useRef<FurniturePointer | null>(null);
  const suppressFurnitureClickRef = useRef<RoomFurnitureId | null>(null);
  const draggingRef = useRef(false);
  const suppressClickAfterDragRef = useRef(false);
  const wakeClickIgnoreUntilRef = useRef(0);
  const startledRef = useRef(false);
  const startleTimerRef = useRef(0);
  const lastWorldFallAtRef = useRef(Number.NEGATIVE_INFINITY);
  const spaceBlackHoleTouchingRef = useRef(false);
  const activityTransitionTimerRef = useRef(0);
  const activityTransitionCancelRef = useRef<(() => void) | null>(null);
  const activityTransitionFinishRef = useRef<(() => void) | null>(null);
  const bambooDropTimerRef = useRef(0);
  const hoverCuddleTimerRef = useRef(0);
  const lastHoverCuddleAtRef = useRef(Number.NEGATIVE_INFINITY);
  const currentImageRef = useRef('');
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const facingRef = useRef<'left' | 'right'>('right');
  const trackRef = useRef<HTMLDivElement>(null);
  const bubbleAnchorRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<RoomPoint>({ u: 0.5, v: 0.58 });
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);

  const updateRoomFurniturePoint = useCallback((id: RoomFurnitureId, point: RoomFurniturePoint) => {
    const next = { ...roomFurnitureLayoutRef.current, [id]: point };
    roomFurnitureLayoutRef.current = next;
    setRoomFurnitureLayout(next);
  }, []);

  const persistRoomFurnitureLayout = useCallback((layout: RoomFurnitureLayout) => {
    try {
      writeRoomFurnitureLayout(window.localStorage, layout);
    } catch (error) { console.error('Could not save the room furniture layout.', error); }
  }, []);

  const mailboxPlacement = useMemo(() => {
    const width = 54;
    const height = 52;
    const scale = Math.min(viewportSize.width / ROOM_IMAGE_WIDTH, viewportSize.height / ROOM_IMAGE_HEIGHT);
    const roomWidth = ROOM_IMAGE_WIDTH * scale;
    const roomHeight = ROOM_IMAGE_HEIGHT * scale;
    const left = (viewportSize.width - roomWidth) / 2;
    const top = (viewportSize.height - roomHeight) / 2;
    const below = viewportSize.height - (top + roomHeight);
    let x = 6;
    let y = viewportSize.height - height - 6;
    if (left >= width + 8) {
      x = left / 2 - width / 2;
      y = top + roomHeight * 0.8;
    } else if (below >= height + 120) {
      x = 10;
      y = top + roomHeight + 10;
    }
    return { left: x, top: y, bottom: 'auto', width, height } as const;
  }, [viewportSize]);

  const roomFurnitureStyle = useCallback((
    id: RoomFurnitureId,
    elementRef: { current: HTMLElement | null },
  ) => {
    const point = roomFurnitureLayout[id];
    if (!point) return undefined;
    const rect = elementRef.current?.getBoundingClientRect();
    const safePoint = clampRoomFurnitureCenter(
      point.x * viewportSize.width,
      point.y * viewportSize.height,
      rect?.width ?? 1,
      rect?.height ?? 1,
      viewportSize.width,
      viewportSize.height,
    );
    return {
      left: `${safePoint.x * 100}%`,
      top: `${safePoint.y * 100}%`,
      right: 'auto',
      bottom: 'auto',
      transform: 'translate(-50%, -50%)',
    };
  }, [roomFurnitureLayout, viewportSize]);

  const beginFurnitureMove = useCallback((id: RoomFurnitureId, event: ReactPointerEvent<Element>) => {
    if (!showInteractionBubble || !event.isPrimary || event.button !== 0) return;
    event.stopPropagation();
    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    const press: FurniturePointer = {
      id,
      pointerId: event.pointerId,
      element,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      holdTimer: 0,
      active: false,
      moved: false,
    };
    const previous = furniturePointerRef.current;
    if (previous?.holdTimer) window.clearTimeout(previous.holdTimer);
    furniturePointerRef.current = press;
    press.holdTimer = window.setTimeout(() => {
      if (furniturePointerRef.current !== press) return;
      press.active = true;
      suppressFurnitureClickRef.current = id;
      setDraggingFurnitureId(id);
      try {
        element.setPointerCapture(press.pointerId);
      } catch {
        // Pointer capture can fail if the pointer was released while the hold timer was settling.
      }
    }, 520);
  }, [showInteractionBubble]);

  const moveFurniture = useCallback((event: ReactPointerEvent<Element>) => {
    const press = furniturePointerRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (!press.active) {
      if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > 10) {
        window.clearTimeout(press.holdTimer);
        furniturePointerRef.current = null;
      }
      return;
    }
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) <= 4) return;
    const rect = press.element.getBoundingClientRect();
    const left = event.clientX - press.offsetX;
    const top = event.clientY - press.offsetY;
    const point = clampRoomFurnitureCenter(
      left + rect.width / 2,
      top + rect.height / 2,
      rect.width,
      rect.height,
      viewportSize.width,
      viewportSize.height,
    );
    press.moved = true;
    updateRoomFurniturePoint(press.id, point);
  }, [updateRoomFurniturePoint, viewportSize]);

  const finishFurnitureMove = useCallback((event: ReactPointerEvent<Element>) => {
    const press = furniturePointerRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    event.stopPropagation();
    window.clearTimeout(press.holdTimer);
    furniturePointerRef.current = null;
    if (!press.active) return;
    setDraggingFurnitureId(null);
    if (press.moved) persistRoomFurnitureLayout(roomFurnitureLayoutRef.current);
    window.setTimeout(() => {
      if (suppressFurnitureClickRef.current === press.id) suppressFurnitureClickRef.current = null;
    }, 0);
    try {
      if (press.element.hasPointerCapture(press.pointerId)) press.element.releasePointerCapture(press.pointerId);
    } catch {
      // The browser may already have released capture after pointerup or pointercancel.
    }
  }, [persistRoomFurnitureLayout]);

  const suppressFurnitureClick = useCallback((id: RoomFurnitureId, event: ReactMouseEvent<Element>) => {
    if (suppressFurnitureClickRef.current !== id) return;
    event.preventDefault();
    event.stopPropagation();
    suppressFurnitureClickRef.current = null;
  }, []);

  useEffect(() => {
    const resize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => () => {
    const press = furniturePointerRef.current;
    if (press?.holdTimer) window.clearTimeout(press.holdTimer);
  }, []);

  const setBathPhaseNow = useCallback((next: BathPhase) => {
    bathPhaseRef.current = next;
    setBathPhase(next);
  }, []);
  const setDampAfterBathNow = useCallback((next: boolean) => {
    dampAfterBathRef.current = next;
    dampDryingReadyRef.current = false;
    setDampAfterBath(next);
    setDampDryingReady(false);
    setDampDrySecondsRemaining(DAMP_RACK_DRY_MS / 1000);
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
  const hoverCuddleVisible = showInteractionBubble && !equippedToy && hoverCuddleActive && pet.stage === 'present'
    && interactionState !== 'chat' && !isSleeping && !isDragging && !isPressPending && !developerGrab
    && !hangingOnRack && !dampAfterBath && bathPhase === 'none' && !startled && dizzyPhase === 'none'
    && worldFallPhase === 'none' && !dirtyReturn && !developerPose;
  const isCuddling = (pet.stage === 'performing' && action === 'cuddle') || hoverCuddleVisible;
  const sprite = hoverCuddleVisible
    ? 'cuddle-wriggle'
    : dirtyGrab
    ? dirtyGrabLiftComplete ? 'dirty-grab' : 'dirty-grab-lift'
    : showInteractionBubble && dizzyPhase !== 'none'
    ? 'dizzy'
    : showInteractionBubble && (isDragging || developerGrab || hangingOnRack)
    ? 'grab'
    : startled && showInteractionBubble
    ? animationManifest.motionSprites.idle
    : showInteractionBubble && toyPose && pet.stage === 'present' && activityState === 'roaming'
    ? (equippedToy === 'teaser' ? 'toy-teaser' : 'toy-laser')
    : pet.stage === 'performing' && action === 'captured-homecoming'
    ? animationManifest.actionSprites[action]
    : pet.stage === 'performing' && (interactionState !== 'chat' || pet.actionPreview)
    ? animationManifest.actionSprites[action]
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
    activityTransitionCancelRef.current?.();
    activityTransitionCancelRef.current = null;
    activityTransitionFinishRef.current = null;
    setTransitionFrameSrc(null);
  }, []);

  const playTransitionFrames = useCallback((frames: string[], direction: 'entering' | 'waking', onComplete: () => void) => {
    clearTransitionFrames();
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      const cancel = activityTransitionCancelRef.current;
      activityTransitionCancelRef.current = null;
      activityTransitionFinishRef.current = null;
      cancel?.();
      setTransitionFrameSrc(null);
      setActivityTransition(null);
      onComplete();
    };
    activityTransitionFinishRef.current = finish;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    activityTransitionCancelRef.current = playPixelTransitionFrames(
      frames,
      direction,
      { setTimeout: (callback, delay) => window.setTimeout(callback, delay), clearTimeout: timer => window.clearTimeout(timer) },
      {
        onFrame: setTransitionFrameSrc,
        onPhase: (phase: PixelTransitionPhase) => setActivityTransition(phase),
        onComplete: finish,
      },
      PIXEL_TRANSITION_FRAME_MS,
    );
  }, [clearTransitionFrames]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finishTransitionIfNeeded = (event: MediaQueryListEvent) => {
      if (event.matches) activityTransitionFinishRef.current?.();
    };
    preference.addEventListener('change', finishTransitionIfNeeded);
    return () => preference.removeEventListener('change', finishTransitionIfNeeded);
  }, []);

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
  useEffect(() => () => window.clearTimeout(hoverCuddleTimerRef.current), []);
  useEffect(() => () => {
    const envelopeDrag = spacePoliceEnvelopePointerRef.current;
    if (envelopeDrag?.holdTimer) window.clearTimeout(envelopeDrag.holdTimer);
    window.clearTimeout(spacePoliceEnvelopeStoreTimerRef.current);
  }, []);

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

    if ((interactionStateRef.current !== 'chat' || pet.action === 'captured-homecoming' || pet.actionPreview) && startedPerformance) {
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
    } else if ((interactionStateRef.current !== 'chat' || previous.actionPreview) && finishedPerformance) {
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

    previousPetStageRef.current = {
      stage: pet.stage,
      token: pet.token,
      action: pet.action,
      actionPreview: pet.actionPreview,
    };
  }, [clearActivityTransition, pet.action, pet.actionPreview, pet.stage, pet.token, playPixelTransition, playTransitionFrames, startBambooFeeding]);

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
    activityTransitionCancelRef.current?.();
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
      ? projectRoomPoint(point, window.innerWidth, window.innerHeight)
      : projectDesktopPoint(point);
    track.style.setProperty('--room-x', `${projected.x}%`);
    track.style.setProperty('--room-y', `${projected.y}%`);
    track.style.setProperty('--room-scale', projected.scale.toFixed(3));
    const bubbleAnchor = bubbleAnchorRef.current;
    if (bubbleAnchor) {
      bubbleAnchor.style.setProperty('--room-x', `${projected.x}%`);
      bubbleAnchor.style.setProperty('--room-y', `${projected.y}%`);
      bubbleAnchor.style.setProperty('--room-scale', projected.scale.toFixed(3));
    }
    // Room characters stay in front of movable furniture and fixed cut-outs.
    track.style.zIndex = showInteractionBubble ? '240' : String(projected.zIndex);
    track.dataset.roomU = point.u.toFixed(3);
    track.dataset.roomV = point.v.toFixed(3);
    track.dataset.roomScale = projected.scale.toFixed(3);
    if (showInteractionBubble) {
      track.dataset.roomWalkable = String(isWalkableRoomPoint(point));
      track.style.setProperty('--room-shadow-scale', projected.shadowScale.toFixed(3));
      track.style.setProperty('--room-shadow-opacity', projected.shadowOpacity.toFixed(3));
      track.style.setProperty('--room-shadow-blur', `${projected.shadowBlur.toFixed(2)}px`);
      track.style.setProperty('--room-brightness', projected.brightness.toFixed(3));
      track.dataset.roomDepth = projected.depth.toFixed(3);
      track.dataset.roomZ = String(projected.zIndex);
    } else delete track.dataset.roomWalkable;
  }, [showInteractionBubble]);

  useLayoutEffect(() => {
    if (!capturedHomecoming) {
      if (capturedHomecomingArrivedRef.current) {
        capturedHomecomingArrivedRef.current = false;
        setCapturedHomecomingArrived(false);
      }
      capturedHomecomingTokenRef.current = null;
      return;
    }
    if (capturedHomecomingTokenRef.current === pet.token) return;
    capturedHomecomingTokenRef.current = pet.token;
    capturedHomecomingArrivedRef.current = false;
    setCapturedHomecomingArrived(false);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      capturedHomecomingArrivedRef.current = true;
      setCapturedHomecomingArrived(true);
    }
  }, [capturedHomecoming, pet.token]);

  const finishCapturedHomecomingPath = useCallback(() => {
    if (!capturedHomecoming || capturedHomecomingArrivedRef.current) return;
    capturedHomecomingArrivedRef.current = true;
    setCapturedHomecomingArrived(true);
  }, [capturedHomecoming]);

  useLayoutEffect(() => {
    if (!showInteractionBubble || !spacePoliceLetter) {
      positionedSpacePoliceLetterRef.current = null;
      setSpacePoliceEnvelopePosition(null);
      return;
    }
    if (spacePoliceLetter.filedAt !== undefined || spacePoliceLetter.eatenAt !== undefined) {
      positionedSpacePoliceLetterRef.current = spacePoliceLetter.deliveredAt;
      setSpacePoliceEnvelopePosition(null);
      return;
    }
    if (positionedSpacePoliceLetterRef.current === spacePoliceLetter.deliveredAt) return;
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const x = Math.max(16, Math.min(width - 16, bounds.left + bounds.width / 2)) / width;
    const y = Math.max(18, Math.min(height - 18, bounds.bottom - 13)) / height;
    positionedSpacePoliceLetterRef.current = spacePoliceLetter.deliveredAt;
    setSpacePoliceEnvelopePosition({ x, y });
  }, [pet.stage, pet.token, showInteractionBubble, spacePoliceLetter?.deliveredAt, spacePoliceLetter?.filedAt, spacePoliceLetter?.eatenAt]);

  useEffect(() => {
    if (!showInteractionBubble || !spacePoliceLetter || spacePoliceLetter.filedAt !== undefined
      || spacePoliceLetter.eatenAt !== undefined || spacePoliceEnvelopeStoring || !onEatSpacePoliceLetter) return undefined;
    const { deliveredAt } = spacePoliceLetter;
    const delay = (spacePoliceLetter.eatAfterAt ?? deliveredAt + SPACE_POLICE_LETTER_EAT_DELAY_MS) - Date.now();
    if (delay <= 0) {
      onEatSpacePoliceLetter(deliveredAt);
      return undefined;
    }
    const timer = window.setTimeout(() => onEatSpacePoliceLetter(deliveredAt), delay);
    return () => window.clearTimeout(timer);
  }, [showInteractionBubble, spacePoliceLetter?.deliveredAt, spacePoliceLetter?.filedAt, spacePoliceLetter?.eatenAt, spacePoliceLetter?.eatAfterAt,
    spacePoliceEnvelopeStoring, onEatSpacePoliceLetter]);

  useEffect(() => {
    if (!showInteractionBubble || !spacePoliceLetter || spacePoliceLetter.openedAt !== undefined
      || spacePoliceLetter.filedAt !== undefined || spacePoliceLetter.eatenAt !== undefined) {
      setSpacePoliceLetterReminderVisible(false);
      return undefined;
    }
    const delay = spacePoliceLetter.deliveredAt + SPACE_POLICE_LETTER_REMINDER_MS - Date.now();
    if (delay <= 0) {
      setSpacePoliceLetterReminderVisible(true);
      return undefined;
    }
    setSpacePoliceLetterReminderVisible(false);
    const reminder = window.setTimeout(() => setSpacePoliceLetterReminderVisible(true), delay);
    return () => window.clearTimeout(reminder);
  }, [showInteractionBubble, spacePoliceLetter?.deliveredAt, spacePoliceLetter?.openedAt]);

  useLayoutEffect(() => {
    if (!showInteractionBubble || !hangingOnRack) return undefined;
    const alignToRack = () => {
      const rackRect = clothesRackRef.current?.getBoundingClientRect();
      const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
      if (!rackRect || !pandaRect) return;
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const rodY = rackRect.top + rackRect.height * 0.27;
      const target = unprojectRoomPoint(
        ((rackRect.left + rackRect.width * 0.2) / width) * 100,
        ((rodY + pandaRect.height) / height) * 100,
        width,
        height,
      );
      applyRoomPoint(target);
    };
    alignToRack();
    window.addEventListener('resize', alignToRack);
    return () => {
      window.removeEventListener('resize', alignToRack);
    };
  }, [applyRoomPoint, draggingFurnitureId, hangingOnRack, roomFurnitureLayout, showInteractionBubble, viewportSize]);

  const startBathDropToTub = useCallback(() => {
    const tubRect = bathTubRef.current?.getBoundingClientRect();
    if (!showInteractionBubble || !tubRect || bathPhaseRef.current !== 'none') return false;
    const track = trackRef.current;
    const previous = positionRef.current;
    if (track) {
      track.style.setProperty('--bath-start-x', track.style.getPropertyValue('--room-x') || '50%');
      track.style.setProperty('--bath-start-y', track.style.getPropertyValue('--room-y') || '58%');
    }
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const target = unprojectRoomPoint(
      ((tubRect.left + tubRect.width / 2) / width) * 100,
      ((tubRect.top + tubRect.height * 0.86) / height) * 100,
      width,
      height,
    );
    updateFacing(target.u - previous.u);
    applyRoomPoint(target);
    setDampAfterBathNow(false);
    window.clearTimeout(bathDropTimerRef.current);
    setBathPhaseNow('falling');
    bathDropTimerRef.current = window.setTimeout(() => {
      bathDropTimerRef.current = 0;
      if (bathPhaseRef.current === 'falling') setBathPhaseNow('bathing');
    }, BATH_DROP_MS);
    return true;
  }, [applyRoomPoint, setBathPhaseNow, setDampAfterBathNow, showInteractionBubble, updateFacing]);

  useEffect(() => {
    if (!showInteractionBubble || !dampAfterBath || !hangingOnRack) {
      dampDryingReadyRef.current = false;
      setDampDryingReady(false);
      setDampDrySecondsRemaining(DAMP_RACK_DRY_MS / 1000);
      return undefined;
    }

    const driesAt = Date.now() + DAMP_RACK_DRY_MS;
    dampDryingReadyRef.current = false;
    setDampDryingReady(false);
    setDampDrySecondsRemaining(DAMP_RACK_DRY_MS / 1000);
    const countdown = window.setInterval(() => {
      setDampDrySecondsRemaining(Math.max(0, Math.ceil((driesAt - Date.now()) / 1000)));
    }, 150);
    const dryTimer = window.setTimeout(() => {
      dampDryingReadyRef.current = true;
      setDampDryingReady(true);
      setDampDrySecondsRemaining(0);
      window.clearInterval(countdown);
    }, DAMP_RACK_DRY_MS);
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(dryTimer);
    };
  }, [dampAfterBath, hangingOnRack, showInteractionBubble]);

  const startDeveloperBathRub = useCallback(() => {
    if (bathPhaseRef.current !== 'bathing') return false;
    const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
    if (!pandaRect) return false;
    const position = {
      x: pandaRect.left + pandaRect.width * 0.62 - 20,
      y: pandaRect.top + pandaRect.height * 0.08,
    };
    bathRubMsRef.current = 0;
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
      case 'dirty-grab': {
        const restoreWorldFallPhase = worldFallPhaseRef.current;
        setWorldFallPhase('dirty');
        setDeveloperGrab(true);
        developerEventTimerRef.current = window.setTimeout(() => {
          developerEventTimerRef.current = 0;
          setDeveloperGrab(false);
          setWorldFallPhase(restoreWorldFallPhase);
        }, 2500);
        break;
      }
      case 'dizzy-drop':
        setFrame(0);
        setDizzyPhase('falling');
        break;
      case 'world-fall':
        {
          const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
          if (pandaRect) {
            setSpaceBlackHolePosition({
              x: ((pandaRect.left + pandaRect.width / 2) / Math.max(1, window.innerWidth)) * 100,
              y: ((pandaRect.top + pandaRect.height / 2) / Math.max(1, window.innerHeight)) * 100,
            });
          }
        }
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
      case 'toy-teaser':
      case 'toy-laser': {
        const toy = developerEvent.event === 'toy-teaser' ? 'teaser' : 'laser';
        const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
        setEquippedToy(toy);
        if (pandaRect) {
          const pointer = {
            x: Math.min(window.innerWidth - 24, pandaRect.right + 40),
            y: pandaRect.top + pandaRect.height / 2,
          };
          toyPointerRef.current = pointer;
          setToyPointer(pointer);
        }
        developerEventTimerRef.current = window.setTimeout(() => {
          developerEventTimerRef.current = 0;
          setEquippedToy(null);
          toyPointerRef.current = null;
          setToyPointer(null);
          setToyPose(null);
        }, 3200);
        break;
      }
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
          && !hangingOnRackRef.current
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
          && !hangingOnRackRef.current
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
      bathRubMsRef.current = 0;
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
      bathRubMsRef.current = 0;
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
    const autoBall = window.setTimeout(() => {
      if (bathPhaseRef.current !== 'bathing' || !startDeveloperBathRub()) return;
      setBathBallDropping(true);
      bathBallDropTimerRef.current = window.setTimeout(() => {
        bathBallDropTimerRef.current = 0;
        setBathBallDropping(false);
      }, BATH_BALL_DROP_MS);
    }, 700);
    return () => window.clearTimeout(autoBall);
  }, [bathPhase, setBathPhaseNow, showInteractionBubble, startDeveloperBathRub]);

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
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    applyRoomPoint(unprojectRoomPoint(
      ((sceneRect.left + sceneRect.width / 2) / width) * 100,
      ((sceneRect.top + sceneRect.height * 0.64) / height) * 100,
      width,
      height,
    ));
  }, [applyRoomPoint, bathPhase, showInteractionBubble]);

  const beginWorldFallFromBlackHole = useCallback(() => {
    const now = performance.now();
    if (!showInteractionBubble || dampAfterBath || worldFallPhaseRef.current !== 'none'
      || interactionStateRef.current !== 'roaming' || activityStateRef.current !== 'roaming'
      || bathPhaseRef.current !== 'none' || hangingOnRackRef.current || draggingRef.current || hidden
      || now - lastWorldFallAtRef.current < WORLD_FALL_COOLDOWN_MS) return false;
    lastWorldFallAtRef.current = now;
    setRoomWalking(false);
    setWorldFallMessageVisible(true);
    setWorldFallPhase('falling');
    return true;
  }, [dampAfterBath, hidden, showInteractionBubble]);

  useEffect(() => {
    if (!spaceBlackHoleVisible) {
      spaceBlackHoleTouchingRef.current = false;
      return undefined;
    }
    const movement = window.setInterval(() => {
      setSpaceBlackHolePosition({
        x: 13 + Math.random() * 74,
        y: 22 + Math.random() * 56,
      });
    }, 8300);
    return () => window.clearInterval(movement);
  }, [spaceBlackHoleVisible]);

  useEffect(() => {
    if (!spaceBlackHoleVisible) {
      spaceBlackHoleTouchingRef.current = false;
      return undefined;
    }
    const checkCollision = window.setInterval(() => {
      if (worldFallPhaseRef.current !== 'none') return;
      const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
      const holeRect = spaceBlackHoleRef.current?.getBoundingClientRect();
      if (!pandaRect || !holeRect) return;
      const touching = pandaRect.left < holeRect.right && pandaRect.right > holeRect.left
        && pandaRect.top < holeRect.bottom && pandaRect.bottom > holeRect.top;
      if (!touching) {
        spaceBlackHoleTouchingRef.current = false;
        return;
      }
      if (spaceBlackHoleTouchingRef.current) return;
      spaceBlackHoleTouchingRef.current = true;
      beginWorldFallFromBlackHole();
    }, 100);
    return () => window.clearInterval(checkCollision);
  }, [beginWorldFallFromBlackHole, spaceBlackHoleVisible]);

  useEffect(() => {
    if (!showInteractionBubble || !roomWalking || !onPlaceSpacePolicePoop) return undefined;
    const pending = activeWasteLetters.find(letter => letter.poop?.phase === 'pending');
    if (!pending) return undefined;
    const timer = window.setTimeout(() => {
      const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
      if (!pandaRect) return;
      onPlaceSpacePolicePoop(
        pending.deliveredAt,
        (pandaRect.left + pandaRect.width / 2) / Math.max(1, window.innerWidth),
        (pandaRect.bottom - 4) / Math.max(1, window.innerHeight),
      );
    }, 900);
    return () => window.clearTimeout(timer);
  }, [activeWasteLetters, onPlaceSpacePolicePoop, roomWalking, showInteractionBubble]);

  useEffect(() => {
    const timers = activeWasteLetters
      .filter(letter => letter.poop?.phase === 'disposing')
      .map(letter => window.setTimeout(() => onFinishSpacePolicePoopDisposal?.(letter.deliveredAt), ROOM_WASTE_DISPOSE_MS));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [activeWasteLetters, onFinishSpacePolicePoopDisposal]);

  const maybeEnterRest = useCallback((point: RoomPoint) => {
    if (!showInteractionBubble || dampAfterBath) return false;
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
  }, [clearActivityTransition, dampAfterBath, playPixelTransition, showInteractionBubble]);

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
    if (sprite === 'dirty-grab-lift' && motionPreference.matches) {
      setDirtyGrabLiftComplete(true);
      setFrame(0);
      return;
    }
    let next = motionPreference.matches ? reducedMotionFrame : 0;
    setFrame(next);
    if (sprite === 'grab' || sprite === 'dirty-grab') return;
    const frameCount = animationManifest.frameCountBySprite[sprite as keyof typeof animationManifest.frameCountBySprite]
      ?? animationManifest.frameCount;
    const frameIntervalMs = animationManifest.frameIntervalMs[sprite as keyof typeof animationManifest.frameIntervalMs];
    let timer = 0;
    const isDirtyPickupTransition = sprite === 'dirty-grab-lift';
    const isCapturedHomecoming = sprite === 'captured-homecoming';
    const isTransitioningFrames = activityTransition === 'frames-entering' || activityTransition === 'frames-waking';
    const waitingForSnack = pet.stage === 'performing' && pet.action === 'bamboo' && bambooPhase !== 'eating';
    const start = () => {
      if (hidden || (interactionState === 'chat' && !isCapturedHomecoming && !pet.actionPreview) || document.visibilityState === 'hidden' || motionPreference.matches || timer
        || waitingForSnack
        || (showInteractionBubble && (activityState === 'lying' || isTransitioningFrames) && !isDirtyPickupTransition)) return;
      timer = window.setInterval(() => {
        const isBambooEating = sprite === 'chew' && pet.stage === 'performing'
          && pet.action === 'bamboo' && bambooPhase === 'eating';
        const isDizzyFalling = sprite === 'dizzy' && dizzyPhase === 'falling';
        next = isBambooEating || isDizzyFalling || isDirtyPickupTransition
          ? Math.min(next + 1, frameCount)
          : (next + 1) % (frameCount + 1);
        setFrame(next);
        if (isDirtyPickupTransition && next >= frameCount) {
          setDirtyGrabLiftComplete(true);
          window.clearInterval(timer);
          timer = 0;
        } else if ((isBambooEating || isDizzyFalling) && next >= frameCount) {
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
      if (isDirtyPickupTransition) setDirtyGrabLiftComplete(true);
    };
    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (event.matches && isCapturedHomecoming) finishCapturedHomecomingPath();
      if (event.matches) stop();
      else start();
    };
    const onVisibilityChange = () => document.visibilityState === 'hidden' ? stop() : start();
    start();
    motionPreference.addEventListener('change', onMotionPreferenceChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      if (timer) window.clearInterval(timer);
      motionPreference.removeEventListener('change', onMotionPreferenceChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [activityState, activityTransition, bambooPhase, dirtyGrab, dizzyPhase, finishCapturedHomecomingPath, hidden, interactionState, motion, pet.action, pet.actionPreview, pet.stage, pet.token, setFrame, setDirtyGrabLiftComplete, showInteractionBubble, sprite]);

  useEffect(() => {
    if (dirtyGrab) return;
    setDirtyGrabLiftComplete(false);
  }, [dirtyGrab]);

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
    if (capturedHomecoming) onCapturedHomecomingInteraction?.();
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

  const handleSpacePoliceEnvelopePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)
      || !spacePoliceEnvelopePosition || spacePoliceEnvelopeStoring) return;
    event.stopPropagation();
    const drag: SpacePoliceEnvelopePointer = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      holdTimer: 0,
      dragging: false,
      movedBeforeHold: false,
    };
    spacePoliceEnvelopePointerRef.current = drag;
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.holdTimer = window.setTimeout(() => {
      const active = spacePoliceEnvelopePointerRef.current;
      if (!active || active.pointerId !== pointerId || active.movedBeforeHold) return;
      active.holdTimer = 0;
      active.dragging = true;
      setSpacePoliceEnvelopeDragging(true);
    }, SPACE_POLICE_ENVELOPE_HOLD_MS);
  };

  const handleSpacePoliceEnvelopePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = spacePoliceEnvelopePointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    if (!drag.dragging) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > GRAB_CLICK_SUPPRESS_MOVE_PX) {
        drag.movedBeforeHold = true;
        window.clearTimeout(drag.holdTimer);
        drag.holdTimer = 0;
      }
      return;
    }
    event.preventDefault();
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const x = Math.max(12, Math.min(width - 12, event.clientX - 36));
    const y = Math.max(12, Math.min(height - 12, event.clientY - 6));
    setSpacePoliceEnvelopePosition({ x: x / width, y: y / height });
  };

  const handleSpacePoliceEnvelopePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = spacePoliceEnvelopePointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    window.clearTimeout(drag.holdTimer);
    spacePoliceEnvelopePointerRef.current = null;
    if (!drag.dragging) {
      if (drag.movedBeforeHold) {
        suppressSpacePoliceEnvelopeClickRef.current = true;
        window.setTimeout(() => { suppressSpacePoliceEnvelopeClickRef.current = false; }, 0);
      }
      return;
    }

    setSpacePoliceEnvelopeDragging(false);
    suppressSpacePoliceEnvelopeClickRef.current = true;
    window.setTimeout(() => { suppressSpacePoliceEnvelopeClickRef.current = false; }, 0);
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const x = Math.max(12, Math.min(width - 12, event.clientX - 36));
    const y = Math.max(12, Math.min(height - 12, event.clientY - 6));
    setSpacePoliceEnvelopePosition({ x: x / width, y: y / height });

    const mailbox = spacePoliceMailboxRef.current?.getBoundingClientRect();
    const droppedInMailbox = mailbox
      && event.clientX >= mailbox.left && event.clientX <= mailbox.right
      && event.clientY >= mailbox.top && event.clientY <= mailbox.bottom;
    if (!droppedInMailbox || !spacePoliceLetter || !onFileSpacePoliceLetter) return;

    const filedDeliveredAt = spacePoliceLetter.deliveredAt;
    setSpacePoliceEnvelopeStoring(true);
    window.clearTimeout(spacePoliceEnvelopeStoreTimerRef.current);
    spacePoliceEnvelopeStoreTimerRef.current = window.setTimeout(() => {
      spacePoliceEnvelopeStoreTimerRef.current = 0;
      if (positionedSpacePoliceLetterRef.current === filedDeliveredAt) {
        setSpacePoliceEnvelopePosition(null);
      }
      setSpacePoliceEnvelopeStoring(false);
      onFileSpacePoliceLetter?.(filedDeliveredAt);
    }, SPACE_POLICE_ENVELOPE_STORE_MS);
  };

  const handleSpacePoliceEnvelopePointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = spacePoliceEnvelopePointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    window.clearTimeout(drag.holdTimer);
    spacePoliceEnvelopePointerRef.current = null;
    setSpacePoliceEnvelopeDragging(false);
  };

  const handleSpacePoliceEnvelopeClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (suppressSpacePoliceEnvelopeClickRef.current) {
      suppressSpacePoliceEnvelopeClickRef.current = false;
      return;
    }
    onOpenSpacePoliceLetter?.();
  };

  const handlePandaPointerEnter = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'mouse' || !showInteractionBubble || pet.stage !== 'present'
      || interactionStateRef.current !== 'roaming' || hidden || isSleeping || isDragging || isPressPending
      || developerGrab || hangingOnRack || bathPhaseRef.current !== 'none' || startledRef.current
      || dizzyPhase !== 'none' || worldFallPhase !== 'none' || dirtyReturn || developerPose
      || activityStateRef.current !== 'roaming' || activityTransition !== null) return;
    const now = performance.now();
    if (now - lastHoverCuddleAtRef.current < HOVER_CUDDLE_COOLDOWN_MS) return;
    lastHoverCuddleAtRef.current = now;
    window.clearTimeout(hoverCuddleTimerRef.current);
    setHoverCuddleActive(true);
    playPixelTransition('lying', 'entering', () => {});
    hoverCuddleTimerRef.current = window.setTimeout(() => {
      hoverCuddleTimerRef.current = 0;
      playPixelTransition('lying', 'waking', () => setHoverCuddleActive(false));
    }, HOVER_CUDDLE_DURATION_MS);
  };

  const handlePandaPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!showInteractionBubble || interactionStateRef.current === 'chat' || !event.isPrimary
      || dizzyPhase !== 'none' || (worldFallPhase !== 'none' && worldFallPhase !== 'dirty') || bathPhaseRef.current === 'falling'
      || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (hoverCuddleActive) {
      window.clearTimeout(hoverCuddleTimerRef.current);
      hoverCuddleTimerRef.current = 0;
      setHoverCuddleActive(false);
      clearActivityTransition();
    }
    if (capturedHomecoming) onCapturedHomecomingInteraction?.();
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
      liftedFromBath: false,
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
      if (hangingOnRackRef.current && dampAfterBathRef.current && dampDryingReadyRef.current) {
        setDampAfterBathNow(false);
      }
      setHangingOnRack(false);
      clearActivityTransition();
      setActivityState('roaming');
      setSleepingOnBed(false);
      if (bathPhaseRef.current === 'bathing') {
        activeDrag.liftedFromBath = true;
        setBathPhaseNow('none');
        setDampAfterBathNow(true);
        if (worldFallPhase !== 'none') setWorldFallPhase('none');
      }
      if (motion === 'sleep') setNightWakeOverride(true);
      setRoomWalking(false);
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const x = ((activeDrag.currentX + activeDrag.offsetX) / width) * 100;
      const y = ((activeDrag.currentY + activeDrag.offsetY) / height) * 100;
      applyRoomPoint(unprojectRoomPoint(x, y, width, height));
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
    const point = unprojectRoomPoint(x, y, width, height);
    updateFacing(point.u - positionRef.current.u);
    applyRoomPoint(point);
  };

  const finishPandaPointer = (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = dragPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rackRect = clothesRackRef.current?.getBoundingClientRect();
    const tubRect = bathTubRef.current?.getBoundingClientRect();
    const bedRect = bedRef.current?.getBoundingClientRect();
    const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
    const pandaCenterX = pandaRect ? pandaRect.left + pandaRect.width / 2 : Number.NaN;
    const pandaCenterY = pandaRect ? pandaRect.top + pandaRect.height / 2 : Number.NaN;
    const droppedOntoBed = drag.grabbed && !cancelled && showInteractionBubble
      && !dampAfterBathRef.current
      && bedRect !== undefined && pandaRect !== undefined
      && pandaCenterX >= bedRect.left && pandaCenterX <= bedRect.right
      && pandaCenterY >= bedRect.top && pandaCenterY <= bedRect.bottom;
    const droppedIntoTub = drag.grabbed && !cancelled && showInteractionBubble
      && !drag.liftedFromBath && bathPhaseRef.current === 'none' && tubRect !== undefined
      && event.clientX >= tubRect.left && event.clientX <= tubRect.right
      && event.clientY >= tubRect.top && event.clientY <= tubRect.bottom;
    const rackRodY = rackRect ? rackRect.top + rackRect.height * 0.27 : 0;
    const rackHangCenterY = rackRodY + (pandaRect?.height ?? 0) * 0.5;
    const droppedOntoRack = drag.grabbed && !cancelled && showInteractionBubble
      && rackRect !== undefined && pandaRect !== undefined
      && pandaCenterX >= rackRect.left - rackRect.width * 0.35
      && pandaCenterX <= rackRect.right - rackRect.width * 0.08
      && Math.abs(pandaCenterY - rackHangCenterY) <= Math.max(48, rackRect.height * 0.2);
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
      if (droppedOntoBed && bedRect && pandaRect) {
        const width = Math.max(1, window.innerWidth);
        const height = Math.max(1, window.innerHeight);
        const target = unprojectRoomPoint(
          ((bedRect.left + bedRect.width * 0.5) / width) * 100,
          ((bedRect.top + bedRect.height * 0.5 + pandaRect.height * 0.5) / height) * 100,
          width,
          height,
        );
        updateFacing(target.u - positionRef.current.u);
        applyRoomPoint(target);
        setSleepingOnBed(true);
        setActivityState('sleeping');
        playPixelTransition('sleep', 'entering', () => setRoomWalking(false));
      } else if (droppedOntoRack && rackRect && pandaRect) {
        const width = Math.max(1, window.innerWidth);
        const height = Math.max(1, window.innerHeight);
        const hangX = Math.min(
          rackRect.left + rackRect.width * 0.76,
          Math.max(rackRect.left + rackRect.width * 0.24, pandaCenterX),
        );
        const target = unprojectRoomPoint(
          (hangX / width) * 100,
          ((rackRodY + pandaRect.height) / height) * 100,
          width,
          height,
        );
        updateFacing(target.u - positionRef.current.u);
        applyRoomPoint(target);
        setHangingOnRack(true);
        setRoomWalking(false);
      } else if (droppedIntoTub && tubRect) {
        startBathDropToTub();
      } else if (triggeredDizzyDrop) {
        setFrame(0);
        setDizzyPhase('falling');
      }
      if (showInteractionBubble && !cancelled && !droppedOntoBed && !droppedOntoRack && !droppedIntoTub
        && !isWalkableRoomPoint(positionRef.current)) {
        applyRoomPoint(nearestWalkableRoomPoint(positionRef.current));
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

  useEffect(() => {
    try { window.localStorage.setItem(ROOM_PROPS_KEY, JSON.stringify(placedProps)); } catch { /* storage unavailable */ }
  }, [placedProps]);

  useEffect(() => {
    const root = document.documentElement.style;
    const scale = Math.min(viewportSize.width / ROOM_IMAGE_WIDTH, viewportSize.height / ROOM_IMAGE_HEIGHT);
    const width = ROOM_IMAGE_WIDTH * scale;
    const height = ROOM_IMAGE_HEIGHT * scale;
    const left = (viewportSize.width - width) / 2;
    const top = (viewportSize.height - height) / 2;
    root.setProperty('--room-left', `${left}px`);
    root.setProperty('--room-top', `${top}px`);
    root.setProperty('--room-w', `${width}px`);
    root.setProperty('--room-h', `${height}px`);
    root.setProperty('--room-gap-bottom', `${top}px`);
    root.setProperty('--room-gap-right', `${left}px`);
  }, [viewportSize]);

  // Movable furniture sorts against the fixed room cut-outs by where its base stands.
  useLayoutEffect(() => {
    if (!showInteractionBubble) return;
    for (const element of [clothesRackRef.current, bedRef.current, bathStationRef.current]) {
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      const depth = unprojectRoomPoint(
        ((rect.left + rect.width / 2) / Math.max(1, window.innerWidth)) * 100,
        (rect.bottom / Math.max(1, window.innerHeight)) * 100,
        window.innerWidth,
        window.innerHeight,
      ).v;
      const rackCoversBlackHole = element === clothesRackRef.current && depth >= 0.42;
      element.style.zIndex = String(rackCoversBlackHole
        ? SPACE_BLACK_HOLE_OCCLUDER_Z_INDEX
        : roomFurnitureZIndex(depth) + 1);
    }
    if (bathPhaseRef.current === 'bathing' && draggingFurnitureId === 'bathStation') {
      const stationRect = bathStationRef.current?.getBoundingClientRect();
      const tubRect = bathTubRef.current?.getBoundingClientRect();
      if (stationRect && tubRect) {
        const screenX = tubRect.left + tubRect.width / 2;
        const screenY = tubRect.top + tubRect.height * 0.86;
        const target = unprojectRoomPoint(
          (screenX / Math.max(1, window.innerWidth)) * 100,
          (screenY / Math.max(1, window.innerHeight)) * 100,
          window.innerWidth,
          window.innerHeight,
        );
        updateFacing(target.u - positionRef.current.u);
        applyRoomPoint(target);
        const track = trackRef.current;
        const bubbleAnchor = bubbleAnchorRef.current;
        const screenXPercent = `${(screenX / Math.max(1, window.innerWidth)) * 100}%`;
        const screenYPercent = `${(screenY / Math.max(1, window.innerHeight)) * 100}%`;
        track?.style.setProperty('--room-x', screenXPercent);
        track?.style.setProperty('--room-y', screenYPercent);
        bubbleAnchor?.style.setProperty('--room-x', screenXPercent);
        bubbleAnchor?.style.setProperty('--room-y', screenYPercent);
      }
    }
  }, [applyRoomPoint, draggingFurnitureId, placedProps, roomFurnitureLayout, showInteractionBubble, updateFacing, viewportSize]);

  useEffect(() => {
    if (!showInteractionBubble || bathPhase !== 'bathing' || !bathRubbing) return undefined;
    const startedAt = performance.now();
    const alreadyRubbed = bathRubMsRef.current;
    const timer = window.setTimeout(() => {
      bathRubMsRef.current = BATH_RUB_MS;
      bathBallDragRef.current = null;
      setBathBallDragging(false);
      setBathRubbing(false);
      setBathBallPlaced(false);
      setBathBallPosition(null);
    }, Math.max(0, BATH_RUB_MS - alreadyRubbed));
    return () => {
      window.clearTimeout(timer);
      bathRubMsRef.current = Math.min(BATH_RUB_MS, alreadyRubbed + performance.now() - startedAt);
    };
  }, [bathPhase, bathRubbing, showInteractionBubble]);

  useEffect(() => {
    if (!showInteractionBubble || !equippedToy) {
      toyPointerRef.current = null;
      setToyPointer(null);
      return undefined;
    }
    const onMove = (event: PointerEvent) => {
      const overDock = (event.target as Element | null)?.closest?.('.rp-dock, .cc-top, [role="dialog"]');
      const next = overDock ? null : { x: event.clientX, y: event.clientY };
      toyPointerRef.current = next;
      setToyPointer(next);
    };
    const onLeave = () => { toyPointerRef.current = null; setToyPointer(null); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setEquippedToy(null); };
    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
    };
  }, [equippedToy, showInteractionBubble]);

  useEffect(() => {
    if (!showInteractionBubble || !equippedToy) return undefined;
    let raf = 0;
    let last = performance.now();
    let nearSince = 0;
    let walking = false;
    let pose: 'swat' | 'pounce' | null = null;
    const setPose = (next: 'swat' | 'pounce' | null) => { if (pose !== next) { pose = next; setToyPose(next); } };
    const setWalk = (next: boolean) => { if (walking !== next) { walking = next; setRoomWalking(next); } };
    const tick = (now: number) => {
      raf = window.requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const pointer = toyPointerRef.current;
      const busy = !pointer || pet.stage !== 'present' || activityState !== 'roaming' || hidden || dampAfterBath
        || developerGrab || flyChaseActive || worldFallPhase !== 'none' || draggingRef.current
        || bathPhaseRef.current !== 'none' || hangingOnRackRef.current || startledRef.current
        || interactionStateRef.current !== 'roaming';
      if (busy) { setWalk(false); setPose(null); nearSince = 0; return; }
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const goal = nearestWalkableRoomPoint(unprojectRoomPoint((pointer.x / width) * 100, (pointer.y / height) * 100, width, height));
      const from = positionRef.current;
      const dx = goal.u - from.u;
      const dy = goal.v - from.v;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.06) {
        nearSince = 0;
        setPose(null);
        const step = Math.min(distance, (equippedToyRef.current === 'laser' ? 0.55 : 0.34) * dt);
        let next = { u: from.u + (dx / distance) * step, v: from.v + (dy / distance) * step };
        if (!isWalkableRoomSegment(from, next)) {
          const slideU = { u: next.u, v: from.v };
          const slideV = { u: from.u, v: next.v };
          next = isWalkableRoomSegment(from, slideU) ? slideU : isWalkableRoomSegment(from, slideV) ? slideV : from;
        }
        if (next !== from) {
          updateFacing(next.u - from.u);
          applyRoomPoint(next);
          setWalk(true);
        } else setWalk(false);
        return;
      }
      setWalk(false);
      updateFacing(dx);
      if (!nearSince) nearSince = now;
      const phase = (now - nearSince) % 4200;
      if (equippedToyRef.current === 'teaser') setPose(phase < 2000 ? 'swat' : null);
      else setPose(phase < 2000 ? 'pounce' : null);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      setToyPose(null);
      setRoomWalking(false);
    };
  }, [activityState, applyRoomPoint, dampAfterBath, developerGrab, equippedToy, flyChaseActive, hidden, pet.stage, showInteractionBubble, updateFacing, worldFallPhase]);

  useEffect(() => {
    if (!equippedToy) return undefined;
    const previous = document.body.style.cursor;
    document.body.style.cursor = 'none';
    return () => { document.body.style.cursor = previous; };
  }, [equippedToy]);

  const toggleRoomProp = useCallback((prop: RoomProp) => {
    setPlacedProps((current) => ({ ...current, [prop]: !current[prop] }));
  }, []);

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
    window.clearTimeout(poopPackStartTimerRef.current);
    window.clearTimeout(poopPackFinishTimerRef.current);
    if (dragPointerRef.current) window.clearTimeout(dragPointerRef.current.holdTimer);
  }, []);

  useEffect(() => {
    if (!showInteractionBubble || !pet.actionPreview || pet.action !== 'tail' || pet.stage !== 'performing') return;

    const center = nearestWalkableRoomPoint(positionRef.current);
    const right = nearestWalkableRoomPoint({ u: center.u + 0.045, v: center.v });
    const top = nearestWalkableRoomPoint({ u: center.u, v: center.v - 0.03 });
    const left = nearestWalkableRoomPoint({ u: center.u - 0.045, v: center.v });
    const bottom = nearestWalkableRoomPoint({ u: center.u, v: center.v + 0.03 });
    const route = [center];
    let from = center;
    for (const target of [right, top, left, bottom, right]) {
      const segment = planRoomWalkPath(from, target);
      route.push(...segment.slice(1));
      from = segment.at(-1) ?? from;
    }
    if (route.length < 2) return;

    let frame = 0;
    const startedAt = performance.now();
    const duration = pet.duration > 100 ? pet.duration : pet.duration * 1000;
    setRoomWalking(true);
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / Math.max(1, duration));
      const point = pointAlongRoomWalkPath(route, progress);
      updateFacing(point.u - positionRef.current.u);
      applyRoomPoint(point);
      if (progress < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(frame);
      setRoomWalking(false);
    };
  }, [
    applyRoomPoint,
    pet.action,
    pet.actionPreview,
    pet.duration,
    pet.stage,
    pet.token,
    showInteractionBubble,
    updateFacing,
  ]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timeout = 0;
    let raf = 0;
    let alive = true;
    let from = positionRef.current;
    let to = from;
    let route: RoomPoint[] = [from, to];
    let startedAt = 0;
    let duration = 0;
    let stepCount = 1;
    const setWalking = (walking: boolean) => {
      if (showInteractionBubble) setRoomWalking(walking);
    };

    const canRoam = () => interactionState === 'roaming' && !equippedToyRef.current && dizzyPhase === 'none' && !reacting && !startled && !developerGrab && !hangingOnRackRef.current && !dampAfterBath && !startledRef.current && !hidden
      && (worldFallPhase === 'none' || worldFallPhase === 'dirty') && bathPhase === 'none'
      && pet.stage !== 'performing' && pet.stage !== 'returning' && !hoverCuddleActive
      && !developerPose && !pixelTransitionDirection && activityState === 'roaming' && !isDragging && !isPressPending && !draggingRef.current
      && (motion !== 'sleep' || nightWakeOverride) && !preference.matches && document.visibilityState !== 'hidden';
    const schedule = () => {
      if (!alive || !canRoam() || timeout || raf) return;
      setWalking(false);
      timeout = window.setTimeout(() => {
        timeout = 0;
        if (!canRoam()) return;
        from = showInteractionBubble ? nearestWalkableRoomPoint(positionRef.current) : positionRef.current;
        if (showInteractionBubble && !isWalkableRoomPoint(positionRef.current)) applyRoomPoint(from);
        to = showInteractionBubble ? randomWalkableRoomPoint() : randomRoomPoint();
          if (showInteractionBubble && flyChaseActive) {
            const escapeDirection = flyChaseSide === 'left' ? 1 : -1;
            const fleeDistance = 0.28 + Math.random() * 0.16;
            const targetU = Math.max(0.08, Math.min(0.92, from.u + escapeDirection * fleeDistance));
            const targetV = Math.max(0.08, Math.min(0.92, from.v + (Math.random() - 0.5) * 0.22));
            const fleeTarget = Math.abs(targetU - from.u) >= 0.12
              ? { u: targetU, v: targetV }
              : { u: targetU, v: Math.max(0.08, Math.min(0.92, from.v + (from.v < 0.5 ? 0.24 : -0.24))) };
            to = nearestWalkableRoomPoint(fleeTarget);
            if (Math.hypot(to.u - from.u, to.v - from.v) < 0.12) to = randomWalkableRoomPoint();
          }
        if (showInteractionBubble && Math.hypot(to.u - from.u, to.v - from.v) < 0.22) {
          for (let attempt = 0; attempt < 8 && Math.hypot(to.u - from.u, to.v - from.v) < 0.22; attempt += 1) {
            to = randomWalkableRoomPoint();
          }
        }
        route = showInteractionBubble ? planRoomWalkPath(from, to) : [from, to];
        if (showInteractionBubble && route.length < 2) {
          schedule();
          return;
        }
        const initialHorizontalDelta = showInteractionBubble ? route[1].u - from.u : to.u - from.u;
        updateFacing(Math.abs(initialHorizontalDelta) > DIRECTION_EPSILON
          ? initialHorizontalDelta
          : to.u - from.u);
        if (startledRef.current) return;
        startedAt = performance.now();
        const distance = showInteractionBubble
          ? roomWalkPathLength(route)
          : Math.hypot(to.u - from.u, to.v - from.v);
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
        ? pointAlongRoomWalkPath(route, gaitProgress(progress, stepCount))
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
        if (flyChaseActive || !maybeEnterRest(positionRef.current)) schedule();
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

    if (showInteractionBubble && canRoam() && !isWalkableRoomPoint(positionRef.current)) {
      applyRoomPoint(nearestWalkableRoomPoint(positionRef.current));
    } else applyRoomPoint(positionRef.current);
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
    dampAfterBath,
    applyRoomPoint,
    dizzyPhase,
    flyChaseActive,
    flyChaseSide,
    hidden,
    interactionState,
    hoverCuddleActive,
    isDragging,
    isPressPending,
    maybeEnterRest,
    motion,
    developerPose,
    pixelTransitionDirection,
    nightWakeOverride,
    pet.stage,
    pet.token,
    reacting,
    developerGrab,
    equippedToy,
    startled,
    updateFacing,
    worldFallPhase,
  ]);

  const image = dirtyGrab && sprite === 'dirty-grab-lift'
    ? frame === 0
      ? pandaStaticUrl('dirty-return.png?v=world-fall-1')
      : pandaStaticUrl(`frames/dirty-grab-lift-${frame}.png?v=dirty-grab-lift-pixen-2`)
    : dirtyGrab
      ? pandaStaticUrl('dirty-grab.png?v=dirty-grab-pixen-2')
      : hangingOnRack && showInteractionBubble
    ? pandaStaticUrl('grab.png?v=scruff-grab-1')
    : dirtyReturn && showInteractionBubble && bathPhase === 'bathing'
    ? bathRubbing ? dirtyBathingRubbingFrameUrl(bathFrame) : dirtyBathingFrameUrl(bathFrame)
    : dirtyReturn && isFlyChasing
      ? pandaStaticUrl('dirty-flee.png?v=dirty-flee-pixflux-1')
    : dirtyReturn
      ? pandaStaticUrl('dirty-return.png?v=world-fall-1')
    : showInteractionBubble && bathPhase === 'bathing'
      ? bathRubbing ? bathingRubbingFrameUrl(bathFrame) : bathingFrameUrl(bathFrame)
    : startled && showInteractionBubble
      ? pandaStaticUrl('startled.png?v=mouse-startle-pixflux-1')
    : sprite === 'toy-teaser' || sprite === 'toy-laser'
    ? frame === 0
      ? pandaStaticUrl('idle.png?v=toy-loop-base-1')
      : pandaStaticUrl(`frames/${sprite}-${frame}.png?v=pixellab-toy-actions-1`)
    : sprite === 'lying'
    ? LYING_SPRITE
    : sprite === 'cuddle-wriggle'
      ? frame === 0
        ? LYING_SPRITE
        : pandaStaticUrl(`frames/cuddle-wriggle-${frame}.png?v=cuddle-wriggle-pixellab-1`)
    : sprite === 'peeking'
      ? PEEKING_SPRITE
    : sprite === 'grab'
    ? `${import.meta.env.BASE_URL}static/panda/grab.png?v=scruff-grab-1`
    : sprite === 'dizzy'
      ? frame === 0
        ? `${import.meta.env.BASE_URL}static/panda/grab.png?v=scruff-grab-1`
        : pandaStaticUrl(`frames/dizzy-${Math.min(frame, DIZZY_FRAME_COUNT)}.png?v=dizzy-drop-1`)
      : sprite === 'captured-homecoming'
        ? frame === 0
          ? pandaStaticUrl('captured-dazed.png?v=captured-rescue-pixen-2')
          : frame >= 6
            ? pandaStaticUrl('captured-hug.png?v=captured-homecoming-pixen-1')
            : pandaStaticUrl(`frames/captured-homecoming-${frame}.png?v=captured-homecoming-pixen-1`)
    : frame === 0
      ? pandaStaticUrl(`${sprite}.png?v=${sprite === 'chew' ? 'chew-feed-4' : sprite === 'tail-chase' ? 'tail-chase-ccw-3' : 'tail-left-3'}`)
      : pandaStaticUrl(`frames/${sprite}-${frame}.png?v=${sprite === 'chew' ? 'chew-feed-4' : sprite === 'tail-chase' ? 'tail-chase-ccw-3' : 'tail-left-3'}`);
  currentImageRef.current = image;

  useLayoutEffect(() => {
    if (!showInteractionBubble || !isDragging) return;
    const drag = dragPointerRef.current;
    const track = trackRef.current;
    const body = pandaButtonRef.current?.querySelector<HTMLImageElement>('.ps-body');
    if (!drag || !drag.grabbed || drag.pointerType !== 'mouse' || !track || !body) return;

    const trackRect = track.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const anchor = dirtyGrab ? GRAB_HAND_ANCHOR_BY_FORM.dirty : GRAB_HAND_ANCHOR_BY_FORM.regular;
    const facingAdjustedX = facing === 'left' ? 1 - anchor.x : anchor.x;
    const handX = bodyRect.left + bodyRect.width * facingAdjustedX;
    const handY = bodyRect.top + bodyRect.height * anchor.y;

    // The cursor is the hold point: keep the relevant paw/grip aligned as the held sprite changes.
    drag.offsetX = trackRect.left + trackRect.width / 2 - handX;
    drag.offsetY = trackRect.bottom - handY;

    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const point = unprojectRoomPoint(
      ((drag.currentX + drag.offsetX) / width) * 100,
      ((drag.currentY + drag.offsetY) / height) * 100,
      width,
      height,
    );
    applyRoomPoint(point);
  }, [applyRoomPoint, dirtyGrab, facing, image, isDragging, showInteractionBubble]);

  const beginRoomWastePointer = useCallback((
    deliveredAt: number,
    phase: NonNullable<SpacePoliceLetter['poop']>['phase'],
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (phase !== 'fresh' && phase !== 'bagged') return;
    event.preventDefault();
    event.stopPropagation();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* pointer may already be captured */ }
    const pointer: RoomWastePointer = {
      pointerId: event.pointerId,
      deliveredAt,
      kind: phase === 'fresh' ? 'pack' : 'drag',
      holdTimer: 0,
    };
    roomWastePointerRef.current = pointer;
    if (phase === 'fresh') {
      if (packingPoopRef.current !== null) return;
      pointer.holdTimer = window.setTimeout(() => {
        poopPackStartTimerRef.current = 0;
        packingPoopRef.current = deliveredAt;
        setPackingPoopDeliveredAt(deliveredAt);
        poopPackFinishTimerRef.current = window.setTimeout(() => {
          poopPackFinishTimerRef.current = 0;
          packingPoopRef.current = null;
          setPackingPoopDeliveredAt(null);
          onPackSpacePolicePoop?.(deliveredAt);
        }, ROOM_WASTE_PACK_MS);
      }, ROOM_WASTE_HOLD_MS);
      poopPackStartTimerRef.current = pointer.holdTimer;
    } else {
      setDraggingPoopDeliveredAt(deliveredAt);
      setPoopDragPosition({
        x: event.clientX / Math.max(1, window.innerWidth),
        y: event.clientY / Math.max(1, window.innerHeight),
      });
    }
  }, [onPackSpacePolicePoop]);

  const moveRoomWastePointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = roomWastePointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId || pointer.kind !== 'drag') return;
    event.preventDefault();
    event.stopPropagation();
    setPoopDragPosition({
      x: Math.max(0.02, Math.min(0.98, event.clientX / Math.max(1, window.innerWidth))),
      y: Math.max(0.02, Math.min(0.98, event.clientY / Math.max(1, window.innerHeight))),
    });
  }, []);

  const finishRoomWastePointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const pointer = roomWastePointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    roomWastePointerRef.current = null;
    if (pointer.kind === 'pack') {
      if (packingPoopRef.current !== pointer.deliveredAt) {
        window.clearTimeout(pointer.holdTimer);
        if (poopPackStartTimerRef.current === pointer.holdTimer) poopPackStartTimerRef.current = 0;
      }
      return;
    }
    const x = cancelled && poopDragPosition
      ? poopDragPosition.x
      : Math.max(0.02, Math.min(0.98, event.clientX / Math.max(1, window.innerWidth)));
    const y = cancelled && poopDragPosition
      ? poopDragPosition.y
      : Math.max(0.02, Math.min(0.98, event.clientY / Math.max(1, window.innerHeight)));
    const holeRect = spaceBlackHoleRef.current?.getBoundingClientRect();
    const droppedIntoHole = !cancelled && holeRect
      && event.clientX >= holeRect.left && event.clientX <= holeRect.right
      && event.clientY >= holeRect.top && event.clientY <= holeRect.bottom;
    if (droppedIntoHole && holeRect) {
      onDisposeSpacePolicePoopBag?.(
        pointer.deliveredAt,
        (holeRect.left + holeRect.width / 2) / Math.max(1, window.innerWidth),
        (holeRect.top + holeRect.height / 2) / Math.max(1, window.innerHeight),
      );
    } else {
      onMoveSpacePolicePoopBag?.(pointer.deliveredAt, x, y);
    }
    setDraggingPoopDeliveredAt(null);
    setPoopDragPosition(null);
  }, [onDisposeSpacePolicePoopBag, onMoveSpacePolicePoopBag, poopDragPosition]);

  const roomBackgroundImage = `url("${import.meta.env.BASE_URL}static/room/room-background-pixellab.png?v=bamboo-room-1")`;
  const roomBackgroundSize = `min(100vw, ${(ROOM_IMAGE_WIDTH / ROOM_IMAGE_HEIGHT) * 100}vh) auto`;
  const roomFloorBounds = roomFloorBoundsPercent(window.innerWidth, window.innerHeight);
  const roomImageStyle = showInteractionBubble ? {
    backgroundImage: roomBackgroundImage,
    backgroundSize: roomBackgroundSize,
    backgroundPosition: 'center center',
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
         data-testid="panda-interaction-state" data-damp-after-bath={dampAfterBath ? 'true' : undefined}
         data-damp-drying-ready={dampDryingReady ? 'true' : undefined}
         style={{ ['--ps-dur' as string]: `${seconds}s` }}>
        {spaceBlackHoleVisible && (
          <div ref={spaceBlackHoleRef} className="ps-space-black-hole" aria-label="时空回收门；拖动黑色袋子到这里，小熊猫碰到会掉出房间"
            role="img" data-testid="space-time-black-hole"
            style={{
              left: `${spaceBlackHolePosition.x}%`,
              top: `${spaceBlackHolePosition.y}%`,
              transitionDuration: developerEvent?.event === 'world-fall' ? '0ms' : undefined,
            }}>
            <img src={CAPTURED_TIME_VORTEX_SPRITE} alt="" aria-hidden="true" draggable={false} />
          </div>
        )}
        {showInteractionBubble && ROOM_FURNITURE_OCCLUDERS.map((furniture) => (
          <div key={furniture.id} className="ps-room-occlusion" aria-hidden="true"
            data-testid={`room-occlusion-${furniture.id}`}
            data-room-depth={furniture.depth.toFixed(3)}
            style={{
              zIndex: furniture.coversBlackHole
                ? SPACE_BLACK_HOLE_OCCLUDER_Z_INDEX
                : roomFurnitureZIndex(furniture.depth),
              backgroundImage: roomBackgroundImage,
              backgroundSize: roomBackgroundSize,
              backgroundPosition: 'center center',
              backgroundRepeat: 'no-repeat',
              clipPath: furniture.polygon
                ? roomImagePolygonClipPath(furniture.polygon, window.innerWidth, window.innerHeight)
                : furniture.region
                  ? roomImageRegionClipPath(furniture.region, window.innerWidth, window.innerHeight)
                  : undefined,
            }} />
        ))}
        {showInteractionBubble && placedProps.rack && (
          <img ref={clothesRackRef}
            className={`ps-room-rack${draggingFurnitureId === 'rack' ? ' ps-furniture-dragging' : ''}`}
            src={`${import.meta.env.BASE_URL}static/room/panda-clothes-rack.png?v=bamboo-rack-clean-2`}
            alt="晾衣架" draggable={false}
            style={roomFurnitureStyle('rack', clothesRackRef)}
            onPointerDown={(event) => beginFurnitureMove('rack', event)}
            onPointerMove={moveFurniture}
            onPointerUp={finishFurnitureMove}
            onPointerCancel={finishFurnitureMove}
            data-testid="room-clothes-rack" />
        )}
        {showInteractionBubble && placedProps.bed && (
          <img ref={bedRef}
            className={`ps-room-bed${draggingFurnitureId === 'bed' ? ' ps-furniture-dragging' : ''}`}
            src={`${import.meta.env.BASE_URL}static/room/panda-nest-bed.png?v=panda-fresh-isometric-bed-5-paw-axis-perspective`}
            alt="小熊猫窝" draggable={false}
            style={roomFurnitureStyle('bed', bedRef)}
            onPointerDown={(event) => beginFurnitureMove('bed', event)}
            onPointerMove={moveFurniture}
            onPointerUp={finishFurnitureMove}
            onPointerCancel={finishFurnitureMove}
            data-testid="room-bed" />
        )}
        {showInteractionBubble && onOpenSpacePoliceMailbox && (
          <button ref={spacePoliceMailboxRef} type="button"
            className="ps-space-letter-box"
            aria-haspopup="dialog"
            aria-label={`打开时空警察来信箱，${spacePoliceMailCount ?? 0}封来信，${spacePoliceUnreadCount ?? 0}封未读`}
            data-testid="space-police-mailbox"
            style={mailboxPlacement}
            onClick={(event) => { event.stopPropagation(); onOpenSpacePoliceMailbox(); }}>
            <span className="ps-space-letter-box-stamp" aria-hidden="true">✉</span>
            <span className="ps-space-letter-box-label">信箱</span>
            {spacePoliceUnreadCount > 0 && <span className="ps-space-letter-box-count" aria-hidden="true">{spacePoliceUnreadCount > 9 ? '9+' : spacePoliceUnreadCount}</span>}
          </button>
        )}
        {showInteractionBubble && placedProps.tub && (
          <div ref={bathStationRef}
            className={`ps-bath-station${draggingFurnitureId === 'bathStation' ? ' ps-furniture-dragging' : ''}`}
            style={roomFurnitureStyle('bathStation', bathStationRef)}
            onPointerDown={(event) => beginFurnitureMove('bathStation', event)}
            onPointerMove={moveFurniture}
            onPointerUp={finishFurnitureMove}
            onPointerCancel={finishFurnitureMove}
            onClickCapture={(event) => suppressFurnitureClick('bathStation', event)}
            data-testid="bath-station">
            <img ref={bathTubRef} className="ps-room-bathtub"
              src={`${import.meta.env.BASE_URL}static/room/pet-bathtub.png?v=pet-bathtub-1`}
              alt="" aria-hidden="true" draggable={false} data-testid="room-bathtub" />
          </div>
        )}
        {showInteractionBubble && visibleWasteLetters.map(letter => {
          const poop = letter.poop!;
          const dragPoint = draggingPoopDeliveredAt === letter.deliveredAt ? poopDragPosition : null;
          const point = dragPoint ?? { x: poop.x ?? 0.5, y: poop.y ?? 0.65 };
          const isPacking = packingPoopDeliveredAt === letter.deliveredAt;
          const isDraggingBag = draggingPoopDeliveredAt === letter.deliveredAt;
          return (
            <button key={letter.deliveredAt} type="button"
              className={`ps-room-waste ps-room-waste-${poop.phase}${isPacking ? ' ps-room-waste-packing' : ''}${isDraggingBag ? ' ps-room-waste-dragging' : ''}`}
              style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
              aria-label={poop.phase === 'fresh'
                ? '长按把大便打包成黑色袋子'
                : poop.phase === 'disposing' ? '黑色袋子正在被时空黑洞吸走' : '拖动黑色袋子到时空黑洞里'}
              title={poop.phase === 'fresh' ? '长按打包' : poop.phase === 'bagged' ? '拖进时空黑洞' : undefined}
              disabled={poop.phase === 'disposing'}
              onPointerDown={event => beginRoomWastePointer(letter.deliveredAt, poop.phase, event)}
              onPointerMove={moveRoomWastePointer}
              onPointerUp={event => finishRoomWastePointer(event)}
              onPointerCancel={event => finishRoomWastePointer(event, true)}
              data-testid={`room-waste-${letter.deliveredAt}`}
              data-waste-phase={poop.phase}>
              {poop.phase === 'fresh'
                ? <span className="ps-room-waste-poop" aria-hidden="true">💩</span>
                : <span className="ps-room-waste-bag" aria-hidden="true"><i /></span>}
              {isPacking && <span className="ps-room-waste-wrap" aria-hidden="true"><i /></span>}
            </button>
          );
        })}
        {!showInteractionBubble && thinking && <span className="ps-thinking" role="status">唔……</span>}
        {!hidden && (!worldAway || worldFallMessageVisible) && (
          <div ref={trackRef} className={`ps-track${pet.stage === 'returning' ? ' ps-returning' : ''}${worldFallPhase === 'returning' ? ' ps-world-returning' : ''}${worldAway ? ' ps-world-away' : ''}${bathPhase === 'falling' ? ' ps-bath-dropping' : ''}${sleepingOnBed ? ' ps-bed-sleeping' : ''}${hangingOnRack ? ' ps-hanging-on-rack' : ''}${dampAfterBath ? ' ps-damp-after-bath' : ''}${capturedHomecoming && !capturedHomecomingArrived ? ' ps-captured-homecoming' : ''}${capturedHomecoming && capturedHomecomingArrived ? ' ps-captured-hugging' : ''}`}
            onAnimationEnd={(event) => { if (event.animationName === 'ps-captured-homecoming-path') finishCapturedHomecomingPath(); }}
            data-captured-return-phase={!capturedHomecoming ? undefined : capturedHomecomingArrived ? 'hugging' : frame < 2 ? 'thrown' : frame <= 4 ? 'impact' : 'crawling'}
            data-room-u="0.500" data-room-v="0.580" data-testid="panda-room-position" key={`${pet.token}-${pet.stage}`}>
            {showInteractionBubble && capturedHomecoming && !capturedHomecomingArrived && (
              <span className="ps-captured-time-vortex" aria-hidden="true">
                <img src={CAPTURED_TIME_VORTEX_SPRITE} alt="" draggable={false} />
              </span>
            )}
            {showInteractionBubble && !worldAway && bathPhase !== 'bathing' && !hangingOnRack && (
              <span className={`ps-ground-shadow${isSleeping ? ' ps-ground-shadow-sleeping' : ''}${capturedHomecoming ? ' ps-captured-impact-shadow' : ''}${isCuddling ? ' ps-ground-shadow-cuddling' : ''}`}
                aria-hidden="true" />
            )}
            {capturedHomecoming && !capturedHomecomingArrived && frame >= 2 && frame <= 4 && (
              <span className="ps-captured-impact-dust" aria-hidden="true"><i /><i /><i /></span>
            )}
              {!worldAway && (
      <button ref={pandaButtonRef} type="button" className={`ps-panda ps-${hangingOnRack ? 'idle' : isCuddling ? 'cuddle' : pet.stage === 'performing' ? action : basePoseClass}${showInteractionBubble && roomWalking && !hangingOnRack ? ' ps-walking' : ''}${showInteractionBubble && activityTransition ? ` ps-transition-${activityTransition}` : ''}${pixelTransitionDirection ? ' ps-pixel-transition' : ''}${interactionState === 'chat' ? ' ps-chatting' : ''}${(showInteractionBubble && activityState === 'lying' || developerPose === 'lying') ? ' ps-lying' : ''}${(showInteractionBubble && activityState === 'peeking' || developerPose === 'peeking') ? ' ps-peeking' : ''}${isSleeping ? ' ps-sleeping' : ''}${developerPose === 'idle' ? ' ps-dev-idle' : ''}${startled ? ' ps-startled' : ''}${isPressPending ? ' ps-pressing' : ''}${reacting ? ' ps-reacting' : ''}${isDragging || developerGrab ? ' ps-dragging' : ''}${hangingOnRack ? ' ps-hanging' : ''}${dirtyGrab ? ' ps-dirty-grabbing' : ''}${showInteractionBubble && dizzyPhase !== 'none' ? ' ps-dizzy' : ''}${worldFallPhase === 'falling' ? ' ps-world-falling' : ''}${bathPhase === 'falling' ? ' ps-bath-dropping' : ''}${bathPhase === 'bathing' ? ' ps-bathing' : ''}${dirtyReturn ? ' ps-world-dirty' : ''}${isFlyChasing ? ' ps-fly-flee' : ''}`}
               data-damp-after-bath={dampAfterBath && bathPhase === 'none' ? 'true' : undefined}
              onPointerEnter={handlePandaPointerEnter}
              onClick={handlePandaClick}
              onPointerDown={handlePandaPointerDown}
              onPointerMove={handlePandaPointerMove}
              onPointerUp={handlePandaPointerUp}
              onPointerCancel={handlePandaPointerCancel}
                   aria-label={capturedHomecoming ? '小熊猫从时空旋涡被送回，旁边有空间警察来信' : hangingOnRack ? '小熊猫挂在晾衣架上；长按可以把它抱下来' : isFlyChasing ? '脏兮兮的小熊猫被苍蝇追着跑' : bathPhase === 'falling' ? '小熊猫掉进浴缸了' : bathPhase === 'bathing' ? '小熊猫正在洗澡；长按可以提起' : worldFallPhase === 'falling' ? '小熊猫掉出房间了' : dirtyReturn ? '小熊猫灰头土脸地哭着回来了' : dizzyPhase === 'falling' ? '小熊猫松手后掉到地上' : dizzyPhase === 'dazed' ? '小熊猫坐在地上眩晕了一会儿' : isDragging ? '正在拎起小熊猫；拖动到目标位置后松手' : isPressPending ? '按住小熊猫即可拎起' : startled ? '小熊猫被吓了一跳' : isSleeping ? '小熊猫正在睡觉；点击叫醒' : interactionState === 'chat' ? '小熊猫正在聊天；点击房间空白处退出' : '点击小熊猫和它互动'}
                  data-testid="button-panda" data-cuddling={isCuddling ? 'true' : undefined} data-sprite={sprite} data-hanging-on-rack={hangingOnRack ? 'true' : undefined} data-bath-state={showInteractionBubble ? bathPhase : undefined} data-bath-ball-on-panda={bathBallPlaced ? 'true' : undefined} data-bath-rubbing={showInteractionBubble && bathPhase === 'bathing' ? (bathRubbing ? 'true' : 'false') : undefined} data-sleeping-on-bed={sleepingOnBed ? 'true' : 'false'} data-reacting={reacting ? 'true' : undefined} data-startled={startled ? 'true' : undefined} data-dizzy-state={showInteractionBubble ? dizzyPhase : undefined} data-facing={facing}
                 data-bamboo-phase={action === 'bamboo' ? bambooPhase : undefined}
                data-activity-state={showInteractionBubble ? developerPose ?? activityState : undefined}
                data-dev-pose={developerPose ?? undefined}
                data-activity-transition={showInteractionBubble ? activityTransition ?? 'none' : undefined}
                data-transition-direction={pixelTransitionDirection ?? undefined}
                 data-world-fall-state={showInteractionBubble ? worldFallPhase : undefined}>
                <img className="ps-body" src={image}
                 data-sprite={dirtyGrab ? sprite : hangingOnRack ? 'grab' : dirtyReturn && bathPhase === 'bathing' ? (bathRubbing ? 'dirty-bathing-soap' : 'dirty-bathing') : dirtyReturn && isFlyChasing ? 'dirty-flee' : dirtyReturn ? 'dirty-return' : bathPhase === 'bathing' ? 'bathing' : startled && showInteractionBubble ? 'startled' : sprite}
                 data-frame={dirtyGrab ? frame : hangingOnRack ? '0' : showInteractionBubble && bathPhase === 'bathing' ? bathFrame : dirtyReturn ? '0' : frame}
                 width={60} height={60} alt="" draggable={false} />
                {dampAfterBath && bathPhase === 'none' && (
                  <span className="ps-damp-drops" aria-hidden="true"><i /><i /><i /></span>
                )}
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
                  <span className="ps-grab-hook" aria-hidden="true"><i /><b /></span>
                  <span className="ps-grab-daze" aria-hidden="true">···</span>
                </>
              )}
              {startled && showInteractionBubble && <span className="ps-scared-mark" aria-hidden="true"><b>!</b><i /></span>}
              {capturedHomecomingArrived && showInteractionBubble && (
                <span className="ps-captured-hug-bubble" role="status" aria-live="polite">抱抱……</span>
              )}
              {(showInteractionBubble || developerPose === 'sleeping') && interactionState !== 'chat' && isSleeping && (
                <span className="ps-sleep-zzz" aria-hidden="true"><i>z</i><i>z</i><i>z</i></span>
              )}
              {interactionState !== 'chat' && ((showInteractionBubble && activityState === 'daydreaming') || developerPose === 'idle') && (
                <span className="ps-daydream-dots" aria-hidden="true">···</span>
              )}
              {action === 'bamboo' && bambooPhase === 'dropping' && (
                <img className="ps-snack-drop" src={BAMBOO_SNACK_SPRITE} alt="" aria-hidden="true" draggable={false} />
              )}
              {pet.carrying && (
                <span className="ps-gift ps-gift-held" aria-hidden="true" data-testid="panda-carrying-item">
                  {pet.carrying}
                </span>
              )}
              </button>
              )}
          </div>
        )}
        {showInteractionBubble && spacePoliceLetter && spacePoliceLetter.filedAt === undefined
          && spacePoliceLetter.eatenAt === undefined && spacePoliceEnvelopePosition && onOpenSpacePoliceLetter && (
          <>
            <button type="button"
              className={`ps-space-police-envelope${capturedHomecoming && !capturedHomecomingArrived ? ' ps-space-police-envelope-flying' : ''}${spacePoliceLetter.openedAt !== undefined ? ' ps-space-police-envelope-opened' : ''}${spacePoliceEnvelopeDragging ? ' ps-space-police-envelope-dragging' : ''}${spacePoliceEnvelopeStoring ? ' ps-space-police-envelope-storing' : ''}`}
              style={{ left: `${spacePoliceEnvelopePosition.x * 100}%`, top: `${spacePoliceEnvelopePosition.y * 100}%` }}
              disabled={capturedHomecoming && !capturedHomecomingArrived}
              aria-label={spacePoliceEnvelopeDragging ? '正在拖动时空警察信封，放到时空信箱里收好' : spacePoliceLetter.openedAt !== undefined ? '重新打开空间警察来信；长按可拖进时空信箱' : '打开空间警察信封；长按可拖进时空信箱'}
              data-testid="space-police-envelope"
              data-dragging={spacePoliceEnvelopeDragging ? 'true' : undefined}
              onPointerDown={handleSpacePoliceEnvelopePointerDown}
              onPointerMove={handleSpacePoliceEnvelopePointerMove}
              onPointerUp={handleSpacePoliceEnvelopePointerUp}
              onPointerCancel={handleSpacePoliceEnvelopePointerCancel}
              onClick={handleSpacePoliceEnvelopeClick}>
              <i aria-hidden="true" />
            </button>
            {spacePoliceLetter.openedAt === undefined && spacePoliceLetterReminderVisible && !spacePoliceEnvelopeDragging && (
              <span className="ps-space-letter-arrow"
                style={{ left: `calc(${spacePoliceEnvelopePosition.x * 100}% + 36px)`, top: `calc(${spacePoliceEnvelopePosition.y * 100}% - 26px)` }}
                aria-hidden="true" data-testid="space-police-envelope-arrow">↓</span>
            )}
          </>
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
      {showInteractionBubble && interactionState !== 'chat' && (
        <RoomPropDock
          equippedToy={equippedToy}
          onSelectToy={(toy) => setEquippedToy((current) => current === toy ? null : toy)}
          placed={placedProps}
          onTogglePlaced={toggleRoomProp}
          locked={{ tub: bathPhase !== 'none', rack: hangingOnRack, bed: sleepingOnBed }} />
      )}
      {showInteractionBubble && interactionState !== 'chat' && equippedToy && toyPointer && (
        <span className={`ps-toy ps-toy-${equippedToy}`} aria-hidden="true" data-testid={`room-toy-${equippedToy}`}
          style={{ left: toyPointer.x, top: toyPointer.y }}>
          <i /><b />
        </span>
      )}
      {showInteractionBubble && (
        <div className="ps-bubble-layer" aria-live="off">
          <div ref={bubbleAnchorRef} className="ps-bubble-anchor">
            {showInteractionBubble && worldFallMessageVisible && (
              <span className="ps-thinking ps-room-chat-bubble ps-world-fall-bubble" role="status" aria-live="polite"
                data-testid="panda-world-fall-message">掉出去啦！</span>
            )}
            {showInteractionBubble && dampAfterBath && bathPhase === 'none' && (
              <span className="ps-damp-status" aria-live="off" data-testid="panda-damp-status">
                {hangingOnRack
                  ? dampDryingReady ? '晾好啦' : `晾干中 ${dampDrySecondsRemaining} 秒`
                  : '还湿着呢'}
              </span>
            )}
            {showInteractionBubble && worldFallPhase === 'dirty' && bathPhase === 'none'
              && interactionState === 'roaming' && activityState === 'roaming' && !developerPose
              && !isSleeping && !isDragging && !hangingOnRack && dirtyPleaText && (
                <span className="ps-thinking ps-room-chat-bubble ps-world-dirty-plea" role="status" aria-live="polite"
                  data-testid="panda-dirty-plea">{dirtyPleaText}</span>
            )}
            {showInteractionBubble && !dampAfterBath && !capturedHomecoming && worldFallPhase === 'none' && !isSleeping && !startled && !isDragging && !hangingOnRack && interactionBubbleText && (
              <span className="ps-thinking ps-room-chat-bubble" role="status" aria-live="polite"
                data-testid="panda-chat-bubble">{interactionBubbleText}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
