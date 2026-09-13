import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const mobileRequire = createRequire(
  new URL("../../mobile/package.json", import.meta.url),
);
const { JSDOM } = mobileRequire("jsdom");
const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = React;
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../components/kite/BasketMarquee.tsx", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  },
).outputText;
const exports = {};
runInThisContext(`(function(require, exports) { ${compiled}\n})`)(
  (name) =>
    name === "./MarketUI"
      ? {
          // Only the card presentation is replaced; exercise the actual marquee component.
          BasketCard: ({ basket, tabIndex }) =>
            React.createElement(
              "a",
              {
                className: "basket-card",
                href: `/basket/${basket.id}`,
                tabIndex,
              },
              basket.name,
            ),
        }
      : require(name),
  exports,
);
const baskets = ["first", "second", "third"].map((id) => ({ id, name: id }));

async function fixture(
  t,
  { reduced = false, period = 1000, rounded = false } = {},
) {
  const dom = new JSDOM(
    '<!doctype html><div id="root"></div><button id="outside">Outside</button>',
    {
      url: "https://kite.example/",
      pretendToBeVisual: true,
    },
  );
  const { window } = dom;
  let now = 100;
  let nextFrame = 0;
  let hidden = false;
  const frames = new Map();
  const mediaListeners = new Set();
  const resizeObservers = [];
  const intersectionObservers = [];
  const motion = {
    matches: reduced,
    addEventListener: (_, fn) => mediaListeners.add(fn),
    removeEventListener: (_, fn) => mediaListeners.delete(fn),
  };
  window.matchMedia = () => motion;
  Object.defineProperty(window.document, "hidden", { get: () => hidden });
  Object.defineProperty(window.HTMLElement.prototype, "offsetLeft", {
    get() {
      return this.getAttribute("aria-hidden") === "true" ? period + 7 : 7;
    },
  });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  const globals = {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    performance: { now: () => now },
    IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class {
      constructor(callback) {
        this.callback = callback;
        resizeObservers.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
    IntersectionObserver: class {
      constructor(callback) {
        this.callback = callback;
        intersectionObservers.push(this);
      }
      observe() {}
      disconnect() {
        this.disconnected = true;
      }
    },
  };
  const previous = Object.fromEntries(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });
  const root = createRoot(window.document.getElementById("root"));
  let unmounted = false;
  async function unmount() {
    if (unmounted) return;
    await act(async () => root.unmount());
    unmounted = true;
  }
  t.after(async () => {
    await unmount();
    dom.window.close();
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  });
  await act(async () =>
    root.render(React.createElement(exports.BasketMarquee, { baskets })),
  );
  const viewport = window.document.querySelector(".basket-marquee-viewport");
  if (rounded) {
    let scroll = 0;
    Object.defineProperty(viewport, "scrollLeft", {
      get: () => scroll,
      set: (value) => {
        scroll = Math.round(value);
      },
    });
  }
  return {
    viewport,
    window,
    frames,
    mediaListeners,
    resizeObservers,
    intersectionObservers,
    unmount,
    advance(ms = 10) {
      now += ms;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now);
    },
    visible(value = true) {
      intersectionObservers.at(-1)?.callback([{ isIntersecting: value }]);
    },
    resize(value) {
      period = value;
      resizeObservers.at(-1)?.callback([]);
    },
    async reduced(value) {
      motion.matches = value;
      await act(async () => {
        for (const listener of mediaListeners) listener(motion);
      });
    },
    hidden(value) {
      hidden = value;
      window.document.dispatchEvent(new window.Event("visibilitychange"));
    },
    event(type, target = viewport, properties = {}) {
      const event = new window.Event(type, { bubbles: true });
      for (const [key, value] of Object.entries(properties))
        Object.defineProperty(event, key, { value });
      target.dispatchEvent(event);
    },
    async toggle() {
      await act(async () =>
        window.document.querySelector(".basket-motion-toggle").click(),
      );
    },
  };
}

test("marquee accumulates fractional motion and wraps across the measured inter-group gap", async (t) => {
  const view = await fixture(t, { period: 10, rounded: true });
  assert.equal(
    view.viewport.querySelectorAll(".basket-card").length,
    baskets.length * 2,
  );
  const [original, copy] = view.viewport.querySelectorAll(
    ".basket-marquee-set",
  );
  assert.equal(copy.getAttribute("aria-hidden"), "true");
  assert.ok(
    [...copy.querySelectorAll("a")].every((link) => link.tabIndex === -1),
  );
  assert.ok(
    [...original.querySelectorAll("a")].every((link) => link.tabIndex === 0),
  );
  assert.equal(
    view.frames.size,
    0,
    "offscreen content does not start animation",
  );
  view.visible();
  view.advance();
  for (let frame = 0; frame < 20; frame++) view.advance();
  assert.equal(
    view.viewport.scrollLeft,
    6,
    "subpixel steps survive a rounding scroll implementation",
  );
  for (let frame = 0; frame < 12; frame++) view.advance();
  assert.equal(
    view.viewport.scrollLeft,
    0,
    "32 steps wrap the 10px period rather than a half-width estimate",
  );
  view.resize(20);
  for (let frame = 0; frame < 40; frame++) view.advance();
  assert.equal(
    view.viewport.scrollLeft,
    13,
    "responsive resize updates the measured loop boundary",
  );
});

