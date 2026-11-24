/* Desktop-only platforms: horizontal walking, gravity, drag and return home.
 * Room gifts, falls, toys and AI performances intentionally do not drive this layer. */
(() => {
  "use strict";
  const bridge = window.pandaDesktop, model = window.PandaDesktopPet, geometry = window.PandaDesktopPlatforms;
  const biteModel = window.PandaBackgroundBite;
  const actor = document.getElementById("panda"), image = document.getElementById("panda-sprite");
  const biteCanvas = document.getElementById("background-bite"), biteContext = biteCanvas.getContext("2d");
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
  let promptOpen = false, restMenuOpen = false, disposed = false;
  let nextBiteAt = Infinity, bitePending = null, backgroundBite = null;
  let nextEdgeAt = Infinity, edgeClimb = null, edgeFrame = null;
  let transitionFrames = [], transitionStartedAt = 0;
  const dirtStorageKey = "panda.desktop.dirt.v1";
  let desktopDirt = loadDirt();
  let fallOriginY = null;
  let landingStarted = null;
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
    const now = performance.now();
    const punchFrame = punchStarted === null ? null
      : model.punchFrame(now - punchStarted, manifest, preference.matches);
    const landing = landingStarted === null ? null
      : model.landingFrame(state.characterId, now - landingStarted, preference.matches);
    presence.dataset.motion = edgeFrame ? "edge-climb" : landing ? "landing" : punchFrame === null ? motion : "punch";
    presence.dataset.landing = landing?.phase ?? "";
    presence.dataset.edgeClimb = edgeFrame?.phase ?? "";
    presence.dataset.character = state.characterId;
    presence.dataset.dragging = String(held);
    presence.dataset.paused = String(state.paused);
    presence.dataset.quiet = String(Boolean(state.quietMode));
    presence.dataset.platform = support?.ownerId || "";
    presence.dataset.falling = String(!support && !held && !edgeClimb);
    presence.dataset.roomSide = point.x < innerWidth / 2 ? "left" : "right";
    presence.dataset.roomBubble = point.y < 175 ? "below" : "above";
    presence.dataset.dirtLevel = String(desktopDirt.remainingShakes);
    presence.dataset.identityReady = String(state.identityReady);
    presence.dataset.mode = state.mode;
    const transitionIndex = Math.floor((now - transitionStartedAt) / 75);
    const shakeIndex = shakeStartedAt === null ? null : model.shakeFrame(now - shakeStartedAt, preference.matches);
    const biting = backgroundBite !== null;
    const biteElapsed = biting ? now - backgroundBite.started : 0;
    const biteFrame = biting ? biteModel.frameAt(biteElapsed, backgroundBite.stayLow) : null;
    biteCanvas.hidden = !biting;
    presence.dataset.biting = String(biting);
    if (biting) biteModel.draw(biteContext, backgroundBite, biteElapsed);
    const source = edgeFrame ? edgeFrame.source : landing ? landing.source : biteFrame ? biteFrame.source : punchFrame === null
      ? motion === "shake" && shakeIndex !== null
        ? `../public/static/panda/desktop-shake/${desktopDirt.remainingShakes}/${shakeIndex + 1}.png`
        : transitionFrames[transitionIndex] ?? model.sprite(state.characterId, motion, frame, manifest)
      : `../public/static/panda/punch/${punchFrame}.png`;
    if (transitionIndex >= transitionFrames.length) transitionFrames = [];
    if (image.getAttribute("src") !== source) image.setAttribute("src", source);
    image.style.top = `${edgeFrame ? (96 - edgeFrame.bottom) * 40 / 96 : model.spriteTop(source)}px`;
    image.style.left = edgeFrame ? `${(edgeClimb.route.side === "left" ? -1 : 1) * edgeFrame.grip}px` : "";
    if (edgeFrame) presence.dataset.edgeFlip = String(edgeFrame.nativeLeft !== (edgeClimb.route.side === "left"));
    else delete presence.dataset.edgeFlip;
    if (biteFrame) image.dataset.biteFlip = String(biteFrame.nativeLeft !== backgroundBite.left);
    else delete image.dataset.biteFlip;
    image.dataset.sprite = edgeFrame ? "edge-climb" : landing ? "landing" : biting ? "background-bite" : punchFrame === null ? motion : "punch";
    image.dataset.frame = String(punchFrame ?? frame);
    if (dirt) {
      const dirtyLevel = desktopDirt.remainingShakes;
      const dirtSource = dirtyLevel ? `../public/static/panda/desktop-shake/soil-${dirtyLevel}.png` : "";
      if (dirt.getAttribute("src") !== dirtSource) {
        if (dirtSource) dirt.setAttribute("src", dirtSource);
        else dirt.removeAttribute("src");
      }
      dirt.hidden = !dirtyLevel || motion === "shake" || state.characterId !== "panda";
      const clipped = (landing || edgeFrame) && !dirt.hidden;
      // Keep stains inside the active silhouette during a pose change.
      dirt.style.top = clipped ? image.style.top : "";
      dirt.style.left = clipped ? image.style.left : "";
      dirt.style.maskImage = clipped ? `url("${image.src}")` : "";
    }
    presence.dataset.shaking = String(motion === "shake");
  }
  function setMotion(value, animate = true) {
    if (motion === value) return;
    if (motion === "shake") shakeStartedAt = null;
    transitionFrames = animate && !preference.matches ? model.transition(state.characterId, motion, value) : [];
    transitionStartedAt = performance.now();
    motion = value; frame = 0; lastFrame = performance.now(); render();
  }
  function settledMotion() {
    return state.restPose ?? (state.quietMode && quietRest ? quietRest.motion : "idle");
  }
  function touchDown(now) {
    // Grab stays on screen until gravity finds a real support; only the contact
    // frame may start the recovery. Pause/quiet settings are not changed.
    transitionFrames = [];
    landingStarted = preference.matches ? null : now;
    setMotion(landingStarted === null ? settledMotion() : "idle", false);
  }
  function startEdgeClimb(route) {
    edgeClimb = { route, elapsed: 0 };
    edgeFrame = model.edgeClimbAt(route, 0);
    destination = null; support = null; velocity = 0; fallOriginY = null;
    transitionFrames = [];
  }
  function cancelEdgeClimb() {
    if (!edgeClimb && !destination?.edgeRoute) return false;
    edgeClimb = null; edgeFrame = null; destination = null;
    support = geometry.supportAt(point, surfaces); velocity = 0;
    nextWalk = performance.now() + 1500;
    setMotion(support ? settledMotion() : "grab");
    return true;
  }
  function cancelBite() {
    if (!bitePending && !backgroundBite) return false;
    bitePending = null; backgroundBite = null;
    nextWalk = performance.now() + 500;
    return true;
  }
  function canBite(walking, manual = false) {
    return Boolean(biteContext && support) && biteModel.canStart(state, walking,
      Boolean(held || press || promptOpen || restMenuOpen || landingStarted !== null || punchStarted !== null || motion === "shake"
        || document.visibilityState === "hidden"), preference.matches, manual);
  }
  async function tryBite(now, manual = false) {
    const request = { left: presence.dataset.facing === "left", manual,
      stayLow: ["sleep", "lying"].includes(motion) };
    bitePending = request;
    nextBiteAt = biteModel.nextAt(now);
    destination = null; setMotion(settledMotion()); publishRegions();
    let color;
    try { color = await bridge.backgroundColor(request.left, request.manual); }
    catch { color = null; }
    if (bitePending !== request) return;
    bitePending = null;
    nextWalk = performance.now() + 500;
    if (!canBite(true, request.manual) || !biteModel.validColor(color)) return;
    transitionFrames = [];
    backgroundBite = { ...request, color, started: performance.now() };
    render();
  }
  unsubs.push(bridge.onBiteNow(() => {
    if (!bitePending && !backgroundBite && canBite(false, true)) void tryBite(performance.now(), true);
  }));
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
  actor.addEventListener("click", async event => {
    if (event.detail !== 0 && performance.now() < suppressClickUntil) return;
    if (state.identityStatus === "offline-trial") {
      if (held || !state.identityReady || restMenuOpen) return;
      if (cancelBite()) render();
      if (cancelEdgeClimb()) render();
      restMenuOpen = true;
      destination = null;
      if (support && motion !== "shake") setMotion(settledMotion());
      try { await bridge.openRestMenu(); }
      catch (error) { console.error("桌宠休息菜单未能打开：", error.message); }
      finally { restMenuOpen = false; nextWalk = performance.now() + 500; }
      return;
    }
    if (state.characterId !== "panda") { showPrompt(); return; }
    if (held || !support || !state.identityReady || punchStarted !== null || motion === "shake" || !manifest.punch) return;
    landingStarted = null;
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
    landingStarted = null;
    cancelEdgeClimb();
    held = true; support = null; velocity = 0; destination = null; closePrompt(); setMotion("grab");
    bridge.setPetDragging(true);
    bridge.setIgnoreMouseEvents(false);
    render();
  }
  actor.addEventListener("pointerdown", e => {
    if (e.button !== 0 || !e.isPrimary) return;
    if (cancelBite()) render();
    actor.setPointerCapture(e.pointerId);
    press = { id: e.pointerId, offsetX: e.clientX - point.x, offsetY: e.clientY - point.y,
      x: e.clientX, y: e.clientY, timer: setTimeout(beginDrag, 380) };
  });
  actor.addEventListener("contextmenu", () => {
    const stoppedBite = cancelBite();
    if (cancelEdgeClimb() || stoppedBite) render();
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
      const now = performance.now();
      held = false; suppressClickUntil = now + 450;
      support = geometry.supportAt(point, surfaces); velocity = 0;
      bridge.setPetDragging(false);
      if (support) {
        point = { x: point.x, y: support.y };
        if (state.identityReady && state.mode === "desktop") touchDown(now);
      } else setMotion("grab");
      nextWalk = now + 2000;
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
    const poseChanged = state.restPose !== value.restPose;
    const biteEnabled = value.backgroundBite === true && state.backgroundBite !== true;
    const entering = value.identityReady && value.mode === "desktop" &&
      (!state.identityReady || state.mode !== "desktop" || changed);
    state = value;
    if (entering) nextEdgeAt = model.nextEdgeClimbAt(performance.now(), undefined, true);
    if (changed || state.mode !== "desktop" || !state.identityReady) landingStarted = null;
    if (biteEnabled) nextBiteAt = biteModel.nextAt(performance.now(), undefined, true);
    if (quietChanged || poseChanged || !canBite(true, (bitePending ?? backgroundBite)?.manual)) cancelBite();
    if (state.identityStatus === "offline-trial") actor.setAttribute("aria-label", "点击选择睡觉、坐着或趴着；长按可拖动；右键打开桌宠设置");
    if (changed || quietChanged || poseChanged || state.mode !== "desktop" || state.paused) punchStarted = null;
    if (changed && value.characterId !== "panda") shakeStartedAt = null;
    if (state.quietMode && (!quietRest || quietChanged)) quietRest = model.quietRest(null, performance.now());
    if (!state.quietMode) quietRest = null;
    if (changed || state.quietMode || state.restPose || state.paused || state.mode !== "desktop" || !state.identityReady) cancelEdgeClimb();
    if (changed) transitionFrames = [];
    if (state.mode !== "desktop" || !state.identityReady) endDrag();
    if (changed || quietChanged || poseChanged || state.paused || state.mode !== "desktop") {
      destination = null; closePrompt();
      if (!held && landingStarted === null) setMotion(support ? settledMotion() : "grab");
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
  // Cache one-shot sprites so their short poses are ready on the first play.
  for (const source of [...model.landingSources, ...biteModel.spriteSources, ...model.edgeClimbSources]) new Image().src = source;
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
    if (preference.matches && cancelEdgeClimb()) needsRender = true;
    if (physical && edgeClimb) {
      const { route } = edgeClimb;
      edgeClimb.elapsed += Math.max(0, Math.min(delta, .05)) * 1000;
      edgeFrame = model.edgeClimbAt(route, edgeClimb.elapsed);
      point = { x: route.x, y: edgeFrame?.y ?? route.groundY };
      if (!edgeFrame) {
        edgeClimb = null; support = geometry.supportAt(point, surfaces);
        nextWalk = now + 43000;
        setMotion(support ? "stare" : "grab");
      }
      needsRender = true;
    } else if (physical) {
      const previousSupport = support;
      const tracked = geometry.track(point, support, surfaces);
      const moved = tracked.point.x !== point.x || tracked.point.y !== point.y;
      if (support && (!tracked.support || moved)) {
        if (cancelBite()) needsRender = true;
        if (!tracked.support) {
          punchStarted = null;
          landingStarted = null;
          fallOriginY = previousSupport?.ownerId === "taskbar" ? null : previousSupport?.y ?? null;
        }
        destination = null; velocity = 0; nextWalk = now + 1500;
        if (landingStarted === null) setMotion(tracked.support ? settledMotion() : "grab");
      }
      point = tracked.point; support = tracked.support;
      if (!support) {
        const falling = geometry.fall(point, velocity, delta, surfaces, preference.matches);
        point = falling.point; velocity = falling.velocity; support = falling.support;
        destination = null; nextWalk = now + 1500;
        if (support) {
          if (model.lostWorldFall(fallOriginY, support.y)) makeDirty(Date.now());
          fallOriginY = null;
          touchDown(now);
        } else setMotion("grab");
        needsRender = true;
      } else if (moved) needsRender = true;
    }
    if (landingStarted !== null) {
      needsRender = true;
      if (!model.landingFrame(state.characterId, now - landingStarted, preference.matches)) {
        landingStarted = null;
        setMotion(settledMotion());
        nextWalk = Math.max(nextWalk, now + 400);
      }
    }
    if (bitePending || backgroundBite) {
      if (!canBite(true, (bitePending ?? backgroundBite).manual)
        || (backgroundBite && now - backgroundBite.started >= biteModel.duration)) {
        if (cancelBite()) needsRender = true;
      } else if (backgroundBite) needsRender = true;
    } else if (physical && destination && !destination.edgeRoute && now >= nextBiteAt && canBite(motion === "walk")) {
      void tryBite(now);
    }
    if (punchStarted !== null) {
      needsRender = true;
      if (now >= punchStarted && model.punchFrame(now - punchStarted, manifest, preference.matches) === null) {
        punchStarted = null; setMotion(support ? settledMotion() : "grab"); nextWalk = now + 1500;
      }
    }
    if (physical && support && state.quietMode && !promptOpen && !restMenuOpen
      && landingStarted === null && punchStarted === null) {
      destination = null;
      if (!quietRest || now >= quietRest.until) quietRest = model.quietRest(quietRest?.motion, now);
      setMotion(quietRest.motion);
    }
    const canClean = physical && support && state.characterId === "panda" && desktopDirt.remainingShakes > 0
      && !state.quietMode && !state.paused && !state.restPose && !promptOpen && !restMenuOpen
      && !bitePending && !backgroundBite && landingStarted === null && punchStarted === null;
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
    const active = physical && support && landingStarted === null && punchStarted === null && motion !== "shake"
      && !state.quietMode && !state.paused && !state.restPose && !preference.matches && !promptOpen && !restMenuOpen
      && !bitePending && !backgroundBite;
    if (active) {
      if (!destination && now >= nextWalk) {
        const route = state.characterId === "panda" && now >= nextEdgeAt ? geometry.edgeRoute(point, support) : null;
        if (route) {
          destination = { x: route.x, y: route.groundY, edgeRoute: route };
          nextEdgeAt = model.nextEdgeClimbAt(now);
        } else destination = geometry.walkTarget(point, support);
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
          const route = destination.edgeRoute;
          destination = null;
          if (route) {
            point = { x: route.x, y: route.groundY };
            presence.dataset.facing = route.side;
            startEdgeClimb(route);
          } else if (state.characterId === "panda") {
            const rest = model.companionRest(now);
            nextWalk = rest.until;
            setMotion(rest.motion);
          } else {
            nextWalk = now + 4500 + Math.random() * 5500;
            setMotion(Math.random() < .2 ? "sleep" : "idle");
          }
        }
      }
    } else if (!state.quietMode && !state.restPose && support && !held && !promptOpen && (state.paused || preference.matches)) {
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
    cancelBite(); surfaces = geometry.platforms(windows, innerWidth, innerHeight);
    point = geometry.constrain(point, innerWidth, innerHeight);
    cancelEdgeClimb(); destination = null; render(); publishRegions();
  });
  const hitTimer = setInterval(publishRegions, 100);
  window.addEventListener("beforeunload", () => {
    disposed = true; endDrag(); clearInterval(hitTimer); unsubs.forEach(off => off?.());
  }, { once: true });
  presence.hidden = true; render(); requestAnimationFrame(tick);
})();
