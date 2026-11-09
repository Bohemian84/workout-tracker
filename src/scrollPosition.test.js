import assert from "node:assert/strict";
import test from "node:test";
import { preserveInputPosition, preserveScrollPosition } from "./scrollPosition.js";

function fixture() {
  const frames = [];
  const scrolls = [];
  const view = {
    scrollY: 1200,
    innerHeight: 844,
    visualViewport: { height: 844 },
    requestAnimationFrame: (callback) => frames.push(callback),
    scrollBy: (options) => scrolls.push(options)
  };
  const document = { defaultView: view, activeElement: null };
  const anchor = {
    ownerDocument: document,
    isConnected: true,
    top: 200,
    getBoundingClientRect() { return { top: this.top }; }
  };
  return { anchor, document, view, scrolls, flush: () => frames.splice(0).forEach((fn) => fn()) };
}

test("adding a recommendation keeps its position when no field is being edited", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.flush();
  assert.deepEqual(f.scrolls, [{ top: 400, left: 0, behavior: "instant" }]);
});

test("no movement is scheduled for unchanged recommendation layout", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => {});
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("updates still run without a recommendation section", () => {
  let updated = false;
  preserveScrollPosition(null, () => { updated = true; });
  assert.equal(updated, true);
});

test("editing a name, number, or range takes priority over recommendation scrolling", () => {
  for (const tag of ["input", "textarea", "select"]) {
    const f = fixture();
    f.document.activeElement = { matches: (selector) => selector.includes(tag) };
    preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
    f.flush();
    assert.equal(f.anchor.top, 600);
    assert.deepEqual(f.scrolls, []);
  }
});

test("a pending scroll cannot pull focus away from a newly selected field", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.document.activeElement = { matches: () => true };
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("contenteditable focus also cancels a pending adjustment", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.document.activeElement = { matches: () => false, isContentEditable: true };
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("keyboard resizing cancels a pending adjustment", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.view.visualViewport.height = 450;
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("manual or browser scroll adjustments are not applied a second time", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.view.scrollY += 400;
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("removed sections do not trigger delayed scrolling", () => {
  const f = fixture();
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.anchor.isConnected = false;
  f.flush();
  assert.deepEqual(f.scrolls, []);
});

test("browsers without visualViewport still preserve recommendation position", () => {
  const f = fixture();
  delete f.view.visualViewport;
  preserveScrollPosition(f.anchor, () => { f.anchor.top += 400; });
  f.flush();
  assert.equal(f.scrolls.length, 1);
});

function inputFixture() {
  const f = fixture();
  const events = new Map();
  f.view.innerWidth = 390;
  f.view.visualViewport = { height: 480, width: 390, offsetTop: 0, scale: 1 };
  f.view.addEventListener = (name, listener) => events.set(name, listener);
  f.view.removeEventListener = (name) => events.delete(name);
  f.view.scrollBy = (options) => {
    f.scrolls.push(options);
    f.view.scrollY += options.top;
    f.anchor.top -= options.top;
  };
  f.anchor.matches = (selector) => selector === "input, textarea, select";
  f.anchor.getBoundingClientRect = function () { return { top: this.top, bottom: this.top + 44 }; };
  f.document.activeElement = f.anchor;
  return {
    ...f, events,
    jump: (distance) => { f.view.scrollY += distance; f.anchor.top -= distance; },
    finish: () => { f.flush(); f.flush(); }
  };
}

test("rep edits repair a sudden jump to the bottom without losing the focused field", () => {
  const f = inputFixture();
  preserveInputPosition(f.anchor);
  f.jump(12000);
  f.finish();
  assert.deepEqual(f.scrolls, [{ top: -12000, left: 0, behavior: "instant" }]);
  assert.equal(f.anchor.top, 200);
  assert.equal(f.view.scrollY, 1200);
  assert.equal(f.document.activeElement, f.anchor);
  assert.equal(f.events.size, 0);
});

test("rep edits also catch browser scrolling on the frame after React renders", () => {
  const f = inputFixture();
  preserveInputPosition(f.anchor);
  f.flush();
  f.jump(6000);
  f.flush();
  assert.equal(f.scrolls.length, 1);
});

test("ordinary typing and small visible position changes never scroll the page", () => {
  const f = inputFixture();
  preserveInputPosition(f.anchor);
  f.jump(50);
  f.finish();
  assert.deepEqual(f.scrolls, []);
  assert.equal(f.events.size, 0);
});

test("manual touch, mouse, wheel, and keyboard actions cancel an editing scroll repair", () => {
  for (const event of ["pointerdown", "touchmove", "wheel", "keydown"]) {
    const f = inputFixture();
    preserveInputPosition(f.anchor);
    f.events.get(event)();
    f.jump(12000);
    f.finish();
    assert.deepEqual(f.scrolls, []);
    assert.equal(f.events.size, 0);
  }
});

test("keyboard opening, viewport panning, zoom, and rotation take priority over scroll repair", () => {
  for (const property of ["height", "width", "offsetTop", "scale"]) {
    const f = inputFixture();
    preserveInputPosition(f.anchor);
    f.view.visualViewport[property] += property === "scale" ? 0.1 : 100;
    f.jump(12000);
    f.finish();
    assert.deepEqual(f.scrolls, []);
  }
});

test("a keyboard resize cancels both pending frames even if it settles back", () => {
  const f = inputFixture();
  preserveInputPosition(f.anchor);
  f.view.visualViewport.height = 300;
  f.flush();
  f.view.visualViewport.height = 480;
  f.jump(12000);
  f.flush();
  assert.deepEqual(f.scrolls, []);
  assert.equal(f.events.size, 0);
});

test("unfocused, removed, initially hidden, and checkbox inputs never trigger scroll repair", () => {
  for (const scenario of ["blur", "removed", "hidden", "checkbox"]) {
    const f = inputFixture();
    if (scenario === "hidden") f.anchor.top = -500;
    if (scenario === "checkbox") f.anchor.matches = () => true;
    preserveInputPosition(f.anchor);
    if (scenario === "blur") f.document.activeElement = null;
    if (scenario === "removed") f.anchor.isConnected = false;
    f.jump(12000);
    f.finish();
    assert.deepEqual(f.scrolls, []);
    assert.equal(f.events.size, 0);
  }
  preserveInputPosition(null);
});

test("editing protection works without the Visual Viewport API", () => {
  const f = inputFixture();
  delete f.view.visualViewport;
  preserveInputPosition(f.anchor);
  f.jump(12000);
  f.finish();
  assert.equal(f.scrolls.length, 1);
});
