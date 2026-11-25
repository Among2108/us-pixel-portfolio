import { useEffect, useSyncExternalStore } from 'react'
import { journeyImageManifest } from './story'

type ImageStatus = 'queued' | 'loading' | 'ready' | 'failed'
type PreparedAsset = { status: ImageStatus; image?: HTMLImageElement }

// Keep the decoded images for this visit, including subsequent trips through the worlds.
const assets = new Map<string, PreparedAsset>()
const pending: string[] = []
const listeners = new Set<() => void>()
let active = 0

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function pump() {
  while (active < 4 && pending.length) {
    const src = pending.shift()!
    const asset = assets.get(src)!
    const image = new Image()
    active++
    asset.status = 'loading'
    asset.image = image
    image.decoding = 'async'
    function finish(success: boolean) {
      if (asset.status !== 'loading') return
      window.clearTimeout(timeout)
      image.onload = image.onerror = null
      asset.status = success ? 'ready' : 'failed'
      if (!success) {
        image.removeAttribute('src')
        asset.image = undefined
      }
      active--
      notify()
      pump()
    }
    const timeout = window.setTimeout(() => finish(false), 8000)
    image.onerror = () => finish(false)
    image.onload = () => {
      if (typeof image.decode !== 'function') finish(image.naturalWidth > 0)
      else image.decode().then(() => finish(true), () => finish(false))
    }
    image.src = src
  }
}

function prepare(src: string, retry = false) {
  const previous = assets.get(src)
  if (previous && !(retry && previous.status === 'failed')) return
  assets.set(src, { status: 'queued' })
  if (retry) pending.unshift(src)
  else pending.push(src)
  pump()
  notify()
}

export function startJourneyPreviews() {
  for (const variant of journeyImageManifest) prepare(variant.src)
}

function settledPreviews() {
  return journeyImageManifest.filter(({ src }) => {
    const status = assets.get(src)?.status
    return status === 'ready' || status === 'failed'
  }).length
}

export function usePreviewProgress() {
  const settled = useSyncExternalStore(subscribe, settledPreviews)
  return { settled, total: journeyImageManifest.length }
}

// A browser can have the bytes in its cache and still need a few frames to
// decode them. Suppress the visual flash while those cached previews prepare.
export function previewsAreComingFromCache() {
  if (typeof performance.getEntriesByType !== 'function') return false
  const urls = new Set(journeyImageManifest.map(({ src }) => new URL(src, document.baseURI).href))
  const previews = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter(resource => urls.has(resource.name))
  return previews.length > 0 && previews.every(resource => resource.transferSize === 0 && resource.decodedBodySize > 0)
}

export function usePreparedImage(src: string | undefined) {
  useEffect(() => { if (src) prepare(src) }, [src])
  return useSyncExternalStore(subscribe, () => src ? assets.get(src)?.status ?? 'queued' : 'failed')
}

export function retryImage(src: string) {
  prepare(src, true)
}

export function markImageUnavailable(src: string) {
  const asset = assets.get(src)
  if (asset?.status === 'ready') {
    asset.status = 'failed'
    asset.image = undefined
    notify()
  }
}
