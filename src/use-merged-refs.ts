import { type Ref, type RefCallback, useCallback } from 'react'

function assignRef<T>(ref: Ref<T> | undefined, node: T): () => void {
	if (typeof ref === 'function') {
		const cleanup = ref(node)
		return typeof cleanup === 'function' ? cleanup : () => ref(null)
	}
	if (ref) {
		ref.current = node
		return () => {
			ref.current = null
		}
	}
	return () => {}
}

/**
 * Combines a ref passed in as a prop with a part's own registration callback,
 * using React 19 callback-ref cleanups so each element is unregistered exactly
 * once, including under StrictMode's double mount.
 */
export function useMergedRefs<T>(
	forwarded: Ref<T> | undefined,
	own: (node: T) => () => void
): RefCallback<T> {
	return useCallback(
		(node: T | null) => {
			if (node === null) return
			const cleanupOwn = own(node)
			const cleanupForwarded = assignRef(forwarded, node)
			return () => {
				cleanupForwarded()
				cleanupOwn()
			}
		},
		[forwarded, own]
	)
}
