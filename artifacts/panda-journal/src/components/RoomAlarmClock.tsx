import { useEffect, useRef } from 'react';

export function formatLocalAlarmTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const DIGIT_SEGMENTS: Record<string, readonly string[]> = {
  '0': ['top', 'upperLeft', 'upperRight', 'lowerLeft', 'lowerRight', 'bottom'],
  '1': ['upperRight', 'lowerRight'],
  '2': ['top', 'upperRight', 'middle', 'lowerLeft', 'bottom'],
  '3': ['top', 'upperRight', 'middle', 'lowerRight', 'bottom'],
  '4': ['upperLeft', 'upperRight', 'middle', 'lowerRight'],
  '5': ['top', 'upperLeft', 'middle', 'lowerRight', 'bottom'],
  '6': ['top', 'upperLeft', 'middle', 'lowerLeft', 'lowerRight', 'bottom'],
  '7': ['top', 'upperRight', 'lowerRight'],
  '8': ['top', 'upperLeft', 'upperRight', 'middle', 'lowerLeft', 'lowerRight', 'bottom'],
  '9': ['top', 'upperLeft', 'upperRight', 'middle', 'lowerRight', 'bottom'],
};

const SEGMENT_BOUNDS: Record<string, [number, number, number, number]> = {
  top: [1, 0, 4, 2],
  upperLeft: [0, 1, 2, 4],
  upperRight: [4, 1, 2, 4],
  middle: [1, 4, 4, 2],
  lowerLeft: [0, 5, 2, 4],
  lowerRight: [4, 5, 2, 4],
  bottom: [1, 9, 4, 2],
};

function drawDigit(context: CanvasRenderingContext2D, digit: string, left: number, top: number) {
  for (const segment of DIGIT_SEGMENTS[digit] ?? []) {
    const [x, y, width, height] = SEGMENT_BOUNDS[segment];
    context.fillStyle = '#a38963';
    context.fillRect(left + x, top + y, width, height);
    context.fillStyle = '#f2e6bf';
    context.fillRect(left + x + 1, top + y + 1, Math.max(1, width - 2), Math.max(1, height - 1));
  }
}

export function drawLocalAlarmTime(context: CanvasRenderingContext2D, date: Date) {
  const time = formatLocalAlarmTime(date);

  // Cover only the baked-in numerals, leaving the clock casing, screen bezel, and scene untouched.
  context.fillStyle = '#211c1e';
  context.fillRect(58, 218, 34, 13);

  const digitPositions = [59, 66, 77, 84];
  let digitIndex = 0;
  for (const character of time) {
    if (character === ':') {
      context.fillStyle = '#eadfba';
      context.fillRect(73, 221, 1, 1);
      context.fillRect(73, 226, 1, 1);
      continue;
    }
    drawDigit(context, character, digitPositions[digitIndex], 219);
    digitIndex += 1;
  }
}

export function RoomAlarmClock() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;

    let timer = 0;
    const update = () => {
      drawLocalAlarmTime(context, new Date());
      window.clearTimeout(timer);
      const now = new Date();
      timer = window.setTimeout(update, 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
    };
    const updateWhenVisible = () => {
      if (document.visibilityState === 'visible') update();
    };

    update();
    document.addEventListener('visibilitychange', updateWhenVisible);
    window.addEventListener('focus', update);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', updateWhenVisible);
      window.removeEventListener('focus', update);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="ps-room-live-clock"
      width={1024}
      height={576}
      aria-hidden="true"
    />
  );
}
