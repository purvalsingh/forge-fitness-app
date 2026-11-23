import { describe, expect, it } from 'vitest'
import { mergePhysique } from '../ai.js'

describe('mergePhysique', () => {
  it('uses the front answer as base and combines lists without repeats', () => {
    const m = mergePhysique([
      { angle: 'back', a: { composition_estimate: 'back view', strengths: ['Lats'], priorities: ['Rear delts'], training: { focus: 'x', emphasis: ['back'] } } },
      { angle: 'front', a: { composition_estimate: 'front view', strengths: ['lats', 'Chest'], priorities: ['Arms'], training: { focus: 'strength', emphasis: ['Back', 'arms'] } } },
    ])
    expect(m.composition_estimate).toBe('front view')
    expect(m.strengths).toEqual(['Lats', 'Chest'])
    expect(m.priorities).toEqual(['Rear delts', 'Arms'])
    expect(m.training).toEqual({ focus: 'strength', emphasis: ['back', 'arms'] })
  })
})
