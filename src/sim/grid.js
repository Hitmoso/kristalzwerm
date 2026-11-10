// Spatial hash for neighbour queries. Rebuilt every tick; cheap at this scale.

export function buildGrid(items, cell) {
  const cells = new Map();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const key = Math.floor(it.x / cell) * 4096 + Math.floor(it.y / cell);
    let bucket = cells.get(key);
    if (!bucket) cells.set(key, (bucket = []));
    bucket.push(it);
  }
  return { cells, cell };
}

export function queryGrid(grid, x, y, r, cb) {
  const c = grid.cell;
  const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
  const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      const bucket = grid.cells.get(cx * 4096 + cy);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) cb(bucket[i]);
    }
  }
}
