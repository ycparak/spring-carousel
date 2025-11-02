import { describe, expect, it } from 'vitest'
import { interpolate, presence, resolveReleaseTarget, spacingAt } from '../src/math'

describe('interpolate', () => {
	const points = [0, 100, 300]

	it('reads whole and fractional indexes', () => {
		expect(interpolate(points, 0)).toBe(0)
		expect(interpolate(points, 1)).toBe(100)
		expect(interpolate(points, 1.5)).toBe(200)
	})

	it('extrapolates past either end with the nearest spacing', () => {
		expect(interpolate(points, -0.5)).toBe(-50)
		expect(interpolate(points, 2.5)).toBe(400)
	})

	it('handles empty and single lists', () => {
		expect(interpolate([], 3)).toBe(0)
		expect(interpolate([42], 3)).toBe(42)
	})
})

describe('spacingAt', () => {
	it('measures the gap around a position and falls back when there is none', () => {
		expect(spacingAt([0, 100, 300], 1.2, 1)).toBe(200)
		expect(spacingAt([0, 100, 300], 5, 1)).toBe(200)
		expect(spacingAt([50], 0, 640)).toBe(640)
	})
})

describe('presence', () => {
	it('is 1 on the slide and fades to 0 a slide away', () => {
		expect(presence(2, 2)).toBe(1)
		expect(presence(2.25, 2)).toBe(0.75)
		expect(presence(3.5, 2)).toBe(0)
	})
})

describe('resolveReleaseTarget', () => {
	const base = { count: 5, kind: 'drag' as const, flickVelocity: 0.5 }

	it('returns to the anchor after a short, slow drag', () => {
		expect(resolveReleaseTarget({ ...base, position: 2.2, anchor: 2, velocity: 0 })).toBe(2)
		expect(resolveReleaseTarget({ ...base, position: 1.8, anchor: 2, velocity: 0 })).toBe(2)
	})

	it('advances once a slow drag covers 30% of a slide', () => {
		expect(resolveReleaseTarget({ ...base, position: 2.35, anchor: 2, velocity: 0 })).toBe(3)
		expect(resolveReleaseTarget({ ...base, position: 1.65, anchor: 2, velocity: 0 })).toBe(1)
	})

	it('settles on the nearest slide after a long slow drag', () => {
		expect(resolveReleaseTarget({ ...base, position: 3.2, anchor: 2, velocity: 0 })).toBe(3)
	})

	it('follows a flick to the next slide in its direction', () => {
		expect(resolveReleaseTarget({ ...base, position: 2.05, anchor: 2, velocity: 2 })).toBe(3)
		expect(resolveReleaseTarget({ ...base, position: 2.2, anchor: 2, velocity: -2 })).toBe(2)
		expect(resolveReleaseTarget({ ...base, position: 1.95, anchor: 2, velocity: -2 })).toBe(1)
	})

	it('pages one slide per trackpad swipe', () => {
		const wheel = { ...base, kind: 'wheel' as const }
		expect(resolveReleaseTarget({ ...wheel, position: 2.01, anchor: 2, velocity: 0 })).toBe(3)
		expect(resolveReleaseTarget({ ...wheel, position: 1.99, anchor: 2, velocity: 0 })).toBe(1)
		expect(resolveReleaseTarget({ ...wheel, position: 2, anchor: 2, velocity: 0 })).toBe(2)
	})

	it('never leaves the slides', () => {
		expect(resolveReleaseTarget({ ...base, position: -0.4, anchor: 0, velocity: -5 })).toBe(0)
		expect(resolveReleaseTarget({ ...base, position: 4.3, anchor: 4, velocity: 5 })).toBe(4)
		expect(resolveReleaseTarget({ ...base, count: 0, position: 0, anchor: 0, velocity: 0 })).toBe(0)
	})
})
