import { toBlob } from "html-to-image";

/** Resolve a React Native Web View ref to a real DOM element. */
export function asHtmlElement(ref: unknown): HTMLElement | null {
  if (!ref) return null;
  if (typeof HTMLElement !== "undefined" && ref instanceof HTMLElement) {
    return ref;
  }

  const candidate = ref as {
    _nativeNode?: unknown;
    getNode?: () => unknown;
  };

  if (
    typeof HTMLElement !== "undefined" &&
    candidate._nativeNode instanceof HTMLElement
  ) {
    return candidate._nativeNode;
  }

  if (typeof candidate.getNode === "function") {
    const node = candidate.getNode();
    if (typeof HTMLElement !== "undefined" && node instanceof HTMLElement) {
      return node;
    }
  }

  return null;
}

/** Rasterize an on-DOM AuraCard host to a PNG blob for upload. */
export async function captureCardImageBlob(host: HTMLElement): Promise<Blob> {
  // Force the clone into a normal paint box. Offscreen hosts often keep
  // left:-9999 (or similar) on the cloned root, which yields a solid blank PNG.
  const blob = await toBlob(host, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#05070C",
    style: {
      position: "relative",
      left: "0",
      top: "0",
      right: "auto",
      bottom: "auto",
      transform: "none",
      opacity: "1",
      margin: "0",
    },
  });

  if (!blob) {
    throw new Error("Could not capture the aura card.");
  }

  // All-one-color ~6KB captures mean the card never painted into the clone.
  if (blob.size < 20_000) {
    throw new Error("Card capture looked empty. Try sharing again.");
  }

  return blob;
}
