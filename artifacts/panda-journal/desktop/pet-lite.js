/* Desktop-only platforms: horizontal walking, gravity, drag and return home.
 * Room gifts, falls, toys and AI performances intentionally do not drive this layer. */
(() => {
  "use strict";
  const bridge = window.pandaDesktop, model = window.PandaDesktopPet, geometry = window.PandaDesktopPlatforms;
  const actor = document.getElementById("panda"), image = document.getElementById("panda-sprite");
  const presence = document.querySelector(".pet-presence");
  const bubble = document.getElementById("speech"), copy = document.getElementById("speech-copy");
  const dirt = document.getElementById("panda-dirt");
  const home = document.getElementById("open-journal"), stay = document.getElementById("dismiss-prompt");
  const actions = document.getElementById("speech-actions");
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  document.documentElement.dataset.liteDesktop = "true";
  home.textContent = "回家"; stay.textContent = "再玩一会儿";
  actor.setAttribute("aria-label", "点击触发挨拳后仰动作；长按可拖动；右键回家");
  let state = { mode: "desktop", characterId: "panda", paused: false, quietMode: false, identityReady: false };
  let quietRest = null;
  let punchStarted = null;
  let windows = [], surfaces = geometry.platforms([], innerWidth, innerHeight);
  let support = surfaces[0], velocity = 0, platformRevision = -1;
  let manifest = { frameCount: 4 }, point = { x: innerWidth * .65, y: support.y };
  let destination = null, frame = 0, lastFrame = 0, previous = performance.now();
  let motion = "idle", nextWalk = performance.now() + 1800, press = null, held = false, suppressClickUntil = 0;
  let promptOpen = false, disposed = false;
  let transitionFrames = [], transitionStartedAt = 0;
  const dirtStorageKey = "panda.desktop.dirt.v1";
  let desktopDirt = loadDirt();
  let fallOriginY = null;
  let shakeStartedAt = null;
  const unsubs = [];
  function loadDirt() {
    try {
      const saved = JSON.parse(localStorage.getItem(dirtStorageKey) || "null");
      return saved && Number.isInteger(saved.remainingShakes) && saved.remainingShakes >= 0
        && saved.remainingShakes <= 3 && Number.isFinite(saved.nextShakeAt)
        ? saved : { remainingShakes: 0, nextShakeAt: 0 };
    } catch { return { remainingShakes: 0, nextShakeAt: 0 }; }
  }
  function saveDirt() {
    try { localStorage.setItem(dirtStorageKey, JSON.stringify(desktopDirt)); } catch {}
  }
  function makeDirty(now) {
    if (state.characterId !== "panda" || desktopDirt.remainingShakes > 0) return;
    desktopDirt = model.dirtyReturn(now);
    saveDirt();
  }
  function render() {
    presence.style.left = `${point.x}px`; presence.style.top = `${point.y}px`;
    const punchFrame = punchStarted === null ? null
      : model.punchFrame(performance.now() - punchStarted, manifest, preference.matches);
    presence.dataset.motion = punchFrame === null ? motion : "punch";
    presence.dataset.character = state.characterId;
    presence.dataset.dragging = String(held);
    presence.dataset.paused = String(state.paused);
    presence.dataset.quiet = String(Boolean(state.quietMode));
    presence.dataset.platform = support?.ownerId || "";
    presence.dataset.falling = String(!support && !held);
    presence.dataset.roomSide = point.x < innerWidth / 2 ? "left" : "right";
    presence.dataset.roomBubble = point.y < 175 ? "below" : "above";
    presence.dataset.dirtLevel = String(desktopDirt.remainingShakes);
    presence.dataset.identityReady = String(state.identityReady);
    presence.dataset.mode = state.mode;
    const transitionIndex = Math.floor((performance.now() - transitionStartedAt) / 75);
    const shakeIndex = shakeStartedAt === null ? null : model.shakeFrame(performance.now() - shakeStartedAt, preference.matches);
    const source = punchFrame === null
      ? motion === "shake" && shakeIndex !== null
        ? `../public/static/panda/desktop-shake/${desktopDirt.remainingShakes}/${shakeIndex + 1}.png`
        : transitionFrames[transitionIndex] ?? model.sprite(state.characterId, motion, frame, manifest)
      : `../public/static/panda/punch/${punchFrame}.png`;
    if (transitionIndex >= transitionFrames.length) transitionFrames = [];
    if (image.getAttribute("src") !== source) image.setAttribute("src", source);
    image.style.top = `${model.spriteTop(source)}px`;
    image.dataset.sprite = punchFrame === null ? motion : "punch";
    image.dataset.frame = String(punchFrame ?? frame);
    if (dirt) {
      const dirtyLevel = desktopDirt.remainingShakes;
      const dirtSource = dirtyLevel ? `../public/static/panda/desktop-shake/soil-${dirtyLevel}.png` : "";
      if (dirt.getAttribute("src") !== dirtSource) {
        if (dirtSource) dirt.setAttribute("src", dirtSource);
        else dirt.removeAttribute("src");
      }
      dirt.hidden = !dirtyLevel || motion === "shake" || state.characterId !== "panda";
    }
    presence.dataset.shaking = String(motion === "shake");
  }
  function setMotion(value) {
    if (motion === value) return;
    if (motion === "shake") shakeStartedAt = null;
    transitionFrames = preference.matches ? [] : model.transition(state.characterId, motion, value);
    transitionStartedAt = performance.now();
    motion = value; frame = 0; lastFrame = performance.now(); render();
  }
  function settledMotion() {
    return state.quietMode && quietRest ? quietRest.motion : "idle";
  }
  function closePrompt() {
    promptOpen = false; bubble.hidden = true;
    nextWalk = performance.now() + 2000; publishRegions();
  }
  function showPrompt() {
    if (held || !state.identityReady) return;
    destination = null;
    if (!state.quietMode) setMotion("idle");
    promptOpen = true;
    copy.textContent = "要回家吗？"; actions.hidden = false; bubble.hidden = false;
    render(); publishRegions();
  }
  actor.addEventListener("click", event => {
    if (event.detail !== 0 && performance.now() < suppressClickUntil) return;
    if (state.characterId !== "panda") { showPrompt(); return; }
    if (held || !support || !state.identityReady || punchStarted !== null || motion === "shake" || !manifest.punch) return;
    destination = null; closePrompt(); setMotion("idle");
    punchStarted = performance.now() + transitionFrames.length * 75;
    render();
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
    punchStarted = null;
    held = true; support = null; velocity = 0; destination = null; closePrompt(); setMotion("grab");
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
    point = geometry.constrain({ x: press.x - press.offsetX, y: press.y - press.offsetY }, innerWidth, innerHeight);
    render(); publishRegions();
  });
  function endDrag(e) {
    if (!press || (e && press.id !== e.pointerId)) return;
    clearTimeout(press.timer); press = null;
    if (held) {
      held = false; suppressClickUntil = performance.now() + 450;
      support = geometry.supportAt(point, surfaces); velocity = 0;
      bridge.setPetDragging(false); setMotion(support ? settledMotion() : "grab"); nextWalk = performance.now() + 2000;
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
    const quietChanged = Boolean(state.quietMode) !== Boolean(value.quietMode);
    state = value;
    if (changed || quietChanged || state.mode !== "desktop" || state.paused) punchStarted = null;
    if (changed && value.characterId !== "panda") shakeStartedAt = null;
    if (state.quietMode && (!quietRest || quietChanged)) quietRest = model.quietRest(null, performance.now());
    if (!state.quietMode) quietRest = null;
    if (changed) transitionFrames = [];
    if (state.mode !== "desktop" || !state.identityReady) endDrag();
    if (changed || quietChanged || state.paused || state.mode !== "desktop") {
      destination = null; closePrompt();
      if (!held) setMotion(support ? settledMotion() : "grab");
      if (quietChanged && !state.quietMode) nextWalk = performance.now() + 200;
    }
    presence.hidden = !state.identityReady || state.mode !== "desktop";
    render(); publishRegions();
  }
  unsubs.push(bridge.onDesktopPetState(applyState));
  function applyPlatforms(snapshot) {
    if (!snapshot || !Number.isFinite(snapshot.revision) || snapshot.revision < platformRevision
      || !Array.isArray(snapshot.windows)) return;
    platformRevision = snapshot.revision;
    windows = snapshot.windows;
    surfaces = geometry.platforms(windows, innerWidth, innerHeight);
  }
  unsubs.push(bridge.onDesktopPlatforms(applyPlatforms));
  void bridge.desktopPlatforms().then(applyPlatforms).catch(() => {
    console.error("桌面平台资料暂不可用，将仅沿任务栏活动。");
  });
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
    const physical = state.mode === "desktop" && state.identityReady
      && document.visibilityState !== "hidden" && !held && !press;
    if (physical) {
      const previousSupport = support;
      const tracked = geometry.track(point, support, surfaces);
      const moved = tracked.point.x !== point.x || tracked.point.y !== point.y;
      if (support && (!tracked.support || moved)) {
        if (!tracked.support) {
          punchStarted = null;
          fallOriginY = previousSupport?.ownerId === "taskbar" ? null : previousSupport?.y ?? null;
        }
        destination = null; velocity = 0; nextWalk = now + 1500;
        setMotion(tracked.support ? settledMotion() : "grab");
      }
      point = tracked.point; support = tracked.support;
      if (!support) {
        const falling = geometry.fall(point, velocity, delta, surfaces, preference.matches);
        point = falling.point; velocity = falling.velocity; support = falling.support;
        destination = null; nextWalk = now + 1500;
        if (support) {
          if (model.lostWorldFall(fallOriginY, support.y)) makeDirty(Date.now());
          fallOriginY = null;
          setMotion(support ? settledMotion() : "grab");
        } else setMotion("grab");
        needsRender = true;
      } else if (moved) needsRender = true;
    }
    if (punchStarted !== null) {
      needsRender = true;
      if (now >= punchStarted && model.punchFrame(now - punchStarted, manifest, preference.matches) === null) {
        punchStarted = null; setMotion(support ? settledMotion() : "grab"); nextWalk = now + 1500;
      }
    }
    if (physical && support && state.quietMode && !promptOpen && punchStarted === null) {
      destination = null;
      if (!quietRest || now >= quietRest.until) quietRest = model.quietRest(quietRest?.motion, now);
      setMotion(quietRest.motion);
    }
    const canClean = physical && support && state.characterId === "panda" && desktopDirt.remainingShakes > 0
      && !state.quietMode && !state.paused && !promptOpen && punchStarted === null;
    const canShake = canClean && !preference.matches;
    const cleaningNow = Date.now();
    if (canClean && preference.matches && motion === "shake" && shakeStartedAt !== null) {
      desktopDirt = model.finishShake(desktopDirt, cleaningNow);
      shakeStartedAt = null; saveDirt(); setMotion("idle"); nextWalk = now + 1800; needsRender = true;
    } else if (canShake && motion === "shake" && shakeStartedAt !== null
      && now - shakeStartedAt >= model.shakeFrameCount * model.shakeFrameIntervalMs) {
      desktopDirt = model.finishShake(desktopDirt, cleaningNow);
      saveDirt(); shakeStartedAt = null;
      setMotion("idle"); nextWalk = now + 1800; needsRender = true;
    } else if (canClean && preference.matches && motion !== "shake" && cleaningNow >= desktopDirt.nextShakeAt) {
      desktopDirt = model.finishShake(desktopDirt, cleaningNow);
      saveDirt(); needsRender = true;
    } else if (canShake && motion !== "shake" && cleaningNow >= desktopDirt.nextShakeAt) {
      destination = null; shakeStartedAt = now; setMotion("shake"); render(); needsRender = true;
    }
    const active = physical && support && punchStarted === null && motion !== "shake"
      && !state.quietMode && !state.paused && !preference.matches && !promptOpen;
    if (active) {
      if (!destination && now >= nextWalk) {
        destination = geometry.walkTarget(point, support);
        if (destination) {
          presence.dataset.facing = destination.x < point.x ? "left" : "right";
          setMotion("walk");
        } else { setMotion("idle"); nextWalk = now + 3000; }
      }
      if (destination && !transitionFrames.length) {
        const step = model.advance(point, destination, delta, state.characterId);
        point = { x: Math.min(support.right, Math.max(support.left, step.point.x)), y: support.y };
        needsRender = true;
        if (step.arrived) {
          destination = null; nextWalk = now + 4500 + Math.random() * 5500;
          setMotion(Math.random() < .2 ? "sleep" : "idle");
        }
      }
    } else if (!state.quietMode && support && !held && !promptOpen && (state.paused || preference.matches)) {
      destination = null; setMotion("idle");
    }
    const interval = motion === "shake" ? model.shakeFrameIntervalMs
      : motion === "walk" ? state.characterId === "xiaobai" ? 140 : 180
      : motion === "sleep" ? 520 : 420;
    if (now - lastFrame >= interval && !preference.matches && !state.quietMode) {
      if (motion !== "shake") frame++;
      lastFrame = now;
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
    surfaces = geometry.platforms(windows, innerWidth, innerHeight);
    point = geometry.constrain(point, innerWidth, innerHeight); destination = null; render(); publishRegions();
  });
  const hitTimer = setInterval(publishRegions, 100);
  window.addEventListener("beforeunload", () => {
    disposed = true; endDrag(); clearInterval(hitTimer); unsubs.forEach(off => off?.());
  }, { once: true });
  presence.hidden = true; render(); requestAnimationFrame(tick);
})();
