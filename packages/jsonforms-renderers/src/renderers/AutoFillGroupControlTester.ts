import { rankWith, uiTypeIs, type RankedTester } from '@jsonforms/core'

export const AutoFillGroupControlTester: RankedTester = rankWith(1, uiTypeIs('AutoFillGroup'))