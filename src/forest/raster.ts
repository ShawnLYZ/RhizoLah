// Small raster helpers on the 500 x 500 grid, shared by the canopy classifier and the Site Layout generator.

import { N } from './model'

export interface Components {
  /** 0 outside the mask, otherwise 1..count. */
  labels: Int32Array
  count: number
  /** Pixel count per label (index 0 unused). */
  area: Int32Array
  /** Whether the component touches the tile edge (index 0 unused). */
  edge: Uint8Array
}

/** 4-connected components of a mask, labelled in scan order. */
export function components(mask: Uint8Array): Components {
  const labels = new Int32Array(N * N)
  const areas: number[] = [0]
  const edges: number[] = [0]
  const stack = new Int32Array(N * N)
  let count = 0
  for (let start = 0; start < N * N; start++) {
    if (!mask[start] || labels[start]) continue
    count++
    let top = 0, area = 0, edge = 0
    stack[top++] = start
    labels[start] = count
    while (top > 0) {
      const p = stack[--top]
      area++
      const x = p % N, y = (p - x) / N
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) edge = 1
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = count; stack[top++] = p - 1 }
      if (x < N - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = count; stack[top++] = p + 1 }
      if (y > 0 && mask[p - N] && !labels[p - N]) { labels[p - N] = count; stack[top++] = p - N }
      if (y < N - 1 && mask[p + N] && !labels[p + N]) { labels[p + N] = count; stack[top++] = p + N }
    }
    areas.push(area)
    edges.push(edge)
  }
  return { labels, count, area: Int32Array.from(areas), edge: Uint8Array.from(edges) }
}

const BIG = 1e9
const DIAG = Math.SQRT2

/**
 * Distance in metres from every pixel to the nearest pixel where `target` is set (two-pass chamfer).
 * Pixels are BIG when the target is empty. The tile edge is not a target.
 */
export function distanceTo(target: Uint8Array): Float32Array {
  const d = new Float32Array(N * N)
  for (let i = 0; i < N * N; i++) d[i] = target[i] ? 0 : BIG
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = y * N + x
      let v = d[p]
      if (v === 0) continue
      if (x > 0) v = Math.min(v, d[p - 1] + 1)
      if (y > 0) {
        v = Math.min(v, d[p - N] + 1)
        if (x > 0) v = Math.min(v, d[p - N - 1] + DIAG)
        if (x < N - 1) v = Math.min(v, d[p - N + 1] + DIAG)
      }
      d[p] = v
    }
  }
  for (let y = N - 1; y >= 0; y--) {
    for (let x = N - 1; x >= 0; x--) {
      const p = y * N + x
      let v = d[p]
      if (v === 0) continue
      if (x < N - 1) v = Math.min(v, d[p + 1] + 1)
      if (y < N - 1) {
        v = Math.min(v, d[p + N] + 1)
        if (x < N - 1) v = Math.min(v, d[p + N + 1] + DIAG)
        if (x > 0) v = Math.min(v, d[p + N - 1] + DIAG)
      }
      d[p] = v
    }
  }
  return d
}

/** A mask that is 1 where `values[i] === value`. */
export function maskOf(values: ArrayLike<number>, value: number): Uint8Array {
  const m = new Uint8Array(N * N)
  for (let i = 0; i < N * N; i++) m[i] = values[i] === value ? 1 : 0
  return m
}
