import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Carousel, type RootProps, useCarousel, useCarouselProgress, useSlide } from '../src'

const ITEMS = [
	{ id: 'fast', label: 'Fast' },
	{ id: 'columns', label: 'Columns' },
	{ id: 'search', label: 'Search' },
]

function Example(props: RootProps) {
	return (
		<Carousel.Root aria-label="Demos" {...props}>
			<Carousel.Viewport>
				<Carousel.Track>
					{ITEMS.map((item, index) => (
						<Carousel.Slide key={item.id} index={index}>
							{item.label} slide
						</Carousel.Slide>
					))}
				</Carousel.Track>
			</Carousel.Viewport>
			<Carousel.Tabs>
				{ITEMS.map((item, index) => (
					<Carousel.Tab key={item.id} index={index}>
						{item.label}
					</Carousel.Tab>
				))}
			</Carousel.Tabs>
			<Carousel.Prev />
			<Carousel.Next />
		</Carousel.Root>
	)
}

function slide(label: string) {
	return screen.getByText(`${label} slide`)
}

afterEach(cleanup)

describe('server rendering', () => {
	it('renders the starting slide accessible and the rest inert', () => {
		const html = renderToString(<Example defaultIndex={1} />)
		const container = document.createElement('div')
		container.innerHTML = html

		const slides = container.querySelectorAll('[data-spring-carousel-slide]')
		expect([...slides].map(element => element.hasAttribute('inert'))).toEqual([true, false, true])

		const tabs = container.querySelectorAll('[role="tab"]')
		expect([...tabs].map(tab => tab.getAttribute('aria-selected'))).toEqual([
			'false',
			'true',
			'false',
		])
		expect(container.querySelector('section')?.getAttribute('style')).toContain(
			'--carousel-initial-index:1'
		)
		expect(html).toContain('data-spring-carousel-track')
	})

	it('hydrates without errors or warnings', async () => {
		const container = document.createElement('div')
		container.innerHTML = renderToString(<Example />)
		document.body.append(container)
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})

		const root = await act(async () => hydrateRoot(container, <Example />))

		expect(error).not.toHaveBeenCalled()
		expect(container.querySelector('[role="tabpanel"]')).not.toBeNull()
		act(() => root.unmount())
		container.remove()
		error.mockRestore()
	})
})

describe('uncontrolled', () => {
	it('moves with the next and previous buttons and reports changes', () => {
		const onIndexChange = vi.fn()
		render(<Example onIndexChange={onIndexChange} />)

		fireEvent.click(screen.getByRole('button', { name: 'Next slide' }))
		expect(onIndexChange).toHaveBeenLastCalledWith(1)
		expect(slide('Columns').hasAttribute('data-active')).toBe(true)
		expect(slide('Fast').hasAttribute('inert')).toBe(true)

		fireEvent.click(screen.getByRole('button', { name: 'Previous slide' }))
		expect(onIndexChange).toHaveBeenLastCalledWith(0)
	})

	it('keeps the edge buttons focusable but inert', () => {
		const onIndexChange = vi.fn()
		render(<Example onIndexChange={onIndexChange} />)
		const prev = screen.getByRole('button', { name: 'Previous slide' })

		expect(prev.getAttribute('aria-disabled')).toBe('true')
		expect(prev.hasAttribute('disabled')).toBe(false)
		fireEvent.click(prev)
		expect(onIndexChange).not.toHaveBeenCalled()
	})

	it('selects a slide from its tab', () => {
		render(<Example />)
		fireEvent.click(screen.getByRole('tab', { name: 'Search' }))
		expect(screen.getByRole('tab', { name: 'Search' }).getAttribute('aria-selected')).toBe('true')
		expect(screen.getByRole('tab', { name: 'Search' }).tabIndex).toBe(0)
		expect(screen.getByRole('tab', { name: 'Fast' }).tabIndex).toBe(-1)
	})

	it('lets a consumer cancel navigation with preventDefault', () => {
		const onIndexChange = vi.fn()
		render(
			<Carousel.Root onIndexChange={onIndexChange}>
				<Carousel.Viewport>
					<Carousel.Track>
						<Carousel.Slide index={0}>A</Carousel.Slide>
						<Carousel.Slide index={1}>B</Carousel.Slide>
					</Carousel.Track>
				</Carousel.Viewport>
				<Carousel.Next onClick={event => event.preventDefault()} />
			</Carousel.Root>
		)
		fireEvent.click(screen.getByRole('button', { name: 'Next slide' }))
		expect(onIndexChange).not.toHaveBeenCalled()
	})
})

