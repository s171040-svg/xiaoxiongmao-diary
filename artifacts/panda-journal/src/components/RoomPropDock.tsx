import './RoomPropDock.css';

export type RoomToy = 'teaser' | 'laser';
export type RoomProp = 'bed' | 'rack' | 'tub';

export const PANDA_TEASER_WAND_URL = `${import.meta.env.BASE_URL}static/room/panda-cat-teaser-wand.png?v=teaser-wand-1`;
export const TRUTH_POTION_URL = `${import.meta.env.BASE_URL}static/room/truth-potion.png?v=panda-face-icon-pixen-1`;

const PALETTE: Record<string, string> = {
  k: '#2b1d12', w: '#f4ead2', b: '#8a5a32', B: '#c08a50', g: '#5f8f4a', G: '#a8cf72',
  r: '#d9483b', R: '#ff8f7a', c: '#7fd0d6', C: '#d7f5f2', y: '#f2c744', s: '#9aa59a',
};

const ICONS = {
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
  truthPotionInRoom: boolean;
  onToggleTruthPotion: () => void;
  placed: Record<RoomProp, boolean>;
  onTogglePlaced: (prop: RoomProp) => void;
  locked: Record<RoomProp, boolean>;
};

const TOYS: { id: RoomToy; label: string }[] = [
  { id: 'teaser', label: '逗猫棒' },
  { id: 'laser', label: '激光笔' },
];

const FURNITURE: { id: RoomProp; label: string }[] = [
  { id: 'tub', label: '浴缸' },
  { id: 'rack', label: '晾衣架' },
];

export function RoomPropDock({ equippedToy, onSelectToy, truthPotionInRoom, onToggleTruthPotion, placed, onTogglePlaced, locked }: Props) {
  return (
    <section className="rp-dock" aria-label="道具区" data-testid="room-prop-dock"
      onPointerDown={(event) => event.stopPropagation()}>
      <h2 className="rp-title">道具区</h2>
      <div className="rp-group" role="group" aria-label="小玩具">
        {TOYS.map((toy) => (
          <button key={toy.id} type="button" className="rp-slot" aria-pressed={equippedToy === toy.id}
            aria-label={toy.label} onClick={() => onSelectToy(toy.id)} data-testid={`prop-toy-${toy.id}`}
            title={toy.id === 'teaser' ? equippedToy === toy.id ? '收回逗猫棒' : '拿出逗猫棒：拖动来回晃动，再次晃动会冲刺' : '开关激光笔：移动光点吸引小熊猫'}>
            {toy.id === 'teaser'
              ? <img className="rp-icon rp-teaser-icon" src={PANDA_TEASER_WAND_URL} alt="" />
              : <PixelIcon name={toy.id} />}
            <span>{toy.label}</span>
          </button>
        ))}
      </div>
      <span className="rp-divider" aria-hidden="true" />
      <div className="rp-group" role="group" aria-label="消耗道具">
        <button type="button" className="rp-slot" aria-pressed={truthPotionInRoom}
          aria-label="药药药" onClick={onToggleTruthPotion} data-testid="prop-truth-potion"
          title={truthPotionInRoom ? '收回药药药' : '拿出药药药，再拖到小熊猫身上让它喝下'}>
          <img className="rp-icon rp-potion-icon" src={TRUTH_POTION_URL} alt="" />
          <span>药药药</span>
        </button>
      </div>
      <span className="rp-divider" aria-hidden="true" />
      <div className="rp-group" role="group" aria-label="家具">
        {FURNITURE.map((item) => (
          <button key={item.id} type="button" className="rp-slot" aria-pressed={placed[item.id]}
            disabled={locked[item.id]} data-placed={placed[item.id] ? 'true' : 'false'}
            aria-label={item.label}
            onClick={() => onTogglePlaced(item.id)} data-testid={`prop-furniture-${item.id}`}>
            <PixelIcon name={item.id} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
