export const lerp = (a: number, b: number, t: number) => {
  return a + (b - a) * t;
}

export const clampToDiamond = ({ x, y }: { x: number, y: number }, diamondWidth: number) => {
  
  const r = diamondWidth / 2;          // half diagonal (tip-to-tip / 2)
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const s = ax + ay;

  if (s <= r || s === 0) return { x: x, y: y };

  const k = r / s;                     // scale so |x|+|y| becomes r
  return { x: x * k, y: y * k };
}