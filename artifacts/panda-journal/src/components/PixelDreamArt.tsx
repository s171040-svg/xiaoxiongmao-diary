import { useId } from 'react';
import { dreamRandom, type PetDream } from '@/lib/pet-dreams';

const ink = '#534b56', cream = '#fff4ce', leaf = '#92b683';
const star = 'M0-6H2V-2H6V0H2V4H0V0H-4V-2H0Z';
const cloud = 'M0 4H4V0H14V4H22V8H26V14H0V10H-4V6H0Z';
const moon = 'M0 0H12V4H8V12H12V16H4V12H0Z';

/** Hand-drawn on an integer grid; no emoji, smoothing, gradients or remote images. */
export function PixelDreamScene({ dream }: { dream: PetDream }) {
  const rand = dreamRandom(dream.seed);
  const night = ['boat', 'moon', 'cloud', 'fish', 'star', 'spaceship', 'sea'].includes(dream.id);
  const specks = Array.from({ length: 11 }, () => ({
    x: 3 + Math.floor(rand() * 45) * 2, y: 3 + Math.floor(rand() * 18) * 2,
  }));
  return <svg viewBox="0 0 96 64" xmlns="http://www.w3.org/2000/svg"
    shapeRendering="crispEdges" aria-hidden="true" data-dream-scene={dream.id} data-dream-seed={dream.seed}>
    <path fill={night ? '#454c72' : '#c4dac1'} d="M0 0H96V64H0Z" />
    <path fill={night ? '#65678a' : '#debd98'} d="M0 46H12V42H28V46H46V40H62V46H82V42H96V64H0Z" />
    {specks.map((p, i) => <rect key={i} {...p} width={i % 3 === 0 ? 3 : 2}
      height="2" fill={night ? '#eee5ad' : '#f4edc9'} />)}
    {dream.id === 'boat' && <>
      <path fill="#6a9ba1" d="M0 46H96V64H0Z" /><path stroke="#b6d6b6" strokeWidth="2" d="M4 52H26M70 50H90M16 61H42M60 59H84" />
      <path fill={ink} d="M24 42H72V46H66V50H32V46H24Z" /><path fill={leaf} d="M28 40H68V44H62V47H34V44H28Z" />
      <path stroke="#d9e6ad" strokeWidth="2" d="M34 42H62M48 42V24" /><path fill={cream} d="M50 24H54V28H58V32H62V36H50Z" />
      <path d={moon} transform="translate(76 10)" fill="#f3d59a" />
    </>}
    {dream.id === 'moon' && <>
      <path fill="#e5c990" d="M26 23H32V17H44V13H58V17H68V23H74V39H68V47H34V43H26Z" />
      <path fill="#f8e0a7" d="M32 23H38V19H52V23H44V27H32Z" />
      {[37, 49, 60].map((x, i) => <g key={x} fill={i % 2 ? '#7f9d77' : '#adc68b'}><path d={`M${x} 36h4v4h4v10h-12V40h4Z`} /><path fill="#556f64" d={`M${x - 3} 44h10v2h-10Z`} /></g>)}
    </>}
    {['icecream', 'bakery'].includes(dream.id) && <>
      <path fill={ink} d="M20 24H76V57H20Z" /><path fill="#efd8a6" d="M23 31H73V54H23Z" />
      <path fill="#b97969" d="M18 22H78V32H18Z" /><path fill={cream} d="M20 22H30V32H20ZM40 22H50V32H40ZM60 22H70V32H60Z" />
      <path fill="#7f9d84" d="M25 48H71V54H25Z" />
      {dream.id === 'icecream' ? <><path fill="#c69569" d="M43 38H57V43H54V48H47V43H43Z" /><path fill="#e1edb1" d="M40 30H45V26H54V30H60V38H40Z" /><path fill="#fbf2cd" d="M45 28H50V32H45Z" /></>
        : <><path fill="#a67e59" d="M33 44H65V48H33Z" /><path fill={cream} d="M35 38H39V34H47V38H51V44H35ZM53 38H57V35H63V39H66V44H53Z" /><path fill="#f5f1d4" d="M40 13H42V18H40ZM53 10H55V15H53Z" /></>}
      <path fill="#739077" d="M9 36H12V57H9ZM83 32H86V57H83Z" />
    </>}
    {dream.id === 'cloud' && <>
      <path d={cloud} fill="#b6afc6" transform="translate(26 39) scale(2 1)" />
      <path fill={cream} d="M33 33H62V36H66V45H29V36H33Z" /><path fill="#d3c5b8" d="M33 42H62V45H33Z" />
      <path d={star} fill="#f4d58e" transform="translate(70 22) scale(1.3)" /><path d={moon} fill="#e4c6a0" transform="translate(18 10)" />
    </>}
    {dream.id === 'fish' && <>
      <path fill="#809bb2" d="M0 48H96V64H0Z" /><path stroke="#b4c1d1" strokeWidth="2" d="M5 54H25M70 58H92M38 60H58" />
      <path fill="#f0c48e" d="M29 25H35V21H55V25H63V37H55V41H35V37H29V34H23V39H18V23H23V29H29Z" />
      <path fill="#dd9d78" d="M37 35H55V39H37Z" /><rect x="52" y="27" width="3" height="3" fill={ink} />
      <path d={star} fill="#f8e4a4" transform="translate(77 18)" />
    </>}
    {dream.id === 'star' && <>
      <path d={cloud} fill="#9290ac" transform="translate(23 43) scale(2 1)" />
      <path fill="#e3ad72" d="M44 12H52V24H66V32H60V38H64V46H54V42H42V46H32V38H36V32H30V24H44Z" />
      <path fill="#f6d88e" d="M46 16H50V28H61V31H54V37H58V40H51V37H43V40H37V37H41V31H35V28H46Z" />
      <path stroke={ink} strokeWidth="2" d="M41 29H45M51 29H55" /><rect x="47" y="34" width="3" height="2" fill="#c18979" />
    </>}
    {dream.id === 'dewdrop' && <>
      <path fill="#809e7f" d="M0 47H96V64H0Z" /><path fill="#c4b48c" d="M40 38H60V59H40Z" />
      <path fill="#e3edd8" d="M38 33H62V37H38ZM43 27H57V31H43Z" /><path fill="#a6d3c6" d="M43 39H57V54H43Z" />
      {[19, 74].map(x => <g key={x}><path stroke="#607e68" strokeWidth="2" d={`M${x} 30V55`} /><path fill="#deefdc" d={`M${x - 1} 18h2v4h4v6h-10v-6h4Z`} /><path fill="#9fcabc" d={`M${x - 3} 25h6v4h-6Z`} /></g>)}
    </>}
    {dream.id === 'spaceship' && <>
      <path d={moon} transform="translate(75 10)" fill="#f2d69c" />
      <path fill="#ebbb86" d="M45 8H51V14H57V36H62V47H54V43H42V47H34V36H39V14H45Z" />
      <path fill="#c3d5ac" d="M42 18H54V36H42Z" /><path fill="#f6ecd0" d="M45 18H51V33H45Z" />
      <path fill={ink} d="M43 25H53V33H43Z" /><path fill="#83b8bd" d="M45 27H51V31H45Z" />
      <path fill="#e5a16e" d="M43 44H53V51H50V58H46V52H43Z" /><path fill="#f7db9c" d="M46 44H50V52H46Z" />
    </>}
    {dream.id === 'sea' && <>
      <path fill="#6b9ca8" d="M0 40H96V64H0Z" /><path fill="#98c6bc" d="M0 43H16V46H37V43H62V46H82V43H96V48H0Z" />
      <path fill="#dfd7bd" d="M34 34H62V43H34ZM24 30H30V33H35V39H29V36H24ZM62 33H68V30H74V36H69V39H62Z" />
      <path fill="#fcf3d0" d="M37 34H58V39H37Z" /><path d={moon} fill="#f7dfad" transform="translate(16 9)" />
      <path stroke="#d8e9bd" strokeWidth="2" d="M8 54H24M38 58H56M72 52H88" />
    </>}
    {dream.id === 'library' && <>
      <path fill="#789875" d="M12 22H18V14H30V10H67V15H82V24H88V39H78V47H66V64H56V46H42V64H30V45H19V38H12Z" />
      <path fill="#ad805b" d="M27 27H72V55H27Z" /><path fill="#d5bd8b" d="M31 31H68V50H31Z" />
      <path stroke="#785e4f" strokeWidth="3" d="M32 40H67M32 49H67" />
      {[34, 42, 50, 59].map((x, i) => <path key={x} fill={['#a66b64', '#6f9190', '#b19b6d', '#80896c'][i]} d={`M${x} 33h5v6h-5ZM${x} 43h5v5h-5Z`} />)}
      <path fill={cream} d="M64 16H72V20H75V23H66V21H62V18H64Z" />
    </>}
    {dream.id === 'picnic' && <>
      <path d={cloud} fill={cream} transform="translate(20 40) scale(2.2 1.3)" />
      <path fill="#b87868" d="M30 37H70V49H30Z" /><path fill="#f2d9b2" d="M32 39H42V43H32ZM50 39H60V43H50ZM42 43H50V47H42ZM60 43H68V47H60Z" />
      <path fill="#c49b69" d="M48 29H62V38H48Z" /><path stroke="#927047" strokeWidth="2" fill="none" d="M50 29V25H59V29" />
      <path fill="#e5b57e" d="M35 29H41V35H35Z" /><path fill="#f8eac5" d="M33 30H35V34H33ZM41 30H43V34H41Z" />
    </>}
    <path fill={night ? '#9290ae' : '#eed6ae'} d="M0 62H96V64H0Z" />
  </svg>;
}

