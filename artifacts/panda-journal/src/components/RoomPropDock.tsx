import './RoomPropDock.css';

export type RoomToy = 'teaser' | 'laser';
export type RoomProp = 'bed' | 'rack' | 'tub';

const PALETTE: Record<string, string> = {
  k: '#2b1d12', w: '#f4ead2', b: '#8a5a32', B: '#c08a50', g: '#5f8f4a', G: '#a8cf72',
  r: '#d9483b', R: '#ff8f7a', c: '#7fd0d6', C: '#d7f5f2', y: '#f2c744', s: '#9aa59a',
};

const ICONS = {
  teaser: [
    '..........rr....',
    '.........rRRr...',
    '........rRyyRr..',
    '.......k.rRRr...',
    '......k..y......',
    '.....k..........',
    '....k...........',
    '...k............',
    '..bk............',
    '.bBk............',
    '.bb.............',
    '................',
  ],
  laser: [
    '................',
    '.....R..R.......',
    '......rr........',
    '.....RrrR.......',
    '......rr........',
    '.......k........',
    '......kk........',
    '....kkskk.......',
    '...ksssssk......',
    '...ksrsssk......',
    '....kkkkk.......',
    '................',
  ],
  tub: [
    '................',
    '...C.C..........',
    '..CcCcC.........',
    '.kkkkkkkkkkkk...',
    'kwwwwwwwwwwwwk..',
    'kwcccccccccwwk..',
    'kwwwwwwwwwwwwk..',
    '.kwwwwwwwwwwk...',
    '..kkkkkkkkkk....',
    '..yk......ky....',
    '................',
    '................',
  ],
  bed: [
    '................',
    '....kkkkkkkk....',
    '...kbbBBBBbbk...',
    '..kbBBBBBBBBbk..',
    '.kbBwwwwwwwwBbk.',
    '.kbBwwkwwkwwBbk.',
    '.kbBwwwwwwwwBbk.',
    '..kbBBBBBBBBbk..',
    '...kkbbbbbbkk...',
    '.....kkkkkk.....',
    '................',
    '................',
  ],
  rack: [
    '................',
    '.......yy.......',
    '..y....kk....y..',
    '..yk...kk...ky..',
    '...yk..kk..ky...',
    '....yyykkyyy....',
    '.......kk.......',
    '.......kk.......',
    '.......kk.......',
    '.......kk.......',
    '.....yykkyy.....',
    '................',
  ],
} as const;

function PixelIcon({ name }: { name: keyof typeof ICONS }) {
  const rows = ICONS[name];
  return (
    <svg className="rp-icon" viewBox={`0 0 16 ${rows.length}`} shapeRendering="crispEdges" aria-hidden="true">
      {rows.flatMap((row, y) => [...row].map((cell, x) => (
        cell === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={PALETTE[cell]} />
      )))}
    </svg>
  );
}

type Props = {
  equippedToy: RoomToy | null;
  onSelectToy: (toy: RoomToy) => void;
  placed: Record<RoomProp, boolean>;
  onTogglePlaced: (prop: RoomProp) => void;
  locked: Record<RoomProp, boolean>;
};

const TOYS: { id: RoomToy; label: string; hint: string }[] = [
  { id: 'teaser', label: '逗猫棒', hint: '拿起逗猫棒，小熊猫会跟着羽毛跑、扑一扑；再点一次或按 Esc 放回' },
  { id: 'laser', label: '激光笔', hint: '拿起激光笔，红点移到哪里小熊猫就追到哪里；再点一次或按 Esc 放回' },
];

const FURNITURE: { id: RoomProp; label: string; hint: string }[] = [
  { id: 'tub', label: '浴缸', hint: '浴缸：把小熊猫拖进去洗澡，浴球会自动出现' },
  { id: 'bed', label: '小窝', hint: '小窝：把小熊猫拖上去会睡觉' },
  { id: 'rack', label: '晾衣架', hint: '晾衣架：把洗完澡的小熊猫挂上去晾干' },
];

export function RoomPropDock({ equippedToy, onSelectToy, placed, onTogglePlaced, locked }: Props) {
  return (
    <section className="rp-dock" aria-label="道具区" data-testid="room-prop-dock"
      onPointerDown={(event) => event.stopPropagation()}>
      <h2 className="rp-title">道具区</h2>
      <div className="rp-group" role="group" aria-label="小玩具">
        {TOYS.map((toy) => (
          <button key={toy.id} type="button" className="rp-slot" aria-pressed={equippedToy === toy.id}
            title={toy.hint} onClick={() => onSelectToy(toy.id)} data-testid={`prop-toy-${toy.id}`}>
            <PixelIcon name={toy.id} />
            <span>{toy.label}</span>
          </button>
        ))}
      </div>
      <span className="rp-divider" aria-hidden="true" />
      <div className="rp-group" role="group" aria-label="家具">
        {FURNITURE.map((item) => (
          <button key={item.id} type="button" className="rp-slot" aria-pressed={placed[item.id]}
            disabled={locked[item.id]} data-placed={placed[item.id] ? 'true' : 'false'}
            title={`${item.hint}；${placed[item.id] ? '点击收进道具区' : '点击摆进房间'}`}
            onClick={() => onTogglePlaced(item.id)} data-testid={`prop-furniture-${item.id}`}>
            <PixelIcon name={item.id} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
