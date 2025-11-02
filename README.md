# @ycparak/spring-carousel

A composable, spring-driven carousel for React. Slides follow your finger, trackpad and arrow keys, then settle with a physical spring you can tune. A centred tab strip slides along with them.

- **Composable.** Namespaced parts you arrange and style yourself, plus hooks for anything custom.
- **Tunable motion.** One `spring` prop, as physics (`stiffness`, `damping`, `mass`) or feel (`duration`, `bounce`).
- **No re-renders while moving.** Animation runs outside React; per-frame values reach your code through a hook and CSS variables.
- **Accessible.** Follows the WAI-ARIA tabbed carousel pattern, with keyboard support and `prefers-reduced-motion`.
- **SSR-safe.** Renders the right slide on the server and hydrates cleanly. Styles ship with the component.
- **Zero dependencies.** React 19.2 or later is the only peer.

## Install

```sh
npm install @ycparak/spring-carousel
```

## Usage

```tsx
import { Carousel } from '@ycparak/spring-carousel'

export function Demos({ items }) {
  return (
    <Carousel.Root aria-label="Product demos">
      <Carousel.Viewport>
        <Carousel.Track>
          {items.map((item, index) => (
            <Carousel.Slide key={item.id} index={index}>
              <img src={item.src} alt={item.alt} />
            </Carousel.Slide>
          ))}
        </Carousel.Track>
      </Carousel.Viewport>

      <Carousel.Tabs>
        {items.map((item, index) => (
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
```

Every part renders one element, forwards `ref` and accepts that element's props.

## Parts

| Part | Element | Notes |
| --- | --- | --- |
| `Carousel.Root` | `section` | Holds state and options. Give it an `aria-label`. |
| `Carousel.Viewport` | `div` | The draggable, clipped window onto the track. |
| `Carousel.Track` | `div` | The row of slides that moves. |
| `Carousel.Slide` | `div` | One slide. Needs `index`, counting from 0 without gaps. |
| `Carousel.Tabs` | `div` | The tab strip, centred under the slides, sliding as they move. Optional. |
| `Carousel.Tab` | `button` | Selects slide `index`. |
| `Carousel.Prev`, `Carousel.Next` | `button` | Step buttons with a default chevron; pass children to replace it. |

### Root props

| Prop | Type | Default | |
| --- | --- | --- | --- |
| `index` | `number` | | The current slide, for a controlled carousel. |
| `defaultIndex` | `number` | `0` | The starting slide, for an uncontrolled carousel. |
| `onIndexChange` | `(index) => void` | | Called when a gesture, key, tab or button asks for a new slide. |
| `spring` | `SpringOptions` | `{ stiffness: 90, damping: 18.1, mass: 0.9 }` | `{ stiffness, damping, mass }` or `{ duration, bounce }` (seconds, −1 to 1). |
| `keyboard` | `'focus' \| 'global' \| false` | `'focus'` | Where arrow keys work: inside the carousel, anywhere on the page, or nowhere. |
| `wheel` | `boolean` | `true` | Page through slides with horizontal trackpad swipes. |
| `draggable` | `boolean` | `true` | Drag slides with a mouse, pen or finger. |
| `reducedMotion` | `'user' \| 'always' \| 'never'` | `'user'` | `'user'` follows `prefers-reduced-motion`. |

A controlled carousel always settles on `index`. If `onIndexChange` ignores a request, the carousel springs back.

## Hooks

Call these from any component inside `Carousel.Root`.

### `useCarousel()`

Returns `{ index, count, isDragging, canPrev, canNext, goTo, next, prev, progress }`. It re-renders when the index, slide count or drag state changes, never once per frame.

```tsx
function Counter() {
  const { index, count } = useCarousel()
  return <p>{index + 1} / {count}</p>
}
```

`goTo(index, { animate, velocity })`, `next()` and `prev()` accept `{ animate: false }` to move instantly.

### `useCarouselProgress(listener)`

Calls `listener(progress)` on every frame the carousel moves, and once on mount. `progress` is the position in slides: `1.5` is halfway between the second and third. Use it to drive styles directly, without re-rendering:

```tsx
function Caption({ index, children }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useCarouselProgress(progress => {
    const offset = index - progress
    ref.current?.style.setProperty('opacity', `${Math.max(0, 1 - Math.abs(offset) * 2)}`)
    ref.current?.style.setProperty('translate', `${offset * 60}px`)
  })
  return <p ref={ref}>{children}</p>
}
```

### `useSlide()`

Inside `Carousel.Slide`, returns `{ index, isActive }`. Useful for playing a video only while its slide is showing:

```tsx
function SlideVideo(props) {
  const ref = useRef<HTMLVideoElement>(null)
  const { isActive } = useSlide()
  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (isActive) video.play().catch(() => {})
    else video.pause()
  }, [isActive])
  return <video ref={ref} muted loop playsInline {...props} />
}
```

## Styling

The component injects only the structural CSS it needs to lay out and move. Every rule uses `:where()`, so any class you write overrides it. Style the parts with `className` and these hooks:

**Data attributes**

| Attribute | On |
| --- | --- |
| `data-spring-carousel` and `data-spring-carousel-{viewport,track,slide,tabs,tab,prev,next}` | Each part |
| `data-active` | The current `Slide` and `Tab` |
| `data-dragging` | `Root`, while a pointer drags |
| `data-disabled` | `Prev` at the first slide, `Next` at the last |
| `data-measured` | `Tabs`, once positioned (it is hidden until then) |

**CSS variables you set**

| Variable | Default | |
| --- | --- | --- |
| `--carousel-slide-size` | `100%` | Slide width. Below 100% the neighbours peek in. |
| `--carousel-gap` | `0px` | Space between slides. |
| `--carousel-inactive-opacity` | `0.25` | Opacity of tabs away from the current slide. |

**CSS variables the carousel sets every frame**

| Variable | On | |
| --- | --- | --- |
| `--carousel-progress` | `Root` | Position in slides. |
| `--carousel-offset` | each `Slide` and `Tab` | `index − progress`: 0 when current, −1 one slide behind. |
| `--carousel-presence` | each `Slide` and `Tab` | 1 when current, falling to 0 a slide away. |

```css
.slide {
  scale: calc(0.9 + 0.1 * var(--carousel-presence));
  opacity: calc(0.4 + 0.6 * var(--carousel-presence));
}
```

With Tailwind, set variables as utilities (`[--carousel-slide-size:80%]`). Part styles are unlayered, so to change a structural property from a utility, mark it important (`overflow-visible!`).

To keep an element inside a slide from starting a drag (a range input, a map), give it `data-carousel-no-drag`.

## Accessibility

- `Root` is a labelled region described as a carousel. Slides are `tabpanel`s labelled by their tab when there are tabs, otherwise `group`s labelled "2 of 5". Both are described as slides.
- Slides other than the current one are `inert`, so their contents can't be focused or read until shown.
- Tabs use a roving `tabindex`. Arrow keys move between them and change slide; `Home` and `End` jump to the ends.
- `Prev` and `Next` use `aria-disabled` rather than `disabled` at the ends, so keyboard focus isn't lost.
- Arrow keys are ignored in text fields and other arrow-key widgets, and with modifier keys held.
- With `reducedMotion="user"` (the default), slides move instantly when the visitor prefers reduced motion. Dragging still follows the pointer.
- The track is a polite live region, so screen readers announce the new slide.

## Notes

- Requires React 19.2 or later: it uses `useEffectEvent`, ref cleanups and `<style>` hoisting.
- Left-to-right layouts only for now. There's no looping or autoplay.

## License

MIT
