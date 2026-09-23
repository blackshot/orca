import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Maximize, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import {
  DIAGRAM_BUTTON_ZOOM_STEP,
  MIN_DIAGRAM_SCALE,
  diagramMinScale,
  fitDiagramTransform,
  wheelZoomFactor,
  zoomDiagramAt,
  type DiagramSize,
  type DiagramTransform
} from './mermaid-diagram-viewport'

type MermaidDiagramLightboxProps = {
  /** Reads the rendered diagram's sanitized SVG markup; called only when the viewer opens. */
  getSvgMarkup: () => string | null
}

type MermaidDiagramViewportProps = {
  svgMarkup: string
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
}

/**
 * Corner button on a rendered mermaid diagram that opens it full-window with
 * wheel zoom and drag pan. The dialog primitive owns Escape and focus restore.
 */
export default function MermaidDiagramLightbox({
  getSvgMarkup
}: MermaidDiagramLightboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  // Why: captured on open and dropped after close so idle diagrams hold no second SVG copy.
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null)
  const expandLabel = translate(
    'auto.components.editor.MermaidDiagramLightbox.expand',
    'Expand diagram'
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          const markup = getSvgMarkup()
          if (!markup) {
            return
          }
          setSvgMarkup(markup)
        }
        setOpen(nextOpen)
      }}
    >
      {/* Why: the wrapper owns hover reveal so the Button keeps its own variant styling. */}
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover/mermaid:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                contentEditable={false}
                aria-label={expandLabel}
                onClick={(event) => {
                  // Why: keep parent row/card handlers from treating this as selection.
                  event.stopPropagation()
                }}
              >
                <Maximize2 />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {expandLabel}
          </TooltipContent>
        </Tooltip>
      </div>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        variant="fullscreen"
        onOpenAutoFocus={(event) => {
          // Why: default focus lands on the first toolbar button and opens its tooltip,
          // so the first Escape only dismisses the tooltip. Focus the dialog itself instead.
          event.preventDefault()
          if (event.currentTarget instanceof HTMLElement) {
            event.currentTarget.focus()
          }
        }}
        // Runs after the exit animation, so the diagram stays visible while fading out.
        onCloseAutoFocus={() => setSvgMarkup(null)}
        // Why: React bubbles portal events through the component tree, so pans and
        // clicks here would otherwise reach the markdown host's click handlers.
        onClick={(event) => event.stopPropagation()}
      >
        {svgMarkup && <MermaidDiagramViewport svgMarkup={svgMarkup} />}
      </DialogContent>
    </Dialog>
  )
}

function readSvgNaturalSize(svg: SVGSVGElement): DiagramSize {
  const viewBox = svg.viewBox.baseVal
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height }
  }
  const rect = svg.getBoundingClientRect()
  return { width: rect.width, height: rect.height }
}

