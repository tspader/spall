#!/usr/bin/env bun
import { render } from "@opentui/solid"
import { SliderRenderable } from "@opentui/core"
import { ErrorBoundary } from "solid-js"
import { Review } from "./Review"
import { ErrorFallback } from "./components"
import { mkdirSync, writeFileSync } from "fs"

// Monkey patch Slider to prevent rendering with invalid layout
// Fixes flash when scrollbar appears (layout not yet calculated by yoga)
const originalSliderRenderSelf = (SliderRenderable.prototype as any).renderSelf
;(SliderRenderable.prototype as any).renderSelf = function (buffer: any) {
  // Skip if dimensions invalid - vertical sliders should have height > 1, horizontal width > 1
  if (this.width <= 0 || this.height <= 0) return
  if (this.orientation === "vertical" && this.height <= 1) return
  if (this.orientation === "horizontal" && this.width <= 1) return
  originalSliderRenderSelf.call(this, buffer)
}

const RECORD_FRAMES = process.env.RECORD_FRAMES === "1"
let frameNumber = 0
const decoder = new TextDecoder()

render(
  () => (
    <ErrorBoundary fallback={(err: Error, reset: () => void) => <ErrorFallback error={err} reset={reset} />}>
      <Review />
    </ErrorBoundary>
  ),
  {
    exitOnCtrlC: false,
    useKittyKeyboard: {},
    postProcessFns: RECORD_FRAMES
      ? [
          (buffer) => {
            const frameBytes = buffer.getRealCharBytes(true)
            const frame = decoder.decode(frameBytes)

            mkdirSync("frames", { recursive: true })
            writeFileSync(`frames/frame-${String(frameNumber++).padStart(5, "0")}.txt`, frame)
          },
        ]
      : undefined,
  },
)
