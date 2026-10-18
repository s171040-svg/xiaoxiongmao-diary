(() => {
  "use strict";

  const desktop = window.pandaDesktop;
  const roamingGeometry = window.PandaRoaming;
  const fullDesktop = new URLSearchParams(window.location.search).get("desktopMode") === "full";
  if (fullDesktop) document.documentElement.dataset.fullDesktop = "true";
  const panda = document.getElementById("panda");
  const pandaSprite = document.getElementById("panda-sprite");
  const presence = document.querySelector(".pet-presence");
  const speech = document.getElementById("speech");
  const speechCopy = document.getElementById("speech-copy");
  const actions = document.getElementById("speech-actions");
  const openJournalButton = document.getElementById("open-journal");
  const dismissButton = document.getElementById("dismiss-prompt");
  const giftCard = document.getElementById("pet-gift-card");
  const giftButton = document.getElementById("pet-gift-button");
  const giftObject = document.getElementById("pet-gift-object");
  const giftCopy = document.getElementById("pet-gift-copy");
  const homeObjects = [document.getElementById("desktop-bed"), document.getElementById("desktop-bathtub")];

  const phrases = [
    "你好呀～",
    "我想你了。",
    "今天也要开心哦。",
    "我在听呢。慢慢来就好。",
    "今天也辛苦啦，先歇一会儿吧。",
    "谢谢你愿意和我待一会儿。",
    "不用急着想明白，我陪着你。",
    "给心情留一点位置，也很好。"
  ];
  const doubleClickWindow = 285;
  const ordinarySpeechDuration = 3700;
  let phraseIndex = -1;
  let clickTimer = 0;
  let speechTimer = 0;
  let lastClickAt = 0;
  let interactionCaptured = null;
  let currentMotion = "idle";
  let animationManifest = {
    frameCount: 4,
    frameCountBySprite: { chew: 14 },
    frameIntervalMs: { idle: 420, walk: 180, sleep: 520, chew: 350, roll: 170, jump: 180, cuddle: 230 },
    motionSprites: { idle: "idle", walk: "walk", sleep: "sleep" },
    actionSprites: { idle: "idle", bamboo: "chew", roll: "idle", jump: "jump", spin: "idle", somersault: "jump", tail: "cuddle", tumble: "idle", cuddle: "cuddle" }
  };
  let frameTimer = 0;
  let currentFrame = 0;
  let bambooPhase = "idle";
  const bambooEatEndFrame = 14;
  const bambooDropMs = 780;
  let bambooDropTimer = 0;
  let actionTransitionTimer = 0;
  let actionTransitionSequence = 0;
  let activeBambooToken = null;
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let roomPoint = { u: 0.5, v: 0.58 };
  let roomRoaming = false;
  let roomTimer = 0;
  let roomFrame = 0;
  let giftId = "";
  let desktopObstacles = [];

  function projectRoomPoint(point) {
    if (roamingGeometry) {
      return roamingGeometry.projectRoomPoint(point, window.innerWidth, window.innerHeight, fullDesktop);
    }
    const u = Math.min(1, Math.max(0, point.u));
    const v = Math.min(1, Math.max(0, point.v));
    const halfWidth = 28 + v * 18;
    return { x: 50 + (u - 0.5) * 2 * halfWidth, y: 14 + v * 62, scale: 0.62,
      shadowScale: 0.62 + v * 0.46, zIndex: 10 + Math.round(v * 100) };
  }

  function setRoomPoint(point) {
    roomPoint = point;
    const projected = projectRoomPoint(point);
    presence.style.left = `${projected.x}%`;
    presence.style.top = `${projected.y}%`;
    presence.style.zIndex = String(projected.zIndex);
    presence.style.setProperty("--depth-scale", projected.scale.toFixed(3));
    presence.style.setProperty("--shadow-depth-scale", projected.shadowScale.toFixed(3));
    const speechSide = projected.x < 42 ? "left" : projected.x > 58 ? "right" : "center";
    presence.dataset.roomSide = speechSide;
    presence.dataset.roomBubble = projected.y < 34 ? "below" : "above";
    presence.dataset.roomU = point.u.toFixed(3);
    presence.dataset.roomV = point.v.toFixed(3);
    presence.dataset.roomScale = projected.scale.toFixed(3);
  }

  function getRoomObstacles() {
    if (!fullDesktop) return [];
    const furniture = homeObjects.map((element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        : null;
    }).filter(Boolean);
    return [...desktopObstacles, ...furniture];
  }

  function roomPointIsBlocked(point) {
    return fullDesktop && roamingGeometry
      && !roamingGeometry.isPointClear(point, getRoomObstacles(), window.innerWidth, window.innerHeight, true);
  }

  function chooseRoomTarget(from) {
    if (fullDesktop && roamingGeometry) {
      return roamingGeometry.findSafePoint(
        from, getRoomObstacles(), window.innerWidth, window.innerHeight, true,
      );
    }
    return { u: 0.08 + Math.random() * 0.84, v: 0.08 + Math.random() * 0.84 };
  }

  function roomCanRoam() {
    return currentMotion === "walk" && presence.dataset.stage !== "performing"
      && presence.dataset.stage !== "returning" && presence.dataset.stage !== "away"
      && presence.dataset.stage !== "fallen" && !motionPreference.matches
      && document.visibilityState !== "hidden";
  }

  function scheduleRoomStep(delay = 400 + Math.random() * 800) {
    if (!roomRoaming || !roomCanRoam() || roomTimer || roomFrame) return;
    roomTimer = window.setTimeout(() => {
      roomTimer = 0;
      if (!roomRoaming || !roomCanRoam()) return;
      let from = { ...roomPoint };
      let to = chooseRoomTarget(from);
      if (!to) {
        scheduleRoomStep(1100);
        return;
      }
      let startedAt = performance.now();
      let duration = 2500 + Math.random() * 1700;
      let lastClearPoint = roomPointIsBlocked(from) ? null : { ...from };
      const step = (now) => {
        roomFrame = 0;
        if (!roomRoaming || !roomCanRoam()) return;
        let progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress * progress * (3 - 2 * progress);
        let nextPoint = {
          u: from.u + (to.u - from.u) * eased,
          v: from.v + (to.v - from.v) * eased
        };
        const blocked = roomPointIsBlocked(nextPoint);
        if (blocked && lastClearPoint) {
          const detour = chooseRoomTarget(lastClearPoint);
          if (!detour) {
            setRoomPoint(lastClearPoint);
            roomPoint = { ...lastClearPoint };
            scheduleRoomStep(1100);
            return;
          }
          from = { ...lastClearPoint };
          to = detour;
          startedAt = now;
          duration = 1400 + Math.random() * 1000;
          progress = 0;
          nextPoint = { ...from };
        } else if (!blocked) {
          lastClearPoint = { ...nextPoint };
        }
        setRoomPoint(nextPoint);
        if (progress < 1) roomFrame = window.requestAnimationFrame(step);
        else scheduleRoomStep();
      };
      roomFrame = window.requestAnimationFrame(step);
    }, delay);
  }

  function stopRoomRoaming() {
    roomRoaming = false;
    window.clearTimeout(roomTimer);
    roomTimer = 0;
    if (roomFrame) window.cancelAnimationFrame(roomFrame);
    roomFrame = 0;
  }

  function syncRoomRoaming() {
    if (!roomCanRoam()) { stopRoomRoaming(); return; }
    if (!roomRoaming) roomRoaming = true;
    scheduleRoomStep();
  }

  setRoomPoint(roomPoint);

  function applySprite() {
    const stage = presence.dataset.stage;
    const sprite = stage === "returning" ? "walk"
      : stage === "performing" ? (animationManifest.actionSprites[presence.dataset.action] || "idle")
        : (animationManifest.motionSprites[currentMotion] || "idle");
    window.clearInterval(frameTimer);
    currentFrame = stage === "performing" && presence.dataset.action === "bamboo"
      && bambooPhase === "eating" && motionPreference.matches ? bambooEatEndFrame : 0;
    pandaSprite.dataset.sprite = sprite;

    function showFrame() {
      const source = currentFrame === 0
        ? `../public/static/panda/${sprite}.png${sprite === "chew" ? "?v=chew-feed-4" : ""}`
        : `../public/static/panda/frames/${sprite}-${currentFrame}.png${sprite === "chew" ? "?v=chew-feed-4" : ""}`;
      pandaSprite.dataset.frame = String(currentFrame);
      pandaSprite.setAttribute("src", source);
    }
    showFrame();

    const waitingForSnack = stage === "performing" && presence.dataset.action === "bamboo" && bambooPhase !== "eating";
    if (stage === "fallen" || stage === "away" || motionPreference.matches || waitingForSnack) return;
    const spriteFrameCount = animationManifest.frameCountBySprite?.[sprite] || animationManifest.frameCount;
    frameTimer = window.setInterval(() => {
      const isBambooEating = sprite === "chew" && stage === "performing"
        && presence.dataset.action === "bamboo" && bambooPhase === "eating";
      if (isBambooEating) {
        currentFrame = Math.min(currentFrame + 1, spriteFrameCount);
      } else {
        currentFrame = (currentFrame + 1) % (spriteFrameCount + 1);
      }
      showFrame();
      if (isBambooEating && currentFrame >= spriteFrameCount) {
        window.clearInterval(frameTimer);
        frameTimer = 0;
      }
    }, animationManifest.frameIntervalMs[sprite] || 180);
  }

  applySprite();
  motionPreference.addEventListener("change", () => { applySprite(); syncRoomRoaming(); });
  document.addEventListener("visibilitychange", syncRoomRoaming);

  fetch("../src/lib/panda-animation-manifest.json")
    .then(response => {
      if (!response.ok) throw new Error(`Animation manifest unavailable (${response.status})`);
      return response.json();
    })
    .then(manifest => {
      if (!manifest || !Number.isInteger(manifest.frameCount) || !manifest.motionSprites || !manifest.actionSprites || !manifest.frameIntervalMs) {
        throw new Error("Animation manifest is invalid");
      }
      animationManifest = manifest;
      applySprite();
    })
    .catch(error => console.error("无法读取小熊猫动画配置：", error));

  function setMouseCapture(ignore) {
    if (!desktop || typeof desktop.setIgnoreMouseEvents !== "function") return;
    const shouldCapture = !ignore;
    if (interactionCaptured === shouldCapture) return;
    interactionCaptured = shouldCapture;
    desktop.setIgnoreMouseEvents(ignore);
  }

  function showSpeech(message, promptMode) {
    window.clearTimeout(speechTimer);
    speechCopy.textContent = message;
    actions.hidden = !promptMode;
    speech.hidden = false;
    presence.classList.toggle("is-attentive", true);
    if (!promptMode) {
      speechTimer = window.setTimeout(() => {
        speech.hidden = true;
        presence.classList.remove("is-attentive");
      }, ordinarySpeechDuration);
    }
  }

  function dismissSpeech() {
    window.clearTimeout(speechTimer);
    speech.hidden = true;
    actions.hidden = true;
    presence.classList.remove("is-attentive");
  }

  function showPrompt() {
    showSpeech("今天有什么烦心事呢？", true);
    setMouseCapture(false);
  }

  function speakGently() {
    let next = Math.floor(Math.random() * phrases.length);
    if (next === phraseIndex) next = (next + 1) % phrases.length;
    phraseIndex = next;
    const phrase = phrases[next];
    showSpeech(phrase, false);
    setMouseCapture(false);
  }

  function handlePandaActivation(event) {
    // Native mouse double-clicks expose detail >= 2. The timer also gives
    // keyboard users the same double-activation behavior without relying on
    // a mouse-only dblclick event.
    const now = Date.now();
    const isSecondActivation = now - lastClickAt <= doubleClickWindow;
    lastClickAt = now;
    window.clearTimeout(clickTimer);

    if (event.detail >= 2 || isSecondActivation) {
      lastClickAt = 0;
      showPrompt();
      return;
    }

    clickTimer = window.setTimeout(() => {
      lastClickAt = 0;
      if (desktop && typeof desktop.greet === "function") {
        try { desktop.greet(); } catch (_) { speakGently(); }
        setMouseCapture(false);
      } else speakGently();
    }, doubleClickWindow);
  }

  let drag = null;
  let suppressClick = false;

  function finishDrag(event) {
    if (!drag) return;
    if (event && event.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    drag = null;
    delete panda.dataset.dragging;
    if (desktop && typeof desktop.setDragging === "function") desktop.setDragging(false);
    if (moved && fullDesktop && desktop && typeof desktop.rememberRoom === "function") desktop.rememberRoom(roomPoint);
    if (moved && fullDesktop && desktop && typeof desktop.setPinned === "function") desktop.setPinned(true);
  }

  panda.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !desktop) return;
    const projected = projectRoomPoint(roomPoint);
    drag = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      lastX: event.screenX,
      lastY: event.screenY,
      moved: false,
      offsetX: event.clientX - window.innerWidth * projected.x / 100,
      offsetY: event.clientY - window.innerHeight * projected.y / 100,
    };
    if (typeof desktop.setDragging === "function") desktop.setDragging(true);
    try { panda.setPointerCapture(event.pointerId); } catch { /* 指针可能已经捕获 */ }
  });

  panda.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(event.screenX - drag.startX, event.screenY - drag.startY) < 6) return;
    drag.moved = true;
    suppressClick = true;
    panda.dataset.dragging = "true";
    stopRoomRoaming();
    if (fullDesktop && roamingGeometry && typeof roamingGeometry.roomPointFromAnchor === "function") {
      const anchorX = (event.clientX - drag.offsetX) / Math.max(1, window.innerWidth) * 100;
      const anchorY = (event.clientY - drag.offsetY) / Math.max(1, window.innerHeight) * 100;
      const next = roamingGeometry.roomPointFromAnchor(anchorX, anchorY, true);
      if (next) setRoomPoint(next);
      return;
    }
    if (typeof desktop.moveBy === "function") {
      desktop.moveBy(event.screenX - drag.lastX, event.screenY - drag.lastY);
      drag.lastX = event.screenX;
      drag.lastY = event.screenY;
    }
  });

  panda.addEventListener("pointerup", finishDrag);
  panda.addEventListener("pointercancel", finishDrag);
  window.addEventListener("blur", () => finishDrag());

  panda.addEventListener("click", (event) => {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    handlePandaActivation(event);
  });
  panda.addEventListener("focus", () => setMouseCapture(false));
  panda.addEventListener("blur", () => setMouseCapture(true));

  openJournalButton.addEventListener("click", () => {
    dismissSpeech();
    if (desktop && typeof desktop.openJournal === "function") {
      desktop.openJournal();
    }
  });
  dismissButton.addEventListener("click", dismissSpeech);

  // Electron forwards mousemove while the window is in pass-through mode.
  // Inspect the actual visible element under the forwarded pointer so the
  // desktop remains clickable only over the panda and its visible bubble.
  function updatePointerPassThrough(event) {
    if (typeof event.clientX !== "number" || typeof event.clientY !== "number") return;
    const underPointer = document.elementFromPoint(event.clientX, event.clientY);
    const overHitArea = Boolean(underPointer && underPointer.closest(".pet-hit-area"));
    setMouseCapture(!overHitArea);
  }

  document.addEventListener("mousemove", updatePointerPassThrough, { passive: true });
  document.addEventListener("pointermove", updatePointerPassThrough, { passive: true });
  document.addEventListener("focusin", (event) => {
    if (event.target instanceof Element && event.target.closest(".pet-hit-area")) {
      setMouseCapture(false);
    }
  });
  document.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!document.activeElement?.closest?.(".pet-hit-area")) setMouseCapture(true);
    }, 0);
  });

  // Linux cannot forward ignored mousemove events. Send actual visible hit
  // regions so the main process can compare the global cursor on every OS.
  function publishHitRegions() {
    if (!desktop || typeof desktop.setHitRegions !== "function") return;
    const targets = [panda, ...(speech.hidden ? [] : [speech]), ...(giftCard.hidden ? [] : [giftButton])];
    desktop.setHitRegions(targets.map((element) => {
      const rect = element.getBoundingClientRect();
      if (element === panda && getComputedStyle(panda).visibility === "hidden") return { x: 0, y: 0, width: 0, height: 0, circle: true };
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, circle: element === panda };
    }));
  }
  const regionTimer = window.setInterval(publishHitRegions, 100);
  publishHitRegions();

  if (desktop && typeof desktop.onRestore === "function") {
    desktop.onRestore((point) => {
      if (!point || !Number.isFinite(point.u) || !Number.isFinite(point.v)) return;
      setRoomPoint({ u: Math.min(1, Math.max(0, point.u)), v: Math.min(1, Math.max(0, point.v)) });
    });
  }

  if (desktop && typeof desktop.onPetMotion === "function") {
    desktop.onPetMotion((motion) => {
      const value = typeof motion === "string" ? motion : motion && (motion.motion || motion.state);
      if (value === "walk" || value === "idle" || value === "sleep") {
        currentMotion = value;
        presence.dataset.motion = value;
        if (presence.dataset.stage !== "performing") {
          applySprite();
          syncRoomRoaming();
        }
      }
    });
  }

  if (desktop && typeof desktop.onDesktopObstacles === "function") {
    desktop.onDesktopObstacles((obstacles) => {
      desktopObstacles = Array.isArray(obstacles) ? obstacles.filter((rect) => rect
        && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
        && rect.width > 0 && rect.height > 0) : [];
    });
  }

  if (desktop && typeof desktop.onGiftState === "function") {
    desktop.onGiftState((state) => {
      const gift = state?.gift;
      if (!gift) {
        giftId = "";
        giftCard.hidden = true;
        publishHitRegions();
        return;
      }
      giftId = gift.id;
      giftObject.textContent = gift.emoji;
      giftCopy.textContent = state.startedAt ? `${gift.item} · 收好中…` : `${gift.item} · 点一下收好`;
      giftButton.disabled = Boolean(state.startedAt);
      giftButton.classList.toggle("collecting", Boolean(state.startedAt));
      giftCard.hidden = false;
      publishHitRegions();
    });
  }
  giftButton.addEventListener("click", () => {
    if (!giftId || giftButton.disabled || !desktop || typeof desktop.clickGift !== "function") return;
    giftButton.classList.add("collecting");
    giftButton.disabled = true;
    desktop.clickGift(giftId);
  });

  const carry = document.createElement("span");
  carry.className = "pet-carry";
  carry.setAttribute("aria-hidden", "true");
  carry.hidden = true;
  const snackDrop = document.createElement("img");
  snackDrop.className = "pet-snack-drop";
  snackDrop.src = "../public/static/panda/snack.png?v=chew-feed-2";
  snackDrop.alt = "";
  snackDrop.draggable = false;
  snackDrop.setAttribute("aria-hidden", "true");
  snackDrop.hidden = true;
  const actionTransition = document.createElement("img");
  actionTransition.className = "pet-action-transition";
  actionTransition.alt = "";
  actionTransition.draggable = false;
  actionTransition.setAttribute("aria-hidden", "true");
  actionTransition.hidden = true;
  panda.append(snackDrop, actionTransition);
  presence.append(carry);
  presence.dataset.bambooPhase = bambooPhase;

  function setBambooPhase(phase) {
    bambooPhase = phase;
    presence.dataset.bambooPhase = phase;
  }

  function runBambooFrames(frames, onComplete) {
    const sequence = ++actionTransitionSequence;
    window.clearTimeout(actionTransitionTimer);
    let index = 0;
    pandaSprite.hidden = true;
    actionTransition.hidden = false;
    const next = () => {
      if (sequence !== actionTransitionSequence) return;
      if (index >= frames.length) {
        actionTransitionTimer = 0;
        actionTransition.hidden = true;
        pandaSprite.hidden = false;
        onComplete();
        return;
      }
      actionTransition.src = frames[index++];
      actionTransitionTimer = window.setTimeout(next, motionPreference.matches ? 1 : 80);
    };
    next();
  }

  function cancelBambooAction() {
    window.clearTimeout(bambooDropTimer);
    window.clearTimeout(actionTransitionTimer);
    bambooDropTimer = 0;
    actionTransitionTimer = 0;
    actionTransitionSequence += 1;
    snackDrop.hidden = true;
    actionTransition.hidden = true;
    pandaSprite.hidden = false;
    setBambooPhase("idle");
    activeBambooToken = null;
  }

  function startBambooAction(token) {
    window.clearTimeout(bambooDropTimer);
    bambooDropTimer = 0;
    activeBambooToken = token;
    setBambooPhase("entering");
    applySprite();
    const frames = Array.from({ length: 5 }, (_, index) =>
      `../public/static/panda/transitions/pixellab-walk-to-chew-${index + 1}.png?v=chew-feed-1`);
    runBambooFrames(frames, () => {
      if (activeBambooToken !== token) return;
      setBambooPhase("dropping");
      applySprite();
      snackDrop.style.animation = "none";
      snackDrop.hidden = false;
      void snackDrop.offsetWidth;
      snackDrop.style.animation = "";
      bambooDropTimer = window.setTimeout(() => {
        bambooDropTimer = 0;
        if (activeBambooToken !== token) return;
        snackDrop.hidden = true;
        setBambooPhase("eating");
        applySprite();
      }, motionPreference.matches ? 1 : bambooDropMs);
    });
  }

  function finishBambooAction(targetStage) {
    window.clearTimeout(bambooDropTimer);
    bambooDropTimer = 0;
    snackDrop.hidden = true;
    window.clearInterval(frameTimer);
    frameTimer = 0;
    setBambooPhase("settling");
    const current = Math.max(0, Math.min(bambooEatEndFrame, currentFrame));
    const remainingBites = Array.from(
      { length: bambooEatEndFrame - current },
      (_, index) => `../public/static/panda/frames/chew-${current + index + 1}.png?v=chew-feed-4`
    );
    const walkFrames = [5, 4, 3, 2, 1].map(frame =>
      `../public/static/panda/transitions/pixellab-walk-to-chew-${frame}.png?v=chew-feed-1`);
    runBambooFrames([...remainingBites, ...walkFrames], () => {
      setBambooPhase("idle");
      activeBambooToken = null;
      currentFrame = 0;
      presence.dataset.stage = targetStage;
      delete presence.dataset.action;
      applySprite();
      syncRoomRoaming();
    });
  }

  function applyCompanion(effect) {
    if (!effect || typeof effect !== "object") return;
    const stage = ["present", "performing", "fallen", "returning", "away"].includes(effect.stage) ? effect.stage : "present";
    const requestedAction = typeof effect.action === "string" ? effect.action : "idle";
    const action = ["roll", "spin", "tumble"].includes(requestedAction) ? "idle" : requestedAction;
    const previousStage = presence.dataset.stage || "present";
    const previousAction = presence.dataset.action || "idle";
    const raw = Number(effect.duration) || 3;
    const sec = Math.min(5, Math.max(2, raw > 100 ? raw / 1000 : raw));
    presence.style.setProperty("--act-dur", (stage === "performing" ? sec / 3 : 3) + "s");
    const hasNewBambooToken = effect.token !== undefined && effect.token !== null && activeBambooToken !== effect.token;
    const startingBamboo = stage === "performing" && action === "bamboo"
      && (bambooPhase === "idle" || hasNewBambooToken);
    const continuingBamboo = stage === "performing" && action === "bamboo"
      && previousStage === "performing" && previousAction === "bamboo" && !startingBamboo;
    const finishingBamboo = previousStage === "performing" && previousAction === "bamboo" && stage === "present";
    if (finishingBamboo) {
      finishBambooAction(stage);
    } else if (continuingBamboo) {
      // Repeated state notifications must not reset the active lift-and-bite frames.
    } else {
      if (bambooPhase !== "idle" && (stage !== "performing" || action !== "bamboo")) cancelBambooAction();
      // Remove then re-add so a repeated action with a new token restarts its CSS animation.
      delete presence.dataset.action;
      delete presence.dataset.stage;
      void presence.offsetWidth;
      presence.dataset.stage = stage;
      if (stage === "performing") presence.dataset.action = action;
      if (startingBamboo) {
        startBambooAction(effect.token);
        syncRoomRoaming();
      } else {
        if (stage !== "performing" || action !== "bamboo") {
          window.clearTimeout(bambooDropTimer);
          bambooDropTimer = 0;
          setBambooPhase("idle");
          activeBambooToken = null;
        }
        applySprite();
        syncRoomRoaming();
      }
    }
    carry.textContent = typeof effect.carrying === "string" ? effect.carrying : "";
    carry.hidden = !carry.textContent || stage === "fallen" || stage === "away";
    if (stage === "fallen" || stage === "away") dismissSpeech();
  }
  if (desktop && typeof desktop.onCompanionMotion === "function") desktop.onCompanionMotion(applyCompanion);

  if (desktop && typeof desktop.onPetMessage === "function") {
    desktop.onPetMessage((payload) => {
      const message = typeof payload === "string"
        ? payload
        : payload && (payload.message || payload.text);
      if (typeof message === "string" && message.trim()) {
        showSpeech(message.trim(), false);
      }
    });
  }

  window.addEventListener("beforeunload", () => {
    stopRoomRoaming();
    window.clearTimeout(clickTimer);
    window.clearTimeout(speechTimer);
    window.clearInterval(regionTimer);
    window.clearInterval(frameTimer);
  }, { once: true });
})();
