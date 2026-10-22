import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  clampRoomFurnitureCenter,
  type RoomFurnitureId,
  type RoomFurnitureLayout,
  type RoomFurniturePoint,
} from '@/lib/room-furniture-layout';
import { ROOM_IMAGE_HEIGHT, ROOM_IMAGE_WIDTH } from '@/lib/room-plane';

type EyeFurnitureId = Exclude<RoomFurnitureId, 'mailbox' | 'trashCan'>;
type ScreenPosition = { x: number; y: number };
type RoomEyePlacement =
  | { kind: 'home' }
  | { kind: 'attached'; id: EyeFurnitureId; xRatio: number; yRatio: number }
  | { kind: 'free'; x: number; y: number };
type RoomEyePointer = {
  pointerId: number;
  element: HTMLButtonElement;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  holdTimer: number;
  active: boolean;
};
type RoomEyeControlOptions = {
  showInteractionBubble: boolean;
  hidden: boolean;
  interactionState: 'roaming' | 'chat';
  placedProps: { bed: boolean; rack: boolean; tub: boolean };
  hangingOnRack: boolean;
  sleepingOnBed: boolean;
  bathPhase: 'none' | 'falling' | 'bathing';
  hasEquippedToy: boolean;
  hasSelectedSnack: boolean;
  viewportSize: { width: number; height: number };
  roomFurnitureLayout: RoomFurnitureLayout;
  roomFurnitureLayoutRef: { current: RoomFurnitureLayout };
  clothesRackRef: { current: HTMLImageElement | null };
  bedRef: { current: HTMLImageElement | null };
  bathStationRef: { current: HTMLElement | null };
  pandaButtonRef: { current: HTMLButtonElement | null };
  updateRoomFurniturePoint: (id: RoomFurnitureId, point: RoomFurniturePoint) => boolean;
  persistRoomFurnitureLayout: (layout: RoomFurnitureLayout) => void;
  triggerStartle: () => void;
};

const ROOM_EYE_HOLD_MS = 420;
const ROOM_EYE_SOFA_ANCHOR = { xRatio: 0.66, yRatio: 0.47 } as const;

