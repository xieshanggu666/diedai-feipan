import { describe, expect, it } from 'vitest';
import { DEMO_FIELDS } from '../data/gameData';
import { FieldRenderer } from './FieldRenderer';

describe('FieldRenderer layout', () => {
  const scale = { width: 900, height: 700 };
  const scene = { scale } as unknown as Parameters<FieldRenderer['fitTo']>[0];

  it('mutates scale and origin in place when the viewport is resized', () => {
    const renderer = new FieldRenderer(DEMO_FIELDS[0], 1, 0, 0);
    renderer.fitTo(scene as never, 70);
    const before = { scale: renderer.scale, x: renderer.originX, y: renderer.originY };
    const point = renderer.toLogical(renderer.toScreen({ x: 100, y: 200 }));

    scale.width = 1200;
    scale.height = 500;
    renderer.fitTo(scene as never, 70);

    expect(renderer.scale).not.toBe(before.scale);
    expect(renderer.originX).not.toBe(before.x);
    expect(renderer.toScreen({ x: 10, y: 20 })).toEqual({
      x: renderer.originX + 10 * renderer.scale,
      y: renderer.originY + 20 * renderer.scale
    });
    const afterResize = renderer.toLogical(renderer.toScreen({ x: 100, y: 200 }));
    expect(afterResize.x).toBeCloseTo(point.x);
    expect(afterResize.y).toBeCloseTo(point.y);
  });
});
