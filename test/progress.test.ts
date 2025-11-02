import { describe, expect, it, vi } from 'vitest'
import { ProgressValue, VelocityTracker } from '../src/progress'

describe('ProgressValue', () => {
	it('calls a new listener immediately and on change, and stops after unsubscribing', () => {
		const progress = new ProgressValue(2)
		const listener = vi.fn()
		const unsubscribe = progress.subscribe(listener)
		expect(listener).toHaveBeenLastCalledWith(2)

		progress.set(2.5, 1)
		expect(listener).toHaveBeenLastCalledWith(2.5)
		expect(progress.getVelocity()).toBe(1)

		progress.set(2.5, 0)
		expect(listener).toHaveBeenCalledTimes(2)

		unsubscribe()
		progress.set(3, 0)
		expect(listener).toHaveBeenCalledTimes(2)
	})
})

describe('VelocityTracker', () => {
	it('measures units per second over recent samples', () => {
		const tracker = new VelocityTracker()
		tracker.add(0, 0)
		tracker.add(16, 8)
		tracker.add(32, 16)
		expect(tracker.velocity(32)).toBeCloseTo(500)
	})

	it('reads 0 once the input has been still', () => {
		const tracker = new VelocityTracker()
		tracker.add(0, 0)
		tracker.add(16, 8)
		expect(tracker.velocity(100)).toBe(0)
	})

	it('keeps the final movement after the input stops, but reports no current velocity', () => {
		const tracker = new VelocityTracker()
		tracker.add(0, 0)
		tracker.add(16, 20)
		tracker.add(33, 60)
		tracker.add(50, 120)
		expect(tracker.intentVelocity()).toBeCloseTo((100 / 34) * 1000)
		expect(tracker.velocity(150)).toBe(0)
	})

	it('reads the last two frames rather than averaging an acceleration away', () => {
		const tracker = new VelocityTracker()
		tracker.add(0, 0)
		tracker.add(33, 2)
		tracker.add(66, 4)
		tracker.add(83, 14)
		tracker.add(100, 24)
		expect(tracker.intentVelocity()).toBeCloseTo((20 / 34) * 1000)
	})

	it('ignores the drift of a held pointer when reading the final movement', () => {
		const tracker = new VelocityTracker()
		tracker.add(0, 0)
		tracker.add(16, -20)
		tracker.add(33, -45)
		tracker.add(50, -65)
		tracker.add(70, -66)
		tracker.add(90, -65)
		tracker.add(110, -66)
		expect(tracker.intentVelocity()).toBeCloseTo((-45 / 34) * 1000)
		expect(Math.abs(tracker.velocity(110))).toBeLessThan(100)
	})

	it('still reads a slow drag as slow', () => {
		const tracker = new VelocityTracker()
		for (let time = 0; time <= 160; time += 16) tracker.add(time, -time / 16)
		expect(Math.abs(tracker.intentVelocity())).toBeCloseTo(62.5)
	})

	it('forgets samples older than 300ms', () => {
		const tracker = new VelocityTracker()
		tracker.add(0, 0)
		tracker.add(10, 1000)
		tracker.add(400, 1000)
		tracker.add(416, 1016)
		expect(tracker.velocity(416)).toBeCloseTo(1000)
	})
})
