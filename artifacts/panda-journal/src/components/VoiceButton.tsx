import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function VoiceButton({ text, disabled, onText, onStatus, onActive }: {
  text: string;
  disabled: boolean;
  onText: (value: string) => void;
  onStatus: (message: string, error: boolean) => void;
  onActive: (active: boolean) => void;
}) {
  const [active, setActive] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const held = useRef(false);
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;

  function stop() {
    held.current = false;
    try { recognition.current?.stop(); } catch { /* Recognition already ended. */ }
  }
  useEffect(() => {
    const blur = () => {
      held.current = false;
      recognition.current?.abort();
    };
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('blur', blur);
      recognition.current?.abort();
      onActiveRef.current(false);
    };
  }, []);

  function start() {
    if (disabled || recognition.current) return;
    const browser = window as RecognitionWindow;
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) {
      onStatus('当前环境不支持语音转文字，请直接输入。照片和文字仍可正常保存。', true);
      return;
    }
    const base = text.trimEnd();
    const session = new Constructor();
    recognition.current = session;
    held.current = true;
    session.lang = 'zh-CN';
    session.continuous = true;
    session.interimResults = true;
    session.onresult = ({ results }) => {
      const transcript = Array.from(results).map((result) => result[0]?.transcript ?? '').join('');
      if (transcript) onText(`${base}${base ? '\n' : ''}${transcript}`.slice(0, 4000));
    };
    session.onerror = ({ error }) => {
      if (error === 'aborted' && !held.current) return;
      onStatus(error === 'not-allowed'
        ? '麦克风权限没有打开，请允许麦克风后再试，或直接输入。'
        : '系统语音识别暂时不可用，请直接输入。没有录音被保存或发送给小熊猫 AI。', true);
    };
    session.onend = () => {
      recognition.current = null;
      setActive(false);
      onActive(false);
    };
    try {
      session.start();
      setActive(true);
      onActive(true);
      onStatus('正在听，松开结束。语音识别可能使用系统／浏览器的联网服务；点击发送后才将文字发送给 AI。', false);
    } catch {
      recognition.current = null;
      setActive(false);
      onActive(false);
      onStatus('暂时无法启动麦克风，请直接输入。', true);
    }
  }
  return <button
    className={`attach-button voice-button${active ? ' is-listening' : ''}`}
    type="button"
    disabled={disabled}
    aria-label="按住说话，松开结束语音转文字"
    aria-pressed={active}
    data-testid="button-voice"
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      start();
    }}
    onPointerUp={stop}
    onPointerCancel={stop}
    onLostPointerCapture={stop}
    onKeyDown={(event) => {
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
        event.preventDefault();
        start();
      }
    }}
    onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); stop(); } }}
    onContextMenu={(event) => event.preventDefault()}
  ><Mic size={15} />{active ? '松开结束' : '按住说话'}</button>;
}
