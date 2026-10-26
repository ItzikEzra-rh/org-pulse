import { describe, it, expect } from 'vitest'
import {
  uiEvidenceOf,
  uxEvidenceOf,
  workflowSourcesOf,
  collectAllLabelOptions,
  matchesLabelQuery,
  featureCardLabels,
  isClosedFeatureVisible,
  uiUxStatusForContext,
  useUiUxFilter
} from '../../../client/execute/composables/useUiUxFilter'

function source(overrides = {}) {
  return {
    epicKey: 'KEY-1', epicType: 'ui-impl', fixVersions: [], components: [],
    localStatus: 'unknown', stageLabels: [], routingLabels: [],
    ...overrides
  }
}

function workflowSource(overrides = {}) {
  return { epicKey: 'KEY-1', labels: [], fixVersions: [], components: [], ...overrides }
}

function evidence({ status = 'unknown', conflict = false, scopes = [], sources = [] } = {}) {
  return { status, conflict, scopes, sources }
}

describe('uiEvidenceOf / uxEvidenceOf', () => {
  it('default to an empty unknown evidence shape when absent', () => {
    expect(uiEvidenceOf({})).toEqual({ status: 'unknown', conflict: false, scopes: [], sources: [] })
    expect(uxEvidenceOf({})).toEqual({ status: 'unknown', conflict: false, scopes: [], sources: [] })
  })

  it('pass through a present evidence object unchanged', () => {
    const feature = { uiEvidence: evidence({ status: 'completed' }) }
    expect(uiEvidenceOf(feature).status).toBe('completed')
  })
})

describe('workflowSourcesOf', () => {
  it('defaults to [] when absent (older payload)', () => {
    expect(workflowSourcesOf({})).toEqual([])
  })

  it('passes through a present workflowLabelSources array unchanged', () => {
    const sources = [workflowSource({ epicKey: 'BOOT-1', labels: ['design-approved'] })]
    expect(workflowSourcesOf({ workflowLabelSources: sources })).toEqual(sources)
  })
})

describe('collectAllLabelOptions', () => {
  it('collects feature-level, Epic stage/routing, and Epic workflow labels, deduped and categorized', () => {
    const features = [
      {
        labels: ['customer:acme', 'ready-for-ui', 'osac-ui'],
        uiEvidence: evidence({ sources: [source({ stageLabels: ['ui-completed'], routingLabels: ['no-ui'] })] }),
        uxEvidence: evidence({ sources: [source({ stageLabels: ['ux-complete'] })] }),
        workflowLabelSources: [workflowSource({ labels: ['design-approved'] })]
      }
    ]
    const options = collectAllLabelOptions(features)
    expect(options).toEqual([
      { value: 'design-approved', category: 'UI/UX Workflow' },
      { value: 'no-ui', category: 'UI/UX Workflow' },
      { value: 'ui-completed', category: 'UI/UX Workflow' },
      { value: 'ux-complete', category: 'UI/UX Workflow' },
      { value: 'ready-for-ui', category: 'Readiness & Tracking' },
      { value: 'customer:acme', category: 'Customer' },
      { value: 'osac-ui', category: 'Other' }
    ])
  })

  it('returns an empty list for features with no labels or evidence sources', () => {
    expect(collectAllLabelOptions([{}, { uiEvidence: evidence() }])).toEqual([])
  })

  it('lists UX and UI routing labels, deduped case-insensitively', () => {
    const features = [{
      uiEvidence: evidence({ sources: [source({ routingLabels: ['no-ui'] })] }),
      uxEvidence: evidence({ sources: [source({ routingLabels: ['No-UX', 'no-ui'] })] })
    }]
    expect(collectAllLabelOptions(features).map(o => o.value)).toEqual(['no-ui', 'No-UX'])
  })

  it('case-folds pure casing variants into a single option, keeping the first-seen casing', () => {
    const features = [{ labels: ['OSAC-UI'] }, { labels: ['osac-ui'] }]
    expect(collectAllLabelOptions(features)).toEqual([{ value: 'OSAC-UI', category: 'Other' }])
  })

  it('does not merge semantically different labels despite a shared prefix', () => {
    const features = [{ labels: ['ux-complete', 'ux-completed'] }]
    expect(collectAllLabelOptions(features).map(o => o.value).sort()).toEqual(['ux-completed', 'ux-complete'].sort())
  })

  it('honors a configured readinessLabels allowlist by exact name only, leaving a distinct label like osac-ui-0.1 uncategorized', () => {
    const features = [{ labels: ['osac-ui', 'osac-ux', 'osac-ui-0.1'] }]
    const options = collectAllLabelOptions(features, { readinessLabels: ['osac-ui', 'osac-ux'] })
    expect(options).toEqual([
      { value: 'osac-ui', category: 'Readiness & Tracking' },
      { value: 'osac-ux', category: 'Readiness & Tracking' },
      { value: 'osac-ui-0.1', category: 'Other' }
    ])
  })

  it('categorizes a named label (e.g. ready-for-ui) as Readiness even when it originates on an Epic, not the Feature', () => {
    const features = [{ uiEvidence: evidence({ sources: [source({ stageLabels: ['ready-for-ui'] })] }) }]
    expect(collectAllLabelOptions(features)).toEqual([{ value: 'ready-for-ui', category: 'Readiness & Tracking' }])
  })

  it('honors custom readiness/customer prefixes when provided', () => {
    const features = [{ labels: ['needs-ui', 'cust:acme'] }]
    const options = collectAllLabelOptions(features, { readinessPrefixes: ['needs-'], customerPrefixes: ['cust:'] })
    expect(options).toEqual([
      { value: 'needs-ui', category: 'Readiness & Tracking' },
      { value: 'cust:acme', category: 'Customer' }
    ])
  })
})