describe('controlled', () => {
	it('stays put when the parent rejects a change', () => {
		const onIndexChange = vi.fn()
		render(<Example index={0} onIndexChange={onIndexChange} />)

		fireEvent.click(screen.getByRole('button', { name: 'Next slide' }))
		expect(onIndexChange).toHaveBeenCalledWith(1)
		expect(slide('Fast').hasAttribute('data-active')).toBe(true)
	})

	it('follows the index prop', () => {
		function Controlled() {
			const [index, setIndex] = useState(0)
			return (
				<>
					<button type="button" onClick={() => setIndex(2)}>
						Jump
					</button>
					<Example index={index} onIndexChange={setIndex} />
				</>
			)
		}
		render(<Controlled />)

		fireEvent.click(screen.getByRole('button', { name: 'Jump' }))
		expect(slide('Search').hasAttribute('data-active')).toBe(true)

		fireEvent.click(screen.getByRole('button', { name: 'Previous slide' }))
		expect(slide('Columns').hasAttribute('data-active')).toBe(true)
	})
})

describe('keyboard', () => {
	it('moves between tabs with arrows, Home and End, and carries focus', () => {
		render(<Example />)
		const fast = screen.getByRole('tab', { name: 'Fast' })
		fast.focus()

		fireEvent.keyDown(fast, { key: 'ArrowRight' })
		const columns = screen.getByRole('tab', { name: 'Columns' })
		expect(columns.getAttribute('aria-selected')).toBe('true')
		expect(document.activeElement).toBe(columns)

		fireEvent.keyDown(columns, { key: 'End' })
		expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Search' }))

		fireEvent.keyDown(document.activeElement as Element, { key: 'Home' })
		expect(document.activeElement).toBe(fast)
	})

	it('ignores arrows typed into a field and modified arrows', () => {
		const onIndexChange = vi.fn()
		render(
			<Carousel.Root onIndexChange={onIndexChange}>
				<Carousel.Viewport>
					<Carousel.Track>
						<Carousel.Slide index={0}>
							<input aria-label="Name" />
						</Carousel.Slide>
						<Carousel.Slide index={1}>B</Carousel.Slide>
					</Carousel.Track>
				</Carousel.Viewport>
				<Carousel.Next />
			</Carousel.Root>
		)

		fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'ArrowRight' })
		fireEvent.keyDown(screen.getByRole('button', { name: 'Next slide' }), {
			key: 'ArrowRight',
			altKey: true,
		})
		expect(onIndexChange).not.toHaveBeenCalled()

		fireEvent.keyDown(screen.getByRole('button', { name: 'Next slide' }), { key: 'ArrowRight' })
		expect(onIndexChange).toHaveBeenCalledWith(1)
	})

	it('listens on the document only in global mode', () => {
		const onIndexChange = vi.fn()
		const { rerender } = render(<Example onIndexChange={onIndexChange} />)

		fireEvent.keyDown(document.body, { key: 'ArrowRight' })
		expect(onIndexChange).not.toHaveBeenCalled()

		rerender(<Example onIndexChange={onIndexChange} keyboard="global" />)
		fireEvent.keyDown(document.body, { key: 'ArrowRight' })
		expect(onIndexChange).toHaveBeenCalledWith(1)
	})
})