test("hover, touch, wheel, focus and the explicit pause control preserve the user's position", async (t) => {
  const view = await fixture(t);
  view.visible();
  view.advance();
  view.advance();
  const start = view.viewport.scrollLeft;
  view.event("pointerenter", view.viewport, { pointerType: "mouse" });
  view.advance();
  assert.equal(view.viewport.scrollLeft, start);
  view.event("pointerleave");
  view.event("pointerdown");
  view.viewport.scrollLeft = 300;
  view.advance();
  assert.equal(view.viewport.scrollLeft, 300);
  view.event("pointerup", view.window);
  view.advance(1000);
  assert.equal(view.viewport.scrollLeft, 300);
  view.event("wheel");
  view.advance(1000);
  assert.equal(
    view.viewport.scrollLeft,
    300,
    "wheel extends the interaction pause",
  );
  view.advance(700);
  assert.ok(view.viewport.scrollLeft > 300);
  view.viewport.querySelector("a").focus();
  const focused = view.viewport.scrollLeft;
  view.advance(2000);
  assert.equal(view.viewport.scrollLeft, focused);
  view.window.document.getElementById("outside").focus();
  view.advance(1700);
  assert.ok(view.viewport.scrollLeft > focused);
  await view.toggle();
  const paused = view.viewport.scrollLeft;
  assert.equal(
    view.window.document
      .querySelector("button.basket-motion-toggle")
      .getAttribute("aria-pressed"),
    "true",
  );
  view.visible();
  view.advance(3000);
  assert.equal(view.viewport.scrollLeft, paused);
  assert.equal(view.frames.size, 0);
  await view.toggle();
  view.visible();
  view.advance();
  view.advance();
  assert.ok(view.viewport.scrollLeft > paused);
});

test("reduced motion avoids duplicate content and reacts to preference changes", async (t) => {
  const view = await fixture(t, { reduced: true });
  assert.equal(
    view.viewport.querySelectorAll(".basket-card").length,
    baskets.length,
  );
  assert.equal(
    view.window.document.querySelector(".basket-motion-toggle"),
    null,
  );
  assert.equal(view.frames.size, 0);
  await view.reduced(false);
  assert.equal(
    view.viewport.querySelectorAll(".basket-card").length,
    baskets.length * 2,
  );
  view.visible();
  view.advance();
  view.advance();
  assert.ok(view.viewport.scrollLeft > 0);
  await view.reduced(true);
  assert.equal(view.frames.size, 0);
  assert.equal(
    view.viewport.querySelectorAll(".basket-card").length,
    baskets.length,
  );
  assert.ok(view.resizeObservers.every((observer) => observer.disconnected));
  assert.ok(
    view.intersectionObservers.every((observer) => observer.disconnected),
  );
});

test("pointer focus keeps a visible duplicate in place until its link can activate", async (t) => {
  const view = await fixture(t);
  const copy = view.viewport.querySelector('[aria-hidden="true"] .basket-card');
  const matches = copy.matches.bind(copy);
  copy.matches = (selector) =>
    selector === ":focus-visible" ? false : matches(selector);
  view.viewport.scrollLeft = 1200;
  view.event("pointerdown", copy);
  copy.focus();
  assert.equal(view.window.document.activeElement, copy);
  assert.equal(
    view.viewport.scrollLeft,
    1200,
    "focus must not move the clicked link before pointerup/click",
  );
});

test("offscreen and hidden documents suspend work; unmount removes observers and animation", async (t) => {
  const view = await fixture(t);
  view.visible();
  view.advance();
  view.advance();
  view.visible(false);
  const offscreen = view.viewport.scrollLeft;
  view.advance(3000);
  assert.equal(view.viewport.scrollLeft, offscreen);
  assert.equal(view.frames.size, 0);
  view.visible();
  view.advance();
  view.advance();
  assert.ok(view.viewport.scrollLeft > offscreen);
  view.hidden(true);
  const hidden = view.viewport.scrollLeft;
  view.advance(3000);
  assert.equal(view.viewport.scrollLeft, hidden);
  assert.equal(view.frames.size, 0);
  view.hidden(false);
  view.advance();
  view.advance();
  assert.ok(view.viewport.scrollLeft > hidden);
  await view.unmount();
  assert.equal(view.frames.size, 0);
  assert.equal(view.mediaListeners.size, 0);
  assert.ok(view.resizeObservers.every((observer) => observer.disconnected));
  assert.ok(
    view.intersectionObservers.every((observer) => observer.disconnected),
  );
});