describe('matchesLabelQuery', () => {
  it('matches when no labels are selected (inactive query)', () => {
    expect(matchesLabelQuery({}, [])).toBe(true)
  })

  it('matches a Feature-level label, honoring Feature-level Version/Component', () => {
    const feature = { labels: ['ready-for-ui'], fixVersions: ['0.3'], components: ['Dashboard'] }
    expect(matchesLabelQuery(feature, ['ready-for-ui'])).toBe(true)
    expect(matchesLabelQuery(feature, ['ready-for-ui'], { selectedVersions: ['0.3'] })).toBe(true)
    expect(matchesLabelQuery(feature, ['ready-for-ui'], { selectedVersions: ['0.9'] })).toBe(false)
  })

  it('reveals a Closed feature-level label match via epicReleaseVersions', () => {
    const feature = { labels: ['ready-for-ui'], fixVersions: ['0.2'], epicReleaseVersions: ['0.3'] }
    expect(matchesLabelQuery(feature, ['ready-for-ui'], { selectedVersions: ['0.3'] })).toBe(true)
  })

  it('matches an Epic stage/routing label carried by any UI or UX source', () => {
    const feature = { uiEvidence: evidence({ sources: [source({ stageLabels: ['ui-completed'] })] }) }
    expect(matchesLabelQuery(feature, ['ui-completed'])).toBe(true)
    expect(matchesLabelQuery(feature, ['ux-complete'])).toBe(false)
  })

  it('matches a UX-sourced stage label via the UX workstream', () => {
    const feature = { uxEvidence: evidence({ sources: [source({ epicKey: 'BOOT-1', stageLabels: ['ux-complete'] })] }) }
    expect(matchesLabelQuery(feature, ['ux-complete'])).toBe(true)
  })

  // Single-source-Epic rule: label + release must be satisfied by the same Epic.
  it('requires the same source Epic to carry both the stage label and the selected release', () => {
    const feature = {
      uiEvidence: evidence({
        sources: [
          source({ epicKey: 'UI-A', stageLabels: ['ui-completed'], fixVersions: ['0.3'] }),
          source({ epicKey: 'UI-B', stageLabels: [], fixVersions: ['0.4'] })
        ]
      })
    }
    expect(matchesLabelQuery(feature, ['ui-completed'], { selectedVersions: ['0.3'] })).toBe(true)
    expect(matchesLabelQuery(feature, ['ui-completed'], { selectedVersions: ['0.4'] })).toBe(false)
  })

  it('requires the same source Epic to carry both the stage label and the selected component', () => {
    const feature = {
      uiEvidence: evidence({ sources: [source({ epicKey: 'UI-A', stageLabels: ['no-ui'], components: ['Dashboard'] })] })
    }
    expect(matchesLabelQuery(feature, ['no-ui'], { selectedComponents: ['Dashboard'] })).toBe(true)
    expect(matchesLabelQuery(feature, ['no-ui'], { selectedComponents: ['Other'] })).toBe(false)
  })

  // Workflow labels (design-approved on a Bootstrap Epic, be-completed on an
  // unclassified backend Epic) follow the identical single-source-Epic rule.
  it('matches design-approved and be-completed via workflowLabelSources, honoring per-Epic scope', () => {
    const feature = {
      workflowLabelSources: [
        workflowSource({ epicKey: 'BOOT-1', labels: ['design-approved'], fixVersions: ['0.3'] }),
        workflowSource({ epicKey: 'BE-1', labels: ['be-completed'], fixVersions: ['0.4'] })
      ]
    }
    expect(matchesLabelQuery(feature, ['design-approved'], { selectedVersions: ['0.3'] })).toBe(true)
    expect(matchesLabelQuery(feature, ['design-approved'], { selectedVersions: ['0.4'] })).toBe(false)
    expect(matchesLabelQuery(feature, ['be-completed'], { selectedVersions: ['0.4'] })).toBe(true)
  })

  it('is case-insensitive for pure casing variants', () => {
    const feature = { labels: ['OSAC-UI'] }
    expect(matchesLabelQuery(feature, ['osac-ui'])).toBe(true)
  })

  it('does not silently merge semantically different labels', () => {
    const feature = { uxEvidence: evidence({ sources: [source({ stageLabels: ['ux-complete'] })] }) }
    expect(matchesLabelQuery(feature, ['ux-completed'])).toBe(false)
  })

  it('OR across multiple selected labels', () => {
    const feature = { labels: ['ready-for-ui'] }
    expect(matchesLabelQuery(feature, ['ready-for-ui', 'ready-for-ux'])).toBe(true)
  })

  it('backward compat: a Feature with no evidence/workflow fields is unmatched, never crashes', () => {
    expect(matchesLabelQuery({}, ['ui-completed'])).toBe(false)
    expect(() => matchesLabelQuery({}, ['ui-completed'])).not.toThrow()
  })
})

