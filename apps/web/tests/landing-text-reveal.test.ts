import assert from "node:assert/strict";
import test from "node:test";
import { landingTextTargets } from "../components/kite/landing-text-reveal";

function element(
  options: {
    parent?: HTMLElement;
    excluded?: boolean;
    hidden?: boolean;
    text?: string;
    card?: boolean;
    story?: "shell" | "chapter";
  } = {},
): HTMLElement {
  return {
    parentElement: options.parent ?? null,
    textContent: options.text ?? "Reading text",
    closest: (selector: string) =>
      selector === "[data-story-stage]"
        ? options.story
          ? {}
          : null
        : options.excluded
          ? {}
          : null,
    getClientRects: () => (options.hidden ? [] : [{}]),
    matches: (selector: string) =>
      selector === "[data-story-stage]"
        ? options.story === "shell"
        : selector === "a" && Boolean(options.card),
    querySelector: () => (options.card ? {} : null),
  } as unknown as HTMLElement;
}

function targets(elements: HTMLElement[]) {
  return landingTextTargets({
    querySelectorAll: () => elements,
  } as unknown as HTMLElement);
}

test("nested text gets one entrance rather than multiplied parent/child fades", () => {
  const heading = element();
  const emphasis = element({ parent: heading });
  const copy = element();
  assert.deepEqual(targets([heading, emphasis, copy]), [heading, copy]);
});

test("hero, decorative and collapsed content are excluded", () => {
  const copy = element();
  assert.deepEqual(
    targets([
      element({ excluded: true }),
      element({ hidden: true }),
      element({ text: "  " }),
      copy,
    ]),
    [copy],
  );
});

test("pinned widgets and their text never receive independent timed transforms", () => {
  const shell = element({ story: "shell" });
  const chapter = element({ parent: shell, story: "chapter" });
  assert.deepEqual(targets([shell, chapter]), []);
});

test("cards reveal their reading text, not the entire clickable container", () => {
  const card = element({ card: true });
  const heading = element({ parent: card });
  const copy = element({ parent: card });
  assert.deepEqual(targets([card, heading, copy]), [heading, copy]);
});
