/** Text and widget shells reveal once; chapters keep their own motion owner. */
export function landingTextTargets(page: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    page.querySelectorAll<HTMLElement>(
      "main h2, main h3, main p, main li, main summary, main a, main small, main strong, main span, main [data-text-reveal-block], footer h2, footer p, footer a, footer span",
    ),
  ).filter((element) => {
    if (
      element.closest(
        "[data-hero], [data-sequence-owned], svg, [aria-hidden='true']",
      ) ||
      element.closest("[data-story-stage]") ||
      !element.textContent?.trim() ||
      !element.getClientRects().length
    )
      return false;
    // Reveal card copy, not its interactive container, and never animate twice.
    if (element.matches("a") && element.querySelector("h2, h3, p"))
      return false;
    return true;
  });
  const selected = new Set(candidates);
  return candidates.filter((element) => {
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      if (selected.has(parent)) return false;
    }
    return true;
  });
}
