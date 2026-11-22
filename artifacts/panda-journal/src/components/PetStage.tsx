import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { PetDreamBubble } from './PetDreamBubble';
import { choosePetDream, DREAM_READY_MS, type PetDream } from '@/lib/pet-dreams';
import { RoomAlarmClock } from './RoomAlarmClock';
import { PetDepartureNotice } from './PetDepartureNotice';
import { useCharacterAsset, useCharacterBody } from '@/hooks/use-character-art';
import { usePetCharacter, usePetNarration } from '@/hooks/use-pet-character';
import { advanceToy, createShakeDetector, createToyRuntime, shakeToy, toyVisual, TOY_ART_VERSION, type ToyPhase, type ToySprite } from '@/lib/room-toy-interaction';
import { LEFT_ROOM_PLANTS, LEFT_ROOM_PLANT_Z_INDEX } from '@/lib/room-plant-interaction';
import { getBathBallSpawnPosition } from '@/lib/bath-ball-position';
import { bathPetAnchor, bathPetClipPath } from '@/lib/room-bath-occlusion';
import { getGiftDropRoomPoint, getGiftStorageRoomPoint } from '@/lib/gift-drop-position';
import { isPandaCenterInsideJar } from '@/lib/room-jar-interaction';
import { GiftDrop } from './GiftDrop';
import {
  BATH_BALL_DRY_MS,
  canPickUpBathBall,
  finishBathBallDrying,
  hangBathBallToDry,
  readBathBallDryingState,
  saveBathBallDryingState,
  takeDryBathBallOffHook,
  wetBathBall,
  type BathBallDryingState,
} from '@/lib/bath-ball-drying';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { CareStatCategory, DeveloperEvent, DeveloperPose, FoxMerchantLetter, Gift, PerformanceAction, PetEffect, SpacePoliceLetter, WorldEcologyState } from '@/lib/companion-types';
import {
  blendRoomPoint,
  CAT_TREE_NEST_POINT,
  gaitProgress,
  isCatTreeNestScreenPoint,
  projectDesktopPoint,
  projectRoomPoint,
  isWalkableRoomPoint,
  isWalkableRoomSegment,
  nearestWalkableRoomPoint,
  planRoomWalkPath,
  pointAlongRoomWalkPath,
  randomWalkableRoomPoint,
  randomRoomPoint,
  ROOM_OUTSIDE_BOUNDARY_V,
  roomImagePolygonClipPath,
  roomImageRegionClipPath,
  roomPointAtImagePosition,
  roomWalkPathLength,
  ROOM_IMAGE_HEIGHT,
  ROOM_IMAGE_WIDTH,
  roomFloorBoundsPercent,
  roomFurnitureZIndex,
  shouldRackOccludePanda,
  shouldPandaRenderBehindRack,
  unprojectRoomPoint,
  unprojectRoomWalkableSurfacePoint,
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
  pixelTransitionBlocksRoomWalking,
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
import { BORED_DOCK_REST_MS, isBoredSearchDue } from '@/lib/room-bored-search';
import { normalizeRoomProps } from '@/lib/room-props';
import { useLeafPlatform } from '@/hooks/use-leaf-platform';
import { RoomLeafPlatform } from './RoomLeafPlatform';
import { isLeafPlatformScreenPoint, LEAF_PLATFORM_POINT, leafPlatformRestPoint, PLATFORM_LANDING_FRAMES, type LeafPlatformActivity } from '@/lib/room-leaf-platform';
import { isLeafPlatformRoomPoint } from '@/lib/room-plane';
import animationManifest from '@/lib/panda-animation-manifest.json';
import { punchDuration } from '@/lib/panda-punch';
import { usePandaPunch } from '@/hooks/use-panda-punch';
import { PANDA_TEASER_WAND_URL, TRUTH_POTION_URL, RoomPropDock, type RoomProp, type RoomToy } from './RoomPropDock';
import { useRoomEyeControl } from './useRoomEyeControl';
import './PetStage.css';

const ROOM_PROPS_KEY = 'little-panda-room-props-v1';
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
const SNACK_TOKEN_WIDTH = 124;
const SNACK_TOKEN_HEIGHT = 54;
const TRUTH_POTION_TOKEN_SIZE = 28;
const SPACE_POLICE_ENVELOPE_HOLD_MS = 420;
const SPACE_POLICE_ENVELOPE_STORE_MS = 190;
const ROOM_WASTE_HOLD_MS = 520;
const ROOM_WASTE_PACK_MS = 880;
const ROOM_WASTE_DISPOSE_MS = 720;
const WAKE_CLICK_COOLDOWN_MS = 500;
const STARTLE_DURATION_MS = 720;
const ACTIVITY_SETTLE_MS = 320;
const ACTIVITY_POSE_MS = 360;
const CAT_TREE_SLEEP_MS = 5 * 60 * 1000;
const CAT_TREE_AUTO_NAP_COOLDOWN_MS = 90 * 1000;
const CAT_TREE_AUTO_NAP_CHANCE = 0.08;
const WORLD_FALL_ANIMATION_MS = 1100;
const WORLD_FALL_MESSAGE_MS = 1800;
const WORLD_AWAY_MS = 5000;
const WORLD_RETURN_MS = 2500;
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
const POTION_COMFORT_SPRITE = pandaStaticUrl('potion-comfort.png?v=truth-potion-comfort-pixen-1');
const POTION_COMFORT_TRANSITION_FRAME_COUNT = 6;
const potionComfortTransitionFrameUrl = (frame: number) => pandaStaticUrl(
  `frames/potion-comfort-transition-${frame}.png?v=truth-potion-comfort-pixellab-1`,
);
const spriteAssetVersion = (sprite: string) => sprite === 'chew' ? 'chew-feed-4'
  : sprite === 'back-pawing' ? 'back-pawing-1'
  : sprite === 'tail-chase' ? 'tail-chase-ccw-3'
    : sprite === 'climb-up' ? 'stairs-back-left-walk-2'
      : sprite === 'jar-peeking' ? 'jar-peeking-pixen-2'
      : sprite.startsWith('eat-') ? 'snack-eating-pixellab-1' : 'tail-left-3';
const CHEW_FRAME_COUNT = 14;
const DIZZY_FRAME_COUNT = animationManifest.frameCountBySprite.dizzy;
const DIZZY_DROP_MS = DIZZY_FRAME_COUNT * animationManifest.frameIntervalMs.dizzy;
const TRASH_CAN_ENTER_FRAME_COUNT = animationManifest.frameCountBySprite['trash-can-enter'];
const TRASH_CAN_EXIT_FRAME_COUNT = animationManifest.frameCountBySprite['trash-can-exit'];
const TRASH_CAN_SPRITE = `${import.meta.env.BASE_URL}static/room/trash-can.png?v=trash-can-pixen-1`;
const BORED_DOCK_FRAME_COUNT = 5;
const boredDockFrameUrl = (frame: number) => pandaStaticUrl(`bored-over-dock/${frame}.png?v=bored-over-dock-pixellab-1`);
const trashCanPandaFrameUrl = (sequence: 'enter' | 'exit', frame: number) => (
  pandaStaticUrl(`frames/trash-can-${sequence}-${frame}.png?v=trash-can-pixen-1`)
);
const DIZZY_HOLD_MS = 2400;
const BAMBOO_DROP_MS = 780;
const BATH_DROP_MS = 680;
const BATH_ENTRY_SHAKE_FRAME_COUNT = 8;
const BATH_ENTRY_SHAKE_FRAME_INTERVAL_MS = 130;
const BATH_BALL_DROP_MS = 720;
const BATH_RUB_MS = 5000;
const BATHING_FRAME_INTERVAL_MS = 160;
const bathingFrameUrl = (frame: number) => pandaStaticUrl(`bathing-wash/${frame}.png?v=bath-wash-pixellab-1`);
const bathingEntryShakeFrameUrl = (frame: number) => pandaStaticUrl(`bathing-entry-shake/${frame}.png?v=bath-entry-shake-pixellab-1`);
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
const ROOM_FURNITURE_OCCLUDERS: {
  id: string;
  depth: number;
  foreground?: boolean;
  region?: { left: number; top: number; right: number; bottom: number };
  polygon?: readonly (readonly [number, number])[];
}[] = [
  { id: 'cat-tree', depth: 0.05, region: { left: 300, top: 150, right: 550, bottom: 300 } },
  { id: 'armchair', depth: 0.03, region: { left: 590, top: 170, right: 790, bottom: 295 } },
  { id: 'wardrobe', depth: 0.14, region: { left: 815, top: 45, right: 975, bottom: 335 } },
  { id: 'dresser', depth: 0.22, region: { left: 925, top: 215, right: 1024, bottom: 365 } },
  ...LEFT_ROOM_PLANTS.map(plant => ({ ...plant, depth: .82, foreground: true })),
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
  somersault: 'back-pawing-1',
  lying: 'pixellab-transition-1',
  sleep: 'sleep-transition-2',
  peeking: 'pixellab-transition-1',
  'captured-homecoming': 'captured-homecoming-exit-1',
  'climb-up': 'stairs-back-left-walk-2',
  'leaf-play': 'leaf-platform-1',
  'plush-play': 'plush-play-1',
  fever: 'fever-pixel-1',
};
const PIXELLAB_TRANSITION_FRAMES = Object.fromEntries(
  Object.entries(PIXELLAB_TRANSITION_FRAME_FILES).map(([key, files]) => [
    key,
    files.map(file => `${pandaStaticUrl(file)}?v=${TRANSITION_ASSET_VERSIONS[key as TransitionKey]}`),
  ]),
) as Record<TransitionKey, string[]>;
const ACTION_TRANSITION_KEY: Record<PerformanceAction, TransitionKey> = {
  bamboo: 'chew',
  'eat-banana': 'chew',
  'eat-carrot': 'chew',
  'eat-fish': 'chew',
  'eat-candy': 'chew',
  'eat-strawberry': 'chew',
  'eat-cookie': 'chew',
  'eat-bamboo': 'chew',
  roll: 'idle',
  jump: 'jump',
  spin: 'idle',
  somersault: 'somersault',
  tail: 'tail',
  tumble: 'idle',
  cuddle: 'lying',
  'captured-homecoming': 'captured-homecoming',
  'climb-up': 'climb-up',
};
const DEVELOPER_POSE_TRANSITION_KEY: Record<DeveloperPose, TransitionKey> = {
  idle: 'idle',
  lying: 'lying',
  sleeping: 'sleep',
  peeking: 'peeking',
  'bored-searching': 'idle',
};
const performanceTransitionKey = (action: PerformanceAction | 'idle'): TransitionKey =>
  action === 'idle' ? 'idle' : ACTION_TRANSITION_KEY[action];
const DEVELOPER_POSE_SPRITES: Record<DeveloperPose, string> = {
  idle: animationManifest.motionSprites.idle,
  lying: 'lying',
  sleeping: animationManifest.motionSprites.sleep,
  peeking: 'peeking',
  'bored-searching': animationManifest.motionSprites.idle,
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
type TrashCanPandaPhase = 'entering' | 'trapped' | 'exiting';
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

function clampPandaDragScreenPosition(x: number, y: number, width: number, height: number): ScreenPosition {
  const horizontalInset = Math.min(46, width / 2);
  const bottom = Math.max(1, height - 4);
  const top = Math.min(92, bottom);
  return {
    x: Math.max(horizontalInset, Math.min(width - horizontalInset, x)),
    y: Math.max(top, Math.min(bottom, y)),
  };
}
const getBathBallWindowHookPosition = (rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): ScreenPosition => ({
  x: rect.left + rect.width / 2 - 20,
  y: rect.top + rect.height * 0.72 - 20,
});
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

export function PetStage({ pet, selectedSnack = null, onFeedSnack, onDrinkTruthPotion, thinking = false, motion = 'idle', debugClicks = false, showInteractionBubble = false, showArrowMarker = false, interactionBubbleText, developerPose = null, developerEvent = null, onChatModeChange, onCareInteraction, onPlayerAttention, worldEcology, foxMerchantLetter, onTryIdleWorldFall, onWorldFallReturned, onPetWashed, onPetDried, onLeafPlatformChange, onCapturedHomecomingInteraction, pendingGift, giftDropStartedAt, onCollectPresent, giftCount = 0, onOpenGiftStorage, spacePoliceLetter, spacePoliceLetters, spacePoliceMailCount = 0, spacePoliceUnreadCount = 0, onOpenSpacePoliceLetter, onFileSpacePoliceLetter, onEatSpacePoliceLetter, onPlaceSpacePolicePoop, onPackSpacePolicePoop, onMoveSpacePolicePoopBag, onDisposeSpacePolicePoopBag, onFinishSpacePolicePoopDisposal, onOpenSpacePoliceMailbox }: {
  pet: PetEffect;
  selectedSnack?: Pick<Gift, 'id' | 'emoji' | 'item'> | null;
  onFeedSnack?: (giftId: string) => void;
  onDrinkTruthPotion?: () => void;
  thinking?: boolean;
  motion?: 'idle' | 'sleep';
  debugClicks?: boolean;
  showInteractionBubble?: boolean;
  showArrowMarker?: boolean;
  interactionBubbleText?: string;
  developerPose?: DeveloperPose | null;
  developerEvent?: { event: DeveloperEvent; token: number } | null;
  onChatModeChange?: (isChat: boolean) => void;
  onCareInteraction?: (category: CareStatCategory) => void;
  onPlayerAttention?: () => void;
  worldEcology?: WorldEcologyState;
  foxMerchantLetter?: FoxMerchantLetter;
  onTryIdleWorldFall?: () => boolean;
  onWorldFallReturned?: () => 'dirty' | 'captured' | 'reset' | undefined;
  onPetWashed?: () => void;
  onPetDried?: () => void;
  onLeafPlatformChange?: (held: boolean) => void;
  onCapturedHomecomingInteraction?: () => void;
  pendingGift?: Gift;
  giftDropStartedAt?: number;
  onCollectPresent?: (giftId: string) => void;
  giftCount?: number;
  onOpenGiftStorage?: () => void;
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
  const { characterId } = usePetCharacter();
  const hidden = pet.stage === 'fallen' || pet.stage === 'away';
  const seconds = Math.min(5, Math.max(2, pet.duration > 100 ? pet.duration / 1000 : pet.duration || 2));
  const requestedAction = pet.stage === 'performing' ? pet.action : 'idle';
  const action: PerformanceAction | 'idle' =
    ['roll', 'tumble'].includes(requestedAction) ? 'idle' : requestedAction;
  const capturedHomecoming = pet.stage === 'performing' && action === 'captured-homecoming';
  const basePoseClass = developerPose ? developerPose === 'sleeping' ? 'sleep' : 'idle' : motion;
  const [interactionState, setInteractionState] = useState<'roaming' | 'chat'>('roaming');
  const [boredAtDock, setBoredAtDock] = useState(false);
  const [boredDockFrame, setBoredDockFrame] = useState(0);
  const [roomPropDockHeight, setRoomPropDockHeight] = useState(68);
  const lastRoomUserActivityAtRef = useRef(Date.now());
  const [reacting, setReacting] = useState(false);
  const [hoverCuddleActive, setHoverCuddleActive] = useState(false);
  const [roomWalking, setRoomWalking] = useState(false);
  const roomWalkingRef = useRef(roomWalking);
  roomWalkingRef.current = roomWalking;
  const [climbingUp, setClimbingUp] = useState(false);
  const climbingUpRef = useRef(false);
  const previousClimbingUpRef = useRef(false);
  const [activityState, setActivityState] = useState<RoomActivityState>('roaming');
  const [sleepingOnBed, setSleepingOnBed] = useState(false);
  const [sleepingInNest, setSleepingInNest] = useState(false);
  const [dream, setDream] = useState<PetDream | null>(null);
  const previousDreamRef = useRef<PetDream['id'] | undefined>(undefined);
  const [dreamPreviewToken, setDreamPreviewToken] = useState<number | null>(null);
  const handledDreamPreviewRef = useRef<number | null>(null);
  const handledPlushPreviewRef = useRef<number | null>(null);
  const [hangingOnRack, setHangingOnRack] = useState(false);
  const [hangingOnWindowHook, setHangingOnWindowHook] = useState(false);
  const hangingOnClothesRack = hangingOnRack && !hangingOnWindowHook;
  const pandaHanging = hangingOnRack || hangingOnWindowHook;
  const [pandaJarTrapped, setPandaJarTrapped] = useState(false);
  const [pandaDragScreenPosition, setPandaDragScreenPosition] = useState<ScreenPosition | null>(null);
  const bambooJarRoomPoint = roomPointAtImagePosition(258, 226);
  const bambooJarTargetRoomPoint = roomPointAtImagePosition(258, 250);
  const [dirtyGrabLiftComplete, setDirtyGrabLiftComplete] = useState(false);
  const [activityTransition, setActivityTransition] = useState<'settling' | 'entering' | 'waking' | 'frames-entering' | 'frames-waking' | null>(null);
  const [pixelTransitionDirection, setPixelTransitionDirection] = useState<'entering' | 'waking' | null>(null);
  const [pixelTransitionKey, setPixelTransitionKey] = useState<TransitionKey | null>(null);
  const roamingTransitionBlocked = pixelTransitionBlocksRoomWalking(pixelTransitionKey, pixelTransitionDirection);
  const [transitionFrameSrc, setTransitionFrameSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPressPending, setIsPressPending] = useState(false);
  const { mode: leafPlatformActivity, heldRef: leafPlatformRef, enter: holdLeafPlatform,
    pickUp: releaseLeafPlatform } = useLeafPlatform(pet.stage === 'present' && !isDragging && !isPressPending);
  const previousLeafActivityRef = useRef<LeafPlatformActivity | null>(null);
  const leafPlatformArrivingRef = useRef(false);
  const handledLeafPlatformEventRef = useRef<number | null>(null);
  const leafPlatformHeld = leafPlatformActivity !== null;
  useEffect(() => {
    onLeafPlatformChange?.(leafPlatformHeld);
    return () => onLeafPlatformChange?.(false);
  }, [leafPlatformHeld, onLeafPlatformChange]);
  const [bathPhase, setBathPhase] = useState<BathPhase>('none');
  const [bathTransition, setBathTransition] = useState<'exiting' | null>(null);
  const [bathExitImage, setBathExitImage] = useState<string | null>(null);
  const [dampAfterBath, setDampAfterBath] = useState(false);
  const [dampDryingReady, setDampDryingReady] = useState(false);
  const [dampDrySecondsRemaining, setDampDrySecondsRemaining] = useState(DAMP_RACK_DRY_MS / 1000);
  const [bathFrame, setBathFrame] = useState(0);
  const [bathEntryShakeFrame, setBathEntryShakeFrame] = useState<number | null>(null);
  const [bathRubbing, setBathRubbing] = useState(false);
  const [bathBallPosition, setBathBallPosition] = useState<ScreenPosition | null>(null);
  const [bathBallDragging, setBathBallDragging] = useState(false);
  const [bathBallDropping, setBathBallDropping] = useState(false);
  const [bathBallPlaced, setBathBallPlaced] = useState(false);
  const [bathBallDrying, setBathBallDrying] = useState<BathBallDryingState>(
    () => readBathBallDryingState(typeof window === 'undefined' ? undefined : window.localStorage),
  );
  const [bathBallDrySecondsRemaining, setBathBallDrySecondsRemaining] = useState(BATH_BALL_DRY_MS / 1000);
  const [startled, setStartled] = useState(false);
  const [developerGrab, setDeveloperGrab] = useState(false);
  const [dizzyPhase, setDizzyPhase] = useState<'none' | 'falling' | 'dazed'>('none');
  const [worldFallPhase, setWorldFallPhase] = useState<WorldFallPhase>(() =>
    worldEcology?.dirtySince !== undefined ? 'dirty' : 'none');
  const worldFallPhaseRef = useRef(worldFallPhase);
  worldFallPhaseRef.current = worldFallPhase;
  const worldFallBoundaryTriggerRef = useRef<(() => boolean) | null>(null);
  const [worldFallMessageVisible, setWorldFallMessageVisible] = useState(false);
  const [packingPoopDeliveredAt, setPackingPoopDeliveredAt] = useState<number | null>(null);
  const [draggingPoopDeliveredAt, setDraggingPoopDeliveredAt] = useState<number | null>(null);
  const [poopDragPosition, setPoopDragPosition] = useState<RoomWastePoint | null>(null);
  const [snackDropPosition, setSnackDropPosition] = useState<ScreenPosition | null>(null);
  const [snackDropDragging, setSnackDropDragging] = useState(false);
  const [truthPotionPosition, setTruthPotionPosition] = useState<ScreenPosition | null>(null);
  const [truthPotionDragging, setTruthPotionDragging] = useState(false);
  const [truthPotionComfortPhase, setTruthPotionComfortPhase] = useState<'walking' | 'settling' | 'sitting' | null>(null);
  const [truthPotionInvitationVisible, setTruthPotionInvitationVisible] = useState(false);
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
  const [trashCanPandaPhase, setTrashCanPandaPhase] = useState<TrashCanPandaPhase | null>(null);
  const trashCanPandaPhaseRef = useRef<TrashCanPandaPhase | null>(null);
  const [trashCanPandaFrame, setTrashCanPandaFrame] = useState(0);
  const [trashCanPandaAnchor, setTrashCanPandaAnchor] = useState<RoomFurniturePoint | null>(null);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === 'undefined' ? 1 : window.innerWidth,
    height: typeof window === 'undefined' ? 1 : window.innerHeight,
  }));
  const [placedProps, setPlacedProps] = useState<Record<RoomProp, boolean>>(() => {
    try {
      const raw = window.localStorage.getItem(ROOM_PROPS_KEY);
      return normalizeRoomProps(raw ? JSON.parse(raw) : undefined);
    } catch { return normalizeRoomProps(); }
  });
  const [equippedToy, setEquippedToy] = useState<RoomToy | null>(null);
  const equippedToyRef = useRef<RoomToy | null>(null);
  const toyCareInteractionRecordedRef = useRef(false);
  equippedToyRef.current = equippedToy;
  const [toyPointer, setToyPointer] = useState<{ x: number; y: number } | null>(null);
  const toyPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [toyPose, setToyPose] = useState<ToySprite | null>(null);
  const [toyArtFrame, setToyArtFrame] = useState(0);
  const [toyPhase, setToyPhase] = useState<ToyPhase>('waiting');
  const toyRuntimeRef = useRef(createToyRuntime());
  const toyShakeRef = useRef(createShakeDetector());
  const toyDragRef = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const [toyDragging, setToyDragging] = useState(false);
  const toyAudioRef = useRef<AudioContext | null>(null);
  const capturedHomecomingArrivedRef = useRef(false);
  const capturedHomecomingTokenRef = useRef<number | null>(null);
  const positionedSpacePoliceLetterRef = useRef<number | null>(null);
  const [dirtyPleaText, setDirtyPleaText] = useState<string | null>(null);
  const [flyChaseActive, setFlyChaseActive] = useState(false);
  const [flyChaseSide, setFlyChaseSide] = useState<'left' | 'right'>('left');
  const worldAway = showInteractionBubble && worldFallPhase === 'away';
  const dirtyReturn = showInteractionBubble && (worldFallPhase === 'returning' || worldFallPhase === 'dirty');
  const feverish = showInteractionBubble && (worldEcology?.sick === true || developerEvent?.event === 'fever');
  const previousFeverishRef = useRef(false);
  const dirtyGrab = dirtyReturn && (isDragging || developerGrab || pandaHanging);
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
  const trashCanBusy = trashCanPandaPhase !== null || draggingFurnitureId === 'trashCan'
    || activeWasteLetters.some(letter => letter.poop?.phase === 'disposing');
  // A shared hide request waits until the local pet/disposal animation is safe.
  const wasteBinVisible = showInteractionBubble && (placedProps.trashCan || trashCanBusy);
  const isFlyChasing = flyChaseActive && bathPhase === 'none' && interactionState === 'roaming'
    && activityState === 'roaming' && !isDragging && !pandaHanging && !hidden;
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
  const sleepingInNestRef = useRef(sleepingInNest);
  sleepingInNestRef.current = sleepingInNest;
  const pandaHangingRef = useRef(pandaHanging);
  pandaHangingRef.current = pandaHanging;
  const bathBallDryingRef = useRef(bathBallDrying);
  bathBallDryingRef.current = bathBallDrying;
  const developerPoseRef = useRef(developerPose);
  developerPoseRef.current = developerPose;
  const bathPhaseRef = useRef<BathPhase>('none');
  const previousBathPhaseRef = useRef<BathPhase>('none');
  const dampAfterBathRef = useRef(dampAfterBath);
  const dampDryingReadyRef = useRef(dampDryingReady);
  dampAfterBathRef.current = dampAfterBath;
  dampDryingReadyRef.current = dampDryingReady;
  const bathBallDragRef = useRef<BathBallPointer | null>(null);
  const bathBallOriginRef = useRef<ScreenPosition | null>(null);
  const bathDropTimerRef = useRef(0);
  const bathExitTimerRef = useRef(0);
  const developerEventTimerRef = useRef(0);
  const dirtyFlyTimerRef = useRef(0);
  const dirtyFlyEndTimerRef = useRef(0);
  const dirtyPleaTimerRef = useRef(0);
  const dirtyPleaHideTimerRef = useRef(0);
  const bathBallDropTimerRef = useRef(0);
  const trashCanPandaAnimationTimerRef = useRef(0);
  const bathRubMsRef = useRef(0);
  const bathTubRef = useRef<HTMLImageElement>(null);
  const bathStationRef = useRef<HTMLDivElement>(null);
  const bedRef = useRef<HTMLImageElement>(null);
  const clothesRackRef = useRef<HTMLImageElement>(null);
  const rackOcclusionRef = useRef<HTMLImageElement>(null);
  const windowDryingHookRef = useRef<HTMLButtonElement>(null);
  const bambooJarRef = useRef<HTMLDivElement>(null);
  const spacePoliceMailboxRef = useRef<HTMLButtonElement>(null);
  const wasteBinRef = useRef<HTMLButtonElement>(null);
  const startTrashCanPandaExit = useCallback(() => {
    if (trashCanPandaPhaseRef.current !== 'trapped') return;
    trashCanPandaPhaseRef.current = 'exiting';
    setTrashCanPandaFrame(0);
    setTrashCanPandaPhase('exiting');
  }, []);
  const bathBallButtonRef = useRef<HTMLButtonElement>(null);
  const pandaButtonRef = useRef<HTMLButtonElement>(null);
  const snackDropPointerRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const truthPotionPointerRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const truthPotionComfortStartRef = useRef<(() => boolean) | null>(null);
  const truthPotionComfortStartedRef = useRef(false);
  const truthPotionComfortRafRef = useRef(0);
  const truthPotionInvitationTimerRef = useRef(0);
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
  const furnitureContactRef = useRef<Set<RoomFurnitureId>>(new Set());
  const furnitureCollisionPendingRef = useRef<Set<RoomFurnitureId>>(new Set());
  const furnitureCollisionActionRef = useRef<(id: RoomFurnitureId) => void>(() => {});
  const suppressFurnitureClickRef = useRef<RoomFurnitureId | null>(null);
  const draggingRef = useRef(false);
  const suppressClickAfterDragRef = useRef(false);
  const wakeClickIgnoreUntilRef = useRef(0);
  const startledRef = useRef(false);
  const startleTimerRef = useRef(0);
  const lastWorldFallAtRef = useRef(Number.NEGATIVE_INFINITY);
  const activityTransitionTimerRef = useRef(0);
  const activityTransitionCancelRef = useRef<(() => void) | null>(null);
  const activityTransitionFinishRef = useRef<(() => void) | null>(null);
  const catTreeSleepTimerRef = useRef(0);
  const lastCatTreeNapAtRef = useRef(Number.NEGATIVE_INFINITY);
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

  useEffect(() => {
    if (!selectedSnack) {
      setSnackDropPosition(null);
      setSnackDropDragging(false);
      snackDropPointerRef.current = null;
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const maxX = Math.max(8, width - SNACK_TOKEN_WIDTH - 8);
    const top = Math.min(112, Math.max(20, height * 0.18));
    const bottom = Math.max(top, height - SNACK_TOKEN_HEIGHT - Math.min(150, height * 0.16));
    const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
    const isClearOfPanda = (x: number, y: number) => !pandaRect
      || x + SNACK_TOKEN_WIDTH < pandaRect.left - 22
      || x > pandaRect.right + 22
      || y + SNACK_TOKEN_HEIGHT < pandaRect.top - 22
      || y > pandaRect.bottom + 22;

    let spawn: ScreenPosition | null = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = {
        x: Math.round(8 + Math.random() * (maxX - 8)),
        y: Math.round(top + Math.random() * (bottom - top)),
      };
      if (isClearOfPanda(candidate.x, candidate.y)) {
        spawn = candidate;
        break;
      }
    }
    if (!spawn) {
      const corners = [
        { x: 8, y: top },
        { x: maxX, y: top },
        { x: 8, y: bottom },
        { x: maxX, y: bottom },
      ].filter(point => isClearOfPanda(point.x, point.y));
      spawn = corners.length
        ? corners[Math.floor(Math.random() * corners.length)]
        : { x: maxX, y: bottom };
    }
    setSnackDropPosition(spawn);
    setSnackDropDragging(false);
    snackDropPointerRef.current = null;
  }, [selectedSnack?.id]);

  const handleSnackPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!selectedSnack || !snackDropPosition) return;
    onPlayerAttention?.();
    event.preventDefault();
    event.stopPropagation();
    snackDropPointerRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - snackDropPosition.x,
      offsetY: event.clientY - snackDropPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSnackDropDragging(true);
  };

  const handleSnackPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = snackDropPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setSnackDropPosition({
      x: Math.max(0, Math.min(window.innerWidth - SNACK_TOKEN_WIDTH, event.clientX - drag.offsetX)),
      y: Math.max(0, Math.min(window.innerHeight - SNACK_TOKEN_HEIGHT, event.clientY - drag.offsetY)),
    });
  };

  const handleSnackPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = snackDropPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    snackDropPointerRef.current = null;
    setSnackDropDragging(false);
    const panda = pandaButtonRef.current?.getBoundingClientRect();
    const droppedOnPanda = pet.stage === 'present' && panda
      && event.clientX >= panda.left - 22 && event.clientX <= panda.right + 22
      && event.clientY >= panda.top - 22 && event.clientY <= panda.bottom + 22;
    if (selectedSnack && droppedOnPanda) {
      onPlayerAttention?.();
      onFeedSnack?.(selectedSnack.id);
      setSnackDropPosition(null);
      return;
    }
    setSnackDropPosition({
      x: Math.max(0, Math.min(window.innerWidth - SNACK_TOKEN_WIDTH, event.clientX - drag.offsetX)),
      y: Math.max(0, Math.min(window.innerHeight - SNACK_TOKEN_HEIGHT, event.clientY - drag.offsetY)),
    });
  };

  const handleSnackPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (snackDropPointerRef.current?.pointerId !== event.pointerId) return;
    snackDropPointerRef.current = null;
    setSnackDropDragging(false);
  };

  const toggleTruthPotion = () => {
    truthPotionPointerRef.current = null;
    setTruthPotionDragging(false);
    if (truthPotionPosition) {
      setTruthPotionPosition(null);
      return;
    }
    const panda = pandaButtonRef.current?.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - TRUTH_POTION_TOKEN_SIZE - 8);
    const maxY = Math.max(90, window.innerHeight - TRUTH_POTION_TOKEN_SIZE - 160);
    const proposedX = panda ? panda.left - TRUTH_POTION_TOKEN_SIZE - 10 : window.innerWidth * 0.5;
    const proposedY = panda ? panda.top + (panda.height - TRUTH_POTION_TOKEN_SIZE) / 2 : window.innerHeight * 0.56;
    setTruthPotionPosition({
      x: Math.round(Math.max(8, Math.min(maxX, proposedX))),
      y: Math.round(Math.max(90, Math.min(maxY, proposedY))),
    });
  };

  const handleTruthPotionPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!truthPotionPosition) return;
    event.preventDefault();
    event.stopPropagation();
    truthPotionPointerRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - truthPotionPosition.x,
      offsetY: event.clientY - truthPotionPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setTruthPotionDragging(true);
  };

  const handleTruthPotionPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = truthPotionPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setTruthPotionPosition({
      x: Math.max(0, Math.min(window.innerWidth - TRUTH_POTION_TOKEN_SIZE, event.clientX - drag.offsetX)),
      y: Math.max(0, Math.min(window.innerHeight - TRUTH_POTION_TOKEN_SIZE, event.clientY - drag.offsetY)),
    });
  };

  const handleTruthPotionPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = truthPotionPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    truthPotionPointerRef.current = null;
    setTruthPotionDragging(false);
    const panda = pandaButtonRef.current?.getBoundingClientRect();
    const droppedOnPanda = pet.stage === 'present' && panda
      && event.clientX >= panda.left - 20 && event.clientX <= panda.right + 20
      && event.clientY >= panda.top - 20 && event.clientY <= panda.bottom + 20;
    if (droppedOnPanda) {
      if (truthPotionComfortStartRef.current?.()) setTruthPotionPosition(null);
      return;
    }
    setTruthPotionPosition({
      x: Math.max(0, Math.min(window.innerWidth - TRUTH_POTION_TOKEN_SIZE, event.clientX - drag.offsetX)),
      y: Math.max(0, Math.min(window.innerHeight - TRUTH_POTION_TOKEN_SIZE, event.clientY - drag.offsetY)),
    });
  };

  const handleTruthPotionPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (truthPotionPointerRef.current?.pointerId !== event.pointerId) return;
    truthPotionPointerRef.current = null;
    setTruthPotionDragging(false);
  };

  const updateRoomFurniturePoint = useCallback((id: RoomFurnitureId, point: RoomFurniturePoint) => {
    if (furnitureCollisionPendingRef.current.has(id)) return true;
    const furniture = id === 'bed' ? bedRef.current
      : id === 'rack' ? clothesRackRef.current
        : id === 'bathStation' ? bathStationRef.current
          : id === 'trashCan' ? wasteBinRef.current : null;
    const panda = pandaButtonRef.current;
    const pandaRect = panda?.querySelector('.ps-body')?.getBoundingClientRect() ?? panda?.getBoundingClientRect();
    const furnitureRect = furniture?.getBoundingClientRect();
    let collisionStarted = false;
    if (id !== 'mailbox' && furnitureRect && pandaRect) {
      const overlaps = (
        first: { left: number; right: number; top: number; bottom: number },
        second: { left: number; right: number; top: number; bottom: number },
      ) => first.left < second.right && first.right > second.left
        && first.top < second.bottom && first.bottom > second.top;
      if (!overlaps(furnitureRect, pandaRect)) furnitureContactRef.current.delete(id);
      const nextRect = {
        left: point.x * viewportSize.width - furnitureRect.width / 2,
        right: point.x * viewportSize.width + furnitureRect.width / 2,
        top: point.y * viewportSize.height - furnitureRect.height / 2,
        bottom: point.y * viewportSize.height + furnitureRect.height / 2,
      };
      if (!overlaps(nextRect, pandaRect)) {
        furnitureContactRef.current.delete(id);
      } else if (!furnitureContactRef.current.has(id)) {
        furnitureContactRef.current.add(id);
        furnitureCollisionPendingRef.current.add(id);
        collisionStarted = true;
      }
    }
    const next = { ...roomFurnitureLayoutRef.current, [id]: point };
    roomFurnitureLayoutRef.current = next;
    setRoomFurnitureLayout(next);
    if (collisionStarted) {
      window.requestAnimationFrame(() => {
        try {
          furnitureCollisionActionRef.current(id);
        } finally {
          furnitureCollisionPendingRef.current.delete(id);
        }
      });
    }
    return collisionStarted;
  }, [viewportSize]);

  const persistRoomFurnitureLayout = useCallback((layout: RoomFurnitureLayout) => {
    try {
      writeRoomFurnitureLayout(window.localStorage, layout);
      window.dispatchEvent(new CustomEvent('panda-coop-room-change', { detail: {
        furnitureLayout: layout,
        placedProps: JSON.parse(window.localStorage.getItem(ROOM_PROPS_KEY) ?? '{}'),
      } }));
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

  const syncRackOcclusion = useCallback(() => {
    const foregroundRack = rackOcclusionRef.current;
    if (!foregroundRack) return;
    const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
    const rackRect = clothesRackRef.current?.getBoundingClientRect();
    const shouldCoverPanda = showInteractionBubble && !draggingRef.current
      && pandaRect !== undefined && rackRect !== undefined
      && shouldRackOccludePanda(pandaRect, rackRect, hangingOnClothesRack);
    foregroundRack.style.visibility = shouldCoverPanda ? 'visible' : 'hidden';
    foregroundRack.dataset.visible = String(shouldCoverPanda);
  }, [hangingOnClothesRack, showInteractionBubble]);

  const syncBathOcclusion = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const tub = bathTubRef.current;
    const clip = showInteractionBubble
      && (bathPhaseRef.current === 'bathing' || bathPhaseRef.current === 'falling')
      && !draggingRef.current && tub
      ? bathPetClipPath(track.getBoundingClientRect(), tub.getBoundingClientRect())
      : null;
    track.style.clipPath = clip ?? '';
    track.dataset.bathOccluded = clip ? 'true' : 'false';
  }, [showInteractionBubble]);

  const beginFurnitureMove = useCallback((id: RoomFurnitureId, event: ReactPointerEvent<Element>) => {
    if (!showInteractionBubble || !event.isPrimary || event.button !== 0) return;
    if (id === 'trashCan' && trashCanPandaPhaseRef.current !== null && trashCanPandaPhaseRef.current !== 'trapped') return;
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
    if (press.id === 'trashCan' && trashCanPandaPhaseRef.current === 'trapped') {
      const pandaRect = pandaButtonRef.current?.querySelector('.ps-body')?.getBoundingClientRect()
        ?? pandaButtonRef.current?.getBoundingClientRect();
      const nextRect = {
        left: point.x * viewportSize.width - rect.width / 2,
        right: point.x * viewportSize.width + rect.width / 2,
        top: point.y * viewportSize.height - rect.height / 2,
        bottom: point.y * viewportSize.height + rect.height / 2,
      };
      const stillOverPanda = pandaRect && nextRect.left < pandaRect.right && nextRect.right > pandaRect.left
        && nextRect.top < pandaRect.bottom && nextRect.bottom > pandaRect.top;
      if (pandaRect && !stillOverPanda) startTrashCanPandaExit();
    }
    press.moved = true;
    const collided = updateRoomFurniturePoint(press.id, point);
    if (!collided) return;
    window.clearTimeout(press.holdTimer);
    furniturePointerRef.current = null;
    setDraggingFurnitureId(null);
    persistRoomFurnitureLayout(roomFurnitureLayoutRef.current);
    window.setTimeout(() => {
      if (suppressFurnitureClickRef.current === press.id) suppressFurnitureClickRef.current = null;
    }, 0);
    try {
      if (press.element.hasPointerCapture(press.pointerId)) press.element.releasePointerCapture(press.pointerId);
    } catch {
      // The browser may already have released capture after pointerup or pointercancel.
    }
  }, [persistRoomFurnitureLayout, startTrashCanPandaExit, updateRoomFurniturePoint, viewportSize]);

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
  const setBathBallDryingNow = useCallback((next: BathBallDryingState) => {
    bathBallDryingRef.current = next;
    saveBathBallDryingState(window.localStorage, next);
    setBathBallDrying(next);
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
    && (leafPlatformHeld ? leafPlatformActivity === 'sleeping' : (developerPose === 'sleeping'
      || (showInteractionBubble && (activityState === 'sleeping' || (activityState === 'roaming' && motion === 'sleep' && !nightWakeOverride)))));
  const boredSearchEligible = showInteractionBubble
    && !leafPlatformHeld
    && interactionState === 'roaming' && !hidden && pet.stage === 'present'
    && activityState === 'roaming' && !roomWalking && !isSleeping
    && !developerPose && !isDragging && !isPressPending && !developerGrab
    && !pandaHanging && !pandaJarTrapped && bathPhase === 'none'
    && !dampAfterBath && !startled && dizzyPhase === 'none'
    && worldFallPhase === 'none' && !capturedHomecoming
    && !equippedToy && !selectedSnack && !pendingGift;
  const boredSearchEligibleRef = useRef(boredSearchEligible);
  boredSearchEligibleRef.current = boredSearchEligible;
  const showBoredSearch = showInteractionBubble && !hidden && interactionState !== 'chat'
    && (developerPose === 'bored-searching' || (boredAtDock && boredSearchEligible));
  const roomArtworkWidth = Math.min(viewportSize.width, viewportSize.height * ROOM_IMAGE_WIDTH / ROOM_IMAGE_HEIGHT);
  const boredPandaSize = roomArtworkWidth / 25;

  useEffect(() => {
    if (!showInteractionBubble) {
      setBoredAtDock(false);
      return undefined;
    }
    lastRoomUserActivityAtRef.current = Date.now();
    const resetIdle = () => {
      lastRoomUserActivityAtRef.current = Date.now();
      setBoredAtDock(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        setBoredAtDock(false);
        return;
      }
      resetIdle();
    };
    document.addEventListener('pointerdown', resetIdle, true);
    document.addEventListener('keydown', resetIdle, true);
    document.addEventListener('input', resetIdle, true);
    document.addEventListener('visibilitychange', handleVisibility);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible'
        && boredSearchEligibleRef.current
        && isBoredSearchDue(lastRoomUserActivityAtRef.current, Date.now())) {
        setBoredAtDock(true);
      }
    }, 1000);
    return () => {
      document.removeEventListener('pointerdown', resetIdle, true);
      document.removeEventListener('keydown', resetIdle, true);
      document.removeEventListener('input', resetIdle, true);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(timer);
    };
  }, [showInteractionBubble]);

  useEffect(() => {
    if (!boredAtDock) return;
    const finishDockRest = () => {
      // Finishing a rest starts a fresh idle period, not another immediate rest.
      lastRoomUserActivityAtRef.current = Date.now();
      setBoredAtDock(false);
    };
    if (!boredSearchEligible) {
      finishDockRest();
      return;
    }
    const timer = window.setTimeout(finishDockRest, BORED_DOCK_REST_MS);
    return () => window.clearTimeout(timer);
  }, [boredAtDock, boredSearchEligible]);

  useEffect(() => {
    if (!showBoredSearch || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBoredDockFrame(0);
      return undefined;
    }
    const sequence = [0, 0, 0, 0, ...Array.from({ length: BORED_DOCK_FRAME_COUNT - 1 }, (_, index) => index + 1)];
    let frame = 0;
    const timer = window.setInterval(() => {
      frame = (frame + 1) % sequence.length;
      setBoredDockFrame(sequence[frame]);
    }, 700);
    return () => window.clearInterval(timer);
  }, [showBoredSearch]);

  useLayoutEffect(() => {
    if (!showInteractionBubble || interactionState === 'chat') return undefined;
    const dock = document.querySelector<HTMLElement>('[data-testid="room-prop-dock"]');
    if (!dock) return undefined;
    const updateHeight = () => setRoomPropDockHeight(dock.getBoundingClientRect().height);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(dock);
    return () => observer.disconnect();
  }, [interactionState, showInteractionBubble]);
  useEffect(() => {
    if (!showInteractionBubble || !isSleeping) {
      setDream(null);
      setDreamPreviewToken(null);
      return undefined;
    }
    setDream(null);
    const timer = window.setTimeout(() => {
      const nextDream = choosePetDream(previousDreamRef.current);
      previousDreamRef.current = nextDream.id;
      setDream(nextDream);
    }, dreamPreviewToken === null ? DREAM_READY_MS : 0);
    return () => window.clearTimeout(timer);
  }, [isSleeping, showInteractionBubble, dreamPreviewToken]);
  const isSleepingRef = useRef(isSleeping);
  isSleepingRef.current = isSleeping;
  const hoverCuddleVisible = showInteractionBubble && !equippedToy && hoverCuddleActive && pet.stage === 'present'
    && !leafPlatformHeld
    && interactionState !== 'chat' && !isSleeping && !isDragging && !isPressPending && !developerGrab
    && !pandaHanging && !dampAfterBath && bathPhase === 'none' && !startled && dizzyPhase === 'none'
    && worldFallPhase === 'none' && !dirtyReturn && !developerPose;
  const isCuddling = (pet.stage === 'performing' && action === 'cuddle') || hoverCuddleVisible;
  const sprite = showInteractionBubble && truthPotionComfortPhase === 'settling'
    ? 'potion-comfort'
    : showInteractionBubble && truthPotionComfortPhase === 'sitting'
    ? 'potion-comfort'
    : showInteractionBubble && climbingUp && roomWalking && pet.stage === 'present'
    && interactionState !== 'chat' && !developerPose && !isDragging && !developerGrab
    && !pandaHanging && !startled && dizzyPhase === 'none' && bathPhase === 'none'
    ? 'climb-up'
    : showInteractionBubble && pandaJarTrapped
    ? 'jar-peeking'
    : hoverCuddleVisible
    ? 'cuddle-wriggle'
    : dirtyGrab
    ? dirtyGrabLiftComplete ? 'dirty-grab' : 'dirty-grab-lift'
    : showInteractionBubble && dizzyPhase !== 'none'
    ? 'dizzy'
    : showInteractionBubble && (isDragging || developerGrab || pandaHanging)
    ? 'grab'
    : feverish
    ? 'fever'
    : startled && showInteractionBubble
    ? animationManifest.motionSprites.idle
    : showInteractionBubble && toyPose && pet.stage === 'present' && activityState === 'roaming'
    ? toyPose
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
    : leafPlatformActivity
      ? roomWalking ? 'walk' : leafPlatformActivity === 'sleeping' ? 'sleep' : leafPlatformActivity === 'playing' ? 'leaf-play' : 'idle'
    : developerPose
        ? DEVELOPER_POSE_SPRITES[developerPose]
        : showInteractionBubble && activityState === 'plush-play'
          ? 'plush-play'
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
  useEffect(() => {
    if (truthPotionComfortPhase !== 'settling') return undefined;
    setFrame(0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTruthPotionComfortPhase('sitting');
      return undefined;
    }
    let nextFrame = 0;
    let finishTimer = 0;
    const timer = window.setInterval(() => {
      nextFrame += 1;
      setFrame(nextFrame);
      if (nextFrame >= POTION_COMFORT_TRANSITION_FRAME_COUNT) {
        window.clearInterval(timer);
        finishTimer = window.setTimeout(() => setTruthPotionComfortPhase('sitting'), 140);
      }
    }, 140);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(finishTimer);
    };
  }, [setFrame, truthPotionComfortPhase]);
  useEffect(() => () => {
    window.cancelAnimationFrame(truthPotionComfortRafRef.current);
    window.clearTimeout(truthPotionInvitationTimerRef.current);
  }, []);
  const [bambooPhase, setBambooPhase] = useState<'idle' | 'entering' | 'dropping' | 'eating' | 'settling'>('idle');

  const recordDebug = useCallback((message: string) => {
    if (!import.meta.env.DEV || !debugClicks) return;
    const time = new Date().toLocaleTimeString();
    setDebugEntries((entries) => [...entries, `${time} ${message}`].slice(-10));
  }, [debugClicks]);

  const startPunchReaction = useCallback(() => {
    if (characterId !== 'panda') return false;
    window.clearTimeout(reactionTimerRef.current);
    setReacting(true);
    setRoomWalking(false);
    reactionTimerRef.current = window.setTimeout(() => {
      reactionTimerRef.current = 0;
      setReacting(false);
    }, punchDuration(window.matchMedia('(prefers-reduced-motion: reduce)').matches));
    return true;
  }, [characterId]);

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
    setPixelTransitionKey(null);
  }, [clearTransitionFrames]);

  const playPixelTransition = useCallback((key: TransitionKey, direction: 'entering' | 'waking', onComplete: () => void) => {
    const frames = PIXELLAB_TRANSITION_FRAMES[key];
    setPixelTransitionKey(key);
    setPixelTransitionDirection(direction);
    playTransitionFrames(direction === 'entering' ? frames : [...frames].reverse(), direction, () => {
      setPixelTransitionDirection(null);
      setPixelTransitionKey(null);
      onComplete();
    });
  }, [playTransitionFrames]);

  useLayoutEffect(() => {
    if (!showInteractionBubble) {
      previousClimbingUpRef.current = false;
      return;
    }
    if (previousClimbingUpRef.current === climbingUp) return;
    previousClimbingUpRef.current = climbingUp;
    if (!climbingUp && (sleepingInNest || sleepingOnBed || activityState === 'sleeping')) return;
    clearActivityTransition();
    playPixelTransition('climb-up', climbingUp ? 'entering' : 'waking', () => {});
  }, [activityState, clearActivityTransition, climbingUp, playPixelTransition, showInteractionBubble, sleepingInNest, sleepingOnBed]);

  useEffect(() => {
    if (roomWalking || !climbingUpRef.current) return;
    climbingUpRef.current = false;
    setClimbingUp(false);
  }, [roomWalking]);

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

  useEffect(() => {
    if (!showInteractionBubble || feverish === previousFeverishRef.current) return;
    previousFeverishRef.current = feverish;
    clearActivityTransition();
    setActivityState('roaming');
    setRoomWalking(false);
    playPixelTransition('fever', feverish ? 'entering' : 'waking', () => setRoomWalking(false));
  }, [clearActivityTransition, feverish, playPixelTransition, showInteractionBubble]);

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
    if (leafPlatformRef.current) return;
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
      window.clearTimeout(catTreeSleepTimerRef.current);
      catTreeSleepTimerRef.current = 0;
      playPixelTransition('sleep', 'waking', () => {
        setSleepingOnBed(false);
        setSleepingInNest(false);
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
    if (activityState === 'peeking' || activityState === 'plush-play') {
      playPixelTransition(activityState, 'waking', () => {
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
    window.clearTimeout(catTreeSleepTimerRef.current);
    activityTransitionCancelRef.current?.();
  }, []);

  const triggerStartle = useCallback(() => {
    if (leafPlatformRef.current) return;
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

  const roomEye = useRoomEyeControl({
    showInteractionBubble,
    hidden,
    interactionState,
    placedProps,
    viewportSize,
    roomFurnitureLayout,
    roomFurnitureLayoutRef,
    clothesRackRef,
    bedRef,
    bathStationRef,
    pandaButtonRef,
    updateRoomFurniturePoint,
    persistRoomFurnitureLayout,
    triggerStartle,
  });

  const updateFacing = useCallback((horizontalDelta: number) => {
    if (Math.abs(horizontalDelta) < DIRECTION_EPSILON) return;
    const nextFacing = horizontalDelta < 0 ? 'left' : 'right';
    if (facingRef.current === nextFacing) return;
    facingRef.current = nextFacing;
    setFacing(nextFacing);

    if (!showInteractionBubble || activityState !== 'roaming' || hidden
      || interactionStateRef.current !== 'roaming' || pet.stage !== 'present' || draggingRef.current || equippedToyRef.current) return;
    const mouse = mousePositionRef.current;
    const track = trackRef.current;
    if (!mouse || !track) return;
    const bounds = track.getBoundingClientRect();
    const pandaCenter = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    if (isMouseBehindOnTurn(mouse, pandaCenter, nextFacing)) triggerStartle();
  }, [activityState, hidden, pet.stage, showInteractionBubble, triggerStartle]);

  const applyRoomPoint = useCallback((point: RoomPoint) => {
    if (leafPlatformRef.current && !draggingRef.current && !isLeafPlatformRoomPoint(point)) return;
    if (showInteractionBubble && worldFallPhaseRef.current === 'falling') return;
    const previousPoint = positionRef.current;
    const reachedOutsideBoundary = showInteractionBubble && roomWalkingRef.current
      && (worldFallPhaseRef.current === 'none' || worldFallPhaseRef.current === 'dirty')
      && previousPoint.v <= ROOM_OUTSIDE_BOUNDARY_V
      && point.v >= ROOM_OUTSIDE_BOUNDARY_V
      && (point.elevation ?? 0) <= 0.001;
    const appliedPoint = reachedOutsideBoundary
      ? { ...point, v: ROOM_OUTSIDE_BOUNDARY_V, elevation: 0 }
      : point;
    const elevationDelta = (appliedPoint.elevation ?? 0) - (previousPoint.elevation ?? 0);
    if (!showInteractionBubble || !roomWalkingRef.current || elevationDelta < -0.0001) {
      if (climbingUpRef.current) {
        climbingUpRef.current = false;
        setClimbingUp(false);
      }
    } else if (elevationDelta > 0.0001 && (point.elevation ?? 0) > 0.01 && !climbingUpRef.current) {
      climbingUpRef.current = true;
      setClimbingUp(true);
    }
    positionRef.current = appliedPoint;
    const track = trackRef.current;
    if (!track) return;
    const projected = showInteractionBubble
      ? projectRoomPoint(appliedPoint, window.innerWidth, window.innerHeight)
      : projectDesktopPoint(appliedPoint);
    track.style.setProperty('--room-x', `${projected.x}%`);
    track.style.setProperty('--room-y', `${projected.y}%`);
    track.style.setProperty('--room-scale', projected.scale.toFixed(3));
    const bubbleAnchor = bubbleAnchorRef.current;
    if (bubbleAnchor) {
      bubbleAnchor.style.setProperty('--room-x', `${projected.x}%`);
      bubbleAnchor.style.setProperty('--room-y', `${projected.y}%`);
      bubbleAnchor.style.setProperty('--room-scale', projected.scale.toFixed(3));
    }
    // Foreground plants on both sides sit one layer above the panda.
    track.style.zIndex = showInteractionBubble
      ? draggingRef.current ? '260' : hangingOnClothesRack ? '241' : '240'
      : String(projected.zIndex);
    if (showInteractionBubble) {
      syncRackOcclusion();
      syncBathOcclusion();
    }
    track.dataset.roomU = appliedPoint.u.toFixed(3);
    track.dataset.roomV = appliedPoint.v.toFixed(3);
    track.dataset.roomElevation = (appliedPoint.elevation ?? 0).toFixed(3);
    track.dataset.roomScale = projected.scale.toFixed(3);
    if (showInteractionBubble) {
      track.dataset.roomWalkable = String(isWalkableRoomPoint(appliedPoint));
      track.style.setProperty('--room-shadow-scale', projected.shadowScale.toFixed(3));
      track.style.setProperty('--room-shadow-opacity', projected.shadowOpacity.toFixed(3));
      track.style.setProperty('--room-shadow-blur', `${projected.shadowBlur.toFixed(2)}px`);
      track.style.setProperty('--room-brightness', projected.brightness.toFixed(3));
      track.dataset.roomDepth = projected.depth.toFixed(3);
      track.dataset.roomZ = String(projected.zIndex);
    } else delete track.dataset.roomWalkable;
    if (reachedOutsideBoundary) worldFallBoundaryTriggerRef.current?.();
  }, [hangingOnClothesRack, showInteractionBubble, syncBathOcclusion, syncRackOcclusion]);

  const enterLeafPlatform = useCallback((mode?: LeafPlatformActivity) => {
    if (!showInteractionBubble || pet.stage !== 'present') return;
    clearActivityTransition();
    window.clearTimeout(catTreeSleepTimerRef.current);
    window.clearTimeout(hoverCuddleTimerRef.current);
    setHoverCuddleActive(false);
    setEquippedToy(null);
    equippedToyRef.current = null;
    setToyPose(null);
    setReacting(false);
    setStartled(false);
    setBoredAtDock(false);
    sleepingInNestRef.current = false;
    setSleepingInNest(false);
    setSleepingOnBed(false);
    setHangingOnRack(false);
    setHangingOnWindowHook(false);
    roomWalkingRef.current = false;
    setRoomWalking(false);
    leafPlatformArrivingRef.current = true;
    holdLeafPlatform(mode);
    onLeafPlatformChange?.(true);
    updateFacing(1);
    applyRoomPoint(LEAF_PLATFORM_POINT);
  }, [applyRoomPoint, clearActivityTransition, holdLeafPlatform, onLeafPlatformChange, pet.stage, showInteractionBubble, updateFacing]);

  useEffect(() => {
    const previous = previousLeafActivityRef.current;
    previousLeafActivityRef.current = leafPlatformActivity;
    if (!leafPlatformActivity || isDragging || pet.stage !== 'present') return;
    const key = leafPlatformActivity === 'sleeping' ? 'sleep' : leafPlatformActivity === 'playing' ? 'leaf-play' : 'idle';
    let cancelled = false;
    let raf = 0;
    const settle = () => {
      if (cancelled || leafPlatformRef.current !== leafPlatformActivity) return;
      roomWalkingRef.current = false;
      setRoomWalking(false);
      setActivityState(leafPlatformActivity === 'sleeping' ? 'sleeping' : 'roaming');
      playPixelTransition(key, 'entering', () => setRoomWalking(false));
    };
    const walkWithinPlatform = () => {
      if (cancelled || leafPlatformRef.current !== leafPlatformActivity) return;
      const from = positionRef.current;
      const target = leafPlatformRestPoint(leafPlatformActivity);
      const duration = Math.max(450, Math.abs(target.u - from.u) * 32_000);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        applyRoomPoint(target);
        settle();
        return;
      }
      const start = performance.now();
      roomWalkingRef.current = true;
      setRoomWalking(true);
      setActivityState('roaming');
      if (Math.abs(target.u - from.u) > 0.001) {
        const nextFacing = target.u < from.u ? 'left' : 'right';
        facingRef.current = nextFacing;
        setFacing(nextFacing);
      }
      const step = (now: number) => {
        if (cancelled || !leafPlatformRef.current || draggingRef.current) return;
        const progress = Math.min(1, Math.max(0, (now - start) / duration));
        applyRoomPoint(blendRoomPoint(from, target, progress));
        if (progress < 1) raf = requestAnimationFrame(step);
        else settle();
      };
      raf = requestAnimationFrame(step);
    };
    if (leafPlatformArrivingRef.current) {
      leafPlatformArrivingRef.current = false;
      playTransitionFrames(PLATFORM_LANDING_FRAMES.map(pandaStaticUrl), 'entering', walkWithinPlatform);
    } else if (previous && previous !== leafPlatformActivity) {
      playPixelTransition(previous === 'sleeping' ? 'sleep' : previous === 'playing' ? 'leaf-play' : 'idle', 'waking', walkWithinPlatform);
    } else walkWithinPlatform();
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [applyRoomPoint, isDragging, leafPlatformActivity, pet.stage, playPixelTransition, playTransitionFrames]);

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
    if (!showInteractionBubble || !pandaHanging) return undefined;
    const alignToHanger = () => {
      const hangerRect = hangingOnWindowHook
        ? windowDryingHookRef.current?.getBoundingClientRect()
        : clothesRackRef.current?.getBoundingClientRect();
      const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
      if (!hangerRect || !pandaRect) return;
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const anchorX = hangingOnWindowHook
        ? hangerRect.left + hangerRect.width * 0.5
        : hangerRect.left + hangerRect.width * 0.2;
      const anchorY = hangingOnWindowHook
        ? hangerRect.top + hangerRect.height * 0.72
        : hangerRect.top + hangerRect.height * 0.27;
      const target = unprojectRoomPoint(
        (anchorX / width) * 100,
        ((anchorY + pandaRect.height) / height) * 100,
        width,
        height,
      );
      applyRoomPoint(target);
    };
    alignToHanger();
    window.addEventListener('resize', alignToHanger);
    return () => {
      window.removeEventListener('resize', alignToHanger);
    };
  }, [applyRoomPoint, draggingFurnitureId, hangingOnWindowHook, pandaHanging, roomFurnitureLayout, showInteractionBubble, viewportSize]);

  const startBathDropToTub = useCallback(() => {
    const tubRect = bathTubRef.current?.getBoundingClientRect();
    if (!showInteractionBubble || !tubRect || bathPhaseRef.current !== 'none') return false;
    const track = trackRef.current;
    const trackRect = track?.getBoundingClientRect();
    const petRect = pandaButtonRef.current?.getBoundingClientRect() ?? trackRect;
    const currentCenterX = petRect ? petRect.left + petRect.width / 2 : tubRect.left + tubRect.width / 2;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const bathAnchor = bathPetAnchor(tubRect, trackRect?.height ?? 0, currentCenterX, petRect?.width ?? 0);
    if (track) {
      track.style.setProperty('--bath-start-x', `${bathAnchor.x / width * 100}%`);
      track.style.setProperty('--bath-start-y', `${Math.max(40, tubRect.top - 12) / height * 100}%`);
    }
    const target = unprojectRoomPoint(
      (bathAnchor.x / width) * 100,
      (bathAnchor.y / height) * 100,
      width,
      height,
    );
    applyRoomPoint(target);
    setDampAfterBathNow(false);
    setBathTransition(null);
    setBathExitImage(null);
    setBathEntryShakeFrame(null);
    window.clearTimeout(bathExitTimerRef.current);
    window.clearTimeout(bathDropTimerRef.current);
    setBathPhaseNow('falling');
    bathDropTimerRef.current = window.setTimeout(() => {
      bathDropTimerRef.current = 0;
      if (bathPhaseRef.current === 'falling') {
        setBathPhaseNow('bathing');
        setBathEntryShakeFrame(0);
      }
    }, BATH_DROP_MS);
    return true;
  }, [applyRoomPoint, setBathEntryShakeFrame, setBathPhaseNow, setDampAfterBathNow, showInteractionBubble]);

  const startTrashCanPanda = useCallback(() => {
    if (leafPlatformRef.current) return false;
    if (!showInteractionBubble || hidden || interactionStateRef.current === 'chat' || draggingRef.current
      || sleepingOnBed || sleepingInNest || pandaHangingRef.current || bathPhaseRef.current !== 'none'
      || trashCanPandaPhaseRef.current !== null) return false;
    const panda = pandaButtonRef.current;
    const bin = wasteBinRef.current;
    const pandaRect = panda?.querySelector('.ps-body')?.getBoundingClientRect() ?? panda?.getBoundingClientRect();
    const binRect = bin?.getBoundingClientRect();
    if (!pandaRect || !binRect) return false;

    const point = clampRoomFurnitureCenter(
      pandaRect.left + pandaRect.width / 2,
      pandaRect.top + pandaRect.height / 2,
      binRect.width,
      binRect.height,
      viewportSize.width,
      viewportSize.height,
    );
    const nextLayout = { ...roomFurnitureLayoutRef.current, trashCan: point };
    roomFurnitureLayoutRef.current = nextLayout;
    setRoomFurnitureLayout(nextLayout);
    persistRoomFurnitureLayout(nextLayout);
    setTrashCanPandaAnchor(point);
    setTrashCanPandaFrame(0);
    trashCanPandaPhaseRef.current = 'entering';
    setTrashCanPandaPhase('entering');

    clearActivityTransition();
    setActivityState('roaming');
    setSleepingOnBed(false);
    setSleepingInNest(false);
    setHangingOnRack(false);
    setHangingOnWindowHook(false);
    setRoomWalking(false);
    return true;
  }, [
    clearActivityTransition,
    hidden,
    persistRoomFurnitureLayout,
    setActivityState,
    setRoomWalking,
    showInteractionBubble,
    sleepingInNest,
    sleepingOnBed,
    viewportSize,
  ]);

  const triggerFurnitureCollisionInteraction = useCallback((id: RoomFurnitureId) => {
    if (id !== 'bed' && id !== 'rack' && id !== 'bathStation' && id !== 'trashCan') return;
    if (!showInteractionBubble || hidden || interactionState === 'chat'
      || draggingRef.current || sleepingOnBed || sleepingInNest || pandaHanging
      || bathPhaseRef.current !== 'none') return;

    const panda = pandaButtonRef.current;
    const pandaBodyRect = panda?.querySelector('.ps-body')?.getBoundingClientRect() ?? panda?.getBoundingClientRect();
    const pandaRect = panda?.getBoundingClientRect();
    const furniture = id === 'bed' ? bedRef.current
      : id === 'rack' ? clothesRackRef.current
        : id === 'bathStation' ? bathStationRef.current : wasteBinRef.current;
    const furnitureRect = furniture?.getBoundingClientRect();
    if (!pandaRect || !pandaBodyRect || !furnitureRect) return;
    const overlapping = furnitureRect.left < pandaBodyRect.right
      && furnitureRect.right > pandaBodyRect.left
      && furnitureRect.top < pandaBodyRect.bottom
      && furnitureRect.bottom > pandaBodyRect.top;
    if (!overlapping) return;

    clearActivityTransition();
    setActivityState('roaming');
    setSleepingOnBed(false);
    setSleepingInNest(false);
    setHangingOnRack(false);
    setHangingOnWindowHook(false);
    setRoomWalking(false);

    if (id === 'bed') {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const target = unprojectRoomPoint(
        ((furnitureRect.left + furnitureRect.width * 0.5) / width) * 100,
        ((furnitureRect.top + furnitureRect.height * 0.5 + pandaRect.height * 0.5) / height) * 100,
        width,
        height,
      );
      updateFacing(target.u - positionRef.current.u);
      applyRoomPoint(target);
      setSleepingOnBed(true);
      setActivityState('sleeping');
      playPixelTransition('sleep', 'entering', () => setRoomWalking(false));
    } else if (id === 'rack') {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const rackRodY = furnitureRect.top + furnitureRect.height * 0.27;
      const pandaCenterX = pandaRect.left + pandaRect.width / 2;
      const hangX = Math.min(
        furnitureRect.left + furnitureRect.width * 0.76,
        Math.max(furnitureRect.left + furnitureRect.width * 0.24, pandaCenterX),
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
    } else if (id === 'trashCan') {
      startTrashCanPanda();
    } else {
      startBathDropToTub();
    }
  }, [
    applyRoomPoint,
    clearActivityTransition,
    pandaHanging,
    hidden,
    interactionState,
    playPixelTransition,
    setActivityState,
    setRoomWalking,
    showInteractionBubble,
    sleepingInNest,
    sleepingOnBed,
    startBathDropToTub,
    startTrashCanPanda,
    updateFacing,
  ]);
  furnitureCollisionActionRef.current = triggerFurnitureCollisionInteraction;

  useEffect(() => {
    if (!showInteractionBubble || !dampAfterBath || !pandaHanging) {
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
  }, [dampAfterBath, pandaHanging, showInteractionBubble]);

  useEffect(() => {
    const { wet, onWindowHook, driesAt } = bathBallDrying;
    if (!wet || !onWindowHook || driesAt === null) {
      setBathBallDrySecondsRemaining(0);
      return undefined;
    }
    const updateRemaining = () => setBathBallDrySecondsRemaining(
      Math.max(0, Math.ceil((driesAt - Date.now()) / 1000)),
    );
    updateRemaining();
    const countdown = window.setInterval(updateRemaining, 150);
    const dryTimer = window.setTimeout(() => {
      setBathBallDryingNow(finishBathBallDrying(bathBallDryingRef.current));
    }, Math.max(0, driesAt - Date.now()));
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(dryTimer);
    };
  }, [bathBallDrying, setBathBallDryingNow]);

  useEffect(() => {
    const previous = previousBathPhaseRef.current;
    previousBathPhaseRef.current = bathPhase;
    if (previous !== 'bathing' || bathPhase !== 'none') return;
    setBathBallDryingNow(wetBathBall());
    const tubRect = bathTubRef.current?.getBoundingClientRect();
    if (!tubRect) return;
    const position = getBathBallSpawnPosition(tubRect, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    bathBallOriginRef.current = position;
    setBathBallPosition(position);
    setBathBallPlaced(false);
    setBathRubbing(false);
  }, [bathPhase, setBathBallDryingNow]);

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

  const spawnBathBallBesideTub = useCallback(() => {
    if (bathPhaseRef.current !== 'bathing') return false;
    const tubRect = bathTubRef.current?.getBoundingClientRect();
    if (!tubRect) return false;
    const position = getBathBallSpawnPosition(tubRect, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    bathRubMsRef.current = 0;
    bathBallOriginRef.current = position;
    setBathBallPosition(position);
    setBathBallPlaced(false);
    setBathRubbing(false);
    return true;
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || !developerEvent || !showInteractionBubble
      || interactionStateRef.current === 'chat') return;
    if (leafPlatformRef.current && !developerEvent.event.startsWith('leaf-platform')) return;
    if (developerEvent.event.startsWith('leaf-platform')) {
      if (handledLeafPlatformEventRef.current === developerEvent.token) return;
      handledLeafPlatformEventRef.current = developerEvent.token;
    }
    // A preview is a one-shot request. Changing pose/callbacks must not put a
    // pet back to sleep after the user has already woken it.
    if (developerEvent.event === 'dream') {
      if (handledDreamPreviewRef.current === developerEvent.token) return;
      handledDreamPreviewRef.current = developerEvent.token;
    }
    if (developerEvent.event === 'plush-play') {
      if (handledPlushPreviewRef.current === developerEvent.token) return;
      handledPlushPreviewRef.current = developerEvent.token;
    }
    window.clearTimeout(developerEventTimerRef.current);
    developerEventTimerRef.current = 0;
    setDeveloperGrab(false);
    clearActivityTransition();
    setActivityState('roaming');
    setSleepingOnBed(false);
    setRoomWalking(false);

    switch (developerEvent.event) {
      case 'leaf-platform':
        enterLeafPlatform();
        break;
      case 'plush-play':
        setActivityState('plush-play');
        playPixelTransition('plush-play', 'entering', () => setRoomWalking(false));
        break;
      case 'fever':
        setRoomWalking(false);
        break;
      case 'leaf-platform-sleep':
        enterLeafPlatform('sleeping');
        break;
      case 'leaf-platform-play':
        enterLeafPlatform('playing');
        break;
      case 'leaf-platform-sit':
        enterLeafPlatform('sitting');
        break;
      case 'dream':
        setDreamPreviewToken(developerEvent.token);
        setActivityState('sleeping');
        break;
      case 'punch':
        startPunchReaction();
        break;
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
        lastWorldFallAtRef.current = performance.now();
        worldFallPhaseRef.current = 'falling';
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
      case 'jar-peeking': {
        const jarPoint = roomPointAtImagePosition(258, 226);
        applyRoomPoint(jarPoint);
        setRoomWalking(false);
        // The panda stays in the jar until the player drags it out.
        setPandaJarTrapped(true);
        break;
      }
      case 'trash-can':
        startTrashCanPanda();
        break;
      case 'truth-potion-comfort':
        truthPotionComfortStartRef.current?.();
        break;
      case 'toy-teaser':
      case 'toy-curious':
      case 'toy-brake':
      case 'toy-wall-dizzy':
      case 'toy-laser': {
        const toy = developerEvent.event === 'toy-laser' ? 'laser' : 'teaser';
        const runtime = createToyRuntime(performance.now());
        if (developerEvent.event === 'toy-curious' || developerEvent.event === 'toy-teaser') shakeToy(runtime, performance.now());
        if (developerEvent.event === 'toy-teaser') runtime.phase = 'excited';
        if (developerEvent.event === 'toy-brake') { runtime.phase = 'brake'; runtime.slideFrom = { ...positionRef.current }; runtime.velocity = { u: 1, v: 0 }; }
        if (developerEvent.event === 'toy-wall-dizzy') runtime.phase = 'dizzy';
        toyRuntimeRef.current = runtime;
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
        }, 5000);
        break;
      }
    }
  }, [applyRoomPoint, clearActivityTransition, developerEvent, enterLeafPlatform, setFrame, showInteractionBubble, startBathDropToTub, startDeveloperBathRub, startFlyChase, startTrashCanPanda, triggerStartle, startPunchReaction]);

  useEffect(() => {
    if (trashCanPandaPhase !== 'entering' && trashCanPandaPhase !== 'exiting') return undefined;
    const entering = trashCanPandaPhase === 'entering';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (entering) {
        trashCanPandaPhaseRef.current = 'trapped';
        setTrashCanPandaFrame(TRASH_CAN_ENTER_FRAME_COUNT);
        setTrashCanPandaPhase('trapped');
      } else {
        trashCanPandaPhaseRef.current = null;
        setTrashCanPandaPhase(null);
        setTrashCanPandaAnchor(null);
        setTrashCanPandaFrame(0);
      }
      return undefined;
    }
    const frameCount = entering ? TRASH_CAN_ENTER_FRAME_COUNT : TRASH_CAN_EXIT_FRAME_COUNT;
    const frameInterval = entering
      ? animationManifest.frameIntervalMs['trash-can-enter']
      : animationManifest.frameIntervalMs['trash-can-exit'];
    let nextFrame = 0;
    const advance = () => {
      nextFrame += 1;
      setTrashCanPandaFrame(nextFrame);
      if (nextFrame >= frameCount) {
        if (entering) {
          trashCanPandaPhaseRef.current = 'trapped';
          setTrashCanPandaPhase('trapped');
        } else {
          trashCanPandaPhaseRef.current = null;
          setTrashCanPandaPhase(null);
          setTrashCanPandaAnchor(null);
          setTrashCanPandaFrame(0);
        }
        trashCanPandaAnimationTimerRef.current = 0;
        return;
      }
      trashCanPandaAnimationTimerRef.current = window.setTimeout(advance, frameInterval);
    };
    trashCanPandaAnimationTimerRef.current = window.setTimeout(advance, frameInterval);
    return () => {
      window.clearTimeout(trashCanPandaAnimationTimerRef.current);
      trashCanPandaAnimationTimerRef.current = 0;
    };
  }, [trashCanPandaPhase]);

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
        const returnPoint = nearestWalkableRoomPoint({
          ...positionRef.current,
          u: 0.08,
          v: Math.min(positionRef.current.v, ROOM_OUTSIDE_BOUNDARY_V - 0.04),
          elevation: 0,
        });
        applyRoomPoint(returnPoint);
        facingRef.current = 'right';
        setFacing('right');
        setWorldFallPhase('returning');
      }, WORLD_AWAY_MS);
    } else if (worldFallPhase === 'returning') {
      timer = window.setTimeout(() => {
        const outcome = onWorldFallReturned?.();
        setWorldFallPhase(outcome === undefined || outcome === 'dirty' ? 'dirty' : 'none');
      }, WORLD_RETURN_MS);
    }

    return () => window.clearTimeout(timer);
  }, [applyRoomPoint, onWorldFallReturned, showInteractionBubble, worldFallPhase]);

  useEffect(() => {
    if (showInteractionBubble && worldEcology?.dirtySince !== undefined && worldFallPhaseRef.current === 'none') {
      setWorldFallPhase('dirty');
    }
  }, [showInteractionBubble, worldEcology?.dirtySince]);

  useEffect(() => {
    if (showInteractionBubble && bathPhase !== 'none' && worldFallPhaseRef.current === 'dirty') {
      onPetWashed?.();
    }
  }, [bathPhase, onPetWashed, showInteractionBubble, worldEcology?.dirtySince]);

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
          && !pandaHangingRef.current
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
          && !pandaHangingRef.current
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
      if (bathBallDrying.wet || bathBallDrying.onWindowHook) {
        const hookRect = bathBallDrying.onWindowHook
          ? windowDryingHookRef.current?.getBoundingClientRect()
          : undefined;
        const tubRect = !hookRect ? bathTubRef.current?.getBoundingClientRect() : undefined;
        const position = hookRect
          ? getBathBallWindowHookPosition(hookRect)
          : tubRect ? getBathBallSpawnPosition(tubRect, { width: window.innerWidth, height: window.innerHeight }) : null;
        if (position) {
          bathBallOriginRef.current = position;
          setBathBallPosition(position);
        } else setBathBallPosition(null);
      } else setBathBallPosition(null);
      setBathBallPlaced(false);
      setBathRubbing(false);
      bathBallDragRef.current = null;
      bathBallOriginRef.current = null;
      return;
    }
    if (bathBallDrying.wet) {
      const hookRect = bathBallDrying.onWindowHook
        ? windowDryingHookRef.current?.getBoundingClientRect()
        : undefined;
      const tubRect = !hookRect ? bathTubRef.current?.getBoundingClientRect() : undefined;
      const position = hookRect
        ? getBathBallWindowHookPosition(hookRect)
        : tubRect ? getBathBallSpawnPosition(tubRect, { width: window.innerWidth, height: window.innerHeight }) : null;
      if (position) {
        bathBallOriginRef.current = position;
        setBathBallPosition(position);
      }
      setBathBallPlaced(false);
      setBathRubbing(false);
      return;
    }
    if (bathBallDrying.onWindowHook) {
      setBathBallDryingNow({ wet: false, onWindowHook: false, driesAt: null });
    }
    setBathRubbing(false);
    setBathBallPosition(null);
    setBathBallPlaced(false);
    const autoBall = window.setTimeout(() => {
      if (bathPhaseRef.current !== 'bathing' || !spawnBathBallBesideTub()) return;
      setBathBallDropping(true);
      bathBallDropTimerRef.current = window.setTimeout(() => {
        bathBallDropTimerRef.current = 0;
        setBathBallDropping(false);
      }, BATH_BALL_DROP_MS);
    }, 700);
    return () => window.clearTimeout(autoBall);
  }, [bathBallDrying, bathPhase, setBathBallDryingNow, setBathPhaseNow, showInteractionBubble, spawnBathBallBesideTub]);

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

  const bathEntryShakeActive = bathEntryShakeFrame !== null;
  useEffect(() => {
    if (bathPhase !== 'bathing' || !bathEntryShakeActive) return undefined;
    const timer = window.setInterval(() => {
      setBathEntryShakeFrame(current => current === null || current >= BATH_ENTRY_SHAKE_FRAME_COUNT
        ? null
        : current + 1);
    }, BATH_ENTRY_SHAKE_FRAME_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [bathEntryShakeActive, bathPhase]);

  useEffect(() => {
    if (bathPhase !== 'bathing') setBathEntryShakeFrame(null);
  }, [bathPhase]);

  const beginWorldFall = useCallback((source: 'idle' | 'boundary') => {
    if (leafPlatformRef.current) return false;
    if (source !== 'idle') return false;
    const phase = worldFallPhaseRef.current;
    if (!showInteractionBubble || pandaJarTrapped || phase !== 'none'
      || bathPhaseRef.current !== 'none' || pandaHangingRef.current || draggingRef.current || hidden
      || pet.stage !== 'present'
      || document.visibilityState !== 'visible'
      || dampAfterBath || interactionStateRef.current !== 'roaming'
      || activityStateRef.current !== 'roaming' || developerPose || isCuddling || reacting || startled) return false;
    lastWorldFallAtRef.current = performance.now();
    worldFallPhaseRef.current = 'falling';
    roomWalkingRef.current = false;
    setRoomWalking(false);
    setWorldFallMessageVisible(true);
    setWorldFallPhase('falling');
    return true;
  }, [dampAfterBath, developerPose, hidden, isCuddling, pandaJarTrapped, pet.stage, reacting, showInteractionBubble, startled]);
  worldFallBoundaryTriggerRef.current = () => false;

  useEffect(() => {
    if (!showInteractionBubble || hidden || developerEvent || pandaJarTrapped
      || worldFallPhase !== 'none' || pet.stage !== 'present') return undefined;
    const timer = window.setInterval(() => {
      const canFallNow = !feverish && document.visibilityState === 'visible'
        && interactionStateRef.current === 'roaming'
        && activityStateRef.current === 'roaming'
        && bathPhaseRef.current === 'none'
        && !pandaHangingRef.current
        && !draggingRef.current
        && !hidden
        && !dampAfterBathRef.current
        && !developerPoseRef.current
        && !isCuddling
        && !reacting
        && !startledRef.current
        && !pandaJarTrapped
        && !leafPlatformRef.current;
      if (!canFallNow || !onTryIdleWorldFall?.()) return;
      beginWorldFall('idle');
    }, 1000);
    return () => window.clearInterval(timer);
  }, [beginWorldFall, developerEvent, feverish, hidden, isCuddling, onTryIdleWorldFall, pandaJarTrapped, pet.stage, reacting, showInteractionBubble, startled, worldFallPhase]);

  useEffect(() => {
    if (!showInteractionBubble || !onPlaceSpacePolicePoop) return undefined;
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
  }, [activeWasteLetters, onPlaceSpacePolicePoop, showInteractionBubble]);

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
    if (nextActivity === 'plush-play' && dirtyReturn) return false;
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
      if (nextActivity === 'peeking' || nextActivity === 'plush-play') {
        playPixelTransition(nextActivity, 'entering', () => setRoomWalking(false));
        return;
      }
      setActivityTransition('entering');
      activityTransitionTimerRef.current = window.setTimeout(() => {
        activityTransitionTimerRef.current = 0;
        setActivityTransition(null);
      }, ACTIVITY_POSE_MS);
    }, ACTIVITY_SETTLE_MS);
    return true;
  }, [clearActivityTransition, dampAfterBath, dirtyReturn, playPixelTransition, showInteractionBubble]);

  const wakeFromCatTreeNest = useCallback(() => {
    window.clearTimeout(catTreeSleepTimerRef.current);
    catTreeSleepTimerRef.current = 0;
    clearActivityTransition();
    playPixelTransition('sleep', 'waking', () => {
      sleepingInNestRef.current = false;
      setSleepingInNest(false);
      setSleepingOnBed(false);
      setActivityState('roaming');
      setRoomWalking(false);
    });
  }, [clearActivityTransition, playPixelTransition]);

  const enterCatTreeSleep = useCallback(() => {
    if (!showInteractionBubble) return;
    window.clearTimeout(catTreeSleepTimerRef.current);
    catTreeSleepTimerRef.current = 0;
    clearActivityTransition();
    sleepingInNestRef.current = true;
    setSleepingInNest(true);
    setSleepingOnBed(false);
    applyRoomPoint(CAT_TREE_NEST_POINT);
    setActivityState('sleeping');
    setRoomWalking(false);
    playPixelTransition('sleep', 'entering', () => {
      if (!sleepingInNestRef.current) return;
      catTreeSleepTimerRef.current = window.setTimeout(() => {
        catTreeSleepTimerRef.current = 0;
        if (!sleepingInNestRef.current) return;
        lastCatTreeNapAtRef.current = performance.now();
        wakeFromCatTreeNest();
      }, CAT_TREE_SLEEP_MS);
    });
  }, [applyRoomPoint, clearActivityTransition, playPixelTransition, showInteractionBubble, wakeFromCatTreeNest]);

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
    if (sprite === 'potion-comfort') {
      setFrame(0);
      return;
    }
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
    const isJarPeeking = sprite === 'jar-peeking';
    const isTransitioningFrames = activityTransition === 'frames-entering' || activityTransition === 'frames-waking';
    const waitingForSnack = pet.stage === 'performing' && pet.action === 'bamboo' && bambooPhase !== 'eating';
    const start = () => {
      if (hidden || (interactionState === 'chat' && !isCapturedHomecoming && !isJarPeeking && !pet.actionPreview) || document.visibilityState === 'hidden' || motionPreference.matches || timer
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
      || interactionState === 'chat' || sleepingOnBed || sleepingInNest) return;
    return scheduleActivityReset(activityState, finishActivity);
  }, [activityState, developerPose, finishActivity, interactionState, showInteractionBubble, sleepingInNest, sleepingOnBed]);

  const exitChat = () => {
    if (interactionStateRef.current !== 'chat') return;
    window.clearTimeout(chatIdleTimerRef.current);
    chatIdleTimerRef.current = 0;
    window.clearTimeout(truthPotionInvitationTimerRef.current);
    truthPotionInvitationTimerRef.current = 0;
    setTruthPotionInvitationVisible(false);
    setTruthPotionComfortPhase(null);
    truthPotionComfortStartedRef.current = false;
    clearActivityTransition();
    setActivityState('roaming');
    roomWalkingRef.current = false;
    setRoomWalking(false);
    interactionStateRef.current = 'roaming';
    setInteractionState('roaming');
    onChatModeChange?.(false);
  };

  const enterChatAfterTruthPotion = () => {
    if (!truthPotionComfortStartedRef.current) return;
    recordDebug('喂食药药药后进入聊天');
    window.clearTimeout(reactionTimerRef.current);
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

  const startTruthPotionComfort = useCallback(() => {
    if (leafPlatformRef.current) return false;
    if (!showInteractionBubble || hidden || pet.stage !== 'present'
      || interactionStateRef.current === 'chat' || truthPotionComfortStartedRef.current
      || pandaJarTrapped || pandaHangingRef.current || draggingRef.current
      || bathPhaseRef.current !== 'none' || worldFallPhaseRef.current !== 'none') return false;

    truthPotionComfortStartedRef.current = true;
    onDrinkTruthPotion?.();
    window.clearTimeout(truthPotionInvitationTimerRef.current);
    truthPotionInvitationTimerRef.current = 0;
    window.cancelAnimationFrame(truthPotionComfortRafRef.current);
    truthPotionComfortRafRef.current = 0;
    setTruthPotionInvitationVisible(false);
    setTruthPotionComfortPhase('walking');
    setActivityState('roaming');
    setSleepingOnBed(false);
    setSleepingInNest(false);
    clearActivityTransition();

    const destination = nearestWalkableRoomPoint({ u: 0.5, v: 0.06 });
    const start = nearestWalkableRoomPoint(positionRef.current);
    const route = planRoomWalkPath(start, destination);
    const pathLength = roomWalkPathLength(route);

    const arriveAndListen = () => {
      truthPotionComfortRafRef.current = 0;
      roomWalkingRef.current = false;
      setRoomWalking(false);
      applyRoomPoint(destination);
      setFrame(0);
      setTruthPotionComfortPhase('settling');
      setTruthPotionInvitationVisible(true);
      enterChatAfterTruthPotion();
      truthPotionInvitationTimerRef.current = window.setTimeout(() => {
        truthPotionInvitationTimerRef.current = 0;
        setTruthPotionInvitationVisible(false);
      }, 5200);
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || route.length < 2 || pathLength < 0.01) {
      arriveAndListen();
      return true;
    }

    roomWalkingRef.current = true;
    setRoomWalking(true);
    const duration = Math.max(1000, Math.min(3600, pathLength * 4200));
    const stepCount = Math.max(6, Math.round(duration / 170));
    const startedAt = performance.now();
    let previousPoint = start;
    const advance = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const point = pointAlongRoomWalkPath(route, gaitProgress(progress, stepCount));
      updateFacing(point.u - previousPoint.u);
      previousPoint = point;
      applyRoomPoint(point);
      if (progress >= 1) {
        arriveAndListen();
        return;
      }
      truthPotionComfortRafRef.current = window.requestAnimationFrame(advance);
    };
    truthPotionComfortRafRef.current = window.requestAnimationFrame(advance);
    return true;
  }, [applyRoomPoint, clearActivityTransition, enterChatAfterTruthPotion, hidden, onDrinkTruthPotion, pandaJarTrapped, pet.stage, setFrame, showInteractionBubble, updateFacing]);
  truthPotionComfortStartRef.current = startTruthPotionComfort;

  const handlePandaClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (leafPlatformRef.current) return;
    if (worldFallPhase !== 'none' && worldFallPhase !== 'dirty') return;
    if (capturedHomecoming) onCapturedHomecomingInteraction?.();
    if (suppressClickAfterDragRef.current) {
      suppressClickAfterDragRef.current = false;
      recordDebug('拖拽结束，忽略随后的点击');
      return;
    }
    if (startledRef.current || dizzyPhase !== 'none') return;
    onPlayerAttention?.();
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
      window.clearTimeout(reactionTimerRef.current);
      window.clearTimeout(catTreeSleepTimerRef.current);
      catTreeSleepTimerRef.current = 0;
      if (sleepingInNestRef.current) lastCatTreeNapAtRef.current = now;
      sleepingInNestRef.current = false;
      reactionTimerRef.current = 0;
      wakeClickIgnoreUntilRef.current = now + WAKE_CLICK_COOLDOWN_MS;
      setReacting(false);
      clearActivityTransition();
      setRoomWalking(false);
      setSleepingOnBed(false);
      setSleepingInNest(false);
      setActivityState('roaming');
      if (motion === 'sleep') setNightWakeOverride(true);
      recordDebug('睡觉中被点击：触发点击反应，不进入聊天');
      if (!startPunchReaction()) triggerStartle();
      return;
    }
    window.clearTimeout(reactionTimerRef.current);
    if (!startPunchReaction()) {
      setReacting(true);
      onCareInteraction?.('bond');
      reactionTimerRef.current = window.setTimeout(() => {
        reactionTimerRef.current = 0;
        setReacting(false);
      }, REACTION_DURATION_MS);
    }
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
    if (leafPlatformRef.current) return;
    if (event.pointerType !== 'mouse' || !showInteractionBubble || pet.stage !== 'present'
      || interactionStateRef.current !== 'roaming' || hidden || isSleeping || isDragging || isPressPending
      || developerGrab || pandaHanging || bathPhaseRef.current !== 'none' || startledRef.current
      || dizzyPhase !== 'none' || pandaJarTrapped || worldFallPhase !== 'none' || dirtyReturn || developerPose
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
    onPlayerAttention?.();
    if (hoverCuddleActive) {
      window.clearTimeout(hoverCuddleTimerRef.current);
      hoverCuddleTimerRef.current = 0;
      setHoverCuddleActive(false);
      clearActivityTransition();
    }
    if (capturedHomecoming) onCapturedHomecomingInteraction?.();
    if (sleepingInNestRef.current) {
      window.clearTimeout(catTreeSleepTimerRef.current);
      catTreeSleepTimerRef.current = 0;
    }
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
      const platformModeOnPickup = leafPlatformRef.current;
      if (platformModeOnPickup) {
        releaseLeafPlatform();
        onLeafPlatformChange?.(false);
      }
      activeDrag.grabbedAt = performance.now();
      activeDrag.motion = createGrabMotionStats(activeDrag.grabbedAt);
      activeDrag.holdTimer = 0;
      draggingRef.current = true;
      suppressClickAfterDragRef.current = true;
      window.clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = 0;
      window.clearTimeout(startleTimerRef.current);
       window.clearTimeout(bathExitTimerRef.current);
       bathExitTimerRef.current = 0;
       if (bathTransition === 'exiting') {
         setBathTransition(null);
         setBathExitImage(null);
       }
      startleTimerRef.current = 0;
      startledRef.current = false;
      setStartled(false);
      setReacting(false);
      setIsPressPending(false);
      setIsDragging(true);
      if (pandaHangingRef.current && dampAfterBathRef.current && dampDryingReadyRef.current) {
        setDampAfterBathNow(false);
        onPetDried?.();
      }
      setHangingOnRack(false);
      setHangingOnWindowHook(false);
      clearActivityTransition();
      setActivityState('roaming');
      setSleepingOnBed(false);
      window.clearTimeout(catTreeSleepTimerRef.current);
      catTreeSleepTimerRef.current = 0;
      if (sleepingInNestRef.current) lastCatTreeNapAtRef.current = performance.now();
      sleepingInNestRef.current = false;
      setSleepingInNest(false);
      if (bathPhaseRef.current === 'bathing') {
        activeDrag.liftedFromBath = true;
        onCareInteraction?.('health');
         const exitImage = dirtyReturn
           ? bathRubbing ? dirtyBathingRubbingFrameUrl(bathFrame) : dirtyBathingFrameUrl(bathFrame)
           : bathRubbing ? bathingRubbingFrameUrl(bathFrame) : bathingFrameUrl(bathFrame);
         setBathExitImage(exitImage);
         setBathTransition('exiting');
         bathExitTimerRef.current = window.setTimeout(() => {
           bathExitTimerRef.current = 0;
           setBathTransition(null);
           setBathExitImage(null);
         }, 380);
        setBathPhaseNow('none');
        setDampAfterBathNow(true);
        if (worldFallPhase !== 'none') setWorldFallPhase('none');
      }
      if (motion === 'sleep') setNightWakeOverride(true);
      if (platformModeOnPickup) {
        playPixelTransition(platformModeOnPickup === 'sleeping' ? 'sleep' : platformModeOnPickup === 'playing' ? 'leaf-play' : 'idle', 'waking', () => {
          if (!draggingRef.current) return;
          playTransitionFrames(PLATFORM_LANDING_FRAMES.map(pandaStaticUrl), 'waking', () => {});
        });
      }
      setRoomWalking(false);
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      setPandaDragScreenPosition(clampPandaDragScreenPosition(
        activeDrag.currentX + activeDrag.offsetX,
        activeDrag.currentY + activeDrag.offsetY,
        width,
        height,
      ));
      const x = ((activeDrag.currentX + activeDrag.offsetX) / width) * 100;
      const y = ((activeDrag.currentY + activeDrag.offsetY) / height) * 100;
      applyRoomPoint(unprojectRoomWalkableSurfacePoint(x, y, width, height));
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
    setPandaDragScreenPosition(clampPandaDragScreenPosition(
      event.clientX + drag.offsetX,
      event.clientY + drag.offsetY,
      width,
      height,
    ));
    const x = ((event.clientX + drag.offsetX) / width) * 100;
    const y = ((event.clientY + drag.offsetY) / height) * 100;
    const point = unprojectRoomWalkableSurfacePoint(x, y, width, height);
    updateFacing(point.u - positionRef.current.u);
    applyRoomPoint(point);
    if (pandaJarTrapped) {
      const jarRect = bambooJarRef.current?.getBoundingClientRect();
      const pandaHeight = pandaButtonRef.current?.getBoundingClientRect().height ?? 0;
      const pandaCenter = {
        x: event.clientX + drag.offsetX,
        y: event.clientY + drag.offsetY - pandaHeight / 2,
      };
      if (jarRect && !isPandaCenterInsideJar(pandaCenter, jarRect)) {
        setPandaJarTrapped(false);
      }
    }
  };

  const finishPandaPointer = (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = dragPointerRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const rackRect = clothesRackRef.current?.getBoundingClientRect();
    const hookRect = windowDryingHookRef.current?.getBoundingClientRect();
    const jarRect = bambooJarRef.current?.getBoundingClientRect();
    const tubRect = bathTubRef.current?.getBoundingClientRect();
    const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
    const pandaCenterX = pandaRect ? pandaRect.left + pandaRect.width / 2 : Number.NaN;
    const pandaCenterY = pandaRect ? pandaRect.top + pandaRect.height / 2 : Number.NaN;
    const droppedIntoNest = drag.grabbed && !cancelled && showInteractionBubble
      && pandaRect !== undefined
      && isCatTreeNestScreenPoint(pandaCenterX, pandaCenterY, window.innerWidth, window.innerHeight);
    const droppedOntoLeafPlatform = drag.grabbed && !cancelled && showInteractionBubble
      && pandaRect !== undefined
      // Pointer-up may arrive before React paints the final dragged sprite position.
      // Use release coordinates, never a potentially stale drawn center.
      && (isLeafPlatformScreenPoint(event.clientX, event.clientY, window.innerWidth, window.innerHeight)
        || isLeafPlatformScreenPoint(event.clientX + drag.offsetX,
          event.clientY + drag.offsetY - pandaRect.height / 2, window.innerWidth, window.innerHeight));
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
    const droppedOntoWindowHook = drag.grabbed && !cancelled && showInteractionBubble
      && hookRect !== undefined && pandaRect !== undefined
      && pandaCenterX >= hookRect.left - 28 && pandaCenterX <= hookRect.right + 28
      && pandaCenterY >= hookRect.top - 24 && pandaCenterY <= hookRect.bottom + 30;
    const droppedIntoJar = drag.grabbed && !cancelled && showInteractionBubble
      && jarRect !== undefined && pandaRect !== undefined
      && isPandaCenterInsideJar({ x: pandaCenterX, y: pandaCenterY }, jarRect);
    const roomImageScale = Math.min(window.innerWidth / ROOM_IMAGE_WIDTH, window.innerHeight / ROOM_IMAGE_HEIGHT);
    const roomImageLeft = (window.innerWidth - ROOM_IMAGE_WIDTH * roomImageScale) / 2;
    const roomImageTop = (window.innerHeight - ROOM_IMAGE_HEIGHT * roomImageScale) / 2;
    const pandaImageX = (pandaCenterX - roomImageLeft) / Math.max(0.001, roomImageScale);
    const pandaImageY = (pandaCenterY - roomImageTop) / Math.max(0.001, roomImageScale);
    const droppedOutsideRoomImage = pandaRect !== undefined
      && (pandaImageX < 0 || pandaImageX > ROOM_IMAGE_WIDTH || pandaImageY < 0 || pandaImageY > ROOM_IMAGE_HEIGHT);
    if (drag.holdTimer) window.clearTimeout(drag.holdTimer);
    dragPointerRef.current = null;
    setPandaDragScreenPosition(null);
    setIsPressPending(false);
    if (drag.grabbed) {
      const now = performance.now();
      const triggeredDizzyDrop = showInteractionBubble && drag.pointerType === 'mouse' && !cancelled
        && qualifiesAsWildGrab(drag.motion, drag.grabbedAt, now, window.innerWidth, window.innerHeight);
      draggingRef.current = false;
      if (trackRef.current && showInteractionBubble) trackRef.current.style.zIndex = '240';
      suppressClickAfterDragRef.current = !cancelled;
      setIsDragging(false);
      clearActivityTransition();
      setActivityState('roaming');
      setSleepingOnBed(false);
      setSleepingInNest(false);
      setRoomWalking(false);
      if (!cancelled && pandaJarTrapped && !droppedIntoJar) setPandaJarTrapped(false);
      if (droppedOntoLeafPlatform) {
        enterLeafPlatform();
      } else if (droppedIntoNest) {
        enterCatTreeSleep();
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
        setHangingOnWindowHook(false);
        setRoomWalking(false);
      } else if (droppedOntoWindowHook && hookRect && pandaRect) {
        const width = Math.max(1, window.innerWidth);
        const height = Math.max(1, window.innerHeight);
        const target = unprojectRoomPoint(
          ((hookRect.left + hookRect.width * 0.5) / width) * 100,
          ((hookRect.top + hookRect.height * 0.72 + pandaRect.height) / height) * 100,
          width,
          height,
        );
        updateFacing(target.u - positionRef.current.u);
        applyRoomPoint(target);
        setHangingOnRack(true);
        setHangingOnWindowHook(true);
        setRoomWalking(false);
      } else if (droppedIntoJar) {
        applyRoomPoint(bambooJarRoomPoint);
        // Re-entering the jar always requires another deliberate drag to get out.
        setPandaJarTrapped(true);
        setRoomWalking(false);
      } else if (droppedIntoTub && tubRect) {
        startBathDropToTub();
      } else if (triggeredDizzyDrop) {
        setFrame(0);
        setDizzyPhase('falling');
      }
      if (showInteractionBubble && !cancelled && !droppedIntoNest && !droppedOntoRack
        && !droppedOntoWindowHook && !droppedIntoJar && !droppedIntoTub
        && (droppedOutsideRoomImage || !isWalkableRoomPoint(positionRef.current))) {
        applyRoomPoint(nearestWalkableRoomPoint({
          u: positionRef.current.u,
          v: positionRef.current.v,
        }));
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
    try {
      window.localStorage.setItem(ROOM_PROPS_KEY, JSON.stringify(placedProps));
      window.dispatchEvent(new CustomEvent('panda-coop-room-change', { detail: {
        furnitureLayout: roomFurnitureLayoutRef.current,
        placedProps,
      } }));
    } catch { /* storage unavailable */ }
  }, [placedProps]);

  useEffect(() => {
    const receiveSharedRoom = (event: Event) => {
      const shared = (event as CustomEvent<{
        furnitureLayout?: RoomFurnitureLayout;
        placedProps?: Record<string, boolean>;
      }>).detail;
      if (!shared) return;
      const layout = shared.furnitureLayout ?? roomFurnitureLayoutRef.current;
      const props = shared.placedProps ?? {};
      try {
        writeRoomFurnitureLayout(window.localStorage, layout);
        window.localStorage.setItem(ROOM_PROPS_KEY, JSON.stringify(props));
      } catch (error) { console.error('Could not apply the shared room state.', error); }
      roomFurnitureLayoutRef.current = layout;
      setRoomFurnitureLayout(layout);
      setPlacedProps(current => normalizeRoomProps({ ...current, ...props }));
    };
    window.addEventListener('panda-coop-shared-state', receiveSharedRoom);
    return () => window.removeEventListener('panda-coop-shared-state', receiveSharedRoom);
  }, []);

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
    if (!showInteractionBubble) {
      syncBathOcclusion();
      return;
    }
    for (const element of [clothesRackRef.current, bedRef.current, bathStationRef.current]) {
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      const depth = unprojectRoomPoint(
        ((rect.left + rect.width / 2) / Math.max(1, window.innerWidth)) * 100,
        (rect.bottom / Math.max(1, window.innerHeight)) * 100,
        window.innerWidth,
        window.innerHeight,
      ).v;
      element.style.zIndex = String(roomFurnitureZIndex(depth) + 1);
    }
    const pandaTrack = trackRef.current;
    if (pandaTrack) pandaTrack.style.zIndex = draggingRef.current ? '260' : hangingOnClothesRack ? '241' : '240';
    syncRackOcclusion();
    if (sleepingOnBed) {
      const bedRect = bedRef.current?.getBoundingClientRect();
      const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
      if (bedRect && pandaRect) {
        applyRoomPoint(unprojectRoomPoint(
          ((bedRect.left + bedRect.width * 0.5) / Math.max(1, window.innerWidth)) * 100,
          ((bedRect.top + bedRect.height * 0.5 + pandaRect.height * 0.5) / Math.max(1, window.innerHeight)) * 100,
          window.innerWidth,
          window.innerHeight,
        ));
      }
    }
    if (bathPhaseRef.current === 'bathing') {
      const stationRect = bathStationRef.current?.getBoundingClientRect();
      const tubRect = bathTubRef.current?.getBoundingClientRect();
      const petRect = pandaButtonRef.current?.getBoundingClientRect();
      const trackRect = trackRef.current?.getBoundingClientRect();
      if (stationRect && tubRect && petRect) {
        const { x: screenX, y: screenY } = bathPetAnchor(
          tubRect,
          trackRect?.height ?? 0,
          petRect.left + petRect.width / 2,
          petRect.width,
        );
        const target = unprojectRoomPoint(
          (screenX / Math.max(1, window.innerWidth)) * 100,
          (screenY / Math.max(1, window.innerHeight)) * 100,
          window.innerWidth,
          window.innerHeight,
        );
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
    syncBathOcclusion();
  }, [applyRoomPoint, bathPhase, draggingFurnitureId, hangingOnClothesRack, hidden, placedProps, roomFurnitureLayout, showInteractionBubble, sleepingOnBed, syncBathOcclusion, syncRackOcclusion, viewportSize, worldAway, worldFallMessageVisible]);

  useEffect(() => {
    if (!showInteractionBubble || bathPhase !== 'falling') return undefined;
    let animationFrame = 0;
    const syncDuringPlunge = () => {
      syncBathOcclusion();
      animationFrame = window.requestAnimationFrame(syncDuringPlunge);
    };
    animationFrame = window.requestAnimationFrame(syncDuringPlunge);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [bathPhase, showInteractionBubble, syncBathOcclusion]);

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
      toyDragRef.current = null;
      setToyDragging(false);
      return undefined;
    }
    const runtime = createToyRuntime(performance.now());
    const preview = developerEvent?.event;
    if (preview === 'toy-curious' || preview === 'toy-teaser') shakeToy(runtime, performance.now());
    if (preview === 'toy-teaser') runtime.phase = 'excited';
    if (preview === 'toy-brake') { runtime.phase = 'brake'; runtime.slideFrom = { ...positionRef.current }; runtime.velocity = { u: 1, v: 0 }; }
    if (preview === 'toy-wall-dizzy') runtime.phase = 'dizzy';
    toyRuntimeRef.current = runtime;
    toyShakeRef.current.reset();
    const rect = pandaButtonRef.current?.getBoundingClientRect();
    const initial = {
      x: Math.min(window.innerWidth - 35, (rect?.right ?? window.innerWidth / 2) + 90),
      y: Math.min(window.innerHeight - 40, rect?.bottom ?? window.innerHeight * .65),
    };
    toyPointerRef.current = initial;
    setToyPointer(initial);
    const onMove = (event: PointerEvent) => {
      if (equippedToy !== 'laser') return;
      const overDock = (event.target as Element | null)?.closest?.('.rp-dock, .cc-top, [role="dialog"]');
      if (overDock) return;
      const next = { x: event.clientX, y: event.clientY };
      toyPointerRef.current = next;
      setToyPointer(next);
    };
    const onLeave = () => { toyDragRef.current = null; setToyDragging(false); toyShakeRef.current.reset(); };
    const onVisibility = () => {
      onLeave();
      toyRuntimeRef.current = createToyRuntime(performance.now());
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setEquippedToy(null); };
    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKey);
    };
  }, [equippedToy, showInteractionBubble, developerEvent?.event]);

  useEffect(() => {
    if (!equippedToy) toyCareInteractionRecordedRef.current = false;
  }, [equippedToy]);
  useEffect(() => () => {
    const audio = toyAudioRef.current;
    toyAudioRef.current = null;
    if (audio && audio.state !== 'closed') {
      void audio.close().catch(error => console.warn('Could not close toy audio', error));
    }
  }, []);

  useEffect(() => {
    if (!showInteractionBubble || !equippedToy || leafPlatformHeld) return undefined;
    let raf = 0;
    let last = performance.now();
    let walking = false;
    let pose: ToySprite | null = null;
    let visualFrame = -1;
    let phase: ToyPhase | null = null;
    const setPose = (next: ToySprite | null) => { if (pose !== next) { pose = next; setToyPose(next); } };
    const setWalk = (next: boolean) => {
      roomWalkingRef.current = next;
      if (walking !== next) { walking = next; setRoomWalking(next); }
    };
    const tick = (now: number) => {
      raf = window.requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const pointer = toyPointerRef.current;
      const busy = !pointer || pet.stage !== 'present' || activityState !== 'roaming' || hidden || dampAfterBath || document.hidden
        || developerGrab || flyChaseActive || worldFallPhase !== 'none' || draggingRef.current
        || bathPhaseRef.current !== 'none' || pandaHangingRef.current || startledRef.current
        || interactionStateRef.current !== 'roaming';
      if (busy) {
        setWalk(false); setPose(null);
        toyRuntimeRef.current = createToyRuntime(now);
        if (phase !== 'waiting') { phase = 'waiting'; setToyPhase('waiting'); }
        return;
      }
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const goal = unprojectRoomPoint((pointer.x / width) * 100, (pointer.y / height) * 100, width, height);
      const from = positionRef.current;
      const state = toyRuntimeRef.current;
      const result = advanceToy(state, equippedToy, from, goal, now, dt);
      const visual = toyVisual(state, now);
      setPose(visual.sprite);
      if (visualFrame !== visual.frame) { visualFrame = visual.frame; setToyArtFrame(visual.frame); }
      if (phase !== state.phase) { phase = state.phase; setToyPhase(state.phase); }
      setWalk(result.walking);
      if (state.phase !== 'waiting') updateFacing(result.lookU);
      if (result.point !== from) applyRoomPoint(result.point);
      if (result.contact && !toyCareInteractionRecordedRef.current) {
        toyCareInteractionRecordedRef.current = true;
        onCareInteraction?.('bond');
      }
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      setToyPose(null);
      roomWalkingRef.current = false;
      setRoomWalking(false);
    };
  }, [activityState, applyRoomPoint, dampAfterBath, developerGrab, equippedToy, flyChaseActive, hidden, leafPlatformHeld, onCareInteraction, pet.stage, showInteractionBubble, updateFacing, worldFallPhase]);

  useEffect(() => {
    if (equippedToy !== 'laser') return undefined;
    const previous = document.body.style.cursor;
    document.body.style.cursor = 'none';
    return () => { document.body.style.cursor = previous; };
  }, [equippedToy]);

  const toggleRoomProp = useCallback((prop: RoomProp) => {
    if (prop === 'trashCan' && (trashCanBusy || trashCanPandaPhaseRef.current !== null)) return;
    setPlacedProps((current) => ({ ...current, [prop]: !current[prop] }));
  }, [trashCanBusy]);

  const beginToyDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (equippedToy !== 'teaser' || !event.isPrimary || event.button !== 0 || !toyPointerRef.current) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    toyDragRef.current = { id: event.pointerId, dx: toyPointerRef.current.x - event.clientX, dy: toyPointerRef.current.y - event.clientY };
    toyShakeRef.current.reset();
    toyShakeRef.current.move(toyPointerRef.current.x, toyPointerRef.current.y, performance.now());
    setToyDragging(true);
    if (!toyAudioRef.current && window.AudioContext) toyAudioRef.current = new AudioContext();
    void toyAudioRef.current?.resume().catch(error => console.warn('Toy sound unavailable', error));
  };
  const moveToyDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const drag = toyDragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const next = { x: Math.max(24, Math.min(window.innerWidth - 24, event.clientX + drag.dx)),
      y: Math.max(46, Math.min(window.innerHeight - 12, event.clientY + drag.dy)) };
    toyPointerRef.current = next; setToyPointer(next);
    if (toyShakeRef.current.move(next.x, next.y, performance.now()) && shakeToy(toyRuntimeRef.current, performance.now())) {
      const audio = toyAudioRef.current;
      if (audio?.state === 'running') {
        const oscillator = audio.createOscillator(), volume = audio.createGain();
        oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(1100, audio.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(550, audio.currentTime + .1);
        volume.gain.setValueAtTime(.025, audio.currentTime);
        volume.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .12);
        oscillator.connect(volume); volume.connect(audio.destination);
        oscillator.start(); oscillator.stop(audio.currentTime + .13);
      }
    }
  };
  const finishToyDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (toyDragRef.current?.id !== event.pointerId) return;
    toyDragRef.current = null; setToyDragging(false); toyShakeRef.current.reset();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleBathBallPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || !bathBallPosition
      || !canPickUpBathBall(bathBallDryingRef.current, bathPhaseRef.current === 'bathing')) return;
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
    setBathRubbing(bathPhaseRef.current === 'bathing' && !bathBallDryingRef.current.wet && touchingPanda);
  };

  const finishBathBallPointer = (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = bathBallDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    bathBallDragRef.current = null;
    setBathBallDragging(false);
    const pandaRect = pandaButtonRef.current?.getBoundingClientRect();
    const hookRect = windowDryingHookRef.current?.getBoundingClientRect();
    const wet = bathBallDryingRef.current.wet;
    const dryOnHook = !wet && bathBallDryingRef.current.onWindowHook;
    const releasedNearHook = !cancelled && showInteractionBubble && hookRect
      && event.clientX >= hookRect.left - 24 && event.clientX <= hookRect.right + 24
      && event.clientY >= hookRect.top - 24 && event.clientY <= hookRect.bottom + 30;
    const droppedOnHook = wet && releasedNearHook;
    const releasedOnPanda = !cancelled && bathPhaseRef.current === 'bathing' && pandaRect
      && !wet
      && event.clientX >= pandaRect.left - 12 && event.clientX <= pandaRect.right + 12
      && event.clientY >= pandaRect.top - 12 && event.clientY <= pandaRect.bottom + 12;
    if (droppedOnHook && hookRect) {
      const position = getBathBallWindowHookPosition(hookRect);
      bathBallOriginRef.current = position;
      setBathBallPosition(position);
      setBathBallDryingNow(hangBathBallToDry(bathBallDryingRef.current));
      setBathBallPlaced(false);
      setBathRubbing(false);
    } else if (releasedOnPanda && pandaRect) {
      setBathBallPosition({
        x: pandaRect.left + pandaRect.width * 0.62 - 20,
        y: pandaRect.top + pandaRect.height * 0.08,
      });
      setBathBallPlaced(true);
      setBathRubbing(true);
    } else if (dryOnHook && !cancelled) {
      if (releasedNearHook && hookRect) {
        const position = getBathBallWindowHookPosition(hookRect);
        bathBallOriginRef.current = position;
        setBathBallPosition(position);
      } else {
        setBathBallDryingNow(takeDryBathBallOffHook(bathBallDryingRef.current));
        bathBallOriginRef.current = null;
        setBathBallPosition(null);
      }
      setBathBallPlaced(false);
      setBathRubbing(false);
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
    window.clearTimeout(reactionTimerRef.current);
    window.clearTimeout(chatIdleTimerRef.current);
    window.clearTimeout(startleTimerRef.current);
    window.clearTimeout(bathDropTimerRef.current);
    window.clearTimeout(bathExitTimerRef.current);
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
    let routeEndsInNest = false;
    let startedAt = 0;
    let duration = 0;
    let stepCount = 1;
    const setWalking = (walking: boolean) => {
      if (showInteractionBubble) {
        roomWalkingRef.current = walking;
        setRoomWalking(walking);
      }
    };

    const canRoam = () => interactionState === 'roaming' && !feverish && !boredAtDock && !truthPotionComfortPhase && !equippedToyRef.current && dizzyPhase === 'none' && !reacting && !startled && !developerGrab && !pandaHangingRef.current && !pandaJarTrapped && !dampAfterBath && !startledRef.current && !hidden
      && (worldFallPhase === 'none' || worldFallPhase === 'dirty') && bathPhase === 'none'
      && pet.stage !== 'performing' && pet.stage !== 'returning' && !hoverCuddleActive
      && !developerPose && !roamingTransitionBlocked && activityState === 'roaming' && !sleepingInNest && !leafPlatformRef.current
      && !isDragging && !isPressPending && !draggingRef.current
      && (motion !== 'sleep' || nightWakeOverride) && !preference.matches && document.visibilityState !== 'hidden';
    const schedule = () => {
      if (!alive || !canRoam() || timeout || raf) return;
      setWalking(false);
      timeout = window.setTimeout(() => {
        timeout = 0;
        if (!canRoam()) return;
        from = showInteractionBubble ? nearestWalkableRoomPoint(positionRef.current) : positionRef.current;
        if (showInteractionBubble && !isWalkableRoomPoint(positionRef.current)) applyRoomPoint(from);
        routeEndsInNest = showInteractionBubble && !flyChaseActive
          && performance.now() - lastCatTreeNapAtRef.current >= CAT_TREE_AUTO_NAP_COOLDOWN_MS
          && Math.random() < CAT_TREE_AUTO_NAP_CHANCE;
        to = showInteractionBubble
          ? routeEndsInNest ? CAT_TREE_NEST_POINT : randomWalkableRoomPoint()
          : randomRoomPoint();
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
        if (showInteractionBubble && !routeEndsInNest && Math.hypot(to.u - from.u, to.v - from.v) < 0.22) {
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
        if (showInteractionBubble && characterId === 'xiaobai' && !flyChaseActive) duration /= 0.85;
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
        if (routeEndsInNest) {
          routeEndsInNest = false;
          enterCatTreeSleep();
        } else if (flyChaseActive || !maybeEnterRest(positionRef.current)) schedule();
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
    boredAtDock,
    leafPlatformHeld,
    characterId,
    dampAfterBath,
    applyRoomPoint,
    dizzyPhase,
    flyChaseActive,
    flyChaseSide,
    hidden,
    interactionState,
    hoverCuddleActive,
    isDragging,
    pandaJarTrapped,
    isPressPending,
    maybeEnterRest,
    motion,
    developerPose,
    feverish,
    roamingTransitionBlocked,
    nightWakeOverride,
    pet.stage,
    pet.token,
    reacting,
    developerGrab,
    equippedToy,
    startled,
    updateFacing,
    worldFallPhase,
    enterCatTreeSleep,
    sleepingInNest,
    truthPotionComfortPhase,
  ]);

  const image = truthPotionComfortPhase === 'settling'
    ? frame === 0
      ? pandaStaticUrl('idle.png?v=tail-left-3')
      : frame >= POTION_COMFORT_TRANSITION_FRAME_COUNT
        ? POTION_COMFORT_SPRITE
        : potionComfortTransitionFrameUrl(frame)
    : truthPotionComfortPhase === 'sitting'
    ? POTION_COMFORT_SPRITE
    : bathTransition === 'exiting' && bathExitImage
    ? bathExitImage
    : showInteractionBubble && bathPhase === 'bathing' && bathEntryShakeFrame !== null
      && characterId === 'panda' && !dirtyReturn
    ? bathingEntryShakeFrameUrl(bathEntryShakeFrame)
    : dirtyGrab && sprite === 'dirty-grab-lift'
    ? frame === 0
      ? pandaStaticUrl('dirty-return.png?v=world-fall-1')
      : pandaStaticUrl(`frames/dirty-grab-lift-${frame}.png?v=dirty-grab-lift-pixen-2`)
    : dirtyGrab
      ? pandaStaticUrl('dirty-grab.png?v=dirty-grab-pixen-2')
      : pandaHanging && showInteractionBubble
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
      ? pandaStaticUrl('startled.png?v=mouse-startle-pixen-2')
    : toyPose && sprite === toyPose
    ? pandaStaticUrl(`frames/${toyPose}-${Math.max(1, toyArtFrame)}.png?v=${TOY_ART_VERSION}`)
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
      ? pandaStaticUrl(`${sprite}.png?v=${spriteAssetVersion(sprite)}`)
      : pandaStaticUrl(`frames/${sprite}-${frame}.png?v=${spriteAssetVersion(sprite)}`);
  currentImageRef.current = image;
  const resolveCharacterAsset = useCharacterAsset();
  const normalCharacterBody = useCharacterBody(image, !!pixelTransitionDirection);
  const punchFrame = usePandaPunch(reacting && characterId === 'panda' && !isDragging && !developerGrab
    && !pandaHanging && !pandaJarTrapped && !dirtyReturn && bathPhase === 'none'
    && dizzyPhase === 'none' && !truthPotionComfortPhase && pet.stage === 'present'
    && interactionState !== 'chat');
  const characterBody = punchFrame === null ? normalCharacterBody : pandaStaticUrl(`punch/${punchFrame}.png`);
  const narrate = usePetNarration();

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
    const binRect = wasteBinRef.current?.getBoundingClientRect();
    const droppedIntoBin = !cancelled && binRect
      && event.clientX >= binRect.left && event.clientX <= binRect.right
      && event.clientY >= binRect.top && event.clientY <= binRect.bottom;
    if (droppedIntoBin && binRect) {
      onDisposeSpacePolicePoopBag?.(
        pointer.deliveredAt,
        (binRect.left + binRect.width / 2) / Math.max(1, window.innerWidth),
        (binRect.top + binRect.height / 2) / Math.max(1, window.innerHeight),
      );
    } else {
      onMoveSpacePolicePoopBag?.(pointer.deliveredAt, x, y);
    }
    setDraggingPoopDeliveredAt(null);
    setPoopDragPosition(null);
  }, [onDisposeSpacePolicePoopBag, onMoveSpacePolicePoopBag, poopDragPosition]);

  const roomBackgroundImage = `url("${import.meta.env.BASE_URL}static/room/room-background-pixellab.png?v=bamboo-room-1")`;
  const roomBackgroundSize = `min(100vw, ${(ROOM_IMAGE_WIDTH / ROOM_IMAGE_HEIGHT) * 100}vh) auto`;
  const trashCanPandaImage = trashCanPandaPhase === 'entering'
    ? trashCanPandaFrame === 0
      ? pandaStaticUrl('idle.png?v=trash-can-pixen-1')
      : trashCanPandaFrameUrl('enter', trashCanPandaFrame)
    : trashCanPandaPhase === 'trapped'
      ? trashCanPandaFrameUrl('enter', TRASH_CAN_ENTER_FRAME_COUNT)
      : trashCanPandaPhase === 'exiting'
        ? trashCanPandaFrame === 0
          ? trashCanPandaFrameUrl('enter', TRASH_CAN_ENTER_FRAME_COUNT)
          : trashCanPandaFrameUrl('exit', trashCanPandaFrame)
        : null;
  const roomFloorBounds = roomFloorBoundsPercent(window.innerWidth, window.innerHeight);
  const roomImageScale = Math.min(window.innerWidth / ROOM_IMAGE_WIDTH, window.innerHeight / ROOM_IMAGE_HEIGHT);
  const bambooJarTargetProjection = projectRoomPoint(
    bambooJarTargetRoomPoint,
    window.innerWidth,
    window.innerHeight,
  );
  const outsideBoundary = projectRoomPoint(
    { u: 0.5, v: ROOM_OUTSIDE_BOUNDARY_V },
    window.innerWidth,
    window.innerHeight,
  );
  const giftStorageProjection = showInteractionBubble && placedProps.giftStorage && onOpenGiftStorage
    ? projectRoomPoint(getGiftStorageRoomPoint(), window.innerWidth, window.innerHeight)
    : null;
  const giftDropProjection = showInteractionBubble && pet.stage !== 'returning' && pendingGift && onCollectPresent
    ? projectRoomPoint(getGiftDropRoomPoint(pendingGift.id), window.innerWidth, window.innerHeight)
    : null;
  const roomImageStyle = showInteractionBubble ? {
    backgroundImage: roomBackgroundImage,
    backgroundSize: roomBackgroundSize,
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat',
  } : undefined;
  return (
    <>
      {showInteractionBubble && <RoomLeafPlatform width={viewportSize.width} height={viewportSize.height}
        activity={leafPlatformActivity} dragging={isDragging} />}
      <div className="ps-room-surface" data-room-only={showInteractionBubble}
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
         data-interaction-state={interactionState}
         data-toy-state={equippedToy ? toyPhase : undefined}
          data-activity-state={showInteractionBubble ? developerPose ?? activityState : undefined}
          data-dev-pose={developerPose ?? undefined} data-transition-direction={pixelTransitionDirection ?? undefined}
          data-dragging={isDragging} data-pressing={isPressPending}
           data-world-fall-state={showInteractionBubble ? worldFallPhase : undefined}
         data-testid="panda-interaction-state" data-damp-after-bath={dampAfterBath ? 'true' : undefined}
         data-damp-drying-ready={dampDryingReady ? 'true' : undefined}
          style={{
            ['--ps-dur' as string]: `${seconds}s`,
            ['--panda-drag-x' as string]: pandaDragScreenPosition ? `${pandaDragScreenPosition.x}px` : undefined,
            ['--panda-drag-y' as string]: pandaDragScreenPosition ? `${pandaDragScreenPosition.y}px` : undefined,
          }}>
        {showInteractionBubble && trashCanPandaPhase && trashCanPandaAnchor && trashCanPandaImage && (
          <img className="ps-room-trash-panda"
            src={resolveCharacterAsset(trashCanPandaImage)}
            alt=""
            aria-hidden="true"
            draggable={false}
            data-testid="trash-can-panda"
            data-phase={trashCanPandaPhase}
            style={{
              left: `${trashCanPandaAnchor.x * 100}%`,
              top: `calc(${trashCanPandaAnchor.y * 100}% - 22px)`,
            }} />
        )}
        {wasteBinVisible && (
          <button ref={wasteBinRef}
            type="button"
            className={`ps-room-trash-can${draggingFurnitureId === 'trashCan' ? ' ps-furniture-dragging' : ''}`}
            aria-label={trashCanPandaPhase === 'trapped'
              ? '小熊猫掉进垃圾桶里了；长按拖动垃圾桶，让小熊猫爬出来'
              : '像素垃圾桶；长按拖动，拖动包好的便便袋到这里清理'}
            title="长按拖动垃圾桶；可以接收包好的便便袋"
            data-testid="room-waste-bin"
            data-dragging={draggingFurnitureId === 'trashCan' ? 'true' : undefined}
            data-panda-state={trashCanPandaPhase ?? undefined}
            data-disposing={activeWasteLetters.some(letter => letter.poop?.phase === 'disposing') ? 'true' : undefined}
            style={roomFurnitureStyle('trashCan', wasteBinRef)}
            onPointerDown={event => beginFurnitureMove('trashCan', event)}
            onPointerMove={moveFurniture}
            onPointerUp={finishFurnitureMove}
            onPointerCancel={finishFurnitureMove}
            onClickCapture={event => suppressFurnitureClick('trashCan', event)}>
            <img src={TRASH_CAN_SPRITE} alt="" aria-hidden="true" draggable={false} />
          </button>
        )}
        {showInteractionBubble && (
          <div className="ps-room-outside-boundary" data-testid="room-outside-boundary" aria-hidden="true"
            style={{
              left: 'var(--room-left)',
              top: `${outsideBoundary.y}%`,
              width: 'var(--room-w)',
            }} />
        )}
        {showInteractionBubble && ROOM_FURNITURE_OCCLUDERS.map((furniture) => (
          <div key={furniture.id} className="ps-room-occlusion" aria-hidden="true"
            data-testid={`room-occlusion-${furniture.id}`}
            data-room-depth={furniture.depth.toFixed(3)}
            style={{
              zIndex: furniture.foreground ? LEFT_ROOM_PLANT_Z_INDEX : roomFurnitureZIndex(furniture.depth),
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
        {showInteractionBubble && (
          <div className="ps-room-image-cutout-canvas" aria-hidden="true">
            <RoomAlarmClock />
            <img
              className="ps-room-plant-user-cutout"
              src={`${import.meta.env.BASE_URL}static/room/room-plant-cutout-user.png?v=user-cutout-1`}
              alt=""
              draggable={false}
            />
          </div>
        )}
        {showInteractionBubble && (
          <div ref={bambooJarRef} className="ps-room-interactive-jar"
            data-testid="room-interactive-jar" data-player-scope="local" aria-hidden="true"
            style={{
              left: `${bambooJarTargetProjection.x}%`,
              top: `${bambooJarTargetProjection.y}%`,
              width: `${48 * roomImageScale}px`,
              height: `${56 * roomImageScale}px`,
              zIndex: bambooJarTargetProjection.zIndex,
            }} />
        )}
        {showInteractionBubble && (
          <button ref={windowDryingHookRef} type="button"
            className="ps-window-drying-hook"
            aria-label={narrate('圆窗边的晾晒小钩子，可挂湿润的小熊猫或浴球')}
            data-drop-hint={isDragging || bathBallDragging ? 'true' : undefined}
            data-testid="window-drying-hook">
            <i aria-hidden="true" />
            {(isDragging || bathBallDragging) && (
              <span className="ps-hook-drop-hint" aria-hidden="true" data-testid="window-hook-drag-hint">
                <span>挂钩在这里</span><b>↓</b>
              </span>
            )}
          </button>
        )}
        {showInteractionBubble && placedProps.rack && (
          <img ref={clothesRackRef}
            className={`ps-room-rack${draggingFurnitureId === 'rack' ? ' ps-furniture-dragging' : ''}${roomEye.controlledFurnitureId === 'rack' ? ' ps-furniture-controlled' : ''}`}
            src={`${import.meta.env.BASE_URL}static/room/${showInteractionBubble ? 'panda-clothes-rack-web-no-eyes.png?v=rack-eyes-detached-1' : 'panda-clothes-rack.png?v=bamboo-rack-clean-2'}`}
            alt="晾衣架" draggable={false}
            style={roomFurnitureStyle('rack', clothesRackRef)}
            onPointerDown={(event) => beginFurnitureMove('rack', event)}
            onPointerMove={moveFurniture}
            onPointerUp={finishFurnitureMove}
            onPointerCancel={finishFurnitureMove}
            data-testid="room-clothes-rack" />
        )}
        {showInteractionBubble && onOpenSpacePoliceMailbox && (
          <button ref={spacePoliceMailboxRef} type="button"
            className="ps-space-letter-box"
            aria-haspopup="dialog"
            aria-label={`打开时空警察来信箱，${spacePoliceMailCount ?? 0}封来信，${spacePoliceUnreadCount ?? 0}封未读`}
            data-testid="space-police-mailbox"
            style={mailboxPlacement}
            onClick={(event) => { event.stopPropagation(); onOpenSpacePoliceMailbox(); }}>
            <span className="ps-space-letter-box-stamp" aria-hidden="true" />
            <span className="ps-space-letter-box-label">信箱</span>
            {spacePoliceUnreadCount > 0 && <span className="ps-space-letter-box-count" aria-hidden="true">{spacePoliceUnreadCount > 9 ? '9+' : spacePoliceUnreadCount}</span>}
          </button>
        )}
        {showInteractionBubble && placedProps.tub && (
          <div ref={bathStationRef}
            className={`ps-bath-station${draggingFurnitureId === 'bathStation' ? ' ps-furniture-dragging' : ''}${roomEye.controlledFurnitureId === 'bathStation' ? ' ps-furniture-controlled' : ''}`}
            style={roomFurnitureStyle('bathStation', bathStationRef)}
            onPointerDown={(event) => beginFurnitureMove('bathStation', event)}
            onPointerMove={moveFurniture}
            onPointerUp={finishFurnitureMove}
            onPointerCancel={finishFurnitureMove}
            onClickCapture={(event) => suppressFurnitureClick('bathStation', event)}
            data-testid="bath-station">
            <div className="ps-bath-tub-wrap">
              <img ref={bathTubRef} className="ps-room-bathtub"
                src={`${import.meta.env.BASE_URL}static/room/pet-bathtub.png?v=pet-bathtub-1`}
                onLoad={syncBathOcclusion}
                alt="" aria-hidden="true" draggable={false} data-testid="room-bathtub" />
              {bathPhase === 'falling' && (
                <span className="ps-bath-splash ps-bath-splash-entering"
                  aria-hidden="true" data-testid="bath-transition-splash">
                  <i /><i /><i /><i /><i />
                </span>
              )}
            </div>
          </div>
        )}
        {showInteractionBubble && roomEye.screenPosition && (
          <>
            <button ref={roomEye.eyeButtonRef} type="button"
              className={`ps-room-rack-eye${roomEye.dragging ? ' ps-room-rack-eye-dragging' : ''}${roomEye.controlledFurnitureId ? ' ps-room-rack-eye-controlled' : ''}`}
              style={{ left: `${roomEye.screenPosition.x}px`, top: `${roomEye.screenPosition.y}px` }}
              aria-label={roomEye.controlledFurnitureId
                ? `小眼睛已附在${roomEye.controlledFurnitureId === 'bathStation' ? '浴缸' : roomEye.controlledFurnitureId === 'bed' ? '小熊猫窝' : '晾衣架'}上，方向键移动，Escape收回`
                : roomEye.placement.kind === 'home' ? '沙发坐垫上的小眼睛，长按拖动' : '小眼睛，长按拖动并放到家具上以控制家具'}
              title={roomEye.controlledFurnitureId ? '方向键移动家具，Shift加速，Escape收回眼睛' : '长按移动'}
              data-testid="room-rack-eye"
              data-controlled-furniture={roomEye.controlledFurnitureId ?? undefined}
              data-eye-start="sofa"
              onPointerDown={roomEye.handlePointerDown}
              onPointerMove={roomEye.handlePointerMove}
              onPointerUp={roomEye.handlePointerUp}
              onPointerCancel={roomEye.handlePointerCancel}
              onClick={(event) => event.stopPropagation()}>
              <img src={`${import.meta.env.BASE_URL}static/room/panda-clothes-rack-eyes.png?v=complete-original-eyes-2`}
                alt="" aria-hidden="true" draggable={false} />
            </button>
            {roomEye.controlledFurnitureId && (
              <div className="ps-room-rack-eye-hint" role="group" aria-label="移动眼睛附着的家具"
                style={{
                  left: `${Math.max(8, Math.min(viewportSize.width - 220, roomEye.screenPosition.x + 22))}px`,
                  top: `${Math.max(8, roomEye.screenPosition.y - 34)}px`,
                }}>
                {([
                  ['←', '向左移动家具', -1, 0],
                  ['↑', '向上移动家具', 0, -1],
                  ['↓', '向下移动家具', 0, 1],
                  ['→', '向右移动家具', 1, 0],
                ] as const).map(([symbol, label, dx, dy]) => (
                  <button key={symbol} type="button" aria-label={label}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={event => {
                      event.stopPropagation();
                      roomEye.moveControlledFurniture(dx, dy);
                    }}>{symbol}</button>
                ))}
                <span>方向键也可移动 · Shift加速 · Esc收回</span>
              </div>
            )}
          </>
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
                : poop.phase === 'disposing' ? '垃圾桶正在处理黑色袋子' : '拖动黑色袋子到垃圾桶里'}
              title={poop.phase === 'fresh' ? '长按打包' : poop.phase === 'bagged' ? '拖进垃圾桶' : undefined}
              disabled={poop.phase === 'disposing'}
              onPointerDown={event => beginRoomWastePointer(letter.deliveredAt, poop.phase, event)}
              onPointerMove={moveRoomWastePointer}
              onPointerUp={event => finishRoomWastePointer(event)}
              onPointerCancel={event => finishRoomWastePointer(event, true)}
              data-testid={`room-waste-${letter.deliveredAt}`}
              data-waste-phase={poop.phase}>
              {poop.phase === 'fresh'
                ? <span className="ps-room-waste-poop" aria-hidden="true" />
                : <span className="ps-room-waste-bag" aria-hidden="true"><i /></span>}
              {isPacking && <span className="ps-room-waste-wrap" aria-hidden="true"><i /></span>}
            </button>
          );
        })}
        {giftStorageProjection && onOpenGiftStorage && (
          <button type="button" className="gift-storage-box"
            aria-label={`礼物收纳盒，已有${giftCount}件礼物，点击查看`}
            aria-haspopup="dialog"
            title="礼物收纳盒"
            data-testid="room-gift-storage-box"
            style={{
              left: `${giftStorageProjection.x}%`,
              top: `${giftStorageProjection.y}%`,
              zIndex: giftStorageProjection.zIndex,
              '--gift-storage-scale': giftStorageProjection.scale,
            } as CSSProperties}
            onClick={(event) => { event.stopPropagation(); onOpenGiftStorage(); }}>
            <img src={`${import.meta.env.BASE_URL}static/room/gift-storage-chest.png`}
              alt="" aria-hidden="true" draggable={false} />
            {giftCount > 0 && <span className="gift-storage-count" aria-hidden="true">{giftCount > 99 ? '99+' : giftCount}</span>}
            <span className="gift-storage-label" aria-hidden="true">礼物收纳盒</span>
          </button>
        )}
        {giftDropProjection && pendingGift && onCollectPresent && (
          <GiftDrop gift={pendingGift} startedAt={giftDropStartedAt}
            onCollect={onCollectPresent} position={giftDropProjection}
            storagePosition={giftStorageProjection ?? undefined} />
        )}
        {!showInteractionBubble && thinking && <span className="ps-thinking" role="status">唔……</span>}
        {!hidden && (!worldAway || worldFallMessageVisible) && (
          <div ref={trackRef} className={`ps-track${pet.stage === 'returning' ? ' ps-returning' : ''}${worldFallPhase === 'returning' ? ' ps-world-returning' : ''}${worldAway ? ' ps-world-away' : ''}${bathPhase === 'falling' ? ' ps-bath-dropping' : ''}${sleepingOnBed ? ' ps-bed-sleeping' : ''}${sleepingInNest ? ' ps-nest-sleeping' : ''}${hangingOnRack ? ' ps-hanging-on-rack' : ''}${dampAfterBath ? ' ps-damp-after-bath' : ''}${capturedHomecoming && !capturedHomecomingArrived ? ' ps-captured-homecoming' : ''}${capturedHomecoming && capturedHomecomingArrived ? ' ps-captured-hugging' : ''}`}
            onAnimationEnd={(event) => { if (event.animationName === 'ps-captured-homecoming-path') finishCapturedHomecomingPath(); }}
            data-captured-return-phase={!capturedHomecoming ? undefined : capturedHomecomingArrived ? 'hugging' : frame < 2 ? 'thrown' : frame <= 4 ? 'impact' : 'crawling'}
            data-room-u="0.500" data-room-v="0.580" data-sleeping-in-nest={sleepingInNest ? 'true' : 'false'} data-testid="panda-room-position" key={`${pet.token}-${pet.stage}`}>
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
      <button ref={pandaButtonRef} type="button" className={`ps-panda ps-${hangingOnRack ? 'idle' : isCuddling ? 'cuddle' : pet.stage === 'performing' ? action : basePoseClass}${showBoredSearch ? ' ps-bored-hidden' : ''}${showInteractionBubble && roomWalking && !hangingOnRack ? ' ps-walking' : ''}${showInteractionBubble && activityTransition ? ` ps-transition-${activityTransition}` : ''}${pixelTransitionDirection ? ' ps-pixel-transition' : ''}${interactionState === 'chat' ? ' ps-chatting' : ''}${(showInteractionBubble && activityState === 'lying' || developerPose === 'lying') ? ' ps-lying' : ''}${(showInteractionBubble && activityState === 'peeking' || developerPose === 'peeking') ? ' ps-peeking' : ''}${isSleeping ? ' ps-sleeping' : ''}${developerPose === 'idle' ? ' ps-dev-idle' : ''}${startled ? ' ps-startled' : ''}${isPressPending ? ' ps-pressing' : ''}${reacting ? ' ps-reacting' : ''}${isDragging || developerGrab ? ' ps-dragging' : ''}${hangingOnRack ? ' ps-hanging' : ''}${dirtyGrab ? ' ps-dirty-grabbing' : ''}${showInteractionBubble && dizzyPhase !== 'none' ? ' ps-dizzy' : ''}${worldFallPhase === 'falling' ? ' ps-world-falling' : ''}${bathPhase === 'falling' ? ' ps-bath-dropping' : ''}${bathPhase === 'bathing' ? ' ps-bathing' : ''}${showInteractionBubble && bathTransition === 'exiting' ? ' ps-bath-exiting' : ''}${dirtyReturn ? ' ps-world-dirty' : ''}${isFlyChasing ? ' ps-fly-flee' : ''}`}
                data-damp-after-bath={dampAfterBath && bathPhase === 'none' ? 'true' : undefined}
                data-sick={feverish ? 'true' : undefined}
                 data-character={characterId}
                data-jar-trapped={pandaJarTrapped ? 'true' : undefined}
                 data-truth-potion-comfort={truthPotionComfortPhase ?? undefined}
                 data-trash-can-state={showInteractionBubble ? trashCanPandaPhase ?? undefined : undefined}
              onPointerEnter={handlePandaPointerEnter}
              onClick={handlePandaClick}
              onPointerDown={handlePandaPointerDown}
              onPointerMove={handlePandaPointerMove}
              onPointerUp={handlePandaPointerUp}
              onPointerCancel={handlePandaPointerCancel}
                 aria-label={pandaJarTrapped ? '小熊猫双爪搭在罐沿上，好奇地四处张望；长按并拖出罐口才能抱出来' : capturedHomecoming ? '小熊猫从时空旋涡被送回，旁边有空间警察来信' : hangingOnWindowHook ? '小熊猫挂在圆窗小钩子上；长按可以把它抱下来' : hangingOnRack ? '小熊猫挂在晾衣架上；长按可以把它抱下来' : isFlyChasing ? '脏兮兮的小熊猫被苍蝇追着跑' : bathPhase === 'falling' ? '小熊猫掉进浴缸了' : bathPhase === 'bathing' ? '小熊猫正在洗澡；长按可以提起' : worldFallPhase === 'falling' ? '小熊猫掉出房间了' : dirtyReturn ? '小熊猫灰头土脸地哭着回来了' : dizzyPhase === 'falling' ? '小熊猫松手后掉到地上' : dizzyPhase === 'dazed' ? '小熊猫坐在地上眩晕了一会儿' : isDragging ? '正在拎起小熊猫；拖动到目标位置后松手' : isPressPending ? '按住小熊猫即可拎起' : feverish ? '小熊猫发烧了，筋疲力尽地躺在地上' : startled ? '小熊猫被吓了一跳' : isSleeping ? '小熊猫正在睡觉；点击叫醒' : interactionState === 'chat' ? '小熊猫正在聊天；点击房间空白处退出' : '点击小熊猫和它互动'}
                  data-testid="button-panda" data-cuddling={isCuddling ? 'true' : undefined} data-sprite={sprite} data-hanging-on-rack={hangingOnRack && !hangingOnWindowHook ? 'true' : undefined} data-hanging-on-window-hook={hangingOnWindowHook ? 'true' : undefined} data-bath-state={showInteractionBubble ? bathPhase : undefined} data-bath-transition={showInteractionBubble ? bathTransition ?? (bathPhase === 'falling' ? 'entering' : undefined) : undefined} data-bath-ball-on-panda={bathBallPlaced ? 'true' : undefined} data-bath-rubbing={showInteractionBubble && bathPhase === 'bathing' ? (bathRubbing ? 'true' : 'false') : undefined} data-sleeping={isSleeping ? 'true' : undefined} data-sleeping-on-bed={sleepingOnBed ? 'true' : 'false'} data-sleeping-in-nest={sleepingInNest ? 'true' : 'false'} data-reacting={reacting ? 'true' : undefined} data-startled={startled ? 'true' : undefined} data-dizzy-state={showInteractionBubble ? dizzyPhase : undefined} data-facing={facing}
                 data-bamboo-phase={action === 'bamboo' ? bambooPhase : undefined}
                data-snack-feeding={snackDropDragging ? 'true' : undefined}
                data-activity-state={showInteractionBubble ? developerPose ?? activityState : undefined}
                data-dev-pose={developerPose ?? undefined}
                data-punch-active={punchFrame !== null ? 'true' : undefined}
                data-activity-transition={showInteractionBubble ? activityTransition ?? 'none' : undefined}
                data-transition-direction={pixelTransitionDirection ?? undefined}
                data-transition-key={pixelTransitionKey ?? undefined}
                 data-world-fall-state={showInteractionBubble ? worldFallPhase : undefined}>
                <img className="ps-body" src={characterBody}
                 data-sprite={punchFrame !== null ? 'punch' : bathEntryShakeFrame !== null && bathPhase === 'bathing' && characterId === 'panda' && !dirtyReturn ? 'bathing-entry-shake' : bathTransition === 'exiting' ? dirtyReturn ? bathRubbing ? 'dirty-bathing-soap' : 'dirty-bathing' : 'bathing' : dirtyGrab ? sprite : hangingOnRack ? 'grab' : dirtyReturn && bathPhase === 'bathing' ? (bathRubbing ? 'dirty-bathing-soap' : 'dirty-bathing') : dirtyReturn && isFlyChasing ? 'dirty-flee' : dirtyReturn ? 'dirty-return' : bathPhase === 'bathing' ? 'bathing' : startled && showInteractionBubble ? 'startled' : sprite}
                 data-frame={bathEntryShakeFrame !== null && bathPhase === 'bathing' && characterId === 'panda' && !dirtyReturn ? bathEntryShakeFrame : punchFrame ?? (bathTransition === 'exiting' ? bathFrame : dirtyGrab ? frame : hangingOnRack ? '0' : showInteractionBubble && bathPhase === 'bathing' ? bathFrame : dirtyReturn ? '0' : frame)}
                  width={60} height={60} alt="" draggable={false} />
                  {showInteractionBubble && truthPotionInvitationVisible && (
                    <span className="ps-truth-potion-invitation" role="status" aria-live="polite"
                      data-testid="truth-potion-invitation">
                      {narrate('有什么心事想和小熊猫说嘛？')}
                    </span>
                  )}
                 {showInteractionBubble && bathPhase === 'bathing' && (
                   <span className="ps-bath-water-bubbles" aria-hidden="true" data-testid="bath-water-bubbles">
                     <i /><i />
                   </span>
                 )}
                 {showInteractionBubble && bathTransition === 'exiting' && (
                   <span className="ps-bath-splash" aria-hidden="true" data-testid="bath-transition-splash">
                     <i /><i /><i /><i /><i />
                   </span>
                 )}
                {dampAfterBath && bathPhase === 'none' && (
                  <span className="ps-damp-drops" aria-hidden="true"><i /><i /><i /></span>
                )}
               {bathPhase === 'bathing' && bathRubbing && (
                 <span className="ps-bath-foam" aria-hidden="true">
                   <i /><i /><i /><i />
                 </span>
               )}
                {isFlyChasing && (
                  <span className={`ps-fly-chaser ps-fly-chaser-${flyChaseSide}`} aria-hidden="true" />
                )}
                {(activityTransition === 'frames-entering' || activityTransition === 'frames-waking')
                 && transitionFrameSrc && (
                 <img className="ps-transition-frame" src={resolveCharacterAsset(transitionFrameSrc)} alt="" aria-hidden="true" draggable={false} />
               )}
              {(isDragging || developerGrab) && showInteractionBubble && (
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
              {showInteractionBubble && interactionState !== 'chat' && isSleeping
                && dream && (
                <PetDreamBubble initialDream={dream} side={facing === 'left' ? 'left' : 'right'}
                  petName={characterId === 'xiaobai' ? '小白' : '小熊猫'} />
              )}
          </div>
        )}
      {showInteractionBubble && placedProps.rack && (
        <img ref={rackOcclusionRef}
          className="ps-room-rack-occlusion"
          src={`${import.meta.env.BASE_URL}static/room/panda-clothes-rack-web-no-eyes.png?v=rack-eyes-detached-1`}
          alt="" aria-hidden="true" draggable={false}
          style={roomFurnitureStyle('rack', clothesRackRef)}
          data-testid="room-clothes-rack-occlusion"
          onLoad={syncRackOcclusion} />
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
        {showInteractionBubble && bathBallPosition
          && (bathPhase === 'bathing' || bathBallDrying.wet || bathBallDrying.onWindowHook) && (
          <button ref={bathBallButtonRef} type="button"
            className={`ps-bath-ball${bathBallDragging ? ' ps-bath-ball-dragging' : ''}${bathBallDropping ? ' ps-bath-ball-dropping' : ''}${bathBallPlaced ? ' ps-bath-ball-placed' : ''}${bathBallDrying.wet ? ' ps-bath-ball-wet' : ''}${bathBallDrying.onWindowHook ? ' ps-bath-ball-on-hook' : ''}`}
            style={{ left: bathBallPosition.x, top: bathBallPosition.y }}
              aria-label={bathBallDrying.wet
                ? bathBallDrying.onWindowHook
                  ? `浴球正在窗边晾干，还要 ${bathBallDrySecondsRemaining} 秒`
                  : '湿浴球；拖到圆窗边的小钩子上晾五秒，干了才能再次使用'
                : bathBallDrying.onWindowHook
                  ? '浴球已晾干；拖动可以从窗钩取下收好，下次洗澡时使用'
                  : '浴球；拖到小熊猫身上就会开始揉洗'}
              title={bathBallDrying.onWindowHook && !bathBallDrying.wet
                ? '拖动干浴球即可从窗钩取下收好'
                : bathBallDrying.wet
                  ? '把湿浴球挂到圆窗边的小钩子上晾五秒'
                  : '浴球碰到小熊猫就会开始揉洗；拖开可以停止'}
             data-testid="bath-ball"
            data-on-panda={bathBallPlaced ? 'true' : 'false'}
            data-wet={bathBallDrying.wet ? 'true' : 'false'}
            data-on-window-hook={bathBallDrying.onWindowHook ? 'true' : 'false'}
             data-dropping={bathBallDropping ? 'true' : 'false'}
            onPointerDown={handleBathBallPointerDown} onPointerMove={handleBathBallPointerMove}
            onPointerUp={finishBathBallPointer} onPointerCancel={(event) => finishBathBallPointer(event, true)}>
            <img src={BATH_PUFF_SPRITE}
              alt="" aria-hidden="true" draggable={false} />
            {(bathBallDrying.wet || bathBallDrying.onWindowHook) && (
              <span className="ps-bath-ball-status" aria-hidden="true">
                {bathBallDrying.wet
                  ? bathBallDrying.onWindowHook ? `晾干中 ${bathBallDrySecondsRemaining} 秒` : '拖到窗钩上晾干'
                  : bathBallDrying.onWindowHook ? '晾好了 · 拖下收好' : '晾好了'}
              </span>
            )}
          </button>
        )}
        {pet.stage === 'fallen' && <p className="ps-away" role="status">{narrate('呜哇——！小熊猫掉出去啦，马上回来。')}</p>}
        {pet.stage === 'away' && pet.token === 0 && foxMerchantLetter?.status === 'captured' && (
          <p className="ps-away" role="status" data-testid="fox-captured-notice">
            被狐贩子用糖拐跑了！打开上方“狐贩子来信”查看怎样换回{foxMerchantLetter.petName}。
          </p>
        )}
        {import.meta.env.DEV && debugClicks && interactionState !== 'chat' && (
          <aside className="ps-debug-panel" data-testid="panda-click-debug" aria-label="小熊猫点击诊断">
            <strong>临时点击诊断</strong>
            <span>状态：{interactionState} · reacting：{String(reacting)}</span>
            <ol>
              {debugEntries.slice(-10).reverse().map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}
            </ol>
            <small>点击和拖拽事件会记录在这里；喂食药药药后才进入聊天。</small>
          </aside>
        )}
      </div>
      {showInteractionBubble && pet.stage === 'away' && pet.token > 0
        && <PetDepartureNotice key={pet.token} point={{ ...positionRef.current }} />}
      {selectedSnack && snackDropPosition && (
        <button type="button" className="ps-snack-feed-token"
          style={{ left: snackDropPosition.x, top: snackDropPosition.y }}
          data-dragging={snackDropDragging ? 'true' : undefined}
          data-testid="snack-feed-token"
          aria-label={`零食${selectedSnack.emoji}；拖到小熊猫身上喂它`}
          onPointerDown={handleSnackPointerDown}
          onPointerMove={handleSnackPointerMove}
          onPointerUp={handleSnackPointerUp}
          onPointerCancel={handleSnackPointerCancel}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onPlayerAttention?.();
              onFeedSnack?.(selectedSnack.id);
              setSnackDropPosition(null);
            }
          }}>
          <span className="ps-snack-feed-emoji" aria-hidden="true">{selectedSnack.emoji}</span>
        </button>
      )}
      {showInteractionBubble && interactionState !== 'chat' && (
        <RoomPropDock
          equippedToy={equippedToy}
          onSelectToy={(toy) => setEquippedToy((current) => current === toy ? null : toy)}
          truthPotionInRoom={Boolean(truthPotionPosition)}
          onToggleTruthPotion={toggleTruthPotion}
          placed={{ ...placedProps, trashCan: placedProps.trashCan || trashCanBusy }}
          onTogglePlaced={toggleRoomProp}
          locked={{ tub: bathPhase !== 'none', rack: hangingOnRack, bed: sleepingOnBed,
            giftStorage: false, trashCan: trashCanBusy }} />
      )}
      {showBoredSearch && (
        <div className="ps-bored-panda" role="status" aria-label={`${characterId === 'xiaobai' ? '小白' : '小熊猫'}无聊地趴在工具栏上找你`}
          data-character={characterId}
          data-testid="bored-panda-at-dock"
          style={{
            ['--bored-panda-size' as string]: `${boredPandaSize}px`,
            ['--bored-dock-height' as string]: `${roomPropDockHeight}px`,
          }}>
          <span className="ps-bored-panda-speech">你在做什么呀</span>
          <img src={resolveCharacterAsset(boredDockFrameUrl(boredDockFrame))} alt="" aria-hidden="true" draggable={false} />
        </div>
      )}
      {showInteractionBubble && truthPotionPosition && (
        <button type="button" className="ps-truth-potion-token"
          style={{ left: truthPotionPosition.x, top: truthPotionPosition.y }}
          data-dragging={truthPotionDragging ? 'true' : undefined}
          data-testid="truth-potion-token"
          aria-label="药药药；拖到小熊猫身上让它喝下"
          title="拖到小熊猫身上让它喝下"
          onPointerDown={handleTruthPotionPointerDown}
          onPointerMove={handleTruthPotionPointerMove}
          onPointerUp={handleTruthPotionPointerUp}
          onPointerCancel={handleTruthPotionPointerCancel}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              if (truthPotionComfortStartRef.current?.()) setTruthPotionPosition(null);
            }
          }}>
          <img src={TRUTH_POTION_URL} alt="" draggable={false} />
        </button>
      )}
      {showInteractionBubble && interactionState !== 'chat' && equippedToy && toyPointer && (
        <span className={`ps-toy ps-toy-${equippedToy}`} data-testid={`room-toy-${equippedToy}`}
            role={equippedToy === 'teaser' ? 'button' : undefined} tabIndex={equippedToy === 'teaser' ? 0 : undefined}
            aria-label={equippedToy === 'teaser' ? '逗猫棒：拖动并来回晃动吸引小熊猫，再次点击逗猫棒按钮收回' : '激光光点'}
            data-dragging={toyDragging} onPointerDown={beginToyDrag} onPointerMove={moveToyDrag}
            onPointerUp={finishToyDrag} onPointerCancel={finishToyDrag} onLostPointerCapture={() => { toyDragRef.current = null; setToyDragging(false); }}
            onKeyDown={event => {
              if (equippedToy === 'teaser' && (event.key === ' ' || event.key === 'Enter')) {
                event.preventDefault(); shakeToy(toyRuntimeRef.current, performance.now());
              }
            }}
            style={{
              left: equippedToy === 'teaser' ? toyPointer.x - 24 : toyPointer.x,
              top: equippedToy === 'teaser' ? toyPointer.y - 46 : toyPointer.y,
            }}>
          {equippedToy === 'teaser'
            ? <img src={PANDA_TEASER_WAND_URL} alt="" draggable={false} />
            : <><i /><b /></>}
        </span>
      )}
      {showInteractionBubble && (
        <div className="ps-bubble-layer" aria-live="off">
          <div ref={bubbleAnchorRef} className="ps-bubble-anchor">
            {equippedToy === 'teaser' && ['curious', 'approach', 'watching'].includes(toyPhase) && (
              <span className="ps-toy-question" data-testid="panda-toy-question" role="status">？</span>
            )}
            {equippedToy && toyPhase === 'dizzy' && (
              <span className="ps-toy-dizzy-stars" data-testid="panda-toy-dizzy" aria-label="撞到墙，晕乎乎">✦ · ✧</span>
            )}
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
                  data-testid="panda-dirty-plea">{narrate(dirtyPleaText)}</span>
            )}
            {showInteractionBubble && showArrowMarker && !worldAway && (
              <span className="ps-arrow-marker" aria-hidden="true" data-testid="panda-arrow-marker">▼</span>
            )}
            {showInteractionBubble && !dampAfterBath && !capturedHomecoming && worldFallPhase === 'none' && !isSleeping && !startled && !isDragging && !hangingOnRack && interactionBubbleText && (
              <span className="ps-thinking ps-room-chat-bubble" role="status" aria-live="polite"
                data-testid="panda-chat-bubble">{narrate(interactionBubbleText)}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
