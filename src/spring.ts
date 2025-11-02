/**
 * Physical spring parameters. Defaults reproduce the original Kami carousel.
 */
export interface PhysicalSpring {
	stiffness?: number
	damping?: number
	mass?: number
	duration?: never
	bounce?: never
}

/**
 * Perceptual spring parameters, as in SwiftUI and Motion's `visualDuration`.
 * `duration` is in seconds; `bounce` runs from -1 (overdamped) through 0 (critically
 * damped) to 1 (undamped).
 */
export interface PerceptualSpring {
	duration: number
	bounce?: number
	stiffness?: never
	damping?: never
	mass?: never
}

export type SpringOptions = PhysicalSpring | PerceptualSpring

export interface ResolvedSpring {
	stiffness: number
	damping: number
	mass: number
}

export interface SpringState {
	position: number
	velocity: number
}

export const DEFAULT_SPRING: ResolvedSpring = { stiffness: 90, damping: 18.1, mass: 0.9 }

/** Positions are in slides, so this is a tenth of a pixel on a 1000px slide. */
const REST_DELTA = 0.0001
const REST_SPEED = 0.001
const STEP_SECONDS = 0.001
const MAX_FRAME_SECONDS = 1

export function resolveSpring(options: SpringOptions | undefined): ResolvedSpring {
	if (!options) return DEFAULT_SPRING

	if (options.duration !== undefined) {
		const duration = Math.max(options.duration, 0.01)
		const bounce = Math.min(Math.max(options.bounce ?? 0, -1), 1)
		const mass = 1
		const stiffness = ((2 * Math.PI) / duration) ** 2 * mass
		const damping =
			bounce >= 0
				? ((1 - bounce) * 4 * Math.PI * mass) / duration
				: (4 * Math.PI * mass) / (duration * (1 + bounce + Number.EPSILON))
		return { stiffness, damping, mass }
	}

	return {
		stiffness: positive(options.stiffness, DEFAULT_SPRING.stiffness),
		damping: Math.max(options.damping ?? DEFAULT_SPRING.damping, 0),
		mass: positive(options.mass, DEFAULT_SPRING.mass),
	}
}

function positive(value: number | undefined, fallback: number) {
	return value !== undefined && value > 0 ? value : fallback
}

/**
 * Advances a spring towards `target` by `elapsed` seconds with fixed 1ms
 * semi-implicit Euler steps, which stay stable for any stiffness a person would
 * reasonably choose. Integrating the real elapsed time keeps the motion on time
 * when frames are throttled; gaps over a second (a backgrounded tab) are capped.
 *
 * Returns true once the spring has settled; the state is then exactly `target`.
 */
export function stepSpring(
	state: SpringState,
	target: number,
	spring: ResolvedSpring,
	elapsed: number
): boolean {
	const steps = Math.ceil(Math.min(Math.max(elapsed, 0), MAX_FRAME_SECONDS) / STEP_SECONDS)

	for (let step = 0; step < steps; step += 1) {
		const displacement = state.position - target
		const acceleration =
			(-spring.stiffness * displacement - spring.damping * state.velocity) / spring.mass
		state.velocity += acceleration * STEP_SECONDS
		state.position += state.velocity * STEP_SECONDS
	}

	const settled =
		Math.abs(state.position - target) < REST_DELTA && Math.abs(state.velocity) < REST_SPEED

	if (settled) {
		state.position = target
		state.velocity = 0
	}

	return settled
}
