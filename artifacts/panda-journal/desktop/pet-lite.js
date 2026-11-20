/* First desktop version: quiet walking, rest, drag and an explicit return-home prompt.
 * Room gifts, falls, toys and AI performances intentionally do not drive this layer. */
(() => {
  "use strict";
  const bridge = window.pandaDesktop, model = window.PandaDesktopPet;
  const actor = document.getElementById("panda"), image = document.getElementById("panda-sprite");
  const presence = document.querySelector(".pet-presence");
  const bubble = document.getElementById("speech"), copy = document.getElementById("speech-copy");
  const home = document.getElementById("open-journal"), stay = document.getElementById("dismiss-prompt");
  const actions = document.getElementById("speech-actions");
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  document.documentElement.dataset.liteDesktop = "true";
  home.textContent = "回家"; stay.textContent = "再玩一会儿";
  actor.setAttribute("aria-label", "点击询问是否回家；长按可拖动");
  let state = { mode: "desktop", characterId: "panda", paused: false, identityReady: false };
  let manifest = { frameCount: 4 }, point = model.constrain({ x: innerWidth * .65, y: innerHeight * .75 }, innerWidth, innerHeight);
  let destination = null, frame = 0, lastFrame = 0, previous = performance.now();
  let motion = "idle", nextWalk = performance.now() + 1800, press = null, held = false, suppressClickUntil = 0;
  let promptOpen = false, disposed = false;
  let transitionFrames = [], transitionStartedAt = 0;
  const unsubs = [];
  function render() {
    presence.style.left = `${point.x}px`; presence.style.top = `${point.y}px`;
    presence.dataset.motion = motion;
    presence.dataset.character = state.characterId;
    presence.dataset.dragging = String(held);
    presence.dataset.paused = String(state.paused);
    presence.dataset.roomSide = point.x < innerWidth / 2 ? "left" : "right";
    presence.dataset.roomBubble = point.y < 175 ? "below" : "above";
    const transitionIndex = Math.floor((performance.now() - transitionStartedAt) / 75);
    const source = transitionFrames[transitionIndex] ?? model.sprite(state.characterId, motion, frame, manifest);
    if (transitionIndex >= transitionFrames.length) transitionFrames = [];
    if (image.getAttribute("src") !== source) image.setAttribute("src", source);
    image.dataset.sprite = motion; image.dataset.frame = String(frame);
  }
  function setMotion(value) {
    if (motion === value) return;
    transitionFrames = preference.matches ? [] : model.transition(state.characterId, motion, value);
    transitionStartedAt = performance.now();
    motion = value; frame = 0; lastFrame = performance.now(); render();
  }
  function closePrompt() {
    promptOpen = false; bubble.hidden = true;
    nextWalk = performance.now() + 2000; publishRegions();
  }
  function showPrompt() {
    if (held || !state.identityReady) return;
    destination = null; setMotion("idle"); promptOpen = true;
    copy.textContent = "要回家吗？"; actions.hidden = false; bubble.hidden = false;
    render(); publishRegions();
  }
  actor.addEventListener("click", event => {
    if (event.detail === 0 || performance.now() >= suppressClickUntil) showPrompt();
  });
  home.addEventListener("click", async () => {
    home.disabled = true;
    try { await bridge.returnHome(); closePrompt(); }
    catch { copy.textContent = "房间暂时没打开，再试一次？"; }
    finally { home.disabled = false; }
  });
  stay.addEventListener("click", closePrompt);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closePrompt(); });
  function beginDrag() {
    if (!press) return;
    held = true; destination = null; closePrompt(); setMotion("grab");
    bridge.setPetDragging(true);
    bridge.setIgnoreMouseEvents(false);
    render();
  }
  actor.addEventListener("pointerdown", e => {
    if (e.button !== 0 || !e.isPrimary) return;
    actor.setPointerCapture(e.pointerId);
    press = { id: e.pointerId, offsetX: e.clientX - point.x, offsetY: e.clientY - point.y,
      x: e.clientX, y: e.clientY, timer: setTimeout(beginDrag, 380) };
  });
  actor.addEventListener("pointermove", e => {
    if (!press || press.id !== e.pointerId) return;
    press.x = e.clientX; press.y = e.clientY;
    if (!held) return;
    point = model.constrain({ x: press.x - press.offsetX, y: press.y - press.offsetY }, innerWidth, innerHeight);
    render(); publishRegions();
  });
  function endDrag(e) {
    if (!press || (e && press.id !== e.pointerId)) return;
    clearTimeout(press.timer); press = null;
    if (held) {
      held = false; suppressClickUntil = performance.now() + 450;
      bridge.setPetDragging(false); setMotion("idle"); nextWalk = performance.now() + 2000;
    }
    render(); publishRegions();
  }
  actor.addEventListener("pointerup", endDrag);
  actor.addEventListener("pointercancel", endDrag);
  actor.addEventListener("lostpointercapture", endDrag);
  window.addEventListener("blur", () => endDrag());
  function publishRegions() {
    if (!state.identityReady || state.mode !== "desktop") { bridge.setHitRegions([]); return; }
    const elements = [actor, ...(!bubble.hidden ? [bubble] : [])];
    bridge.setHitRegions(elements.map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, circle: false };
    }));
  }
  document.addEventListener("pointermove", e => {
    if (held) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    bridge.setIgnoreMouseEvents(!el?.closest(".pet-hit-area"));
  }, { passive: true });
  function applyState(value) {
    if (!value || !["panda", "xiaobai"].includes(value.characterId)) return;
    const changed = state.characterId !== value.characterId;
    state = value;
    if (changed) transitionFrames = [];
    if (state.mode !== "desktop" || !state.identityReady) endDrag();
    if (changed || state.paused || state.mode !== "desktop") {
      destination = null; closePrompt(); setMotion("idle");
    }
    presence.hidden = !state.identityReady || state.mode !== "desktop";
    render(); publishRegions();
  }
  unsubs.push(bridge.onDesktopPetState(applyState));
  void bridge.desktopPetState().then(applyState);
  fetch("../src/lib/panda-animation-manifest.json").then(r => {
    if (!r.ok) throw new Error("Animation manifest missing");
    return r.json();
  }).then(value => { manifest = value; render(); }).catch(error => {
    destination = null; state.paused = true;
    console.error("桌宠动作清单读取失败：", error.message);
  });
  function tick(now) {
    const delta = (now - previous) / 1000; previous = now;
    let needsRender = transitionFrames.length > 0;
    const active = state.mode === "desktop" && state.identityReady && !state.paused && !preference.matches
      && document.visibilityState !== "hidden" && !held && !promptOpen && !press;
    if (active) {
      if (!destination && now >= nextWalk) {
        destination = model.target(point, innerWidth, innerHeight);
        if (destination) {
          presence.dataset.facing = destination.x < point.x ? "left" : "right";
          setMotion("walk");
        } else { setMotion("idle"); nextWalk = now + 3000; }
      }
      if (destination && !transitionFrames.length) {
        const step = model.advance(point, destination, delta, state.characterId);
        point = model.constrain(step.point, innerWidth, innerHeight);
        needsRender = true;
        if (step.arrived) {
          destination = null; nextWalk = now + 4500 + Math.random() * 5500;
          setMotion(Math.random() < .2 ? "sleep" : "idle");
        }
      }
    } else if (!held && !promptOpen && (state.paused || preference.matches)) {
      destination = null; setMotion("idle");
    }
    const interval = motion === "walk" ? state.characterId === "xiaobai" ? 140 : 180
      : motion === "sleep" ? 520 : 420;
    if (now - lastFrame >= interval && !preference.matches) {
      frame++; lastFrame = now;
      needsRender = true;
    }
    if (needsRender) render();
    if (!disposed) requestAnimationFrame(tick);
  }
  image.addEventListener("error", () => {
    state.paused = true; destination = null;
    console.error("桌宠素材加载失败：", image.getAttribute("src"));
  });
  window.addEventListener("resize", () => {
    point = model.constrain(point, innerWidth, innerHeight); destination = null; render(); publishRegions();
  });
  const hitTimer = setInterval(publishRegions, 100);
  window.addEventListener("beforeunload", () => {
    disposed = true; endDrag(); clearInterval(hitTimer); unsubs.forEach(off => off?.());
  }, { once: true });
  presence.hidden = true; render(); requestAnimationFrame(tick);
})();
