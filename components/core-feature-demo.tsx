"use client";

import { AlertTriangle, BookOpen, CheckCircle2, ClipboardCheck, Search } from "lucide-react";
import { useState } from "react";
import { CORE_DEMO_CASE } from "@/lib/core-demo-case";

type DemoField = { key: string; label: string; aiValue: string; confirmedValue: string; evidence?: string };
type SearchMatch = { id: string; title: string; subtitle: string | null; definition: string; source: { provider: string; collection: string; sourceRecordId: string } };
type SearchResponse = { answer: string | null; matches: SearchMatch[]; disclaimer: string; error?: string };

const STEPS = ["육안 소견", "병리 결과", "위탁검사", "오류 수정", "근거 검색", "최종 확인"] as const;

function FieldGrid({ fields }: { fields: readonly DemoField[] }) {
  return (
    <div className="core-demo-field-grid">
      {fields.map((field) => (
        <article className="review-field" key={field.key}>
          <div className="review-field-head"><strong>{field.label}</strong><span className="status-chip success">확인</span></div>
          <div className="comparison-stack">
            <span>저장된 AI 제안값</span><em>{field.aiValue}</em>
            <span>사용자 확인값</span><strong>{field.confirmedValue}</strong>
          </div>
          {field.evidence && <div className="evidence-line"><span>원문 근거</span><em>{field.evidence}</em></div>}
        </article>
      ))}
    </div>
  );
}

function DemoSection({ id, step, title, sourceText, fields, children }: { id: string; step: number; title: string; sourceText?: string; fields?: readonly DemoField[]; children?: React.ReactNode }) {
  return (
    <section className="panel core-demo-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="panel-heading">
        <div><span className="step-label">{step}단계</span><h2 id={`${id}-title`}>{title}</h2></div>
        <span className="core-demo-case-id">{CORE_DEMO_CASE.caseId}</span>
      </div>
      {sourceText && <div className="core-demo-source"><strong>원문</strong><p>{sourceText}</p></div>}
      {fields && <FieldGrid fields={fields} />}
      {children}
    </section>
  );
}

function EvidenceSearch({ label, initialQuery }: { label: string; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/knowledge/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const data = await response.json() as SearchResponse;
      if (!response.ok) throw new Error(data.error ?? "검색 결과를 불러오지 못했습니다.");
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "검색 결과를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="core-demo-search">
      <label htmlFor={`core-search-${label}`}>{label}</label>
      <div className="search-box"><Search size={18} aria-hidden="true" /><input id={`core-search-${label}`} value={query} maxLength={120} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && !loading && void search()} /><button type="button" disabled={loading || !query.trim()} onClick={() => void search()}>{loading ? "검색 중" : "검색"}</button></div>
      {error && <p className="inline-error">{error}</p>}
      {result && <div className="core-demo-search-result" aria-live="polite">
        {result.matches[0] ? <><strong>{result.matches[0].title}{result.matches[0].subtitle ? ` · ${result.matches[0].subtitle}` : ""}</strong><p>{result.matches[0].definition}</p><small>{result.matches[0].source.provider} · {result.matches[0].source.collection} · {result.matches[0].source.sourceRecordId}</small></> : <p>등록된 로컬 근거에서 결과를 찾지 못했습니다.</p>}
      </div>}
    </div>
  );
}

