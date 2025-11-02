'use client'

import { use, useEffectEvent, useLayoutEffect, useMemo } from 'react'
import { SlideContext, type SlideContextValue, useCarouselContext } from './context'
import type { NavigateOptions } from './engine'
import type { CarouselProgress, ProgressListener } from './progress'

export interface CarouselApi {
	/** The slide the carousel is on, or heading to. */
	index: number
	/** How many slides are mounted. 0 until the first client render. */
	count: number
	/** True while a pointer is dragging the slides. */
	isDragging: boolean
	canPrev: boolean
	canNext: boolean
	goTo: (index: number, options?: NavigateOptions) => void
	next: (options?: NavigateOptions) => void
	prev: (options?: NavigateOptions) => void
	/** The continuous position, updated every frame without re-rendering. */
	progress: CarouselProgress
}

/**
 * Reads the carousel's state and controls from any component inside
 * `<Carousel.Root>`. Re-renders when the index, count or drag state changes, never
 * per frame; use `useCarouselProgress` for per-frame work.
 */
export function useCarousel(): CarouselApi {
	const { context, state } = useCarouselContext('useCarousel')
	const { engine, goTo, next, prev } = context
	const { index, count, isDragging } = state

	return useMemo(
		() => ({
			index,
			count,
			isDragging,
			canPrev: index > 0,
			canNext: index < count - 1,
			goTo,
			next,
			prev,
			progress: engine.progress,
		}),
		[index, count, isDragging, goTo, next, prev, engine]
	)
}

/**
 * Calls `listener` with the carousel's position on every frame it moves, and once
 * on mount. Use it to drive styles imperatively (captions, parallax, progress bars)
 * without re-rendering. The listener always sees the latest props and state.
 */
export function useCarouselProgress(listener: ProgressListener) {
	const { context } = useCarouselContext('useCarouselProgress')
	const { progress } = context.engine
	const onProgress = useEffectEvent(listener)

	useLayoutEffect(() => progress.subscribe(value => onProgress(value)), [progress])
}

/** Reads the enclosing `<Carousel.Slide>`'s index and whether it is the current slide. */
export function useSlide(): SlideContextValue {
	const slide = use(SlideContext)
	if (!slide) {
		throw new Error('spring-carousel: `useSlide` must be called inside `<Carousel.Slide>`.')
	}
	return slide
}
