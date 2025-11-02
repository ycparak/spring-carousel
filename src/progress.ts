export type ProgressListener = (progress: number) => void

/**
 * The carousel's continuous position, in slides: 0 is the first slide, 1.5 is
 * halfway between the second and third. It changes every animation frame without
 * re-rendering React; read it with `get()` or listen with `subscribe()`.
 */
export interface CarouselProgress {
	get(): number
	/** Slides per second. */
	getVelocity(): number
	/** Calls `listener` immediately with the current value, then on every change. */
	subscribe(listener: ProgressListener): () => void
}

export class ProgressValue implements CarouselProgress {
	#value: number
	#velocity = 0
	readonly #listeners = new Set<ProgressListener>()

	constructor(initial: number) {
		this.#value = initial
	}

	get = () => this.#value

	getVelocity = () => this.#velocity

	set(value: number, velocity: number) {
		this.#velocity = velocity
		if (value === this.#value) return
		this.#value = value
		for (const listener of this.#listeners) listener(value)
	}

	subscribe = (listener: ProgressListener) => {
		this.#listeners.add(listener)
		listener(this.#value)
		return () => {
			this.#listeners.delete(listener)
		}
	}
}

const HISTORY = 300
const RECENT_WINDOW = 32
const IDLE_AFTER = 50
const STILL_DISTANCE = 2

type Sample = { time: number; position: number }

/** Estimates pointer or wheel velocity from the last 300ms of samples. */
export class VelocityTracker {
	#samples: Sample[] = []

	reset() {
		this.#samples = []
	}

	add(time: number, position: number) {
		this.#samples.push({ time, position })
		while (this.#samples.length > 2 && time - (this.#samples[0]?.time ?? time) > HISTORY) {
			this.#samples.shift()
		}
	}

	/**
	 * Units per second over the final two frames or so of movement before any pause,
	 * however long ago that was: which way, and how hard, the input was heading when it
	 * let go. The pixel or two a held pointer drifts, or a click nudges, is not movement.
	 */
	intentVelocity() {
		const lastIndex = this.#samples.length - 1
		const last = this.#samples[lastIndex]
		if (!last) return 0

		let end = lastIndex
		while (
			end > 0 &&
			Math.abs((this.#samples[end - 1] as Sample).position - last.position) < STILL_DISTANCE
		) {
			end -= 1
		}
		return this.#velocityEndingAt(end)
	}

	/** Units per second at `now`: 0 once the input has been still for 50ms. */
	velocity(now: number) {
		const lastIndex = this.#samples.length - 1
		const last = this.#samples[lastIndex]
		if (!last || now - last.time > IDLE_AFTER) return 0
		return this.#velocityEndingAt(lastIndex)
	}

	#velocityEndingAt(endIndex: number) {
		const end = this.#samples[endIndex]
		if (!end) return 0

		let start = end
		for (let index = endIndex - 1; index >= 0; index -= 1) {
			start = this.#samples[index] as Sample
			if (end.time - start.time >= RECENT_WINDOW) break
		}

		const elapsed = end.time - start.time
		return elapsed > 0 ? ((end.position - start.position) / elapsed) * 1000 : 0
	}
}