export function PixelDreamCloud({ dream }: { dream: PetDream }) {
  const clip = useId().replace(/:/g, '');
  return <svg className="pd-cloud-art" viewBox="0 0 112 84" shapeRendering="crispEdges" aria-hidden="true">
    <defs><clipPath id={clip}><path d="M26 18H84V22H94V30H98V46H90V52H22V48H14V30H18V24H26Z" /></clipPath></defs>
    <path fill="#75604e" d="M22 10H30V6H46V10H66V6H82V10H90V18H100V24H106V30H110V50H104V58H94V64H32V68H22V64H14V58H6V50H2V30H6V22H14V14H22Z" />
    <path fill="#ddcda5" d="M24 12H32V8H44V12H68V8H80V12H88V20H98V26H104V32H108V48H102V56H92V62H30V66H24V62H16V56H8V48H4V32H8V24H16V16H24Z" />
    <path fill="#fff5d7" d="M24 12H32V8H44V12H68V8H80V12H88V20H98V26H104V44H100V52H90V58H24V56H16V52H8V44H4V32H8V24H16V16H24Z" />
    <g clipPath={`url(#${clip})`}><svg x="12" y="10" width="88" height="53" viewBox="0 0 96 64"><PixelDreamScene dream={dream} /></svg></g>
    <path fill="#75604e" d="M16 68H28V78H16ZM6 78H13V84H6Z" />
    <path fill="#fff5d7" d="M18 70H26V75H18ZM8 80H11V82H8Z" />
    <path fill="#fff9e8" d="M20 18H26V20H20ZM32 12H42V14H32ZM70 12H78V14H70Z" />
  </svg>;
}
