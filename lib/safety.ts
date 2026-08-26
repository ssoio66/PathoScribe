const IDENTIFIER_PATTERNS = [
  { label: "주민등록번호", pattern: /\b\d{6}-?[1-4]\d{6}\b/ },
  { label: "전화번호", pattern: /\b01[016789]-?\d{3,4}-?\d{4}\b/ },
  { label: "이메일", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { label: "환자번호", pattern: /(?:환자|등록|차트)\s*(?:번호|no\.?|id)?\s*[:：#]?\s*[A-Z]?\d{6,}/i },
];

export function detectIdentifiers(text: string): string[] {
  return IDENTIFIER_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
}

export function assertSyntheticInput(text: string): void {
  const detected = detectIdentifiers(text);
  if (detected.length > 0) {
    throw new Error(`실제 환자정보로 의심되는 항목이 감지되었습니다: ${detected.join(", ")}`);
  }
}
