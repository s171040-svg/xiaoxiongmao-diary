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
    for (const motion of ["idle", "walk", "sleep", "grab"]) {
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

test("dragged pets stay within the screen work area, including small previews", () => {
  for (const [width, height] of [[1920, 1080], [340, 360], [70, 70]]) {
    const p = model.constrain({ x: -10000, y: 10000 }, width, height);
    assert(p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height);
  }
});

test("first-version walking only depends on work-area bounds, not app windows", () => {
  for (const [width, height] of [[1920, 1080], [340, 360], [1280, 720]]) {
    for (const start of [{ x: width * .65, y: height * .75 }, { x: 42, y: 86 },
      { x: width - 42, y: height - 18 }]) {
      const end = model.target(start, width, height);
      assert(end, "an ordinary desktop can always offer a walking target");
      assert(Math.hypot(end.x - start.x, end.y - start.y) >= 20);
      const b = model.bounds(width, height);
      assert(end.x >= b.left && end.x <= b.right && end.y >= b.top && end.y <= b.bottom);
    }
  }
  const renderer = fs.readFileSync(path.join(__dirname, "pet-lite.js"), "utf8");
  assert(!renderer.includes("onDesktopObstacles"), "stale/failed window scans cannot stop the renderer");
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  assert(main.includes("const avoidDesktopWindows = false"), "Windows scanning stays disabled in v1");
});

test("the installer staging list includes every new renderer dependency", () => {
  const packageScript = fs.readFileSync(path.join(__dirname, "package-win.cjs"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "pet.html"), "utf8");
  for (const file of ["pet-lite.js", "pet-lite.css", "pet-lite-model.js"]) {
    assert(packageScript.includes(`"${file}"`));
    assert(html.includes(`./${file}`));
    assert(fs.existsSync(path.join(__dirname, file)));
  }
});

test("rest and lift transitions reuse real existing intermediate images", () => {
  for (const [character, from, to] of [
    ["xiaobai", "idle", "grab"], ["xiaobai", "grab", "idle"],
    ["xiaobai", "sleep", "grab"], ["panda", "idle", "sleep"],
  ]) {
    const frames = model.transition(character, from, to);
    assert(frames.length >= 5);
    const hashes = frames.map(file => require("node:crypto").createHash("sha256")
      .update(fs.readFileSync(path.resolve(__dirname, file.split("?")[0]))).digest("hex"));
    assert(new Set(hashes).size >= 5, "not padded by repeating the same image");
  }
});
