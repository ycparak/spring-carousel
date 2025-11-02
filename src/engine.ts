import {
	clamp,
	interpolate,
	presence,
	resolveReleaseTarget,
	snapToDevicePixels,
	spacingAt,
} from './math'
import { ProgressValue, VelocityTracker } from './progress'
import { DEFAULT_SPRING, type ResolvedSpring, type SpringState, stepSpring } from './spring'

export type KeyboardMode = 'focus' | 'global' | false
export type ReducedMotionMode = 'user' | 'always' | 'never'

export interface EngineOptions {
	spring: ResolvedSpring
	keyboard: KeyboardMode
	wheel: boolean
	draggable: boolean
	reducedMotion: ReducedMotionMode
}

export interface EngineSnapshot {
	count: number
	tabCount: number
	isDragging: boolean
}

export interface NavigateOptions {
	/** Set to false to move instantly. Defaults to true. */
	animate?: boolean
	/** Starting velocity in slides per second. Defaults to the current velocity. */
	velocity?: number
}

type IndexRequestListener = (index: number) => void

const DRAG_SLOP = 4
const EDGE_RESISTANCE = 0.5
const FLICK_PIXELS_PER_SECOND = 250
const MAX_RELEASE_VELOCITY = 12
const KEYBOARD_EDGE_DISTANCE = 0.03
const WHEEL_SLIP = 0.1
const WHEEL_GESTURE_DURATION = 150
const WHEEL_RESTART_DELAY = 1000
const WHEEL_INTENT_THRESHOLD = 8
const WHEEL_HORIZONTAL_DOMINANCE = 1.4
const WHEEL_INTENT_RESET_DELAY = 120
const WHEEL_LINE_HEIGHT = 16

const EDITABLE_SELECTOR = 'input, textarea, select'
const NO_DRAG_SELECTOR = `${EDITABLE_SELECTOR}, [data-carousel-no-drag]`
const ARROW_KEY_WIDGET_SELECTOR =
	'[role="slider"], [role="tablist"], [role="radiogroup"], [role="menu"], [role="menubar"], [role="listbox"], [role="grid"], [role="tree"], [role="spinbutton"]'

export const OFFSET_PROPERTY = '--carousel-offset'
export const PRESENCE_PROPERTY = '--carousel-presence'
export const PROGRESS_PROPERTY = '--carousel-progress'

export const SERVER_SNAPSHOT: EngineSnapshot = Object.freeze({
	count: 0,
	tabCount: 0,
	isDragging: false,
})

type PointerGesture = {
	id: number
	startX: number
	startY: number
	lastX: number
	anchor: number
	dragging: boolean
}

function matches(target: EventTarget | null, selector: string) {
	return (
		target instanceof HTMLElement && (target.isContentEditable || target.closest(selector) !== null)
	)
}

function format(value: number) {
	return value.toFixed(4)
}

/**
 * Owns everything that happens per frame: measuring, gestures, keyboard input and
 * the spring. React tells it which elements exist and which index to rest on; it
 * tells React when a gesture asks for a new index. It never re-renders React during
 * an animation.
 */
export class CarouselEngine {
	readonly progress: ProgressValue

