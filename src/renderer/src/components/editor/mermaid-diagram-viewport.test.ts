import { describe, expect, it } from 'vitest'
import {
  MAX_DIAGRAM_SCALE,
  MIN_DIAGRAM_SCALE,
  clampDiagramScale,
  fitDiagramTransform,
  wheelZoomFactor,
  zoomDiagramAt
} from './mermaid-diagram-viewport'

describe('fitDiagramTransform', () => {
  it('scales a wide diagram down to the viewport width and centers it vertically', () => {
    const t = fitDiagramTransform({ width: 3000, height: 1000 }, { width: 1064, height: 800 })
    expect(t.scale).toBeCloseTo(1000 / 3000)
    expect(t.x).toBeCloseTo(32)
    expect(t.y).toBeCloseTo((800 - 1000 * t.scale) / 2)
  })

  it('caps the upscale for small diagrams', () => {
    const t = fitDiagramTransform({ width: 100, height: 50 }, { width: 2000, height: 1000 })
    expect(t.scale).toBe(2)
    expect(t.x).toBe((2000 - 200) / 2)
  })

  it('falls back to identity when sizes are unknown', () => {
    expect(fitDiagramTransform({ width: 0, height: 0 }, { width: 800, height: 600 })).toEqual({
      x: 0,
      y: 0,
      scale: 1
    })
  })
})

describe('zoomDiagramAt', () => {
  it('keeps the diagram point under the anchor fixed', () => {
    const start = { x: 40, y: 20, scale: 1 }
    const anchor = { x: 240, y: 170 }
    const diagramPointBefore = {
      x: (anchor.x - start.x) / start.scale,
      y: (anchor.y - start.y) / start.scale
    }
    const next = zoomDiagramAt(start, 2.5, anchor)
    expect(next.scale).toBe(2.5)
    expect(next.x + diagramPointBefore.x * next.scale).toBeCloseTo(anchor.x)
    expect(next.y + diagramPointBefore.y * next.scale).toBeCloseTo(anchor.y)
  })

  it('clamps to the supported scale range without drifting the anchor', () => {
    const start = { x: 0, y: 0, scale: MAX_DIAGRAM_SCALE }
    expect(zoomDiagramAt(start, 100, { x: 300, y: 300 })).toEqual(start)
    expect(clampDiagramScale(0.001)).toBe(MIN_DIAGRAM_SCALE)
  })
})

describe('wheelZoomFactor', () => {
  it('zooms in on upward scroll and out on downward scroll', () => {
    expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100, 0)).toBeLessThan(1)
    expect(wheelZoomFactor(100, 0) * wheelZoomFactor(-100, 0)).toBeCloseTo(1)
  })

  it('treats line-mode deltas as larger pixel deltas', () => {
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(48, 0))
  })
})
