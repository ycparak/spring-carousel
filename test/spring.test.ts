import { describe, expect, it } from 'vitest'
import { DEFAULT_SPRING, resolveSpring, type SpringState, stepSpring } from '../src/spring'

function run(state: SpringState, target: number, spring = DEFAULT_SPRING) {
	let frames = 0
	let peak = state.position
	while (!stepSpring(state, target, spring, 1 / 60)) {
		peak = Math.max(peak, state.position)
		frames += 1
		if (frames > 10_000) throw new Error('spring never settled')
	}
	return { frames, peak }
}

describe('resolveSpring', () => {
	it('defaults to the original carousel spring', () => {
		expect(resolveSpring(undefined)).toEqual(DEFAULT_SPRING)
		expect(resolveSpring({})).toEqual(DEFAULT_SPRING)
	})

	it('fills in missing physical values and rejects invalid ones', () => {
		expect(resolveSpring({ stiffness: 200 })).toEqual({ ...DEFAULT_SPRING, stiffness: 200 })
		expect(resolveSpring({ stiffness: -1, mass: 0 })).toEqual(DEFAULT_SPRING)
	})

	it('converts a perceptual duration and bounce', () => {
		const critical = resolveSpring({ duration: 0.5 })
		expect(critical.mass).toBe(1)
		expect(critical.damping).toBeCloseTo(2 * Math.sqrt(critical.stiffness * critical.mass))

		const bouncy = resolveSpring({ duration: 0.5, bounce: 0.3 })
		expect(bouncy.damping).toBeLessThan(critical.damping)
	})
})

describe('stepSpring', () => {
	it('settles exactly on the target', () => {
		const state = { position: 0, velocity: 0 }
		run(state, 1)
		expect(state).toEqual({ position: 1, velocity: 0 })
	})

	it('overshoots with a bouncy spring and not with a critically damped one', () => {
		const bouncy = run(
			{ position: 0, velocity: 0 },
			1,
			resolveSpring({ duration: 0.4, bounce: 0.4 })
		)
		const critical = run({ position: 0, velocity: 0 }, 1, resolveSpring({ duration: 0.4 }))
		expect(bouncy.peak).toBeGreaterThan(1.05)
		expect(critical.peak).toBeLessThanOrEqual(1)
	})

	it('carries initial velocity through', () => {
		const state = { position: 0, velocity: 10 }
		stepSpring(state, 0, DEFAULT_SPRING, 1 / 60)
		expect(state.position).toBeGreaterThan(0)
	})

	it('keeps time when frames are throttled', () => {
		const smooth = { position: 0, velocity: 0 }
		for (let frame = 0; frame < 30; frame += 1) stepSpring(smooth, 1, DEFAULT_SPRING, 1 / 60)
		const throttled = { position: 0, velocity: 0 }
		stepSpring(throttled, 1, DEFAULT_SPRING, 0.5)
		expect(throttled.position).toBeCloseTo(smooth.position, 2)
	})

	it('caps very long frames instead of exploding', () => {
		const state = { position: 0, velocity: 0 }
		stepSpring(state, 1, resolveSpring({ stiffness: 2000, damping: 10 }), 30)
		expect(Number.isFinite(state.position)).toBe(true)
		expect(Math.abs(state.position)).toBeLessThan(10)
	})
})