	#options: EngineOptions = {
		spring: DEFAULT_SPRING,
		keyboard: 'focus',
		wheel: true,
		draggable: true,
		reducedMotion: 'user',
	}
	#onIndexRequest: IndexRequestListener | null = null

	#snapshot: EngineSnapshot = SERVER_SNAPSHOT
	readonly #snapshotListeners = new Set<() => void>()

	#root: HTMLElement | null = null
	#viewport: HTMLElement | null = null
	#track: HTMLElement | null = null
	#tabList: HTMLElement | null = null
	readonly #slides = new Map<number, HTMLElement>()
	readonly #tabs = new Map<number, HTMLElement>()

	#slideCenters: number[] = []
	#tabCenters: number[] = []
	#trackCenter = 0
	#trackWidth = 0

	#target: number
	#springTarget: number
	readonly #springState: SpringState = { position: 0, velocity: 0 }
	#frame = 0
	#lastFrameTime = 0
	#measureFrame = 0

	#started = false
	#unbind: (() => void) | null = null
	#resizeObserver: ResizeObserver | null = null
	#motionQuery: MediaQueryList | null = null
	#reduceMotion = false

	#pointer: PointerGesture | null = null
	#releasePointerListeners: (() => void) | null = null
	#suppressClick = false
	readonly #tracker = new VelocityTracker()

	#wheelCanStart = true
	#wheelTracking = false
	#wheelAxis: 'pending' | 'horizontal' | 'vertical' | null = null
	#wheelAnchor = 0
	#wheelTravel = 0
	#wheelAccumulatedX = 0
	#wheelAccumulatedY = 0
	#wheelEndTimer = 0
	#wheelRestartTimer = 0
	#wheelIntentTimer = 0

	#keyboardRubberbanding = false

	constructor(initialIndex: number) {
		this.#target = initialIndex
		this.#springTarget = initialIndex
		this.progress = new ProgressValue(initialIndex)
	}

	// External store, read by React through useSyncExternalStore.

	getSnapshot = () => this.#snapshot

	subscribe = (listener: () => void) => {
		this.#snapshotListeners.add(listener)
		return () => {
			this.#snapshotListeners.delete(listener)
		}
	}

	#updateSnapshot(patch: Partial<EngineSnapshot>) {
		const next = { ...this.#snapshot, ...patch }
		if (
			next.count === this.#snapshot.count &&
			next.tabCount === this.#snapshot.tabCount &&
			next.isDragging === this.#snapshot.isDragging
		) {
			return
		}
		this.#snapshot = next
		for (const listener of this.#snapshotListeners) listener()
	}

	get count() {
		return this.#slides.size
	}

	get target() {
		return this.#target
	}

	// Configuration.

	setOptions(options: EngineOptions) {
		const previous = this.#options
		this.#options = options
		if (!this.#started) return

		if (previous.reducedMotion !== options.reducedMotion) this.#updateReducedMotion()
		if (previous.keyboard !== options.keyboard) this.#rebind()
		if (!options.draggable && this.#pointer) this.#endPointer(null)
	}

	onIndexRequest(listener: IndexRequestListener) {
		this.#onIndexRequest = listener
		return () => {
			if (this.#onIndexRequest === listener) this.#onIndexRequest = null
		}
	}

	// Element registration. Each returns a cleanup for React 19 callback refs.

	registerRoot = (element: HTMLElement) => this.#registerElement('root', element)
	registerViewport = (element: HTMLElement) => this.#registerElement('viewport', element)
	registerTrack = (element: HTMLElement) => this.#registerElement('track', element)
	registerTabList = (element: HTMLElement) => this.#registerElement('tabList', element)

	registerSlide(index: number, element: HTMLElement) {
		return this.#registerItem(this.#slides, index, element)
	}

	registerTab(index: number, element: HTMLElement) {
		return this.#registerItem(this.#tabs, index, element)
	}

	#registerElement(slot: 'root' | 'viewport' | 'track' | 'tabList', element: HTMLElement) {
		this.#setElement(slot, element)
		this.#elementsChanged(element)

		return () => {
			if (this.#getElement(slot) !== element) return
			this.#setElement(slot, null)
			this.#elementsChanged(null)
		}
	}

	#registerItem(items: Map<number, HTMLElement>, index: number, element: HTMLElement) {
		items.set(index, element)
		this.#itemsChanged(element)

		return () => {
			if (items.get(index) !== element) return
			items.delete(index)
			this.#itemsChanged(null)
		}
	}

	#getElement(slot: 'root' | 'viewport' | 'track' | 'tabList') {
		if (slot === 'root') return this.#root
		if (slot === 'viewport') return this.#viewport
		if (slot === 'track') return this.#track
		return this.#tabList
	}

	#setElement(slot: 'root' | 'viewport' | 'track' | 'tabList', element: HTMLElement | null) {
		if (slot === 'root') this.#root = element
		else if (slot === 'viewport') this.#viewport = element
		else if (slot === 'track') this.#track = element
		else this.#tabList = element
	}

	#elementsChanged(added: HTMLElement | null) {
		if (!this.#started) return
		if (added) this.#resizeObserver?.observe(added)
		this.#rebind()
		this.#scheduleMeasure()
	}

	#itemsChanged(added: HTMLElement | null) {
		this.#updateSnapshot({ count: this.#slides.size, tabCount: this.#tabs.size })
		if (!this.#started) return
		if (added) this.#resizeObserver?.observe(added)
		this.#scheduleMeasure()
	}

	// Lifecycle.

	start() {
		if (this.#started) return () => this.stop()
		this.#started = true

		this.#motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
		this.#motionQuery.addEventListener('change', this.#updateReducedMotion)
		this.#updateReducedMotion()

		this.#resizeObserver = new ResizeObserver(() => this.#measure())
		for (const element of this.#observedElements()) this.#resizeObserver.observe(element)

		this.#rebind()
		this.#measure()
		this.#jump(this.#target)

		return () => this.stop()
	}

	stop() {
		if (!this.#started) return
		this.#started = false

		this.#cancelAnimation()
		cancelAnimationFrame(this.#measureFrame)
		this.#unbind?.()
		this.#unbind = null
		this.#resizeObserver?.disconnect()
		this.#resizeObserver = null
		this.#motionQuery?.removeEventListener('change', this.#updateReducedMotion)
		this.#motionQuery = null
		this.#resetWheel()
		window.clearTimeout(this.#wheelRestartTimer)
		this.#wheelCanStart = true
		this.#releasePointerListeners?.()
		this.#releasePointerListeners = null
		this.#pointer = null
		this.#updateSnapshot({ isDragging: false })
	}

	*#observedElements() {
		for (const element of [this.#viewport, this.#track, this.#tabList]) {
			if (element) yield element
		}
		yield* this.#slides.values()
		yield* this.#tabs.values()
	}

	#updateReducedMotion = () => {
		const mode = this.#options.reducedMotion
		this.#reduceMotion = mode === 'always' || (mode === 'user' && !!this.#motionQuery?.matches)
	}

	#rebind() {
		this.#unbind?.()
		this.#unbind = null
		if (!this.#started) return

		const cleanups: (() => void)[] = []
		const listen = <K extends keyof HTMLElementEventMap>(
			target: HTMLElement | Document,
			type: K,
			listener: (event: HTMLElementEventMap[K]) => void,
			options?: AddEventListenerOptions
		) => {
			target.addEventListener(type, listener as EventListener, options)
			cleanups.push(() => target.removeEventListener(type, listener as EventListener, options))
		}

		const viewport = this.#viewport
		if (viewport) {
			listen(viewport, 'pointerdown', this.#onPointerDown)
			listen(viewport, 'click', this.#onClickCapture, { capture: true })
			listen(viewport, 'dragstart', this.#onDragStart)
			listen(viewport, 'wheel', this.#onWheel, { passive: false })
		}

		const keyboard = this.#options.keyboard
		const keyTarget = keyboard === 'global' ? document : keyboard === 'focus' ? this.#root : null
		if (keyTarget) {
			listen(keyTarget, 'keydown', this.#onKeyDown)
			listen(keyTarget, 'keyup', this.#onKeyUp)
		}

		this.#unbind = () => {
			for (const cleanup of cleanups) cleanup()
		}
	}

	// Measuring and rendering.

	#scheduleMeasure() {
		cancelAnimationFrame(this.#measureFrame)
		this.#measureFrame = requestAnimationFrame(() => this.#measure())
	}

	#measure() {
		const track = this.#track
		if (!track) return

		const width = track.clientWidth
		if (width === 0) return

		this.#trackWidth = width
		this.#trackCenter = width / 2
		this.#slideCenters = this.#centers(this.#slides, width)

		const tabList = this.#tabList
		if (tabList && this.#tabs.size > 0) {
			const pixelRatio = window.devicePixelRatio
			this.#tabCenters = this.#centers(this.#tabs, 0).map(center =>
				snapToDevicePixels(center, pixelRatio)
			)
			tabList.setAttribute('data-measured', '')
		}

		const lastIndex = Math.max(this.count - 1, 0)
		if (this.#target > lastIndex) {
			this.navigate(lastIndex, { animate: false })
			return
		}

		this.#render(this.progress.get())
	}

	#centers(items: Map<number, HTMLElement>, fallbackSpacing: number) {
		const centers: number[] = []
		for (let index = 0; index < items.size; index += 1) {
			const element = items.get(index)
			const previous = centers[index - 1]
			centers.push(
				element
					? element.offsetLeft + element.offsetWidth / 2
					: previous === undefined
						? fallbackSpacing / 2
						: previous + fallbackSpacing
			)
		}
		return centers
	}

	#render(position: number) {
		if (this.#trackWidth === 0) return

		const track = this.#track
		if (track) {
			const x = this.#trackCenter - interpolate(this.#slideCenters, position)
			track.style.transform = `translate3d(${x}px, 0, 0)`
		}

		const tabList = this.#tabList
		if (tabList && this.#tabCenters.length > 0) {
			const x = -interpolate(this.#tabCenters, position)
			tabList.style.transform = `translate3d(${x}px, 0, 0)`
		}

		this.#root?.style.setProperty(PROGRESS_PROPERTY, format(position))
		this.#writeItemProperties(this.#slides, position)
		this.#writeItemProperties(this.#tabs, position)
	}

	#writeItemProperties(items: Map<number, HTMLElement>, position: number) {
		for (const [index, element] of items) {
			element.style.setProperty(OFFSET_PROPERTY, format(index - position))
			element.style.setProperty(PRESENCE_PROPERTY, format(presence(position, index)))
		}
	}

	#setPosition(position: number, velocity: number) {
		this.progress.set(position, velocity)
		this.#render(position)
	}

	// Animation.

	#isTrackingInput() {
		return this.#pointer !== null || this.#wheelTracking
	}

	#cancelAnimation() {
		cancelAnimationFrame(this.#frame)
		this.#frame = 0
	}

	#jump(position: number) {
		this.#cancelAnimation()
		this.#springTarget = position
		this.#setPosition(position, 0)
	}

	#animate(target: number, velocity: number) {
		this.#springTarget = target

		if (this.#reduceMotion || !this.#started) {
			this.#jump(target)
			return
		}

		this.#springState.position = this.progress.get()
		this.#springState.velocity = velocity
		if (this.#frame !== 0) return

		this.#lastFrameTime = performance.now()
		this.#frame = requestAnimationFrame(this.#tick)
	}

	#tick = (time: number) => {
		const elapsed = (time - this.#lastFrameTime) / 1000
		this.#lastFrameTime = time

		const settled = stepSpring(this.#springState, this.#springTarget, this.#options.spring, elapsed)
		this.#setPosition(this.#springState.position, this.#springState.velocity)
		this.#frame = settled ? 0 : requestAnimationFrame(this.#tick)
	}

	// Navigation.

	/** Moves to `index` and asks React to make it the current index. */
	navigate(index: number, options: NavigateOptions = {}) {
		const target = clamp(Math.round(index), 0, Math.max(this.count - 1, 0))
		this.#target = target

		if (options.animate === false) this.#jump(target)
		else this.#animate(target, options.velocity ?? this.progress.getVelocity())

		this.#onIndexRequest?.(target)
	}

	next(options?: NavigateOptions) {
		this.navigate(this.#target + 1, options)
	}

	prev(options?: NavigateOptions) {
		this.navigate(this.#target - 1, options)
	}

	/**
	 * Called by React after every index change or rejected request: brings the
	 * carousel to rest on the index React holds. A no-op when it is already heading
	 * there, and deferred while a finger or trackpad is moving it.
	 */
	settle(index: number) {
		if (this.#isTrackingInput()) return

		const target = this.count > 0 ? clamp(index, 0, this.count - 1) : index
		if (target === this.#target && target === this.#springTarget) return

		this.#target = target
		this.#animate(target, this.progress.getVelocity())
	}

	/**
	 * Settles a gesture. `intent` picks the slide and `momentum` starts the spring,
	 * both in pixels per second towards later slides.
	 */
	#release(kind: 'drag' | 'wheel', anchor: number, intent: number, momentum: number) {
		const position = this.progress.get()
		const spacing = spacingAt(this.#slideCenters, position, this.#trackWidth)
		const velocity = clamp(momentum / spacing, -MAX_RELEASE_VELOCITY, MAX_RELEASE_VELOCITY)
		const target = resolveReleaseTarget({
			position,
			anchor,
			velocity: intent / spacing,
			count: this.count,
			kind,
			flickVelocity: FLICK_PIXELS_PER_SECOND / spacing,
		})
		this.navigate(target, { velocity })
	}

	/** Moves by `pixels` of scroll: positive travels towards later slides. */
	#scrollBy(pixels: number, scrollVelocity: number) {
		if (this.#trackWidth === 0) return

		const position = this.progress.get()
		const spacing = spacingAt(this.#slideCenters, position, this.#trackWidth)
		let delta = pixels / spacing
		const next = position + delta
		if (next < 0 || next > this.count - 1) delta *= EDGE_RESISTANCE

		this.#setPosition(position + delta, scrollVelocity / spacing)
	}

	// Pointer dragging.

	#onPointerDown = (event: PointerEvent) => {
		if (!this.#options.draggable || !event.isPrimary || event.button !== 0) return
		if (this.#trackWidth === 0 || matches(event.target, NO_DRAG_SELECTOR)) return
		// A new primary press means the last gesture's pointerup never arrived.
		if (this.#pointer) this.#endPointer(null)

		this.#suppressClick = false
		this.#cancelAnimation()
		this.#tracker.reset()
		this.#tracker.add(event.timeStamp, event.clientX)
		this.#pointer = {
			id: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			lastX: event.clientX,
			anchor: this.#target,
			dragging: false,
		}

		// Listened for on the window, because the pointer is only captured once a drag
		// begins: capturing on press would retarget clicks on links inside slides. Losing
		// capture is not an end: Chromium can fire lostpointercapture before pointerup
		// when a trackpad click lifts, which would discard the flick.
		window.addEventListener('pointermove', this.#onPointerMove)
		window.addEventListener('pointerup', this.#onPointerUp)
		window.addEventListener('pointercancel', this.#onPointerCancel)
		this.#releasePointerListeners = () => {
			window.removeEventListener('pointermove', this.#onPointerMove)
			window.removeEventListener('pointerup', this.#onPointerUp)
			window.removeEventListener('pointercancel', this.#onPointerCancel)
		}
	}

	#onPointerMove = (event: PointerEvent) => {
		const pointer = this.#pointer
		if (!pointer || event.pointerId !== pointer.id) return

		if (event.buttons === 0) {
			this.#endPointer(event)
			return
		}

		if (!pointer.dragging) {
			const distanceX = Math.abs(event.clientX - pointer.startX)
			const distanceY = Math.abs(event.clientY - pointer.startY)
			if (distanceX < DRAG_SLOP && distanceY < DRAG_SLOP) return

			if (distanceY > distanceX) {
				this.#endPointer(null)
				return
			}

			pointer.dragging = true
			this.#suppressClick = true
			this.#viewport?.setPointerCapture(pointer.id)
			this.#updateSnapshot({ isDragging: true })
		}

		const delta = event.clientX - pointer.lastX
		pointer.lastX = event.clientX
		this.#tracker.add(event.timeStamp, event.clientX)
		this.#scrollBy(-delta, -this.#tracker.velocity(event.timeStamp))
	}

	#onPointerUp = (event: PointerEvent) => {
		if (this.#pointer?.id === event.pointerId) this.#endPointer(event)
	}

	#onPointerCancel = (event: PointerEvent) => {
		if (this.#pointer?.id === event.pointerId) this.#endPointer(null)
	}

	/** Ends the gesture. A null event (cancelled or abandoned) settles by distance alone. */
	#endPointer(event: PointerEvent | null) {
		const pointer = this.#pointer
		if (!pointer) return
		this.#pointer = null
		this.#releasePointerListeners?.()
		this.#releasePointerListeners = null

		const viewport = this.#viewport
		if (viewport?.hasPointerCapture(pointer.id)) viewport.releasePointerCapture(pointer.id)

		if (!pointer.dragging) {
			this.#animate(this.#target, 0)
			return
		}

		this.#updateSnapshot({ isDragging: false })
		// A click-drag usually stops for a few frames before the button lifts, so the
		// target follows the final stretch of movement, as Kami's did, while the spring
		// only inherits the velocity the pointer still has.
		const intent = event ? this.#tracker.intentVelocity() : 0
		const momentum = event ? this.#tracker.velocity(event.timeStamp) : 0
		this.#release('drag', pointer.anchor, -intent, -momentum)
	}

	#onClickCapture = (event: MouseEvent) => {
		if (!this.#suppressClick) return
		this.#suppressClick = false
		event.preventDefault()
		event.stopPropagation()
	}

	#onDragStart = (event: DragEvent) => {
		if (this.#options.draggable) event.preventDefault()
	}

	// Trackpad and horizontal wheel swipes, which page one slide per gesture.

	#onWheel = (event: WheelEvent) => {
		if (!this.#options.wheel || this.#trackWidth === 0) return

		const { x, y } = this.#wheelDelta(event)
		if (x === 0 && y === 0) return

		if (this.#wheelAxis === 'horizontal') {
			event.preventDefault()
			if (this.#wheelTracking && x !== 0) this.#trackWheel(event.timeStamp, x)
			return
		}

		if (!this.#wheelCanStart) return

		if (this.#wheelAxis === 'vertical') {
			this.#scheduleWheelIntentReset()
			return
		}

		this.#wheelAxis = 'pending'
		this.#wheelAccumulatedX += Math.abs(x)
		this.#wheelAccumulatedY += Math.abs(y)
		this.#scheduleWheelIntentReset()

		if (Math.max(this.#wheelAccumulatedX, this.#wheelAccumulatedY) < WHEEL_INTENT_THRESHOLD) return

		if (this.#wheelAccumulatedY >= this.#wheelAccumulatedX) {
			this.#wheelAxis = 'vertical'
			return
		}

		if (this.#wheelAccumulatedX < this.#wheelAccumulatedY * WHEEL_HORIZONTAL_DOMINANCE) return

		event.preventDefault()
		this.#startWheelGesture()
		this.#trackWheel(event.timeStamp, x)
	}

	#wheelDelta(event: WheelEvent) {
		if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
			return { x: event.deltaX * WHEEL_LINE_HEIGHT, y: event.deltaY * WHEEL_LINE_HEIGHT }
		}
		const viewport = this.#viewport
		if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE && viewport) {
			return { x: event.deltaX * viewport.clientWidth, y: event.deltaY * viewport.clientHeight }
		}
		return { x: event.deltaX, y: event.deltaY }
	}

	#startWheelGesture() {
		this.#wheelAxis = 'horizontal'
		this.#wheelCanStart = false
		this.#wheelTracking = true
		this.#wheelAnchor = this.#target
		this.#wheelTravel = 0
		window.clearTimeout(this.#wheelIntentTimer)
		this.#cancelAnimation()
		this.#tracker.reset()

		this.#wheelEndTimer = window.setTimeout(() => {
			this.#wheelTracking = false
			this.#release(
				'wheel',
				this.#wheelAnchor,
				this.#tracker.intentVelocity(),
				this.#tracker.velocity(performance.now())
			)

			this.#wheelRestartTimer = window.setTimeout(() => {
				this.#wheelCanStart = true
				this.#resetWheelIntent()
			}, WHEEL_RESTART_DELAY)
		}, WHEEL_GESTURE_DURATION)
	}

	#trackWheel(time: number, deltaX: number) {
		const pixels = deltaX * WHEEL_SLIP
		this.#wheelTravel += pixels
		this.#tracker.add(time, this.#wheelTravel)
		this.#scrollBy(pixels, this.#tracker.velocity(time))
	}

	#scheduleWheelIntentReset() {
		window.clearTimeout(this.#wheelIntentTimer)
		this.#wheelIntentTimer = window.setTimeout(this.#resetWheelIntent, WHEEL_INTENT_RESET_DELAY)
	}

	#resetWheelIntent = () => {
		window.clearTimeout(this.#wheelIntentTimer)
		this.#wheelAxis = null
		this.#wheelAccumulatedX = 0
		this.#wheelAccumulatedY = 0
	}

	#resetWheel() {
		window.clearTimeout(this.#wheelEndTimer)
		this.#wheelTracking = false
		this.#resetWheelIntent()
	}

	// Keyboard.

	#onKeyDown = (event: KeyboardEvent) => {
		if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return

		const target = event.target
		if (matches(target, EDITABLE_SELECTOR) || this.#belongsToOtherWidget(target)) return

		const fromTab = target instanceof Element && this.#isOwnTab(target)

		const lastIndex = this.count - 1
		if (lastIndex < 0) return

		if (fromTab && (event.key === 'Home' || event.key === 'End')) {
			event.preventDefault()
			this.navigate(event.key === 'Home' ? 0 : lastIndex)
			this.#focusTab(this.#target)
			return
		}

		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
		event.preventDefault()

		const direction = event.key === 'ArrowRight' ? 1 : -1
		const atBoundary = direction < 0 ? this.#target <= 0 : this.#target >= lastIndex

		if (!atBoundary) {
			this.#keyboardRubberbanding = false
			this.navigate(this.#target + direction)
			if (fromTab) this.#focusTab(this.#target)
			return
		}

		if (!event.repeat && !this.#reduceMotion && !this.#isTrackingInput()) {
			this.#keyboardRubberbanding = true
			this.#animate(this.#target + direction * KEYBOARD_EDGE_DISTANCE, this.progress.getVelocity())
		}
	}

	#onKeyUp = (event: KeyboardEvent) => {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
		if (!this.#keyboardRubberbanding) return
		this.#keyboardRubberbanding = false
		this.#animate(this.#target, this.progress.getVelocity())
	}

	#isOwnTab(element: Element) {
		for (const tab of this.#tabs.values()) if (tab === element) return true
		return false
	}

	/** Leaves arrow keys to sliders, menus and other widgets that use them, except our tabs. */
	#belongsToOtherWidget(target: EventTarget | null) {
		if (!(target instanceof Element)) return false
		const widget = target.closest(ARROW_KEY_WIDGET_SELECTOR)
		return widget !== null && widget !== this.#tabList
	}

	#focusTab(index: number) {
		this.#tabs.get(index)?.focus({ preventScroll: true })
	}
}
