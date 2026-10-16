"use strict";
const desktop = window.pandaDesktop;
const layer = document.getElementById("gift-layer");
const button = document.getElementById("gift-button");
let giftId, started = false;
function region() {
  const r = button.getBoundingClientRect();
  desktop.giftHitRegion(layer.hidden || started ? null : { x: r.x, y: r.y, width: r.width, height: r.height });
}
desktop.onGiftState(state => {
  const gift = state?.gift;
  if (!gift) { layer.hidden = true; region(); return; }
  if (gift.id !== giftId) {
    button.classList.remove("collecting");
    giftId = gift.id;
  }
  layer.hidden = false;
  document.getElementById("gift-object").textContent = gift.emoji;
  document.getElementById("gift-hint").textContent = `${gift.item} · 点一下收好`;
  button.setAttribute("aria-label", `收好小熊猫带回来的${gift.item}`);
  started = Boolean(state.startedAt);
  button.disabled = started;
  if (started) button.classList.add("collecting");
  requestAnimationFrame(region);
});
button.addEventListener("click", () => {
  if (!giftId || started) return;
  desktop.clickGift(giftId);
});
window.addEventListener("resize", region);
