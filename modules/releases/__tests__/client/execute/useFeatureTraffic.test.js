import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useFeatureDetail } from '../../../client/execute/composables/useFeatureTraffic'

const mockApiRequest = vi.fn()

vi.mock('@shared/client/services/api', () => ({
  apiRequest: (...args) => mockApiRequest(...args)
}))

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('useFeatureDetail', () => {
  beforeEach(() => {
    mockApiRequest.mockReset()
  })

  it('loads a feature and caches the successful response', async () => {
    mockApiRequest.mockResolvedValue({ key: 'A-1', epics: [] })
    const { feature, loading, error, loadFeature } = useFeatureDetail()

    await loadFeature('A-1')

    expect(feature.value).toEqual({ key: 'A-1', epics: [] })
    expect(loading.value).toBe(false)
    expect(error.value).toBeNull()
    expect(mockApiRequest).toHaveBeenCalledTimes(1)
  })

  it('reselecting a cached key returns cached data without a new request', async () => {
    mockApiRequest.mockResolvedValue({ key: 'A-1', epics: [] })
    const { feature, loadFeature } = useFeatureDetail()

    await loadFeature('A-1')
    await loadFeature('A-1')

    expect(mockApiRequest).toHaveBeenCalledTimes(1)
    expect(feature.value).toEqual({ key: 'A-1', epics: [] })
  })

  it('clears feature to null while an uncached fetch is in flight', () => {
    const d = deferred()
    mockApiRequest.mockReturnValue(d.promise)
    const { feature, loading, loadFeature } = useFeatureDetail()

    feature.value = { key: 'STALE', epics: [] }
    loadFeature('A-1')

    expect(feature.value).toBeNull()
    expect(loading.value).toBe(true)
  })

  it('a late response for an abandoned selection never overwrites the currently selected feature', async () => {
    const dA = deferred()
    const dB = deferred()
    mockApiRequest.mockImplementation((url) => (url.includes('A-1') ? dA.promise : dB.promise))
    const { feature, loadFeature } = useFeatureDetail()

    const pA = loadFeature('A-1')
    const pB = loadFeature('B-1')

    dB.resolve({ key: 'B-1', epics: [] })
    await pB

    dA.resolve({ key: 'A-1', epics: [] })
    await pA

    expect(feature.value).toEqual({ key: 'B-1', epics: [] })
  })

  it('a cached reselection while another request is pending is not later overwritten by that pending response', async () => {
    mockApiRequest.mockResolvedValueOnce({ key: 'A-1', epics: [] })
    const { feature, loadFeature } = useFeatureDetail()
    await loadFeature('A-1')

    const dB = deferred()
    mockApiRequest.mockReturnValueOnce(dB.promise)
    const pB = loadFeature('B-1')
    expect(feature.value).toBeNull() // B-1 fetch in flight, not yet cached

    await loadFeature('A-1') // cache hit, synchronous
    expect(feature.value).toEqual({ key: 'A-1', epics: [] })

    dB.resolve({ key: 'B-1', epics: [] })
    await pB

    expect(feature.value).toEqual({ key: 'A-1', epics: [] })
  })

  it('a failed load does not poison the cache, so retrying the same key issues a fresh request', async () => {
    mockApiRequest.mockRejectedValueOnce(new Error('boom'))
    const { feature, error, loadFeature } = useFeatureDetail()

    await loadFeature('A-1')
    expect(error.value).toBe('boom')
    expect(feature.value).toBeNull()

    mockApiRequest.mockResolvedValueOnce({ key: 'A-1', epics: [] })
    await loadFeature('A-1')

    expect(error.value).toBeNull()
    expect(feature.value).toEqual({ key: 'A-1', epics: [] })
    expect(mockApiRequest).toHaveBeenCalledTimes(2)
  })

  it('a late error for an abandoned selection never overwrites a since-succeeded selection', async () => {
    const dA = deferred()
    mockApiRequest.mockImplementation((url) => (url.includes('A-1') ? dA.promise : Promise.resolve({ key: 'B-1', epics: [] })))
    const { feature, error, loadFeature } = useFeatureDetail()

    const pA = loadFeature('A-1')
    await loadFeature('B-1')
    expect(feature.value).toEqual({ key: 'B-1', epics: [] })

    dA.reject(new Error('too late'))
    await pA.catch(() => {})

    expect(feature.value).toEqual({ key: 'B-1', epics: [] })
    expect(error.value).toBeNull()
  })
})