function MermaidDiagramViewport({ svgMarkup }: MermaidDiagramViewportProps): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const diagramRef = useRef<HTMLDivElement>(null)
  const naturalSizeRef = useRef<DiagramSize>({ width: 0, height: 0 })
  const minScaleRef = useRef(MIN_DIAGRAM_SCALE)
  const dragRef = useRef<DragState | null>(null)
  const [transform, setTransform] = useState<DiagramTransform | null>(null)
  const [dragging, setDragging] = useState(false)

  const fitToViewport = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    const fitted = fitDiagramTransform(naturalSizeRef.current, {
      width: viewport.clientWidth,
      height: viewport.clientHeight
    })
    minScaleRef.current = diagramMinScale(fitted.scale)
    setTransform(fitted)
  }, [])

  useLayoutEffect(() => {
    const host = diagramRef.current
    if (!host) {
      return
    }
    // Why: markup is serialized from MermaidBlock's DOMPurify-sanitized inline diagram and
    // re-parsed in the same context (div innerHTML), so it needs no second pass.
    host.innerHTML = svgMarkup
    const svg = host.querySelector('svg')
    if (svg) {
      const size = readSvgNaturalSize(svg)
      naturalSizeRef.current = size
      // Why: mermaid emits width="100%" plus an inline max-width, which would tie
      // the diagram to the container; pin it to its intrinsic size and scale via transform.
      svg.setAttribute('width', String(size.width))
      svg.setAttribute('height', String(size.height))
      svg.style.maxWidth = 'none'
    }
    fitToViewport()
  }, [svgMarkup, fitToViewport])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    // Why: React's onWheel is passive, so it cannot stop page/app zoom or scrolling.
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const factor = wheelZoomFactor(event.deltaY, event.deltaMode)
      setTransform(
        (current) =>
          current && zoomDiagramAt(current, current.scale * factor, anchor, minScaleRef.current)
      )
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [])

  const zoomAroundCenter = (factor: number): void => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    const anchor = { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
    setTransform(
      (current) =>
        current && zoomDiagramAt(current, current.scale * factor, anchor, minScaleRef.current)
    )
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return
    }
    dragRef.current = null
    setDragging(false)
  }

  const zoomPercent = Math.round((transform?.scale ?? 1) * 100)
  const title = translate('auto.components.editor.MermaidDiagramLightbox.title', 'Diagram')

  return (
    <>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <div className="relative min-h-0 flex-1">
        <div
          ref={viewportRef}
          data-dragging={dragging}
          className="absolute inset-0 cursor-grab touch-none overflow-hidden bg-background select-none data-[dragging=true]:cursor-grabbing"
          onPointerDown={(event) => {
            if (event.button !== 0 || !transform) {
              return
            }
            event.currentTarget.setPointerCapture(event.pointerId)
            dragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              originX: transform.x,
              originY: transform.y
            }
            setDragging(true)
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== event.pointerId) {
              return
            }
            setTransform(
              (current) =>
                current && {
                  ...current,
                  x: drag.originX + event.clientX - drag.startX,
                  y: drag.originY + event.clientY - drag.startY
                }
            )
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
        >
          <div
            ref={diagramRef}
            className="pointer-events-none absolute top-0 left-0 origin-top-left"
            style={{
              // Why: stay hidden until the first fit so the diagram never flashes at 1:1.
              visibility: transform ? 'visible' : 'hidden',
              transform: transform
                ? `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
                : undefined
            }}
          />
        </div>
        {/* Why: bottom-right keeps the controls clear of the window controls and traffic lights at the top. */}
        <div className="absolute right-4 bottom-4 flex items-center gap-1 rounded-lg border border-border bg-popover/95 p-1 text-popover-foreground shadow-floating backdrop-blur">
          <span className="hidden px-2 text-xs text-muted-foreground md:inline">
            {translate(
              'auto.components.editor.MermaidDiagramLightbox.hint',
              'Scroll to zoom · Drag to pan'
            )}
          </span>
          <Separator orientation="vertical" className="mx-1 hidden h-4 md:block" />
          <ToolbarIconButton
            label={translate('auto.components.editor.MermaidDiagramLightbox.zoomOut', 'Zoom out')}
            onClick={() => zoomAroundCenter(1 / DIAGRAM_BUTTON_ZOOM_STEP)}
          >
            <ZoomOut />
          </ToolbarIconButton>
          <span className="w-12 text-center text-xs text-muted-foreground tabular-nums">
            {zoomPercent}%
          </span>
          <ToolbarIconButton
            label={translate('auto.components.editor.MermaidDiagramLightbox.zoomIn', 'Zoom in')}
            onClick={() => zoomAroundCenter(DIAGRAM_BUTTON_ZOOM_STEP)}
          >
            <ZoomIn />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={translate('auto.components.editor.MermaidDiagramLightbox.fit', 'Fit to screen')}
            onClick={fitToViewport}
          >
            <Maximize />
          </ToolbarIconButton>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <DialogClose asChild>
            <ToolbarIconButton
              label={translate('auto.components.editor.MermaidDiagramLightbox.close', 'Close')}
            >
              <X />
            </ToolbarIconButton>
          </DialogClose>
        </div>
      </div>
    </>
  )
}

type ToolbarIconButtonProps = React.ComponentProps<typeof Button> & { label: string }

function ToolbarIconButton({
  label,
  children,
  ...props
}: ToolbarIconButtonProps): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