describe('hooks', () => {
	it('throws a helpful error outside the root', () => {
		function Orphan() {
			useCarousel()
			return null
		}
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		expect(() => render(<Orphan />)).toThrow(
			'`useCarousel` must be rendered inside `<Carousel.Root>`'
		)
		error.mockRestore()
	})

	it('exposes state and controls through useCarousel', () => {
		function Counter() {
			const { index, count, canNext, next } = useCarousel()
			return (
				<button type="button" onClick={() => next()} disabled={!canNext}>
					{index + 1} / {count}
				</button>
			)
		}
		render(
			<Carousel.Root>
				<Carousel.Viewport>
					<Carousel.Track>
						<Carousel.Slide index={0}>A</Carousel.Slide>
						<Carousel.Slide index={1}>B</Carousel.Slide>
					</Carousel.Track>
				</Carousel.Viewport>
				<Counter />
			</Carousel.Root>
		)

		const counter = screen.getByRole('button', { name: '1 / 2' })
		fireEvent.click(counter)
		expect(counter.textContent).toBe('2 / 2')
		expect(counter.hasAttribute('disabled')).toBe(true)
	})

	it('reports progress on subscribe', () => {
		const listener = vi.fn()
		function Probe() {
			useCarouselProgress(listener)
			return null
		}
		render(
			<Carousel.Root defaultIndex={1}>
				<Carousel.Viewport>
					<Carousel.Track>
						<Carousel.Slide index={0}>A</Carousel.Slide>
						<Carousel.Slide index={1}>B</Carousel.Slide>
					</Carousel.Track>
				</Carousel.Viewport>
				<Probe />
			</Carousel.Root>
		)
		expect(listener).toHaveBeenCalledWith(1)
	})

	it('describes the enclosing slide through useSlide', () => {
		function Label() {
			const { index, isActive } = useSlide()
			return (
				<span>
					{index}:{isActive ? 'active' : 'idle'}
				</span>
			)
		}
		render(
			<Carousel.Root>
				<Carousel.Viewport>
					<Carousel.Track>
						<Carousel.Slide index={0}>
							<Label />
						</Carousel.Slide>
						<Carousel.Slide index={1}>
							<Label />
						</Carousel.Slide>
					</Carousel.Track>
				</Carousel.Viewport>
			</Carousel.Root>
		)
		expect(screen.getByText('0:active')).toBeTruthy()
		expect(screen.getByText('1:idle')).toBeTruthy()
	})
})

describe('lifecycle', () => {
	it('counts slides once under StrictMode and after removing one', () => {
		function Count() {
			return <output>{useCarousel().count}</output>
		}
		function Slides({ total }: { total: number }) {
			return (
				<StrictMode>
					<Carousel.Root>
						<Carousel.Viewport>
							<Carousel.Track>
								{Array.from({ length: total }, (_, index) => (
									<Carousel.Slide key={ITEMS[index]?.id} index={index}>
										{index}
									</Carousel.Slide>
								))}
							</Carousel.Track>
						</Carousel.Viewport>
						<Count />
					</Carousel.Root>
				</StrictMode>
			)
		}
		const { rerender } = render(<Slides total={3} />)
		expect(screen.getByRole('status').textContent).toBe('3')

		rerender(<Slides total={2} />)
		expect(screen.getByRole('status').textContent).toBe('2')
	})

	it('forwards refs and merges props on every part', () => {
		const rootRef = vi.fn()
		const tabRef = { current: null as HTMLButtonElement | null }
		const { unmount } = render(
			<Carousel.Root ref={rootRef} className="root" data-testid="root">
				<Carousel.Viewport>
					<Carousel.Track>
						<Carousel.Slide index={0} className="slide">
							A
						</Carousel.Slide>
					</Carousel.Track>
				</Carousel.Viewport>
				<Carousel.Tabs>
					<Carousel.Tab index={0} ref={tabRef}>
						A
					</Carousel.Tab>
				</Carousel.Tabs>
			</Carousel.Root>
		)

		expect(rootRef).toHaveBeenCalledWith(screen.getByTestId('root'))
		expect(screen.getByTestId('root').className).toBe('root')
		expect(tabRef.current?.getAttribute('role')).toBe('tab')
		unmount()
		expect(rootRef).toHaveBeenLastCalledWith(null)
		expect(tabRef.current).toBeNull()
	})
})

