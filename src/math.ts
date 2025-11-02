export function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}

/** How present an item is at a given progress: 1 when it is the current slide, 0 a slide or more away. */
export function presence(progress: number, index: number) {
	return clamp(1 - Math.abs(index - progress), 0, 1)
}

/**
 * Reads a position at a fractional index from a list of positions, extrapolating
 * past either end with the nearest spacing so rubber-banding keeps moving.
 */
export function interpolate(points: readonly number[], value: number) {
	const count = points.length
	const first = points[0]
	if (first === undefined) return 0
	if (count === 1) return first

	const last = points[count - 1] as number

	if (value <= 0) return first + value * ((points[1] as number) - first)
	if (value >= count - 1)
		return last + (value - (count - 1)) * (last - (points[count - 2] as number))

	const startIndex = Math.floor(value)
	const start = points[startIndex] as number
	const end = points[startIndex + 1] as number
	return start + (end - start) * (value - startIndex)
}

/** Distance between neighbouring positions around `value`, used to turn pixels into slides. */
export function spacingAt(points: readonly number[], value: number, fallback: number) {
	if (points.length < 2) return fallback
	const startIndex = clamp(Math.floor(value), 0, points.length - 2)
	const spacing = Math.abs((points[startIndex + 1] as number) - (points[startIndex] as number))
	return spacing > 0 ? spacing : fallback
}

export type ReleaseKind = 'drag' | 'wheel'

export interface ReleaseInput {
	/** Where the carousel is, in slides. */
	position: number
	/** The index it was resting on, or heading to, when the gesture began. */
	anchor: number
	/** Release velocity in slides per second; positive moves towards later slides. */
	velocity: number
	count: number
	kind: ReleaseKind
	/** Slides per second above which a release counts as a flick. */
	flickVelocity: number
	/** Fraction of a slide a slow drag must cover to advance. */
	distanceThreshold?: number
}

/**
 * Picks the slide a gesture should settle on.
 *
 * - A flick advances to the next whole slide in the direction of travel.
 * - A trackpad swipe advances one slide in the direction it moved.
 * - A slow drag advances once it has covered `distanceThreshold` of a slide.
 */
export function resolveReleaseTarget({
	position,
	anchor,
	velocity,
	count,
	kind,
	flickVelocity,
	distanceThreshold = 0.3,
}: ReleaseInput) {
	if (count <= 0) return 0

	const lastIndex = count - 1
	const travelled = position - anchor
	let target = anchor

	if (Math.abs(velocity) >= flickVelocity) {
		target = velocity > 0 ? Math.floor(position) + 1 : Math.ceil(position) - 1
	} else if (kind === 'wheel') {
		if (travelled !== 0) target = anchor + Math.sign(travelled)
	} else if (travelled > 0) {
		target = Math.floor(position + 1 - distanceThreshold)
	} else if (travelled < 0) {
		target = Math.ceil(position - 1 + distanceThreshold)
	}

	return clamp(target, 0, lastIndex)
}

export function snapToDevicePixels(value: number, pixelRatio: number) {
	const ratio = pixelRatio || 1
	return Math.round(value * ratio) / ratio
}
