import { describe, expect, it } from 'vitest'
import { isPointerOnScrollbar } from './scrollbar'

// A 300×200 box at (10, 20) with a 15px scrollbar: on the right by default (client area starts
// at the left edge), on the left when clientLeft is 15.
function box(clientLeft = 0): Element {
  return {
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
    clientLeft,
    clientTop: 0,
    clientWidth: 285,
    clientHeight: 200,
  } as unknown as Element
}

describe('isPointerOnScrollbar', () => {
  it('is false inside the client area', () => {
    expect(isPointerOnScrollbar(box(), 150, 100)).toBe(false)
  })

  it('is true on a right-hand scrollbar', () => {
    expect(isPointerOnScrollbar(box(), 300, 100)).toBe(true)
  })

  it('is true on a left-hand scrollbar', () => {
    expect(isPointerOnScrollbar(box(15), 15, 100)).toBe(true)
  })
})
