const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sandbox = { module: { exports: {} }, globalThis: {} };
require("node:vm").runInNewContext(fs.readFileSync(path.join(__dirname, "pet-lite-model.js"), "utf8"), sandbox);
const model = sandbox.module.exports;
const manifest = require("../src/lib/panda-animation-manifest.json");

test("both pets resolve only existing first-version transparent PNG assets", () => {
  for (const character of ["panda", "xiaobai"]) {
    for (const motion of ["idle", "walk", "sleep", "grab", "lying", "stare", "plush-play"]) {
      for (let frame = 0; frame < 40; frame++) {
        const asset = model.sprite(character, motion, frame, manifest);
        const png = fs.readFileSync(path.resolve(__dirname, asset.split("?")[0]));
        assert.equal(png.toString("ascii", 1, 4), "PNG");
        assert(png.readUInt32BE(16) > 0);
      }
    }
  }
  assert.throws(() => model.sprite("other", "walk", 0, manifest));
  assert.throws(() => model.sprite("panda", "roll", 0, manifest));
});

test("walking has a constant gentle speed and Xiaobai is slightly slower", () => {
  const from = { x: 0, y: 0 }, to = { x: 100, y: 0 };
  assert.equal(model.advance(from, to, .04, "panda").point.x, 1.2);
  assert.equal(model.advance(from, to, .04, "xiaobai").point.x, 1.02);
  assert(model.advance(from, to, 100, "panda").point.x <= 1.5,
    "resuming after backgrounding does not teleport the pet");
  assert(model.advance(from, { x: .1, y: 0 }, .04, "panda").arrived);
});

test("desktop no longer has an arbitrary two-dimensional walk target", () => {
  assert.equal(model.target, undefined);
  const renderer = fs.readFileSync(path.join(__dirname, "pet-lite.js"), "utf8");
  assert(!renderer.includes("onDesktopObstacles"), "stale/failed window scans cannot stop the renderer");
  assert(renderer.includes("geometry.walkTarget(point, support)"));
});

test("the installer staging list includes every new renderer dependency", () => {
  const packageScript = fs.readFileSync(path.join(__dirname, "package-win.cjs"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "pet.html"), "utf8");
  for (const file of ["pet-lite.js", "pet-lite.css", "pet-lite-model.js", "platform-model.js"]) {
    assert(packageScript.includes(`"${file}"`));
    assert(html.includes(`./${file}`));
    assert(fs.existsSync(path.join(__dirname, file)));
  }
  assert(packageScript.includes('"windows-platforms.cjs"'));
});

test("rest and lift transitions reuse real existing intermediate images", () => {
  for (const [character, from, to] of [
    ["xiaobai", "idle", "grab"], ["xiaobai", "grab", "idle"],
    ["xiaobai", "sleep", "grab"], ["panda", "idle", "sleep"],
    ["panda", "idle", "lying"], ["panda", "lying", "stare"],
    ["panda", "stare", "sleep"], ["panda", "sleep", "lying"],
    ["xiaobai", "lying", "stare"], ["xiaobai", "stare", "sleep"],
    ["panda", "walk", "plush-play"], ["panda", "plush-play", "walk"],
    ["xiaobai", "walk", "plush-play"], ["xiaobai", "plush-play", "walk"],
  ]) {
    const frames = model.transition(character, from, to);
    assert(frames.length >= 5);
    const hashes = frames.map(file => require("node:crypto").createHash("sha256")
      .update(fs.readFileSync(path.resolve(__dirname, file.split("?")[0]))).digest("hex"));
    assert(new Set(hashes).size >= 5, "not padded by repeating the same image");
  }
});

test("desktop panda and Xiaobai play the existing seated toy animation with ready-to-use frames", () => {
  for (const [character, frameCount] of [["panda", 7], ["xiaobai", 8]]) {
    const frames = Array.from({ length: frameCount + 1 }, (_, i) =>
      model.sprite(character, "plush-play", i, manifest));
    assert.equal(new Set(frames).size, character === "panda" ? frameCount + 1 : frameCount);
    for (const source of frames) {
      const file = path.resolve(__dirname, source);
      assert(fs.existsSync(file), `missing ${character} seated-toy frame: ${source}`);
      assert(fs.statSync(file).size > 0, `empty ${character} seated-toy frame: ${source}`);
    }
  }
  assert(model.plushSources.every(source => fs.existsSync(path.resolve(__dirname, source))));
});

