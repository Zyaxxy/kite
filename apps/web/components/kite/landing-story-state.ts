export type StoryMode = "scroll" | "selected" | "paused" | "static";

/** Finish at 86% of the pin; the remaining scroll holds the completed frame. */
export function storyAnimationProgress(pinProgress: number): number {
  const bounded = Number.isFinite(pinProgress) ? Math.max(0, pinProgress) : 0;
  return Math.min(1, bounded / 0.86);
}

export function storyStep(progress: number, count: number): number {
  if (!Number.isInteger(count) || count < 1)
    throw new Error("A story needs at least one stage.");
  const bounded = Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress))
    : 0;
  return Math.min(count - 1, Math.floor(bounded * count));
}

/** Geometry changes only on resize/content measurement, never in the scroll loop. */
export function storyGeometry(
  viewportHeight: number,
  stageHeight: number,
  count: number,
  topInset = 24,
) {
  const inset = 24;
  const clearance = Math.max(inset, topInset);
  const fits =
    stageHeight > 0 && stageHeight <= viewportHeight - clearance - inset;
  return {
    fits,
    top: fits
      ? Math.max(clearance, Math.round((viewportHeight - stageHeight) / 2))
      : inset,
    distance: fits
      ? Math.round(viewportHeight * Math.max(1, count - 1) * 0.62)
      : 0,
  };
}

export function resumesOnScroll(
  mode: StoryMode,
  selectedAt: number,
  currentScroll: number,
) {
  return mode === "selected" && Math.abs(currentScroll - selectedAt) > 2;
}

/** Prefer the entire chapter; never pin content taller than its reading viewport. */
export function pinnedStoryLayout(
  viewportHeight: number,
  chapterHeight: number,
  stageHeight: number,
  count: number,
) {
  const chapter = storyGeometry(viewportHeight, chapterHeight, count, 96);
  const layout = chapter.fits
    ? chapter
    : storyGeometry(viewportHeight, stageHeight, count, 96);
  return {
    ...layout,
    target: chapter.fits ? ("chapter" as const) : ("stage" as const),
  };
}
