/**
 * 按书名确定性生成「平涂封面底色」（无封面图时的回退色块）。
 * 暖纸文学色域内取色（陶土→沙金暖区），同名同色；纯扁平、无渐变。
 */
export function bookCoverColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  // 色相限定 18°(赤褐)~42°(沙金) 暖区，避免冷色破坏暖纸基调
  const hue = 18 + (hash % 24);
  return `hsl(${hue} 44% 52%)`;
}
