import { createContext, use } from 'react'
import type { CarouselEngine, NavigateOptions } from './engine'

export interface CarouselContextValue {
	engine: CarouselEngine
	baseId: string
	initialIndex: number
	draggable: boolean
	goTo: (index: number, options?: NavigateOptions) => void
	next: (options?: NavigateOptions) => void
	prev: (options?: NavigateOptions) => void
}

export interface CarouselStateValue {
	index: number
	count: number
	isDragging: boolean
	hasTabs: boolean
}

export interface SlideContextValue {
	index: number
	isActive: boolean
}

export const CarouselContext = createContext<CarouselContextValue | null>(null)
export const CarouselStateContext = createContext<CarouselStateValue | null>(null)
export const SlideContext = createContext<SlideContextValue | null>(null)

export function useCarouselContext(caller: string) {
	const context = use(CarouselContext)
	const state = use(CarouselStateContext)
	if (!context || !state) {
		throw new Error(`spring-carousel: \`${caller}\` must be rendered inside \`<Carousel.Root>\`.`)
	}
	return { context, state }
}

export function slideId(baseId: string, index: number) {
	return `${baseId}-slide-${index}`
}

export function tabId(baseId: string, index: number) {
	return `${baseId}-tab-${index}`
}

export function trackId(baseId: string) {
	return `${baseId}-track`
}
