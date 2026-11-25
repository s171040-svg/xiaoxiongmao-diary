"use strict";

const REST_SECONDS = 5 * 60;
const mealMinutes = new Set([12 * 60 + 30, 12 * 60 + 50, 13 * 60 + 10]);
const messages = {
  meal: "到饭点啦！小熊猫帮你守着屏幕，你去吃点好吃的嘛～",
  rest: "小爪爪辛苦啦！起来伸伸懒腰、喝口水，小熊猫在这里等你～",
  celebrate: "健康最重要！你照顾自己，我就超开心～",
};

// Only aggregate OS idle seconds enter this model. No keys, titles or text.
function createWellbeing(savedMeals = [], onMealsChanged = () => {}) {
  let meals = new Set(savedMeals.filter(value => typeof value === "string"));
  let waitingSince = null;
  let rested = false;
  let previousNow = null;
  function remind(kind, now) {
    if (!["meal", "rest"].includes(kind)) throw new Error("Unknown wellbeing reminder");
    if (waitingSince === null) {
      waitingSince = now;
      rested = false;
    }
    return { kind, message: messages[kind] };
  }
  function sample({ now, idleSeconds, available = true, date = new Date(now) }) {
    if (!Number.isFinite(now) || !Number.isFinite(idleSeconds) || idleSeconds < 0) return null;
    if (previousNow !== null && now < previousNow) {
      // A clock correction must not be mistaken for a completed break.
      waitingSince = waitingSince === null ? null : now;
      rested = false;
    }
    previousNow = now;
    if (waitingSince !== null) {
      const afterReminder = Math.max(0, (now - waitingSince) / 1000);
      if (Math.min(idleSeconds, afterReminder) >= REST_SECONDS) rested = true;
      if (rested && idleSeconds < 2 && available) {
        waitingSince = null;
        rested = false;
        return { kind: "celebrate", message: messages.celebrate };
      }
    }
    const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const minute = date.getHours() * 60 + date.getMinutes();
    const key = `${day}:${minute}`;
    // No catch-up burst after launch or wake; reminders belong to their minute.
    if (available && idleSeconds < 60 && mealMinutes.has(minute) && !meals.has(key)) {
      meals = new Set([...meals].filter(value => value.startsWith(`${day}:`)));
      meals.add(key);
      onMealsChanged([...meals]);
      return remind("meal", now);
    }
    return null;
  }
  return { sample, remind };
}

module.exports = { createWellbeing, REST_SECONDS, messages };