export function useRoomEyeControl({
  showInteractionBubble,
  hidden,
  interactionState,
  placedProps,
  hangingOnRack,
  sleepingOnBed,
  bathPhase,
  hasEquippedToy,
  hasSelectedSnack,
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
}: RoomEyeControlOptions) {
  const [placement, setPlacement] = useState<RoomEyePlacement>({ kind: 'home' });
  const [screenPosition, setScreenPosition] = useState<ScreenPosition | null>(null);
  const screenPositionRef = useRef<ScreenPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const [controlledFurnitureId, setControlledFurnitureId] = useState<EyeFurnitureId | null>(null);
  const eyeButtonRef = useRef<HTMLButtonElement>(null);
  const pointerRef = useRef<RoomEyePointer | null>(null);
  const startleNearRef = useRef(false);
  const moveDirtyRef = useRef(false);

  const updateScreenPosition = useCallback((point: ScreenPosition | null) => {
    screenPositionRef.current = point;
    setScreenPosition(point);
  }, []);

  const furnitureElement = useCallback((id: EyeFurnitureId): HTMLElement | null => {
    if (id === 'rack') return clothesRackRef.current;
    if (id === 'bed') return bedRef.current;
    return bathStationRef.current;
  }, [bathStationRef, bedRef, clothesRackRef]);

  const furniturePlaced = useCallback((id: EyeFurnitureId) => (
    id === 'rack' ? placedProps.rack : id === 'bed' ? placedProps.bed : placedProps.tub
  ), [placedProps]);

  const canControlFurniture = useCallback((id: EyeFurnitureId) => {
    if (!showInteractionBubble || hidden || interactionState === 'chat' || !furniturePlaced(id)) return false;
    if (id === 'rack') return !hangingOnRack;
    if (id === 'bed') return !sleepingOnBed;
    return bathPhase === 'none';
  }, [bathPhase, furniturePlaced, hangingOnRack, hidden, interactionState, showInteractionBubble, sleepingOnBed]);

  useLayoutEffect(() => {
    if (!showInteractionBubble || dragging) return;
    if (placement.kind === 'home') {
      const scale = Math.min(viewportSize.width / ROOM_IMAGE_WIDTH, viewportSize.height / ROOM_IMAGE_HEIGHT);
      const imageLeft = (viewportSize.width - ROOM_IMAGE_WIDTH * scale) / 2;
      const imageTop = (viewportSize.height - ROOM_IMAGE_HEIGHT * scale) / 2;
      updateScreenPosition({
        x: imageLeft + ROOM_IMAGE_WIDTH * ROOM_EYE_SOFA_ANCHOR.xRatio * scale,
        y: imageTop + ROOM_IMAGE_HEIGHT * ROOM_EYE_SOFA_ANCHOR.yRatio * scale,
      });
      return;
    }
    if (placement.kind === 'free') {
      updateScreenPosition({ x: placement.x, y: placement.y });
      return;
    }
    const id = placement.id;
    if (!furniturePlaced(id)) {
      updateScreenPosition(null);
      return;
    }
    const rect = furnitureElement(id)?.getBoundingClientRect();
    if (!rect) {
      updateScreenPosition(null);
      return;
    }
    updateScreenPosition({
      x: rect.left + rect.width * placement.xRatio,
      y: rect.top + rect.height * placement.yRatio,
    });
  }, [dragging, furnitureElement, furniturePlaced, placement, roomFurnitureLayout, showInteractionBubble, updateScreenPosition, viewportSize]);

  useEffect(() => {
    if (placement.kind === 'attached' && !furniturePlaced(placement.id)) {
      setPlacement({ kind: 'home' });
      setControlledFurnitureId(null);
    }
  }, [furniturePlaced, placement]);

  useEffect(() => {
    if (controlledFurnitureId && !canControlFurniture(controlledFurnitureId)) {
      setControlledFurnitureId(null);
      if (moveDirtyRef.current) {
        persistRoomFurnitureLayout(roomFurnitureLayoutRef.current);
        moveDirtyRef.current = false;
      }
    }
  }, [canControlFurniture, controlledFurnitureId, persistRoomFurnitureLayout, roomFurnitureLayoutRef]);

  const startleFromEye = useCallback((point: ScreenPosition) => {
    const panda = pandaButtonRef.current?.getBoundingClientRect();
    if (!panda) return;
    const centerX = panda.left + panda.width * 0.5;
    const centerY = panda.top + panda.height * 0.46;
    const distance = Math.hypot(point.x - centerX, point.y - centerY);
    const radius = Math.max(38, Math.min(68, panda.width * 0.72));
    if (distance <= radius) {
      if (!startleNearRef.current) triggerStartle();
      startleNearRef.current = true;
    } else if (distance > radius + 20) {
      startleNearRef.current = false;
    }
  }, [pandaButtonRef, triggerStartle]);

  const findFurnitureAt = useCallback((x: number, y: number) => {
    const candidates = (['bathStation', 'bed', 'rack'] as const).flatMap((id) => {
      if (!canControlFurniture(id)) return [];
      const element = furnitureElement(id);
      const rect = element?.getBoundingClientRect();
      if (!element || !rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return [];
      const zIndex = Number.parseInt(window.getComputedStyle(element).zIndex, 10) || 0;
      return [{ id, element, rect, zIndex }];
    });
    return candidates.sort((a, b) => b.zIndex - a.zIndex)[0] ?? null;
  }, [canControlFurniture, furnitureElement]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!showInteractionBubble || !event.isPrimary || event.button !== 0 || hasEquippedToy || hasSelectedSnack) return;
    const sourceFurniture = placement.kind === 'attached' ? placement.id : null;
    if (sourceFurniture && !canControlFurniture(sourceFurniture)) return;
    event.preventDefault();
    const element = event.currentTarget;
    const currentPosition = screenPositionRef.current ?? { x: event.clientX, y: event.clientY };
    const press: RoomEyePointer = {
      pointerId: event.pointerId,
      element,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - currentPosition.x,
      offsetY: event.clientY - currentPosition.y,
      holdTimer: 0,
      active: false,
    };
    const previous = pointerRef.current;
    if (previous?.holdTimer) window.clearTimeout(previous.holdTimer);
    pointerRef.current = press;
    try {
      element.setPointerCapture(press.pointerId);
    } catch {
      // Pointer capture may be unavailable in older browsers; the hold still works.
    }
    press.holdTimer = window.setTimeout(() => {
      if (pointerRef.current !== press) return;
      press.active = true;
      const start = screenPositionRef.current ?? currentPosition;
      setPlacement({ kind: 'free', x: start.x, y: start.y });
      setControlledFurnitureId(null);
      setDragging(true);
      startleNearRef.current = false;
    }, ROOM_EYE_HOLD_MS);
  }, [canControlFurniture, hasEquippedToy, hasSelectedSnack, placement, showInteractionBubble]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const press = pointerRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (!press.active) {
      const holdJitterTolerance = event.pointerType === 'touch' ? 28 : 14;
      if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > holdJitterTolerance) {
        window.clearTimeout(press.holdTimer);
        pointerRef.current = null;
        try {
          if (press.element.hasPointerCapture(press.pointerId)) press.element.releasePointerCapture(press.pointerId);
        } catch {
          // The pointer may already have been released by the browser.
        }
      }
      return;
    }
    const point = {
      x: Math.max(18, Math.min(window.innerWidth - 18, event.clientX - press.offsetX)),
      y: Math.max(18, Math.min(window.innerHeight - 18, event.clientY - press.offsetY)),
    };
    updateScreenPosition(point);
    startleFromEye(point);
  }, [startleFromEye, updateScreenPosition]);

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const press = pointerRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    event.preventDefault();
    window.clearTimeout(press.holdTimer);
    pointerRef.current = null;
    if (press.active) {
      const point = {
        x: Math.max(18, Math.min(window.innerWidth - 18, event.clientX - press.offsetX)),
        y: Math.max(18, Math.min(window.innerHeight - 18, event.clientY - press.offsetY)),
      };
      updateScreenPosition(point);
      startleFromEye(point);
      const target = findFurnitureAt(point.x, point.y);
      if (target) {
        setPlacement({
          kind: 'attached',
          id: target.id,
          xRatio: (point.x - target.rect.left) / Math.max(1, target.rect.width),
          yRatio: (point.y - target.rect.top) / Math.max(1, target.rect.height),
        });
        setControlledFurnitureId(target.id);
        startleNearRef.current = false;
      } else {
        setPlacement({ kind: 'free', x: point.x, y: point.y });
        setControlledFurnitureId(null);
      }
      setDragging(false);
    }
    try {
      if (press.element.hasPointerCapture(press.pointerId)) press.element.releasePointerCapture(press.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
  }, [findFurnitureAt, startleFromEye, updateScreenPosition]);

  const handlePointerCancel = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = pointerRef.current;
    if (!press || press.pointerId !== event.pointerId) return;
    window.clearTimeout(press.holdTimer);
    pointerRef.current = null;
    if (press.active) {
      const point = screenPositionRef.current ?? { x: event.clientX, y: event.clientY };
      setPlacement({ kind: 'free', x: point.x, y: point.y });
      setControlledFurnitureId(null);
      setDragging(false);
    }
  }, []);

  const finishFurnitureMove = useCallback(() => {
    if (!moveDirtyRef.current) return;
    persistRoomFurnitureLayout(roomFurnitureLayoutRef.current);
    moveDirtyRef.current = false;
  }, [persistRoomFurnitureLayout, roomFurnitureLayoutRef]);

  const moveFurniture = useCallback((id: EyeFurnitureId, dx: number, dy: number, step: number) => {
    const rect = furnitureElement(id)?.getBoundingClientRect();
    if (!rect) return;
    const next = clampRoomFurnitureCenter(
      rect.left + rect.width / 2 + dx * step,
      rect.top + rect.height / 2 + dy * step,
      rect.width,
      rect.height,
      viewportSize.width,
      viewportSize.height,
    );
    const nextX = next.x * viewportSize.width;
    const nextY = next.y * viewportSize.height;
    if (Math.abs(nextX - (rect.left + rect.width / 2)) < 0.5
      && Math.abs(nextY - (rect.top + rect.height / 2)) < 0.5) return;
    const collided = updateRoomFurniturePoint(id, next);
    moveDirtyRef.current = true;
    if (collided) {
      finishFurnitureMove();
      return;
    }
    const eyePoint = screenPositionRef.current;
    if (eyePoint) {
      startleFromEye({
        x: eyePoint.x + nextX - (rect.left + rect.width / 2),
        y: eyePoint.y + nextY - (rect.top + rect.height / 2),
      });
    }
  }, [finishFurnitureMove, furnitureElement, startleFromEye, updateRoomFurniturePoint, viewportSize]);

  const returnHome = useCallback(() => {
    finishFurnitureMove();
    const press = pointerRef.current;
    if (press?.holdTimer) window.clearTimeout(press.holdTimer);
    if (press) {
      try {
        if (press.element.hasPointerCapture(press.pointerId)) press.element.releasePointerCapture(press.pointerId);
      } catch {
        // The pointer may already be released.
      }
    }
    pointerRef.current = null;
    startleNearRef.current = false;
    setDragging(false);
    setControlledFurnitureId(null);
    setPlacement({ kind: 'home' });
    updateScreenPosition(null);
  }, [finishFurnitureMove, updateScreenPosition]);

  useEffect(() => {
    if (!showInteractionBubble) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (hasEquippedToy || hasSelectedSnack) return;
      const target = event.target as Element | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (event.key === 'Escape' && (controlledFurnitureId || dragging || placement.kind !== 'home')) {
        event.preventDefault();
        returnHome();
        return;
      }
      if (!controlledFurnitureId || !canControlFurniture(controlledFurnitureId)) return;
      const deltas: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      const delta = deltas[event.key];
      if (!delta) return;
      event.preventDefault();
      moveFurniture(controlledFurnitureId, delta[0], delta[1], event.shiftKey ? 18 : 8);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.startsWith('Arrow')) finishFurnitureMove();
    };
    const onBlur = () => finishFurnitureMove();
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') finishFurnitureMove();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      finishFurnitureMove();
    };
  }, [canControlFurniture, controlledFurnitureId, dragging, finishFurnitureMove, hasEquippedToy, hasSelectedSnack, moveFurniture, placement, returnHome, showInteractionBubble]);

  return {
    placement,
    screenPosition,
    dragging,
    controlledFurnitureId,
    eyeButtonRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
