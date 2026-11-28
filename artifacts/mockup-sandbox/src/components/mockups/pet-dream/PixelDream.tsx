import { PetDreamBubble } from './_PetDreamBubble';
import { choosePetDream } from './_pet-dreams';
import sleep from './_sleep.png';
import './_group.css';

const dream = choosePetDream(undefined, () => .01);
export function PixelDream() {
  return <main className="dream-extract">
    <div className="dream-extract-anchor">
      <img src={sleep} alt="" width={60} height={60} />
      <PetDreamBubble initialDream={dream} side="right" petName="小熊猫" />
    </div>
  </main>;
}