describe('featureCardLabels', () => {
  it('always includes Feature-level labels, unscoped', () => {
    const feature = { labels: ['ready-for-ui'] }
    expect(featureCardLabels(feature)).toEqual(['ready-for-ui'])
  })

  it('includes Epic stage/routing and workflow labels when nothing is selected', () => {
    const feature = {
      labels: ['ready-for-ui'],
      uiEvidence: evidence({ sources: [source({ stageLabels: ['ui-completed'] })] }),
      workflowLabelSources: [workflowSource({ labels: ['design-approved'] })]
    }
    expect(featureCardLabels(feature)).toEqual(['ui-completed', 'design-approved', 'ready-for-ui'])
  })

  // Scope-aware (critical): an Epic label scoped only to 0.3 must not appear when 0.4 is selected.
  it('excludes an Epic label whose source scope does not match the selected Release', () => {
    const feature = {
      uiEvidence: evidence({ sources: [source({ epicKey: 'UI-A', stageLabels: ['ui-completed'], fixVersions: ['0.3'] })] })
    }
    expect(featureCardLabels(feature, ['0.4'])).toEqual([])
    expect(featureCardLabels(feature, ['0.3'])).toEqual(['ui-completed'])
  })

  it('includes UX routing labels, scoped like UI routing labels', () => {
    const feature = {
      uxEvidence: evidence({ sources: [source({ fixVersions: ['0.3'], stageLabels: ['ux-complete'], routingLabels: ['no-ux'] })] })
    }
    expect(featureCardLabels(feature)).toEqual(['ux-complete', 'no-ux'])
    expect(featureCardLabels(feature, ['0.3'])).toEqual(['ux-complete', 'no-ux'])
    expect(featureCardLabels(feature, ['0.4'])).toEqual([])
  })

  it('dedupes case-fold variants across populations, keeping the first-seen casing', () => {
    const feature = {
      labels: ['OSAC-UI'],
      uiEvidence: evidence({ sources: [source({ stageLabels: ['osac-ui'] })] })
    }
    expect(featureCardLabels(feature)).toEqual(['osac-ui'])
  })
})

