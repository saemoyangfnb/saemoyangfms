// 시도 명칭 변경(2023 강원특별자치도, 2024 전북특별자치도 등)으로 신/구 명칭이
// 서로 다른 문자열로 취급되는 것을 막기 위한 정규화
const REGION_ALIASES: Record<string, string> = {
  '강원도': '강원특별자치도', '강원': '강원특별자치도',
  '전라북도': '전북특별자치도', '전북': '전북특별자치도', '전북도': '전북특별자치도',
  '제주도': '제주특별자치도', '제주': '제주특별자치도',
};

export function normalizeStoreRegion(raw: string): string {
  const r = (raw ?? '').trim();
  return REGION_ALIASES[r] ?? r;
}
