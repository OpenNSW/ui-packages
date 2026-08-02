import TextControl, { TextControlTester } from './TextControl'
import NumberControl, { NumberControlTester } from './NumberControl'
import BooleanControl, { BooleanControlTester } from './BooleanControl'
import RadioControl, { RadioControlTester } from './RadioControl'
import SelectControl, { SelectControlTester } from './SelectControl'
import SearchSelectControl from './SearchSelectControl'
import { SearchSelectControlTester } from './SearchSelectControlTester'
import DateControl, { DateControlTester } from './DateControl'
import {
  VerticalLayoutRenderer,
  VerticalLayoutTester,
  HorizontalLayoutRenderer,
  HorizontalLayoutTester,
  GroupLayoutRenderer,
  GroupLayoutTester,
  CategorizationLayoutRenderer,
  CategorizationLayoutTester,
  type CategorizationLayoutProps,
} from './LayoutRenderers'
import FileControl from './FileControl'
import { FileControlTester } from './FileControlTester'
import ExcelSourceFileControl from './ExcelSourceFileControl'
import { ExcelSourceFileControlTester } from './ExcelSourceFileControlTester'
import ArrayControl from './ArrayControl'
import { ArrayControlTester } from './ArrayControlTester'
import DataTableControl from './DataTableControl'
import { DataTableControlTester } from './DataTableControlTester'
import LabelRenderer, { LabelTester } from './LabelRenderer'
import { rankWith, isPrimitiveArrayControl } from '@jsonforms/core'

const PrimitiveArrayControlTester = rankWith(3, isPrimitiveArrayControl)

export const radixRenderers = [
  { tester: TextControlTester, renderer: TextControl },
  { tester: NumberControlTester, renderer: NumberControl },
  { tester: BooleanControlTester, renderer: BooleanControl },
  { tester: RadioControlTester, renderer: RadioControl },
  { tester: SearchSelectControlTester, renderer: SearchSelectControl },
  { tester: SelectControlTester, renderer: SelectControl },
  { tester: DateControlTester, renderer: DateControl },
  { tester: VerticalLayoutTester, renderer: VerticalLayoutRenderer },
  { tester: HorizontalLayoutTester, renderer: HorizontalLayoutRenderer },
  { tester: GroupLayoutTester, renderer: GroupLayoutRenderer },
  { tester: CategorizationLayoutTester, renderer: CategorizationLayoutRenderer },
  { tester: FileControlTester, renderer: FileControl },
  { tester: ExcelSourceFileControlTester, renderer: ExcelSourceFileControl },
  { tester: ArrayControlTester, renderer: ArrayControl },
  { tester: PrimitiveArrayControlTester, renderer: ArrayControl },
  { tester: DataTableControlTester, renderer: DataTableControl },
  { tester: LabelTester, renderer: LabelRenderer },
]

export * from './TextControl'
export * from './NumberControl'
export * from './BooleanControl'
export * from './RadioControl'
export * from './SelectControl'
export * from './DateControl'
export * from './LayoutRenderers'
export type { CategorizationLayoutProps }
export { default as FileControl } from './FileControl'
export * from './FileControlTester'
export { default as ExcelSourceFileControl } from './ExcelSourceFileControl'
export * from './ExcelSourceFileControlTester'
export { default as DataTableControl } from './DataTableControl'
export * from './DataTableControlTester'
export { default as SearchSelectControl } from './SearchSelectControl'
export * from './SearchSelectControlTester'
export { default as ArrayControl } from './ArrayControl'
export * from './ArrayControlTester'
export * from './LabelRenderer'