describe('dragging', () => {
	const WIDTH = 300

	function mockLayout(width = WIDTH) {
		const restore: (() => void)[] = []
		function define(
			property: 'clientWidth' | 'offsetWidth' | 'offsetLeft',
			get: (el: HTMLElement) => number
		) {
			const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, property)
			Object.defineProperty(HTMLElement.prototype, property, {
				configurable: true,
				get(this: HTMLElement) {
					return get(this)
				},
			})
			restore.push(() => {
				if (descriptor) Object.defineProperty(HTMLElement.prototype, property, descriptor)
			})
		}
		const slideIndex = (el: HTMLElement) =>
			el.hasAttribute('data-spring-carousel-slide') ? Number(el.id.split('-slide-')[1]) : -1
		define('clientWidth', el => (el.hasAttribute('data-spring-carousel-track') ? width : 0))
		define('offsetWidth', el => (slideIndex(el) >= 0 ? width : 0))
		define('offsetLeft', el => Math.max(slideIndex(el), 0) * width)
		return () => {
			for (const undo of restore) undo()
		}
	}

	let clock = 0

	/** Dispatches a pointer event at `time` ms, or 500ms after the last one: a slow drag. */
	function pointer(type: string, target: Element | Window, clientX: number, time = clock + 500) {
		clock = time
		const buttons = type === 'pointerup' || type === 'lostpointercapture' ? 0 : 1
		const init = {
			bubbles: true,
			clientX,
			clientY: 0,
			button: 0,
			buttons,
			pointerId: 1,
			isPrimary: true,
		}
		const event = new PointerEvent(type, init)
		Object.defineProperty(event, 'timeStamp', { value: time })
		fireEvent(target, event)
	}

	/** A full-window slide, as in the docs hero, where these drags cover only a few percent. */
	function setup(onIndexChange = vi.fn(), width = 860) {
		const undo = mockLayout(width)
		const { container } = render(<Example onIndexChange={onIndexChange} reducedMotion="always" />)
		const viewport = container.querySelector('[data-spring-carousel-viewport]') as HTMLElement
		viewport.setPointerCapture = () => {}
		viewport.hasPointerCapture = () => false
		return { onIndexChange, viewport, undo }
	}

	/** Replays a drag as `[time, clientX]` samples, then releases at `releaseAt`. */
	function replay(viewport: HTMLElement, samples: [number, number][], releaseAt: number) {
		const [[startTime, startX], ...moves] = samples as [[number, number], ...[number, number][]]
		pointer('pointerdown', viewport, startX, startTime)
		for (const [time, x] of moves) pointer('pointermove', window, x, time)
		const lastX = samples[samples.length - 1]?.[1] ?? startX
		pointer('pointerup', window, lastX, releaseAt)
	}

	// Profiles traced from a screen recording of the docs hero, where these drags were
	// rejected: a flick that stops dead for a few frames before the button lifts, and a
	// short nudge that only speeds up in its last frame.
	it('advances on a flick that stops just before release', () => {
		const { onIndexChange, viewport, undo } = setup()
		replay(
			viewport,
			[
				[0, 400],
				[16, 377],
				[33, 359],
				[50, 322],
				[66, 296],
			],
			120
		)
		expect(onIndexChange).toHaveBeenCalledWith(1)
		undo()
	})

	it('advances on a short nudge that speeds up into release', () => {
		const { onIndexChange, viewport, undo } = setup()
		replay(
			viewport,
			[
				[0, 400],
				[16, 399],
				[33, 397],
				[50, 394],
				[66, 390],
				[83, 383],
			],
			100
		)
		expect(onIndexChange).toHaveBeenCalledWith(1)
		undo()
	})

	it('advances on a flick held still before release, despite the pointer drifting', () => {
		const { onIndexChange, viewport, undo } = setup()
		replay(
			viewport,
			[
				[0, 400],
				[16, 380],
				[33, 355],
				[50, 335],
				[70, 334],
				[90, 335],
				[110, 334],
			],
			140
		)
		expect(onIndexChange).toHaveBeenCalledWith(1)
		undo()
	})

	// Logged from a real trackpad in Chromium: capture is lost 13ms before the pointerup
	// arrives. Treating that as a cancel threw the flick away.
	it('advances when capture is lost before the pointerup arrives', () => {
		const { onIndexChange, viewport, undo } = setup(vi.fn(), 1720)
		const samples: [number, number][] = [
			[0, 861],
			[16, 827],
			[30, 772],
			[52, 724],
			[67, 632],
			[82, 565],
		]
		const [[startTime, startX], ...moves] = samples as [[number, number], ...[number, number][]]
		pointer('pointerdown', viewport, startX, startTime)
		for (const [time, x] of moves) pointer('pointermove', window, x, time)
		pointer('lostpointercapture', viewport, 529, 99)
		pointer('pointerup', window, 529, 112)
		expect(onIndexChange).toHaveBeenCalledWith(1)
		undo()
	})

	it('ends a gesture whose pointerup never arrived', () => {
		const { onIndexChange, viewport, undo } = setup()
		pointer('pointerdown', viewport, 400, 0)
		pointer('pointermove', window, 380, 16)
		pointer('pointermove', window, 355, 33)
		const released = new PointerEvent('pointermove', {
			bubbles: true,
			clientX: 355,
			buttons: 0,
			pointerId: 1,
			isPrimary: true,
		})
		Object.defineProperty(released, 'timeStamp', { value: 50 })
		fireEvent(window, released)
		expect(onIndexChange).toHaveBeenCalledWith(1)

		onIndexChange.mockClear()
		pointer('pointerdown', viewport, 400, 1000)
		pointer('pointermove', window, 450, 1016)
		pointer('pointermove', window, 500, 1033)
		pointer('pointerup', window, 500, 1040)
		expect(onIndexChange).toHaveBeenCalledWith(0)
		undo()
	})

	it('stays after a slow, short drag that ends in a pause', () => {
		const { onIndexChange, viewport, undo } = setup()
		replay(
			viewport,
			[
				[0, 400],
				[100, 394],
				[200, 388],
				[300, 382],
				[400, 376],
			],
			900
		)
		expect(onIndexChange).not.toHaveBeenCalled()
		undo()
	})

	it('stays when a flick turns back before release', () => {
		const { onIndexChange, viewport, undo } = setup()
		replay(
			viewport,
			[
				[0, 400],
				[16, 360],
				[33, 320],
				[50, 325],
				[66, 330],
				[83, 335],
			],
			100
		)
		expect(onIndexChange).not.toHaveBeenCalled()
		undo()
	})

	it('follows the pointer and settles on the slide a slow drag reaches', () => {
		const undo = mockLayout()
		const onIndexChange = vi.fn()
		const { container } = render(<Example onIndexChange={onIndexChange} reducedMotion="always" />)
		const viewport = container.querySelector('[data-spring-carousel-viewport]') as HTMLElement
		const track = container.querySelector('[data-spring-carousel-track]') as HTMLElement
		viewport.setPointerCapture = () => {}
		viewport.hasPointerCapture = () => false

		pointer('pointerdown', viewport, 200)
		pointer('pointermove', window, 150)
		expect(container.querySelector('section')?.hasAttribute('data-dragging')).toBe(true)
		pointer('pointermove', window, 90)
		expect(track.style.transform).toBe('translate3d(-110px, 0, 0)')

		pointer('pointerup', window, 90)
		expect(onIndexChange).toHaveBeenCalledWith(1)
		expect(track.style.transform).toBe('translate3d(-300px, 0, 0)')
		expect(container.querySelector('section')?.hasAttribute('data-dragging')).toBe(false)
		undo()
	})

	it('springs back from a short drag and resists past the first slide', () => {
		const undo = mockLayout()
		const onIndexChange = vi.fn()
		const { container } = render(<Example onIndexChange={onIndexChange} reducedMotion="always" />)
		const viewport = container.querySelector('[data-spring-carousel-viewport]') as HTMLElement
		const track = container.querySelector('[data-spring-carousel-track]') as HTMLElement
		viewport.setPointerCapture = () => {}
		viewport.hasPointerCapture = () => false

		pointer('pointerdown', viewport, 100)
		pointer('pointermove', window, 160)
		pointer('pointermove', window, 200)
		expect(track.style.transform).toBe('translate3d(50px, 0, 0)')

		pointer('pointerup', window, 200)
		expect(onIndexChange).not.toHaveBeenCalled()
		expect(track.style.transform).toBe('translate3d(0px, 0, 0)')
		undo()
	})

	it('swallows the click that ends a drag but not a plain click', () => {
		const undo = mockLayout()
		const onClick = vi.fn()
		const { container } = render(
			<Carousel.Root reducedMotion="always">
				<Carousel.Viewport>
					<Carousel.Track>
						<Carousel.Slide index={0}>
							<button type="button" onClick={onClick}>
								Inside
							</button>
						</Carousel.Slide>
						<Carousel.Slide index={1}>B</Carousel.Slide>
					</Carousel.Track>
				</Carousel.Viewport>
			</Carousel.Root>
		)
		const viewport = container.querySelector('[data-spring-carousel-viewport]') as HTMLElement
		viewport.setPointerCapture = () => {}
		viewport.hasPointerCapture = () => false
		const button = screen.getByRole('button', { name: 'Inside' })

		pointer('pointerdown', button, 100)
		pointer('pointerup', window, 100)
		fireEvent.click(button)
		expect(onClick).toHaveBeenCalledTimes(1)

		pointer('pointerdown', button, 200)
		pointer('pointermove', window, 120)
		pointer('pointerup', window, 120)
		fireEvent.click(button)
		expect(onClick).toHaveBeenCalledTimes(1)
		undo()
	})
})