test("quiet rests choose only three calm poses, lasting five to ten minutes", () => {
  const selected = new Set();
  for (const random of [0, .4, .999999]) {
    const rest = model.quietRest(null, 1234, () => random);
    selected.add(rest.motion);
    assert(rest.until >= 301234 && rest.until < 601234);
    assert.notEqual(model.quietRest(rest.motion, rest.until, () => random).motion, rest.motion);
  }
  assert.deepEqual([...selected].sort(), ["lying", "sleep", "stare"]);
});

test("all automatic companion poses, including plush play and taskbar search, last three minutes", () => {
  for (const [roll, motion] of [[0, "stare"], [.25, "sleep"], [.5, "plush-play"], [.75, "idle"]]) {
    const rest = model.companionRest(100, () => roll);
    assert.equal(rest.motion, motion);
    assert.equal(rest.until, 100 + 180_000);
  }
  assert.equal(model.AUTO_REST_DURATION_MS, 180_000);
  assert(model.nextEdgeClimbAt(100, () => 0, true) >= 55100);
  assert(model.nextEdgeClimbAt(100, () => 0) >= 155100);
});

test("taskbar company reuses the five original peek frames and now also lasts three minutes", () => {
  const frames = Array.from({ length: 8 }, (_, i) => model.sprite("panda", "dock-prone", i, manifest));
  assert.deepEqual([...new Set(frames)], Array.from(model.dockSources));
  const pixels = model.dockSources.map(source => {
    assert.match(source, /bored-over-dock\//);
    assert.equal(model.spriteTop(source), 10, "the paws stay at the taskbar without cropping");
    return require("node:crypto").createHash("sha256").update(fs.readFileSync(path.resolve(__dirname, source))).digest("hex");
  });
  assert.equal(new Set(pixels).size, 5);
  const entrance = model.transition("panda", "walk", "dock-prone");
  assert.equal(new Set(entrance).size, 5);
  assert.deepEqual(Array.from(model.transition("panda", "dock-prone", "walk")), Array.from(entrance).reverse());
  assert.equal(model.dockRestUntil(1000, 375), 181375);
  const restEnd = model.dockRestUntil(1000, 375);
  assert.equal(model.nextDockRestAt(restEnd, () => 0), restEnd + 160000,
    "the next taskbar greeting is scheduled after the three-minute rest ends");
  assert(model.dockGreetingMs < 6000);
});

test("the edge climb uses real mount and loop poses, pauses at the top, and returns to the same ledge", () => {
  const route = { side: "left", x: 20, topY: 504, groundY: 650 };
  const mount = Array.from({ length: 6 }, (_, i) => model.edgeClimbAt(route, 76 * i));
  assert(mount.every(frame => frame.phase === "mount" && frame.y === route.groundY));
  assert.equal(mount[0].nativeLeft, false);
  assert.equal(mount[1].nativeLeft, true);
  const travelMs = 146 / 24 * 1000;
  const up = model.edgeClimbAt(route, 456 + 3000);
  assert.equal(up.phase, "up");
  assert.equal(up.y, 578);
  const pause = model.edgeClimbAt(route, 456 + travelMs + 500);
  assert.equal(pause.phase, "pause");
  assert.equal(pause.y, route.topY);
  const down = model.edgeClimbAt(route, 456 + travelMs + 1000 + 3000);
  assert.equal(down.phase, "down");
  assert.equal(down.y, 576);
  const dismount = Array.from({ length: 6 }, (_, i) =>
    model.edgeClimbAt(route, 457 + 2 * travelMs + 1000 + 76 * i));
  assert(dismount.every(frame => frame.phase === "dismount" && frame.y === route.groundY));
  assert.deepEqual(dismount.map(frame => frame.source), mount.map(frame => frame.source).reverse());
  assert.equal(model.edgeClimbAt(route, 20000), null);
  const hashes = model.edgeClimbSources.map(source => {
    const png = fs.readFileSync(path.resolve(__dirname, source));
    assert.equal(png.readUInt32BE(16), 96);
    assert.equal(png.readUInt32BE(20), 96);
    return require("node:crypto").createHash("sha256").update(png).digest("hex");
  });
  assert.equal(new Set(hashes.slice(0, 6)).size, 6);
  assert(new Set(hashes.slice(6)).size >= 6, "alternate real paw strokes rather than sliding a still picture");
});

test("a clean red panda can step off either screen edge and returns on the same side", () => {
  assert.equal(model.shouldFallAtEdge(0, () => .249), true);
  assert.equal(model.shouldFallAtEdge(0, () => .25), false);
  assert.equal(model.shouldFallAtEdge(1, () => 0), false);
  for (const [side, x, sign] of [["left", 20, -1], ["right", 980, 1]]) {
    const start = { side, x, groundY: 720 };
    const exit = model.edgeFallAt(start, 300), drop = model.edgeFallAt(start, 750);
    assert.equal(exit.phase, "exit");
    assert.equal(exit.point.y, 720, "the feet stay on the taskbar before the drop");
    assert((exit.point.x - x) * sign > 0);
    assert.equal(drop.phase, "drop");
    assert(drop.point.y >= 760 && (drop.point.x - x) * sign > 40, "the sprite clears the visible edge");
    assert.equal(model.edgeFallAt(start, 1000).phase, "away");
    const returning = model.edgeFallAt(start, 1500);
    assert.equal(returning.phase, "return");
    assert.equal(returning.point.x, x - 14 * sign);
    assert(returning.point.y < 0);
  }
});

test("quiet prone poses preserve their scale and align with the same floor", () => {
  assert.equal(model.spriteTop("../public/static/panda/peeking.png"), 22 * 40 / 96);
  for (let frame = 1; frame <= 5; frame++) {
    assert(Number.isFinite(model.spriteTop(`../public/static/panda/transitions/pixellab-walk-to-peeking-${frame}.png`)));
  }
  assert.equal(model.spriteTop("../public/static/panda/sleep.png"), 16 * 40 / 80);
  for (let frame = 1; frame <= 4; frame++) {
    assert.equal(model.spriteTop(`../public/static/panda/frames/sleep-${frame}.png`), 8);
  }
});

test("both desktop characters crouch, pause flat, and push back up once on the foot line", () => {
  for (const character of ["panda", "xiaobai"]) {
    const lower = Array.from({ length: 5 }, (_, i) => model.landingFrame(character, i * 44));
    const rise = Array.from({ length: 5 }, (_, i) => model.landingFrame(character, 480 + i * 83));
    assert(lower.every(frame => frame.phase === "crouch"));
    assert(rise.every(frame => frame.phase === "rise"));
    assert.deepEqual(rise.map(frame => frame.source), lower.map(frame => frame.source).reverse());
    const prone = model.landingFrame(character, 220);
    assert.equal(prone.phase, "prone");
    assert.equal(prone.source, model.sprite(character, "lying", 0, manifest));
    assert.equal(model.landingFrame(character, 479), prone, "the flat pose is held between impact and recovery");
    const hashes = [prone, ...lower].map(({ source }) => {
      assert(source.includes(`/${character}/`), "always uses the selected pet art");
      assert(Number.isFinite(model.spriteTop(source)));
      const png = fs.readFileSync(path.resolve(__dirname, source));
      assert.equal(png.readUInt32BE(16), 96);
      assert.equal(png.readUInt32BE(20), 96);
      return require("node:crypto").createHash("sha256").update(png).digest("hex");
    });
    assert.equal(new Set(hashes).size, 6, "five real intermediate poses plus the fully prone sprite");
    assert.equal(model.landingFrame(character, 895), null);
    assert.equal(model.landingFrame(character, 0, true), null, "respects reduced motion");
    assert.equal(model.landingFrame(character, -.1), lower[0], "sub-frame clock skew does not skip the landing");
  }
});

test("punch is a complete one-shot animation, not a looping or CSS-only reaction", () => {
  const hashes = [];
  for (let frame = 0; frame < manifest.punch.frameCount; frame++) {
    const png = fs.readFileSync(path.join(__dirname, `../public/static/panda/punch/${frame}.png`));
    assert.equal(png.readUInt32BE(16), 96);
    assert.equal(png.readUInt32BE(20), 96);
    hashes.push(require("node:crypto").createHash("sha256").update(png).digest("hex"));
    assert.equal(model.punchFrame(frame * manifest.punch.frameIntervalMs, manifest), frame);
  }
  assert(new Set(hashes.slice(1, 10)).size >= 5, "real intermediate poses into the fall");
  assert(new Set(hashes.slice(-10, -1)).size >= 5, "real recovery poses");
  assert.equal(model.punchFrame(-1, manifest), null);
  assert.equal(model.punchFrame(2000, manifest), null);
  assert.equal(model.punchFrame(10000, manifest), null, "tab resumption cannot replay the punch forever");
  assert.equal(model.punchFrame(0, manifest, true), manifest.punch.impactFrame);
  assert.equal(model.punchFrame(manifest.punch.reducedDurationMs, manifest, true), null);
});

test("a long desktop fall schedules three real shakes with shrinking dirt and then cleans", () => {
  assert.equal(model.lostWorldFall(120, 760), true);
  assert.equal(model.lostWorldFall(240, 760), true);
  assert.equal(model.lostWorldFall(600, 760), false, "a short step to the next line is not a world fall");
  assert.equal(model.lostWorldFall(null, 760), false, "dragging off the edge does not count as an accident");
  let dirt = model.dirtyReturn(1000, () => 0);
  assert.deepEqual({ ...dirt }, { remainingShakes: 3, nextShakeAt: 46000 });
  assert.equal(model.shakeFrame(0), 0);
  assert.equal(model.shakeFrame(model.shakeFrameIntervalMs * 16), 16);
  assert.equal(model.shakeFrame(model.shakeFrameIntervalMs * model.shakeFrameCount), null);
  assert.equal(model.shakeFrame(0, true), null, "reduced motion does not play the shake animation");
  dirt = model.finishShake(dirt, 50000, () => 0);
  assert.deepEqual({ ...dirt }, { remainingShakes: 2, nextShakeAt: 95000 });
  dirt = model.finishShake(dirt, 100000, () => 0);
  assert.equal(dirt.remainingShakes, 1);
  dirt = model.finishShake(dirt, 150000, () => 0);
  assert.deepEqual({ ...dirt }, { remainingShakes: 0, nextShakeAt: 0 });
});

test("desktop dirt overlays and all three animated cleaning passes are packaged as clear pixel PNGs", () => {
  const root = path.join(__dirname, "../public/static/panda/desktop-shake");
  for (let remaining = 1; remaining <= 3; remaining++) {
    const overlay = fs.readFileSync(path.join(root, `soil-${remaining}.png`));
    assert.equal(overlay.toString("ascii", 1, 4), "PNG");
    assert(overlay.readUInt32BE(16) === 96 && overlay.readUInt32BE(20) === 96);
    assert([3, 6].includes(overlay.readUInt8(25)), "soil spots have an alpha-capable pixel format");
    const hashes = [];
    for (let frame = 1; frame <= model.shakeFrameCount; frame++) {
      const asset = fs.readFileSync(path.join(root, String(remaining), `${frame}.png`));
      assert.equal(asset.toString("ascii", 1, 4), "PNG");
      assert.equal(asset.readUInt32BE(16), 96);
      assert.equal(asset.readUInt32BE(20), 96);
      hashes.push(require("node:crypto").createHash("sha256").update(asset).digest("hex"));
    }
    assert(new Set(hashes).size >= 11, "the cleaning pass uses real, visibly different drawn poses");
  }
  const renderer = fs.readFileSync(path.join(__dirname, "pet-lite.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "pet.html"), "utf8");
  assert(renderer.includes("desktop-shake/${desktopDirt.remainingShakes}"));
  assert(renderer.includes("state.quietMode") && renderer.includes("state.paused"));
  assert(html.includes('id="panda-dirt"'), "the pet can show residual dirt between shakes");
});