export function CoreFeatureDemo() {
  const [confirmedLaterality, setConfirmedLaterality] = useState<string>(CORE_DEMO_CASE.warning.originalValue);
  const [correctionApplied, setCorrectionApplied] = useState(false);
  const [finalized, setFinalized] = useState(false);

  function applyCorrection() {
    setConfirmedLaterality(CORE_DEMO_CASE.warning.suggestedValue);
    setCorrectionApplied(true);
    setFinalized(false);
  }

  return (
    <div className="view-stack core-demo-view">
      <div className="core-demo-context">
        <div><strong>{CORE_DEMO_CASE.title}</strong><span>{CORE_DEMO_CASE.caseId} · 원천 평가 {CORE_DEMO_CASE.sourceEvaluationCaseId}</span></div>
        <dl><div><dt>검사</dt><dd>{CORE_DEMO_CASE.specimen.orderId}</dd></div><div><dt>검체</dt><dd>{CORE_DEMO_CASE.specimen.specimenId}</dd></div><div><dt>블록</dt><dd>{CORE_DEMO_CASE.specimen.blockId}</dd></div></dl>
      </div>
      <nav className="core-demo-steps" aria-label="핵심 기능 체험 단계">
        {STEPS.map((step, index) => <a key={step} href={`#core-step-${index + 1}`}><span>{index + 1}</span>{step}</a>)}
      </nav>

      <DemoSection id="core-step-1" step={1} title="육안 소견 입력" sourceText={CORE_DEMO_CASE.gross.sourceText} fields={CORE_DEMO_CASE.gross.fields} />
      <DemoSection id="core-step-2" step={2} title="병리 결과 입력" sourceText={CORE_DEMO_CASE.pathology.sourceText} fields={CORE_DEMO_CASE.pathology.fields} />
      <DemoSection id="core-step-3" step={3} title="위탁검사 결과 입력" sourceText={CORE_DEMO_CASE.outsourced.sourceText} fields={CORE_DEMO_CASE.outsourced.fields} />

      <DemoSection id="core-step-4" step={4} title="입력 오류 확인 및 수정">
        <div className="core-demo-warning" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div><strong>{CORE_DEMO_CASE.warning.label}</strong><p>{CORE_DEMO_CASE.warning.evidence}</p><code>{CORE_DEMO_CASE.warning.code} · {CORE_DEMO_CASE.warning.fieldKey}</code></div></div>
        <div className="core-demo-correction">
          <div><span>수정 전</span><strong>{CORE_DEMO_CASE.warning.originalValue}</strong></div>
          <label><span>사용자 확인값</span><input value={confirmedLaterality} onChange={(event) => { setConfirmedLaterality(event.target.value); setCorrectionApplied(event.target.value === CORE_DEMO_CASE.warning.suggestedValue); setFinalized(false); }} /></label>
          <div><span>수정 제안</span><strong>{CORE_DEMO_CASE.warning.suggestedValue}</strong></div>
          <button type="button" className="secondary-button" onClick={applyCorrection}>제안 적용</button>
        </div>
        <p className="core-demo-state"><ClipboardCheck size={17} aria-hidden="true" />{correctionApplied ? "수정 후 값이 확인되었습니다. 사용자가 최종 확인할 수 있습니다." : "AI가 값을 확정하지 않습니다. 사용자가 수정값을 확인해 주세요."}</p>
      </DemoSection>

      <DemoSection id="core-step-5" step={5} title="암·병리 용어·데이터 항목 검색">
        <div className="core-demo-search-grid">
          <EvidenceSearch label="암·병리 용어" initialQuery={CORE_DEMO_CASE.searches.terminology} />
          <EvidenceSearch label="데이터 항목" initialQuery={CORE_DEMO_CASE.searches.dataField} />
        </div>
      </DemoSection>

      <DemoSection id="core-step-6" step={6} title="최종 확인">
        <div className={`core-demo-final ${finalized ? "complete" : ""}`}>
          {finalized ? <CheckCircle2 size={22} aria-hidden="true" /> : <BookOpen size={22} aria-hidden="true" />}
          <div><strong>{finalized ? "사용자 최종 확인 완료" : "사용자 최종 확인 대기"}</strong><p>육안 소견·병리 결과·위탁검사 결과와 좌우 오류 수정값을 같은 사례 ID로 확인합니다.</p></div>
          <button type="button" className="secondary-button" disabled={!correctionApplied} onClick={() => setFinalized(true)}>{finalized ? "확인 완료" : "최종 확인"}</button>
        </div>
      </DemoSection>
    </div>
  );
}
