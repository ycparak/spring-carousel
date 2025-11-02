'use client'

import {
	type ComponentProps,
	type CSSProperties,
	type MouseEvent,
	useCallback,
	useEffectEvent,
	useId,
	useLayoutEffect,
	useMemo,
	useReducer,
	useState,
	useSyncExternalStore,
} from 'react'
import {
	CarouselContext,
	type CarouselContextValue,
	CarouselStateContext,
	type CarouselStateValue,
	SlideContext,
	slideId,
	tabId,
	trackId,
	useCarouselContext,
} from './context'
import {
	CarouselEngine,
	type KeyboardMode,
	OFFSET_PROPERTY,
	PRESENCE_PROPERTY,
	type ReducedMotionMode,
	SERVER_SNAPSHOT,
} from './engine'
import { resolveSpring, type SpringOptions } from './spring'
import { styles } from './styles'
import { useMergedRefs } from './use-merged-refs'

const getServerSnapshot = () => SERVER_SNAPSHOT

function initialItemStyle(index: number, initialIndex: number, style: CSSProperties | undefined) {
	return {
		[OFFSET_PROPERTY]: index - initialIndex,
		[PRESENCE_PROPERTY]: index === initialIndex ? 1 : 0,
		...style,
	} as CSSProperties
}

export interface RootProps extends ComponentProps<'section'> {
	/** The current slide, for a controlled carousel. Pair with `onIndexChange`. */
	index?: number
	/** The slide to start on, for an uncontrolled carousel. Defaults to 0. */
	defaultIndex?: number
	/** Called when a gesture, key, tab or button asks for a new slide. */
	onIndexChange?: (index: number) => void
	/**
	 * The spring that moves the carousel: `{ stiffness, damping, mass }` or
	 * `{ duration, bounce }` with `duration` in seconds.
	 * Defaults to `{ stiffness: 90, damping: 18.1, mass: 0.9 }`.
	 */
	spring?: SpringOptions
	/**
	 * Where arrow keys move the carousel: `"focus"` when focus is inside it, `"global"`
	 * anywhere on the page outside text fields and other arrow-key widgets, or `false`.
	 * Defaults to `"focus"`.
	 */
	keyboard?: KeyboardMode
	/** Lets horizontal trackpad swipes page through slides. Defaults to true. */
	wheel?: boolean
	/** Lets pointers drag the slides. Defaults to true. */
	draggable?: boolean
	/**
	 * `"user"` follows `prefers-reduced-motion`, `"always"` moves instantly and
	 * `"never"` always animates. Defaults to `"user"`.
	 */
	reducedMotion?: ReducedMotionMode
}

function CarouselRoot({
	index: indexProp,
	defaultIndex = 0,
	onIndexChange,
	spring,
	keyboard = 'focus',
	wheel = true,
	draggable = true,
	reducedMotion = 'user',
	ref,
	style,
	children,
	...props
}: RootProps) {
	const [uncontrolledIndex, setUncontrolledIndex] = useState(defaultIndex)
	const isControlled = indexProp !== undefined
	const index = isControlled ? indexProp : uncontrolledIndex

	const [initialIndex] = useState(index)
	const [engine] = useState(() => new CarouselEngine(initialIndex))
	const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot, getServerSnapshot)
	const [, requestSettle] = useReducer((count: number) => count + 1, 0)
	const baseId = useId()
	const rootRef = useMergedRefs(ref, engine.registerRoot)

	const handleIndexRequest = useEffectEvent((next: number) => {
		// Re-render even when the index is unchanged, so a controlled parent that
		// rejects the request still sends the carousel back to the index it holds.
		requestSettle()
		if (next === index) return
		if (!isControlled) setUncontrolledIndex(next)
		onIndexChange?.(next)
	})

	useLayoutEffect(() => engine.onIndexRequest(next => handleIndexRequest(next)), [engine])

	useLayoutEffect(() => {
		engine.setOptions({
			spring: resolveSpring(spring),
			keyboard,
			wheel,
			draggable,
			reducedMotion,
		})
	}, [engine, spring, keyboard, wheel, draggable, reducedMotion])

	useLayoutEffect(() => engine.start(), [engine])

	useLayoutEffect(() => {
		engine.settle(index)
	})

	const context = useMemo<CarouselContextValue>(
		() => ({
			engine,
			baseId,
			initialIndex,
			draggable,
			goTo: (target, options) => engine.navigate(target, options),
			next: options => engine.next(options),
			prev: options => engine.prev(options),
		}),
		[engine, baseId, initialIndex, draggable]
	)

	const state = useMemo<CarouselStateValue>(
		() => ({
			index,
			count: snapshot.count,
			isDragging: snapshot.isDragging,
			hasTabs: snapshot.tabCount > 0,
		}),
		[index, snapshot]
	)

	return (
		<CarouselContext value={context}>
			<CarouselStateContext value={state}>
				{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: a labelled section is a region, and the APG carousel pattern describes it as a carousel. */}
				<section
					aria-roledescription="carousel"
					{...props}
					ref={rootRef}
					data-spring-carousel=""
					data-dragging={snapshot.isDragging ? '' : undefined}
					style={{ ...style, '--carousel-initial-index': initialIndex } as CSSProperties}>
					<style href="spring-carousel" precedence="default">
						{styles}
					</style>
					{children}
				</section>
			</CarouselStateContext>
		</CarouselContext>
	)
}

export type ViewportProps = ComponentProps<'div'>

function CarouselViewport({ ref, ...props }: ViewportProps) {
	const { context } = useCarouselContext('Carousel.Viewport')
	const viewportRef = useMergedRefs(ref, context.engine.registerViewport)

	return (
		<div
			{...props}
			ref={viewportRef}
			data-spring-carousel-viewport=""
			data-draggable={context.draggable ? '' : undefined}
		/>
	)
}

