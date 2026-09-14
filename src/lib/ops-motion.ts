import { animate, stagger } from "animejs";

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function pulsePanel(node: HTMLElement | null) {
  if (!node) return;
  if (prefersReducedMotion()) return;
  animate(node, {
    opacity: [0.35, 1],
    duration: 220,
    ease: "outQuad",
  });
}

export function ackFlash(node: HTMLElement | null) {
  if (!node) return;
  if (prefersReducedMotion()) return;
  animate(node, {
    opacity: [0, 1],
    duration: 160,
    ease: "outQuad",
  });
}

export function staggerRows(nodes: Element[]) {
  if (!nodes.length || prefersReducedMotion()) return;
  animate(nodes, {
    opacity: [0, 1],
    delay: stagger(16, { start: 0 }),
    duration: 180,
    ease: "outQuad",
  });
}
