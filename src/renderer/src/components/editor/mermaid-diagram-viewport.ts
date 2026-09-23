export type DiagramTransform = { x: number; y: number; scale: number }
export type DiagramSize = { width: number; height: number }
export type DiagramPoint = { x: number; y: number }

export const MIN_DIAGRAM_SCALE = 0.1
export const MAX_DIAGRAM_SCALE = 8
export const DIAGRAM_BUTTON_ZOOM_STEP = 1.25
// Why: small diagrams would otherwise balloon to fill the whole screen on open.
const MAX_FIT_SCALE = 2
const FIT_PADDING = 32
const WHEEL_ZOOM_SENSITIVITY = 0.0015
const WHEEL_LINE_HEIGHT_PX = 16

export function clampDiagramScale(scale: number): number {
  return Math.min(MAX_DIAGRAM_SCALE, Math.max(MIN_DIAGRAM_SCALE, scale))
}

/** Centers the diagram in the viewport at the largest scale that fits it whole. */
export function fitDiagramTransform(content: DiagramSize, viewport: DiagramSize): DiagramTransform {
  if (content.width <= 0 || content.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { x: 0, y: 0, scale: 1 }
  }
  const availableWidth = Math.max(1, viewport.width - FIT_PADDING * 2)
  const availableHeight = Math.max(1, viewport.height - FIT_PADDING * 2)
  const scale = clampDiagramScale(
    Math.min(availableWidth / content.width, availableHeight / content.height, MAX_FIT_SCALE)
  )
  return {
    x: (viewport.width - content.width * scale) / 2,
    y: (viewport.height - content.height * scale) / 2,
    scale
  }
}

/** Zooms to `nextScale` while keeping the diagram point under `anchor` fixed on screen. */
export function zoomDiagramAt(
  transform: DiagramTransform,
  nextScale: number,
  anchor: DiagramPoint
): DiagramTransform {
  const scale = clampDiagramScale(nextScale)
  const ratio = scale / transform.scale
  return {
    x: anchor.x - (anchor.x - transform.x) * ratio,
    y: anchor.y - (anchor.y - transform.y) * ratio,
    scale
  }
}

/** Multiplicative zoom factor for a wheel event; exponential so trackpads and wheels feel alike. */
export function wheelZoomFactor(deltaY: number, deltaMode: number): number {
  // Why: deltaMode 1 reports lines (Firefox-style mouse wheels), not pixels.
  const pixels = deltaMode === 1 ? deltaY * WHEEL_LINE_HEIGHT_PX : deltaY
  return Math.exp(-pixels * WHEEL_ZOOM_SENSITIVITY)
}
