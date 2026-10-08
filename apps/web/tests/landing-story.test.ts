import assert from "node:assert/strict";
import test from "node:test";
import {
  resumesOnScroll,
  pinnedStoryLayout,
  storyAnimationProgress,
  storyGeometry,
  storyStep,
} from "../components/kite/landing-story-state";

test("the completed frame holds before the pin releases, including reverse scrolling", () => {
  assert.equal(storyAnimationProgress(0), 0);
  assert.equal(storyAnimationProgress(0.43), 0.5);
  for (const progress of [0.86, 0.92, 1, 2])
    assert.equal(storyAnimationProgress(progress), 1);
  assert.equal(storyAnimationProgress(-1), 0);
  assert.equal(storyAnimationProgress(Number.NaN), 0);
  assert.equal(storyStep(storyAnimationProgress(0.92), 5), 4);
  assert.equal(storyStep(storyAnimationProgress(0.43), 5), 2);
});

test("smaller animation stages can pin when the whole phone chapter cannot", () => {
  for (const [viewport, chapter, stage] of [
    [768, 667, 460],
    [740, 1075, 465],
    [700, 758, 520],
  ]) {
    const layout = pinnedStoryLayout(viewport, chapter, stage, 2);
    assert.equal(layout.fits, true);
    assert.equal(layout.target, "stage");
    assert(layout.top >= 96);
    assert(layout.top + stage <= viewport - 24);
  }
});

test("research visits all five stages forward and backward", () => {
  const progress = [0, 0.1, 0.2, 0.4, 0.6, 0.8, 1, 0.6, 0.2, 0];
  assert.deepEqual(
    progress.map((value) => storyStep(value, 5)),
    [0, 0, 1, 2, 3, 4, 4, 3, 1, 0],
  );
});

test("recurring stages depend on bounded scroll progress, not elapsed time", () => {
  assert.deepEqual(
    [-1, 0, 0.24, 0.25, 0.5, 0.75, 1, 2].map((value) => storyStep(value, 4)),
    [0, 0, 0, 1, 2, 3, 3, 3],
  );
  assert.equal(storyStep(Number.NaN, 4), 0);
  assert.equal(storyStep(Number.POSITIVE_INFINITY, 4), 0);
  assert.throws(() => storyStep(0, 0));
  assert.throws(() => storyStep(0, 1.5));
});

test("sticky stories fit completely with equal viewport insets", () => {
  assert.deepEqual(storyGeometry(900, 600, 5), {
    fits: true,
    top: 150,
    distance: 2232,
  });
  assert.deepEqual(storyGeometry(740, 692, 4), {
    fits: true,
    top: 24,
    distance: 1376,
  });
});

test("oversized stories remain inline without an artificial scroll trap", () => {
  for (const height of [0, 693, 1000]) {
    assert.deepEqual(storyGeometry(740, height, 4), {
      fits: false,
      top: 24,
      distance: 0,
    });
  }
});

test("a selected chapter holds until actual scrolling; explicit pause stays paused", () => {
  assert.equal(resumesOnScroll("selected", 100, 100), false);
  assert.equal(resumesOnScroll("selected", 100, 102), false);
  assert.equal(resumesOnScroll("selected", 100, 103), true);
  assert.equal(resumesOnScroll("selected", 100, 97), true);
  for (const mode of ["paused", "static", "scroll"] as const)
    assert.equal(resumesOnScroll(mode, 100, 500), false);
});

test("floating navigation cannot cover a sticky story's controls", () => {
  assert.deepEqual(storyGeometry(740, 600, 4, 96), {
    fits: true,
    top: 96,
    distance: 1376,
  });
  assert.deepEqual(storyGeometry(700, 631, 4, 96), {
    fits: false,
    top: 24,
    distance: 0,
  });
});

test("pinned chapters prefer a complete pair, then a fitting stage, then inline", () => {
  const desktop = pinnedStoryLayout(900, 680, 630, 4);
  assert.equal(desktop.target, "chapter");
  assert.equal(desktop.fits, true);
  assert.equal(desktop.distance, 1674);
  const phone = pinnedStoryLayout(844, 1320, 631, 4);
  assert.equal(phone.target, "stage");
  assert.equal(phone.fits, true);
  assert(phone.top >= 96);
  const short = pinnedStoryLayout(700, 1320, 631, 4);
  assert.equal(short.fits, false);
  assert.equal(short.distance, 0);
});
