/**
 * Structural styles only: what the carousel needs to lay out and move. Every
 * selector is wrapped in `:where()`, so any class you write overrides it.
 */
export const styles = `
:where([data-spring-carousel]) {
	position: relative;
	overflow-x: clip;
}

:where([data-spring-carousel-viewport]) {
	position: relative;
	overflow: hidden;
	touch-action: pan-y pinch-zoom;
	user-select: none;
	-webkit-user-select: none;
}

:where([data-spring-carousel-viewport][data-draggable]) {
	cursor: grab;
}

:where([data-spring-carousel-viewport][data-draggable]:active),
:where([data-spring-carousel][data-dragging] [data-spring-carousel-viewport]) {
	cursor: grabbing;
}

:where([data-spring-carousel-track]) {
	position: relative;
	display: flex;
	gap: var(--carousel-gap, 0px);
	transform: translate3d(
		calc(
			(100% - var(--carousel-slide-size, 100%)) / 2 - var(--carousel-initial-index, 0) *
				(var(--carousel-slide-size, 100%) + var(--carousel-gap, 0px))
		),
		0,
		0
	);
	will-change: transform;
}

:where([data-spring-carousel-slide]) {
	position: relative;
	flex: 0 0 var(--carousel-slide-size, 100%);
	min-width: 0;
}

:where([data-spring-carousel-slide] :is(img, video)) {
	-webkit-user-drag: none;
}

:where([data-spring-carousel-tabs]) {
	position: relative;
	display: flex;
	width: max-content;
	margin-inline-start: 50%;
	white-space: nowrap;
	will-change: transform;
}

:where([data-spring-carousel-tabs]:not([data-measured])) {
	visibility: hidden;
}

:where([data-spring-carousel-tab]) {
	--carousel-inactive-opacity: 0.25;
	opacity: calc(
		var(--carousel-inactive-opacity) + (1 - var(--carousel-inactive-opacity)) *
			var(--carousel-presence, 0)
	);
}
`
