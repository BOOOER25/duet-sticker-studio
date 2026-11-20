export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const cents = n => Math.round(Number(n) * 100);
export function amount(n, unit = '元') {
  const value = (Math.round(Number(n) * 100) / 100).toFixed(2).replace(/\.00$/, '');
  return unit === '元' ? `¥${value}` : `${value} ${unit}`;
}
export const visibleItems = (state, time) => state.items.filter(x => x.at <= time);
export function totals(state, time) {
  return [0, 1].map(side => visibleItems(state, time).filter(x => x.side === side)
    .reduce((sum, x) => sum + cents(x.amount), 0) / 100);
}
export function validate(state) {
  if (!state || state.version !== 1) throw new Error('不支持的项目文件版本');
  if (typeof state.title !== 'string' || state.title.length > 48) throw new Error('标题最多 48 字');
  if (!['元', '大卡', '次'].includes(state.unit)) throw new Error('请选择支持的单位');
  if (!Number.isFinite(state.duration) || state.duration < 3 || state.duration > 60) throw new Error('视频时长为 3–60 秒');
  if (!Array.isArray(state.people) || state.people.length !== 2 || state.people.some(p => typeof p.name !== 'string' || p.name.length > 12)) throw new Error('请填写双方名称，最多 12 字');
  if (!Array.isArray(state.items) || state.items.length > 36) throw new Error('最多配置 36 笔，每侧 18 笔');
  if ([0, 1].some(side => state.items.filter(x => x.side === side).length > 18)) throw new Error('每侧最多配置 18 笔');
  const ids = new Set();
  for (const item of state.items) {
    if (typeof item.id !== 'string' || ids.has(item.id)) throw new Error('明细编号重复或缺失');
    ids.add(item.id);
    if (![0, 1].includes(item.side)) throw new Error('请选择明细归属');
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 20) throw new Error('商品名称需为 1–20 字');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(String(item.amount))) throw new Error('金额或热量为 0–999999.99，最多两位小数');
    if (!Number.isFinite(item.at) || item.at < 0 || item.at > state.duration - .5) throw new Error('出现时间需在视频结束前至少 0.5 秒');
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.clock)) throw new Error('请填写有效的消费时间');
    if (!Number.isFinite(item.scale) || item.scale < .6 || item.scale > 1.4) throw new Error('图片大小超出范围');
  }
  return state;
}
export function normalize(raw) {
  if(raw?.version!==1)throw new Error('不支持的项目文件版本');
  // Allowlisted data only; imported fields never become HTML or remote URLs.
  const text = (x, fallback = '') => typeof x === 'string' ? x : fallback;
  const ref = x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(x) ? x : '';
  const state = {
    version: 1, title: text(raw?.title), footer: text(raw?.footer).slice(0, 60),
    unit: raw?.unit, duration: Number(raw?.duration),
    theme: ['pink', 'mint', 'lilac'].includes(raw?.theme) ? raw.theme : 'pink',
    background: ref(raw?.background), music: ref(raw?.music),
    people: Array.isArray(raw?.people) ? raw.people.map(p => ({name: text(p.name), avatar: ref(p.avatar)})) : [],
    items: Array.isArray(raw?.items) ? raw.items.map(x => ({
      id: ref(x.id), side: Number(x.side), name: text(x.name), amount: String(x.amount),
      clock: text(x.clock), at: Number(x.at), asset: ref(x.asset), scale: Number(x.scale),
    })) : [],
  };
  return validate(state);
}
export function example(variant) {
  const names = ['早餐三明治', '冰美式', '午餐便当', '水果酸奶', '晚餐意面', '小蛋糕', '鲜花', '奶茶'];
  const prices = [18, 12, 32.5, 16, 42, 28, 35, 19.9];
  return {
    version: 1, title: '当我和闺蜜共享了今日消费', footer: '认真生活，也认真记录 · 喵喵记账',
    unit: '元', duration: variant === 'receipt' ? 17 : 15,
    theme: variant === 'receipt' ? 'lilac' : 'pink', background: '', music: '',
    people: [{name: '我', avatar: ''}, {name: '我的搭子', avatar: ''}],
    items: names.map((name, i) => ({
      id: `sample-${i}`, side: i === 1 || i === 3 || i === 7 ? 1 : 0, name,
      amount: String(prices[i]), clock: ['08:00', '08:30', '12:00', '14:00', '18:00', '19:00', '20:00', '21:00'][i],
      at: 1 + i * 1.5, asset: `sample-${i % 4}`, scale: 1,
    })),
  };
}