export type TrackProps = ComponentProps<'div'>

function CarouselTrack({ ref, ...props }: TrackProps) {
	const { context } = useCarouselContext('Carousel.Track')
	const trackRef = useMergedRefs(ref, context.engine.registerTrack)

	return (
		<div
			aria-live="polite"
			{...props}
			ref={trackRef}
			id={trackId(context.baseId)}
			data-spring-carousel-track=""
		/>
	)
}

export interface SlideProps extends ComponentProps<'div'> {
	/** This slide's position, from 0. Indexes must run 0, 1, 2… without gaps. */
	index: number
}

function CarouselSlide({ index, ref, style, children, ...props }: SlideProps) {
	const { context, state } = useCarouselContext('Carousel.Slide')
	const { engine, baseId, initialIndex } = context
	const register = useCallback(
		(element: HTMLDivElement) => engine.registerSlide(index, element),
		[engine, index]
	)
	const slideRef = useMergedRefs(ref, register)
	const isActive = index === state.index
	const slide = useMemo(() => ({ index, isActive }), [index, isActive])

	return (
		<SlideContext value={slide}>
			{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-roledescription is global in ARIA 1.2, and the APG carousel pattern puts it on both slide roles. */}
			<div
				role={state.hasTabs ? 'tabpanel' : 'group'}
				aria-roledescription="slide"
				aria-label={
					!state.hasTabs && state.count > 0 ? `${index + 1} of ${state.count}` : undefined
				}
				aria-labelledby={state.hasTabs ? tabId(baseId, index) : undefined}
				{...props}
				ref={slideRef}
				id={slideId(baseId, index)}
				inert={!isActive}
				data-spring-carousel-slide=""
				data-active={isActive ? '' : undefined}
				style={initialItemStyle(index, initialIndex, style)}>
				{children}
			</div>
		</SlideContext>
	)
}

export type TabsProps = ComponentProps<'div'>

function CarouselTabs({ ref, ...props }: TabsProps) {
	const { context } = useCarouselContext('Carousel.Tabs')
	const tabsRef = useMergedRefs(ref, context.engine.registerTabList)

	return (
		<div
			aria-label="Choose a slide"
			{...props}
			ref={tabsRef}
			role="tablist"
			aria-orientation="horizontal"
			data-spring-carousel-tabs=""
		/>
	)
}

export interface TabProps extends ComponentProps<'button'> {
	/** The index of the slide this tab shows. */
	index: number
}

function CarouselTab({ index, ref, style, onClick, ...props }: TabProps) {
	const { context, state } = useCarouselContext('Carousel.Tab')
	const { engine, baseId, initialIndex, goTo } = context
	const register = useCallback(
		(element: HTMLButtonElement) => engine.registerTab(index, element),
		[engine, index]
	)
	const tabRef = useMergedRefs(ref, register)
	const isActive = index === state.index

	function handleClick(event: MouseEvent<HTMLButtonElement>) {
		onClick?.(event)
		if (!event.defaultPrevented) goTo(index)
	}

	return (
		<button
			type="button"
			{...props}
			ref={tabRef}
			id={tabId(baseId, index)}
			role="tab"
			aria-selected={isActive}
			aria-controls={slideId(baseId, index)}
			tabIndex={isActive ? 0 : -1}
			data-spring-carousel-tab=""
			data-active={isActive ? '' : undefined}
			style={initialItemStyle(index, initialIndex, style)}
			onClick={handleClick}
		/>
	)
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
	return (
		<svg
			aria-hidden="true"
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round">
			<path d={direction === 'left' ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'} />
		</svg>
	)
}

export type PrevProps = ComponentProps<'button'>
export type NextProps = ComponentProps<'button'>

function useStepButton(direction: 'prev' | 'next', onClick: PrevProps['onClick']) {
	const { context, state } = useCarouselContext(
		direction === 'prev' ? 'Carousel.Prev' : 'Carousel.Next'
	)
	const disabled = direction === 'prev' ? state.index <= 0 : state.index >= state.count - 1

	function handleClick(event: MouseEvent<HTMLButtonElement>) {
		onClick?.(event)
		if (event.defaultPrevented || disabled) return
		if (direction === 'prev') context.prev()
		else context.next()
	}

	return {
		'aria-controls': trackId(context.baseId),
		'aria-disabled': disabled || undefined,
		'data-disabled': disabled ? '' : undefined,
		onClick: handleClick,
	}
}

/**
 * Stays focusable at the first slide (with `aria-disabled`) so keyboard focus is
 * not dropped to the page when it stops being useful.
 */
function CarouselPrev({ onClick, children, ...props }: PrevProps) {
	const stepProps = useStepButton('prev', onClick)
	return (
		<button
			type="button"
			aria-label="Previous slide"
			{...props}
			{...stepProps}
			data-spring-carousel-prev="">
			{children ?? <Chevron direction="left" />}
		</button>
	)
}

function CarouselNext({ onClick, children, ...props }: NextProps) {
	const stepProps = useStepButton('next', onClick)
	return (
		<button
			type="button"
			aria-label="Next slide"
			{...props}
			{...stepProps}
			data-spring-carousel-next="">
			{children ?? <Chevron direction="right" />}
		</button>
	)
}

export {
	CarouselNext as Next,
	CarouselPrev as Prev,
	CarouselRoot as Root,
	CarouselSlide as Slide,
	CarouselTab as Tab,
	CarouselTabs as Tabs,
	CarouselTrack as Track,
	CarouselViewport as Viewport,
}
