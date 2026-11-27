/**
 * Whether a pointer at (clientX, clientY) is on one of the element's scrollbars (or its border),
 * rather than inside its client area.
 *
 * The client area leaves out the scrollbars: `clientWidth`/`clientHeight` stop before a right or
 * bottom one, and `clientLeft`/`clientTop` cover a left one (right-to-left layouts).
 */
export function isPointerOnScrollbar(element: Element, clientX: number, clientY: number): boolean {
  const rect = element.getBoundingClientRect()
  const x = clientX - rect.left - element.clientLeft
  const y = clientY - rect.top - element.clientTop
  return x < 0 || y < 0 || x >= element.clientWidth || y >= element.clientHeight
}