describe('isClosedFeatureVisible', () => {
  it('is always visible when not Closed, regardless of Release selection', () => {
    const feature = { status: 'In Progress', fixVersions: ['0.3'] }
    expect(isClosedFeatureVisible(feature, [])).toBe(true)
    expect(isClosedFeatureVisible(feature, ['0.9'])).toBe(true)
  })

  it('hides a Closed feature when no Release is selected', () => {
    const feature = { status: 'Closed', fixVersions: ['0.3'] }
    expect(isClosedFeatureVisible(feature, [])).toBe(false)
  })

  it('reveals a Closed feature whose fixVersions matches the selected Release', () => {
    const feature = { status: 'Closed', fixVersions: ['0.3'] }
    expect(isClosedFeatureVisible(feature, ['0.3'])).toBe(true)
    expect(isClosedFeatureVisible(feature, ['0.4'])).toBe(false)
  })

  it('reveals a Closed feature via epicReleaseVersions when fixVersions does not match', () => {
    const feature = { status: 'Closed', fixVersions: ['0.2'], epicReleaseVersions: ['0.3'] }
    expect(isClosedFeatureVisible(feature, ['0.3'])).toBe(true)
  })

  it('stays hidden when neither fixVersions nor epicReleaseVersions matches the selected Release', () => {
    const feature = { status: 'Closed', fixVersions: ['0.2'], epicReleaseVersions: ['0.25'] }
    expect(isClosedFeatureVisible(feature, ['0.3'])).toBe(false)
  })

  it.each(['Closed', 'Done', 'Resolved', 'Cancelled', 'done'])('treats %s as terminal: hidden by default, revealed via fixVersions or epicReleaseVersions only', (status) => {
    expect(isClosedFeatureVisible({ status, fixVersions: ['0.3'] }, [])).toBe(false)
    expect(isClosedFeatureVisible({ status, fixVersions: ['0.3'] }, ['0.3'])).toBe(true)
    expect(isClosedFeatureVisible({ status, fixVersions: ['0.2'], epicReleaseVersions: ['0.3'] }, ['0.3'])).toBe(true)
    expect(isClosedFeatureVisible({ status, fixVersions: ['0.2'], epicReleaseVersions: ['0.25'] }, ['0.3'])).toBe(false)
  })

  it.each(['Release Pending', 'In Progress', undefined])('keeps non-terminal status %s visible', (status) => {
    expect(isClosedFeatureVisible({ status, fixVersions: ['0.3'] }, [])).toBe(true)
  })
})

describe('uiUxStatusForContext', () => {
  it('returns the feature-wide aggregate when no Release/Component is selected', () => {
    const ev = evidence({ status: 'in-progress', conflict: true })
    expect(uiUxStatusForContext(ev, [], [])).toEqual({ status: 'in-progress', conflict: true, source: 'aggregate' })
  })

  it('returns the matching scope status, not the aggregate, once a Release is selected', () => {
    const ev = evidence({
      status: 'in-progress',
      scopes: [
        { fixVersions: ['0.3'], components: [], status: 'completed', conflict: false, sourceKeys: ['UIX-1'] },
        { fixVersions: ['0.4'], components: [], status: 'not-started', conflict: false, sourceKeys: ['BOOT-1'] }
      ]
    })
    expect(uiUxStatusForContext(ev, ['0.3'], [])).toEqual({ status: 'completed', conflict: false, source: 'scope' })
  })

  it('reports no evidence when no scope matches the selected Release', () => {
    const ev = evidence({
      status: 'completed',
      scopes: [{ fixVersions: ['0.3'], components: [], status: 'completed', conflict: false, sourceKeys: ['UIX-1'] }]
    })
    expect(uiUxStatusForContext(ev, ['0.9'], [])).toEqual({ status: 'unknown', conflict: false, source: 'none' })
  })

  it('reports mixed when multiple matching scopes disagree, never fabricating a single status', () => {
    const ev = evidence({
      status: 'in-progress',
      scopes: [
        { fixVersions: ['0.3'], components: ['Dashboard'], status: 'completed', conflict: false, sourceKeys: ['UI-1'] },
        { fixVersions: ['0.3'], components: ['Backend'], status: 'not-started', conflict: true, sourceKeys: ['UI-2'] }
      ]
    })
    expect(uiUxStatusForContext(ev, ['0.3'], [])).toEqual({ status: 'mixed', conflict: true, source: 'mixed' })
  })

  it('returns the uniform status when multiple matching scopes agree', () => {
    const ev = evidence({
      status: 'completed',
      scopes: [
        { fixVersions: ['0.3'], components: ['Dashboard'], status: 'completed', conflict: false, sourceKeys: ['UI-1'] },
        { fixVersions: ['0.3'], components: ['Backend'], status: 'completed', conflict: false, sourceKeys: ['UI-2'] }
      ]
    })
    expect(uiUxStatusForContext(ev, ['0.3'], [])).toEqual({ status: 'completed', conflict: false, source: 'scope' })
  })
})

describe('useUiUxFilter', () => {
  it('toggles selectedLabels and tracks isFiltered', () => {
    const f = useUiUxFilter()
    expect(f.isFiltered.value).toBe(false)

    f.toggleLabel('design-approved')
    expect(f.selectedLabels.value).toEqual(['design-approved'])
    expect(f.isFiltered.value).toBe(true)

    f.toggleLabel('ui-completed')
    expect(f.selectedLabels.value).toEqual(['design-approved', 'ui-completed'])

    f.toggleLabel('design-approved')
    expect(f.selectedLabels.value).toEqual(['ui-completed'])

    f.clearFilters()
    expect(f.isFiltered.value).toBe(false)
    expect(f.selectedLabels.value).toEqual([])
  })
})
