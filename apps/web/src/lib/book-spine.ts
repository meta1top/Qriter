/**
 * 按书名确定性生成书脊渐变色（CSS linear-gradient）。
 * 暖纸文学色域内取色：固定取陶土→沙金区间的色相，亮度随 hash 微调，保证同名同色。
 */
export function bookSpineColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  // 色相限定 18°(赤褐)~42°(沙金) 暖区，避免冷色破坏暖纸基调
  const hue = 18 + (hash % 24);
  const top = `hsl(${hue} 42% 62%)`;
  const bottom = `hsl(${hue + 6} 48% 46%)`;
  return `linear-gradient(160deg, ${top}, ${bottom})`;
}
