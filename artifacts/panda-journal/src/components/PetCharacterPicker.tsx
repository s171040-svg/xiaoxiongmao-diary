import { useState } from 'react';
import { Link } from 'wouter';
import { usePetCharacter, type PetCharacterId } from '@/hooks/use-pet-character';
import './PetCharacterPicker.css';

export function PetCharacterPicker({ compact = false, onJoinHousehold }: { compact?: boolean; onJoinHousehold?: () => void }) {
  const pet = usePetCharacter();
  const [pending, setPending] = useState<PetCharacterId | null>(null);
  const [error, setError] = useState('');
  const choices = [
    { id: 'panda' as const, name: '小熊猫', file: 'panda/idle.png', note: '熟悉的棕红色小伙伴' },
    { id: 'xiaobai' as const, name: '小白', file: 'xiaobai/idle.png', note: '白色毛球尾巴的小狗' },
  ];
  const className = `pet-picker${compact ? ' pet-picker-compact' : ''}`;
  if (pet.isLoading || pet.error) return <>{compact && pet.isSignedIn && <div className="pet-picker-blocker" />}
    <section className={className} aria-busy={pet.isLoading} role={pet.error ? 'alert' : 'status'}>
      {pet.error ? <>伙伴记录暂时无法读取，不会覆盖已有选择。<button onClick={pet.retry}>重试</button></> : '正在读取账号的伙伴记录……'}
    </section></>;
  if (compact && pet.selection?.locked) return null;
  return <>{compact && pet.isSignedIn && !pet.selection?.locked && <div className="pet-picker-blocker" />}
  <section className={`pet-picker${compact ? ' pet-picker-compact' : ''}`} data-testid="pet-character-picker"
    role={compact && pet.isSignedIn && !pet.selection?.locked ? 'dialog' : undefined}
    aria-modal={compact && pet.isSignedIn && !pet.selection?.locked ? true : undefined} aria-label="选择伙伴">
    <div className="pet-picker-heading"><strong>{pet.selection?.locked ? `你的伙伴 · ${pet.name}` : '选择与你一起生活的小伙伴'}</strong>
      <p>{pet.selection?.locked ? '已绑定账号。更换需要角色转化液，目前尚未开放。' : '一个账号只能选定一位伙伴，确认后不能直接更换。双人共同照料将共用同一角色。'}</p></div>
    {pet.selection?.locked
      ? <img className="pet-picker-selected" src={`${import.meta.env.BASE_URL}static/${pet.characterId === 'xiaobai' ? 'xiaobai' : 'panda'}/idle.png`} alt={pet.name} />
      : <>
        <div className="pet-picker-options">{choices.map(choice => <button type="button" key={choice.id}
          disabled={!pet.isSignedIn || pet.saving} onClick={() => { setError(''); setPending(choice.id); }}
          data-testid={`choose-character-${choice.id}`} aria-pressed={pending === choice.id}>
          <img src={`${import.meta.env.BASE_URL}static/${choice.file}`} alt="" /><strong>{choice.name}</strong><span>{choice.note}</span>
        </button>)}</div>
        {!pet.isSignedIn && <p>登录后才能选定伙伴。<Link href="/sign-in">去登录</Link></p>}
        {pet.isSignedIn && onJoinHousehold && <p><button type="button" data-testid="join-household-before-character"
          onClick={onJoinHousehold} disabled={pet.saving}>先加入朋友的共同房间</button><br />加入后会采用房间已选定的角色，不需要先选一次。</p>}
        {pending && <div className="pet-picker-confirm" role="group" aria-label="确认伙伴选择">
          <p>确定选择{pending === 'xiaobai' ? '小白' : '小熊猫'}吗？{pet.selection?.shared ? '这会同时为共同照料的两人选定角色。' : ''}原有日记和成长进度会保留，之后不能直接换成另一位。</p>
          <button type="button" data-testid="confirm-pet-character" disabled={pet.saving} onClick={async () => {
            try { await pet.choose(pending); setPending(null); }
            catch (e) { setError(e instanceof Error ? e.message : '选择未保存，请重试。'); }
          }}>{pet.saving ? '正在保存…' : '确认，选定这位伙伴'}</button>
          <button type="button" disabled={pet.saving} onClick={() => setPending(null)}>再想想</button>
        </div>}
      </>}
    {error && <p role="alert">{error}</p>}
  </section></>;
}
