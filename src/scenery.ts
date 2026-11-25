import type { CSSProperties } from 'react'

export const minimumSceneryTileWidth = 750

const positiveModulo = (distance: number, period: number) =>
  ((distance % period) + period) % period

// Travel is measured in real CSS pixels, independently of the narrative scene
// coordinates. Every second tile is horizontally reflected so both joins are
// identical, including silhouettes that were not originally drawn to tile.
export function sceneryStyle(distance: number, tileWidth: number, landmarkDistance: number, reduced: boolean) {
  const travel = reduced ? 0 : distance
  const landmark = reduced ? 0 : landmarkDistance
  const period = Math.max(minimumSceneryTileWidth, tileWidth) * 2
  const shift = (factor: number) => `${-positiveModulo(travel * factor, period)}px`
  return {
    '--scenery-tile-width': `${Math.max(minimumSceneryTileWidth, tileWidth)}px`,
    '--travel-x': `${-travel}px`,
    '--landmark-x': `${-landmark}px`,
    '--cloud-shift': shift(.15),
    '--far-shift': shift(.24),
    '--near-shift': shift(.38),
    '--woods-shift': shift(.66),
    '--grass-shift': shift(1),
    '--distant-shift': shift(.27),
    '--foreground-shift': shift(.67),
    '--particle-shift': shift(.041),
  } as CSSProperties
}
