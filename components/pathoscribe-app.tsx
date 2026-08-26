"use client";

import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  FileScan,
  History,
  Home,
  Info,
  LayoutDashboard,
  ListChecks,
  Menu,
  Microscope,
  PanelLeftClose,
  Search,
  ShieldCheck,
  Settings2,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { DATA_CATALOG } from "@/lib/data/data-catalog";
import { applyUniqueTermReviewDecision, confirmedValueFromDecision, createTermReviewDecision, type TermReviewDecision } from "@/lib/term-review-state";
import { NCC_LUNG_BRONCHOSCOPY } from "@/lib/data/ncc-lung-bronchoscopy";
import { NCC_LUNG_DIAGNOSIS_REFERENCE } from "@/lib/data/ncc-lung-diagnosis-reference";
import { NCC_LUNG_IMMUNOPATHOLOGY } from "@/lib/data/ncc-lung-immunopathology";
import { IASLC_LUNG_TNM_9TH_FORMAT_REFERENCE } from "@/lib/data/iaslc-lung-tnm-9th";
import { NCC_LUNG_LINKAGE, NCC_LUNG_LINKAGE_DERIVED } from "@/lib/data/ncc-lung-linkage";
import { NCC_LUNG_PATHOLOGIC_STAGES } from "@/lib/data/ncc-lung-pathologic-stages";
import { NCC_LUNG_REGISTRY_DERIVED, NCC_LUNG_REGISTRY_METADATA } from "@/lib/data/ncc-lung-registry-metadata";
import { NCC_LUNG_DERIVED, NCC_LUNG_SUMMARY } from "@/lib/data/ncc-lung-summary";
import type { WorkflowPreviewCase, WorkflowPreviewResponse, WorkflowSourceType } from "@/lib/pathology-workflow";
import { STAGE_FIELD_DEFINITIONS, STAGE_REVIEW_DISCLAIMER, isStageValueAllowed, stageValuesMatch } from "@/lib/stage-review";
import { canonicalConfirmedValueOption, getConfirmedValueControl, OTHER_CONFIRMED_VALUE } from "@/lib/confirmed-value-controls";
import type { AnalyzeKind, AnalyzeResponse, ExtractedField, MedicalTermReview, ReviewIssue, TermReviewStatus } from "@/lib/types";

type ViewId = "intro" | "demo" | "service" | "dashboard" | "worklist" | "workflow" | "gross" | "pathology" | "referral" | "knowledge" | "sources" | "history" | "settings";
type RoleId = "him" | "pathologist" | "lab" | "quality";
type ActiveRoleId = RoleId | null;

const NAV_ITEMS = [
  { id: "intro" as const, label: "서비스 소개", icon: Home },
  { id: "gross" as const, label: "육안 소견", icon: Microscope },
  { id: "pathology" as const, label: "결과 구조화·검수", icon: ClipboardCheck },
  { id: "referral" as const, label: "위탁검사 입력", icon: FileScan },
  { id: "worklist" as const, label: "검수 작업 목록", icon: ListChecks },
  { id: "workflow" as const, label: "가상 연결 데이터", icon: Database },
  { id: "dashboard" as const, label: "품질 대시보드", icon: LayoutDashboard },
  { id: "knowledge" as const, label: "용어·입력 지침", icon: BookOpen },
  { id: "sources" as const, label: "데이터 출처", icon: Database },
  { id: "history" as const, label: "검수 이력", icon: History },
  { id: "settings" as const, label: "안전·데이터 설정", icon: Settings2 },
];

const COMMON_NAV_IDS: ViewId[] = ["intro", "demo", "service", "sources"];
const SIDEBAR_COMMON_NAV_IDS: ViewId[] = ["sources"];
const PRIMARY_MENU_ITEMS: Array<{ id: ViewId; label: string }> = [
  { id: "intro", label: "서비스 소개" },
  { id: "demo", label: "업무 시연" },
  { id: "service", label: "서비스 설명" },
];

function navItemsForRole(role: ActiveRoleId) {
  if (!role) return NAV_ITEMS.filter((item) => item.id === "intro");
  const visibleViews = new Set<ViewId>(["intro", ...ROLE_PROFILES[role].navViews]);
  return NAV_ITEMS.filter((item) => visibleViews.has(item.id));
}

const VIEW_META: Record<ViewId, { title: string; description: string }> = {
  intro: { title: "서비스 소개", description: "폐암 병리 전사·검수 업무를 보조하는 교육용 시제품의 목적을 먼저 확인합니다." },
  demo: { title: "업무 시연", description: "역할을 선택하고 대표 평가사례를 열어 핵심 검수 흐름을 확인합니다." },
  service: { title: "서비스 설명", description: "문제, 기능, AI 활용 방식과 검증 범위를 짧게 확인합니다." },
  dashboard: { title: "데이터 품질 대시보드", description: "합성데이터와 세션 내 검수 현황을 한눈에 확인합니다." },
  worklist: { title: "검수 작업 목록", description: "원천 행 ID가 일치한 경우에만 같은 평가사례 시연을 열고, 그 외 행은 연결 데이터를 확인합니다." },
  workflow: { title: "가상 병리 업무 연결", description: "검사·검체·블록·보고서·면역병리·분자병리를 동일한 가상 ID로 탐색합니다." },
  gross: { title: "육안 소견 입력 지원", description: "가상 원문에서 핵심 항목과 근거 문구를 함께 추출합니다." },
  pathology: { title: "병리 결과 구조화 및 검수", description: "결과문을 구조화하고 누락·불일치·형식 오류를 점검합니다." },
  referral: { title: "위탁검사 결과 입력 지원", description: "가상 위탁검사 문서와 내부 의뢰정보를 나란히 대조합니다." },
  knowledge: { title: "병리 용어·입력 지침", description: "등록된 근거 자료 안에서만 용어 설명과 출처를 찾습니다." },
  sources: { title: "데이터 출처", description: "공개자료, 공공 API 스냅샷, 서비스 생성 가상자료를 구분합니다." },
  history: { title: "검수 이력", description: "원문을 저장하지 않고 현재 브라우저 세션의 집계만 표시합니다." },
  settings: { title: "안전·데이터 설정", description: "합성데이터 사용과 서버 관리형 연동 상태를 확인합니다." },
};

const ROLE_PROFILES: Record<RoleId, {
  label: string;
  shortLabel: string;
  focus: string;
  allowed: string[];
  readonly: string[];
  blocked: string[];
  primaryViews: ViewId[];
  navViews: ViewId[];
  defaultView: ViewId;
}> = {
  him: {
    label: "보건의료정보관리사",
    shortLabel: "HIM",
    focus: "원문과 AI 추출 결과를 대조하고 구조화 템플릿·용어 후보를 검토해 담당자 확정값을 작성하는 주 작업 화면입니다.",
    allowed: ["육안 소견 입력", "병리 결과 입력", "위탁검사 결과 입력", "오류 확인 및 수정", "담당자 확정값 작성", "교육용 검수 PDF 저장"],
    readonly: ["공개 합성데이터 품질 지표", "가상 검사·검체·블록 연결 상태"],
    blocked: ["진단 확정", "병기 자동판정", "실제 의료기록 저장", "실제 병원 권한 적용"],
    primaryViews: ["gross", "pathology", "referral", "knowledge"],
    navViews: ["worklist", "gross", "pathology", "referral", "history", "knowledge"],
    defaultView: "gross",
  },
  pathologist: {
    label: "병리의사",
    shortLabel: "PATH",
    focus: "전사된 내용과 원문을 비교하고 확인 필요 항목을 검토 상태로 표시하는 조회 중심 화면입니다.",
    allowed: ["전사된 내용과 원문 비교", "확인 필요 항목 조회", "수정 요청 또는 검토 상태 표시"],
    readonly: ["담당자 확정값", "위탁검사 대조 결과", "검사·검체·블록 연결 타임라인"],
    blocked: ["AI 대체 진단", "실제 전자서명", "임상적 최종 승인", "공식 판독 저장"],
    primaryViews: ["worklist", "pathology", "workflow", "history"],
    navViews: ["worklist", "pathology", "workflow", "history", "knowledge"],
    defaultView: "worklist",
  },
  lab: {
    label: "임상병리사·병리 검사 담당자",
    shortLabel: "LAB",
    focus: "시제품상 검사·검체·블록 진행정보와 면역병리·분자병리 상태를 조회하는 화면입니다.",
    allowed: ["검사·검체·블록 진행상태 조회", "면역병리·분자병리 검사 상태 확인", "위탁검사 대조 상태 확인"],
    readonly: ["병리 결과 구조화 내용", "전사된 최종 진단", "담당자 확정값"],
    blocked: ["전사된 최종 진단 임의 수정", "병리 판독 수정", "실제 검사실 업무범위 단정"],
    primaryViews: ["workflow", "referral", "worklist"],
    navViews: ["worklist", "workflow", "referral", "knowledge"],
    defaultView: "workflow",
  },
  quality: {
    label: "품질관리자",
    shortLabel: "QA",
    focus: "개인정보가 제거된 오류 유형, 누락·불일치·수정 요청 현황을 보는 품질관리 화면입니다.",
    allowed: ["개인정보 제거 오류 유형 통계", "누락·불일치 현황 확인", "수정 요청 현황 확인", "교육용 품질 대시보드 조회"],
    readonly: ["개별 원문", "담당자 확정값", "검체·보고서 상세 입력값"],
    blocked: ["사용자별 실제 업무성과 평가", "실제 인사평가 지표", "실제 환자 단위 추적"],
    primaryViews: ["dashboard", "history"],
    navViews: ["dashboard", "history"],
    defaultView: "dashboard",
  },
};

const ROLE_PRIMARY_ACTION: Record<RoleId, { view: ViewId; label: string }> = {
  him: { view: "gross", label: "새 가상 검수 시작" },
  pathologist: { view: "worklist", label: "검토 요청 목록" },
  lab: { view: "workflow", label: "검사 진행 현황" },
  quality: { view: "dashboard", label: "품질 대시보드" },
};

const GROSS_SAMPLE = "우측 폐 상엽 쐐기 절제 검체 1개가 포르말린에 고정되어 접수되었다. 검체 크기는 6.2 x 3.8 x 2.1 cm이다. 절단면은 회백색이며 탄력성이 있다. 병변은 절제연에서 1.4 cm 떨어진 상엽 말초에 위치한다. 대표 블록 2개를 제작하였다.";
const PATHOLOGY_SAMPLE = "우측 폐 상엽 절제술: 선암, acinar predominant type, 중등도 분화. 종양 크기: 2.4 cm. 절제연은 종양 음성이다. 림프절 12개 중 1개에서 전이가 확인된다. 병리학적 병기 pT1c pN1 pM0. TTF-1: 양성. PD-L1 TPS 15%. EGFR mutation: not detected.";

const WORK_QUEUE = [
  { id: "SYN-GRS-001", kind: "gross" as const, label: "육안 소견", status: "검수 대기", tone: "warning" as const, detail: "검체 크기·병변 위치 근거 확인", updated: "오늘 09:10" },
  { id: "SYN-PTH-002", kind: "pathology" as const, label: "병리 결과", status: "확인 필요", tone: "danger" as const, detail: "림프절 수와 병기 형식 점검", updated: "오늘 09:04" },
  { id: "SYN-REF-003", kind: "referral" as const, label: "위탁검사", status: "대조 대기", tone: "teal" as const, detail: "검체 블록 정보 내부 의뢰와 비교", updated: "어제 16:40" },
  { id: "SYN-PTH-004", kind: "pathology" as const, label: "병리 결과", status: "검수 완료", tone: "success" as const, detail: "사용자 수정 없이 원문 대조 완료", updated: "어제 14:25" },
] as const;

const INTRO_CORE_TASKS = [
  {
    title: "육안 소견 입력 검수",
    detail: "검체 종류, 장기, 크기, 개수, 절단면, 병변 위치를 원문과 AI 구조화 결과로 대조합니다.",
    target: "gross" as const,
    button: "육안 소견 검수로 이동",
  },
  {
    title: "병리 판독 결과 구조화 검수",
    detail: "원문 값을 구조화 입력 템플릿에 배치하고, 항목별 선택·직접 입력과 용어 검수를 통해 진단명, 크기, 절제연, 림프절, 병기, 면역·분자병리의 누락·불일치를 확인합니다.",
    target: "pathology" as const,
    button: "병리 결과 검수로 이동",
  },
  {
    title: "위탁검사 결과 대조",
    detail: "가상 결과지의 추출값과 가상 의뢰정보를 비교해 검사번호, 날짜, 결과 누락을 검수합니다.",
    target: "referral" as const,
    button: "위탁검사 대조로 이동",
  },
] as const;

const AI_USAGE_ITEMS = [
  {
    title: "병리 원문 구조화",
    detail: "Gemini가 가상 육안 소견과 폐암 병리 결과문에서 원문에 명시된 항목만 구조화합니다. 원문에 없는 값은 추정하지 않고, 서로 충돌하는 원문값은 지우지 않은 채 확인 필요로 표시합니다.",
    target: "pathology" as const,
    action: "병리 결과 시연 열기",
  },
  {
    title: "원문 근거 및 용어 검수",
    detail: "Gemini가 연결한 원문 근거와 폐암 병리 용어목록의 오탈자 후보를 함께 표시합니다. 사전에 없는 표현은 확인 필요로 남깁니다.",
    target: "pathology" as const,
    action: "병리 결과 시연 열기",
  },
  {
    title: "AI와 규칙 기반 검수 결합",
    detail: "Gemini는 비정형 문장의 의미 구조화와 원문 근거 연결을 보조하고, 규칙은 날짜·숫자·단위·좌우·검사번호·검체명을 다시 확인합니다.",
    target: "referral" as const,
    action: "위탁검사 대조 열기",
  },
  {
    title: "사용자 최종 확인",
    detail: "수정 제안은 자동 적용되지 않습니다. 보건의료정보관리사가 제안 적용·거절·직접 수정·확인 필요 중 하나를 선택해 최종 확인합니다.",
    target: "gross" as const,
    action: "원문 대조 화면 열기",
  },
] as const;

const INTRO_NOT_THIS = [
  "폐암 진단 AI",
  "예후 예측 서비스",
  "치료법 추천 서비스",
  "병리의사를 대신하는 자동 판독 시스템",
  "AI가 병기나 결과를 자동 확정하는 시스템",
  "실제 의료기관 병리정보시스템 연동",
] as const;

const INTRO_PROBLEM_ROWS = [
  {
    problem: "육안 소견에서 영문 의학용어, 숫자, 단위, 좌우, 검체 수가 잘못 입력될 가능성",
    feature: "원문·AI 추출값·담당자 확정값 3단 비교, 폐암 병리 용어 오탈자 후보와 숫자·단위·좌우·검체 수 불일치 경고, 충돌 원문값 보존",
    effect: "담당자가 원문 근거와 수정 후보를 함께 확인하고, 단순 철자와 중요 의료정보의 확인 방식을 구분할 수 있습니다.",
  },
  {
    problem: "병리 결과문 안에 진단명, 종양 크기, 절제연, 림프절, 병기, 면역병리, 분자병리 정보가 혼재",
    feature: "병리 결과 구조화 입력 템플릿, 항목별 원문 근거 표시, AI 추출값·템플릿 값·담당자 확정값 분리",
    effect: "혼재된 병리 결과를 항목별로 확인하고, 원문에 없는 값은 빈 값 또는 ‘확인 필요’ 상태로 검토할 수 있습니다.",
  },
  {
    problem: "위탁검사기관마다 결과지 형식이 달라 내부 의뢰정보와 수작업 대조 필요",
    feature: "위탁검사 결과와 가상 내부 의뢰정보 매칭, 검사번호·검체·날짜·결과 상태 비교",
    effect: "형식이 다른 결과지를 내부 의뢰정보와 나란히 확인하는 대조 화면을 제공합니다.",
  },
  {
    problem: "검사번호, 검체, 블록, 보고서, 면역병리, 분자병리 결과가 서로 다른 화면과 데이터에 분리",
    feature: "검사·검체·블록·보고서 연결 타임라인과 동일 가상 ID 기반 탐색",
    effect: "분리된 병리 업무 객체를 하나의 연결 흐름으로 살펴보며 끊어진 참조를 확인할 수 있습니다.",
  },
  {
    problem: "신규 담당자가 병리 용어와 입력 형식을 여러 문서에서 찾아야 하는 문제",
    feature: "병리 용어 RAG와 출처 표시 검색",
    effect: "용어 설명과 데이터 항목 정의를 한 화면에서 확인해 교육·온보딩용 참고 흐름을 제공합니다.",
  },
  {
    problem: "생성형 AI가 원문에 없는 내용을 생성할 수 있는 문제",
    feature: "원문 근거 표시, 근거 없는 값의 not_found 처리, 고위험 정보 자동수정 차단, 제안 적용·거절·직접 수정·확인 필요 상태 관리",
    effect: "AI 결과와 수정 제안을 검토 대상으로 제한하고, 담당자가 원문을 대조한 뒤 확정값에만 반영하도록 합니다.",
  },
  {
    problem: "중요한 누락·불일치가 경고 없이 넘어가 전사 오류 가능성을 놓치는 문제",
    feature: "좌우, 숫자·단위, 필수 결과, 검사 연결값을 원문 근거와 규칙으로 다시 확인하고 고위험 항목은 자동수정하지 않음",
    effect: "중요 오류를 자동으로 해결한다고 주장하지 않고, 담당자가 원문을 다시 확인해야 하는 항목을 남겨 오류가 경고 없이 넘어갈 가능성을 줄입니다.",
  },
] as const;

const BLOCKING_ERROR_ITEMS = [
  {
    title: "좌우 불일치",
    example: "원문에 좌측과 우측 표현이 함께 있는 경우",
    response: "충돌한 원문 표현과 관련 필드값을 함께 표시하고 원문 확인 필요로 남깁니다.",
  },
  {
    title: "숫자·단위 불일치",
    example: "종양 크기, 검체 수, 블록 수의 값 또는 단위가 다른 경우",
    response: "규칙 기반 검수로 불일치를 표시하며 담당자 확정 전에는 자동으로 바꾸지 않습니다.",
  },
  {
    title: "필수 결과 누락",
    example: "절제연, 림프절, 면역병리 결과, 보고일 등이 빠진 경우",
    response: "원문에 없는 값은 null 또는 확인 필요로 표시해 임의 보완을 막습니다.",
  },
  {
    title: "검사 연결 불일치",
    example: "위탁검사의 의뢰번호, 검사명, 검체명이 내부 의뢰정보와 다른 경우",
    response: "가상 내부 의뢰정보와 항목별 대조 결과를 보여 주고 사용자 확인 전에는 확정하지 않습니다.",
  },
] as const;

function SafetyBanner() {
  return (
    <div className="safety-banner" role="note">
      <ShieldCheck size={18} aria-hidden="true" />
      <div>
        <strong>가상·공개 합성데이터 전용</strong>
        <span>실제 환자정보를 입력하지 마세요. 모든 결과는 담당자의 원문 대조가 필요합니다.</span>
        <span>교육용 입력 검수이며 AJCC 병기 판정 도구가 아닙니다.</span>
      </div>
    </div>
  );
}

function StatusChip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "teal" }) {
  return <span className={`status-chip ${tone}`}>{children}</span>;
}

function LungEmptyIcon() {
  return (
    <div className="empty-icon lung-empty-icon" aria-hidden="true">
      <Image src="/images/pathoscribe-lung-mark.png" alt="" width={44} height={44} />
    </div>
  );
}

function SourceActionButton({ sourceId, onNavigate, label = "사용 데이터·출처" }: { sourceId: string; onNavigate: (view: ViewId) => void; label?: string }) {
  const source = DATA_CATALOG.find((entry) => entry.id === sourceId);
  return (
    <button className="source-action-button" type="button" onClick={() => onNavigate("sources")} title={source ? `${source.name} · ${source.referenceDate}` : "데이터 카탈로그"}>
      <Database size={14} />
      {label}
    </button>
  );
}

const IMMUNOPATHOLOGY_MARKER_GUIDE = [
  { marker: "TTF-1", format: "TTF-1: positive/negative 또는 양성/음성", note: "면역병리 입력 형식 안내용 예시입니다." },
  { marker: "p40", format: "p40: positive/negative 또는 양성/음성", note: "마커별 필터와 담당자 입력칸 구성에만 사용합니다." },
  { marker: "CK7", format: "CK7: positive/negative 또는 양성/음성", note: "공공 집계값을 개인 검사 결과로 해석하지 않습니다." },
  { marker: "PD-L1", format: "PD-L1 TPS: 0-100%", note: "비율값은 원문에 명시된 경우에만 입력합니다." },
] as const;

const STAGE_FORMAT_EXAMPLES: Record<string, string> = IASLC_LUNG_TNM_9TH_FORMAT_REFERENCE.allowedExamples;

function RoleScopeBanner({ role, onNavigate }: { role: RoleId; onNavigate: (view: ViewId) => void }) {
  const profile = ROLE_PROFILES[role];
  return (
    <section className="role-scope-banner" aria-label="역할별 화면 보기 범위">
      <div className="role-scope-main">
        <span className="eyebrow">역할별 화면 보기 · 시제품</span>
        <h2>{profile.label}</h2>
        <p>{profile.focus}</p>
        <small>실제 인증·권한체계가 아닌, 시제품에서 역할별 업무 화면 차이를 보여 주기 위한 선택기입니다.</small>
      </div>
      <div className="role-permission-grid">
        <div>
          <strong>수정·작성 가능</strong>
          <div className="role-pill-list">
            {profile.allowed.slice(0, 4).map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        <div>
          <strong>조회 중심</strong>
          <div className="role-pill-list muted">
            {profile.readonly.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        <div>
          <strong>구현하지 않음</strong>
          <div className="role-pill-list blocked">
            {profile.blocked.slice(0, 4).map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </div>
      <div className="role-quick-actions" aria-label={`${profile.label} 주요 화면 이동`}>
        {profile.primaryViews.map((view) => (
          <button type="button" key={view} onClick={() => onNavigate(view)}>
            {VIEW_META[view].title}
          </button>
        ))}
      </div>
    </section>
  );
}

function RoleAccessNotice({ role, area }: { role: RoleId; area: "worklist" | "workflow" | "review" | "referral" | "history" | "dashboard" }) {
  const messages: Record<RoleId, Record<typeof area, string>> = {
    him: {
      worklist: "내 입력·검수 작업을 열어 원문, AI 추출값, 담당자 확정값을 대조합니다.",
      workflow: "동일 가상 ID로 연결된 검사·검체·블록·보고서 흐름을 조회합니다.",
      review: "가상 원문을 입력하고 담당자 확정값을 직접 작성할 수 있습니다.",
      referral: "교육용 가상 문서를 대조한 뒤 담당자 확인 상태만 표시합니다.",
      history: "현재 브라우저 세션에서 수행한 검수 요약만 봅니다.",
      dashboard: "개인 검수 세션의 요약 정보만 참고합니다.",
    },
    pathologist: {
      worklist: "확인 필요 항목을 조회하고 병리 결과 검토 화면으로 이동합니다.",
      workflow: "검사·검체·보고서 연결 흐름을 조회합니다. 가상 자료를 수정하거나 확정하지 않습니다.",
      review: "원문과 구조화 결과를 조회하고 교육용 수정 요청 상태만 표시할 수 있습니다.",
      referral: "위탁검사 대조 결과는 조회 전용입니다.",
      history: "현재 브라우저 세션의 검토 요약만 봅니다.",
      dashboard: "개별 업무성과가 아닌 교육용 집계만 봅니다.",
    },
    lab: {
      worklist: "검사 진행이 필요한 가상 사례를 조회하고 연결 상태 화면으로 이동합니다.",
      workflow: "검사·검체·블록·면역병리·분자병리 상태를 조회합니다. 진단문을 수정하지 않습니다.",
      review: "병리 전사값과 담당자 확정값은 조회 전용입니다.",
      referral: "교육용 위탁검사 자료의 검사명·검체·대조 상태를 조회합니다.",
      history: "실제 검사실 이력은 저장하거나 표시하지 않습니다.",
      dashboard: "개별 환자 결과가 아닌 교육용 집계만 봅니다.",
    },
    quality: {
      worklist: "개별 작업 목록은 품질관리 화면에 제공하지 않습니다.",
      workflow: "개별 사례 흐름은 품질관리 화면에 제공하지 않습니다.",
      review: "개별 원문과 확정값은 품질관리 화면에 제공하지 않습니다.",
      referral: "개별 위탁검사 결과는 품질관리 화면에 제공하지 않습니다.",
      history: "개인정보가 없는 오류 유형 집계를 봅니다.",
      dashboard: "개인정보가 제거된 품질 지표와 오류 유형만 봅니다.",
    },
  };
  return <div className="notice-strip role-access-notice"><Info size={17} /><span><strong>{ROLE_PROFILES[role].label} 보기</strong> · {messages[role][area]}</span></div>;
}

function IntroView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  return (
    <div className="view-stack">
      <section className="intro-hero">
        <div className="intro-hero-copy">
          <span className="eyebrow">보건의료정보관리사 중심 업무지원</span>
          <h2>PathoScribe · 폐암 병리 전사·검수 지원</h2>
          <p className="intro-lead">폐암 병리업무의 육안 소견·병리 결과·위탁검사 입력을 원문과 비교하는 교육용 검수 시제품입니다.</p>
          <div className="intro-callouts">
            <StatusChip tone="teal">교육용 시제품</StatusChip>
            <StatusChip tone="warning">공개 합성데이터·가상 자료만 사용</StatusChip>
            <StatusChip tone="danger">진단·판독·공식 의료기록 사용 금지</StatusChip>
          </div>
        </div>
        <div className="intro-hero-side">
          <div className="intro-side-card">
            <span className="eyebrow">서비스 한 문장 소개</span>
            <strong>비정형 가상 원문을 구조화하고 오류 가능성을 표시합니다.</strong>
            <p>보건의료정보관리사가 원문·AI 추출값·확정값을 대조해 최종 확인합니다.</p>
          </div>
          <div className="intro-side-card muted">
            <span className="eyebrow">30초 핵심 흐름</span>
            <strong>사례 선택 → AI 구조화 → 원문 대조 → 담당자 확인</strong>
            <p>첫 방문자는 업무 시연 메뉴에서 고정된 대표 사례를 한 번의 클릭으로 열 수 있습니다.</p>
          </div>
        </div>
      </section>

      <SafetyBanner />

      <section className="intro-task-section" aria-label="세 가지 핵심 병리 전사 업무">
        <div className="intro-task-section-heading">
          <div><span className="eyebrow">핵심 업무</span><h2>세 가지 입력·검수 흐름</h2></div>
          <button className="secondary-button" onClick={() => onNavigate("demo")}>업무 시연에서 확인</button>
        </div>
        <div className="intro-task-grid">
          {INTRO_CORE_TASKS.map((task) => (
            <article className="panel intro-task-card" key={task.title}>
              <h2>{task.title}</h2>
              <p>{task.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel intro-context-panel">
        <div className="panel-heading"><div><span className="eyebrow">제작 배경</span><h2>반복 입력과 수작업 대조를 검수 흐름으로 정리합니다</h2></div></div>
        <ul className="intro-list intro-context-list">
          <li><strong>문제:</strong> 의학용어, 숫자·단위, 좌우, 검체 수를 다시 입력할 때 누락과 오입력이 발생할 수 있습니다.</li>
          <li><strong>지원:</strong> 공개 폐암 합성데이터와 서비스 생성 가상자료를 사용해 원문 근거와 비교 가능한 화면을 제공합니다.</li>
          <li><strong>원칙:</strong> 중요한 누락·불일치는 원문 확인 필요로 남기며, AI는 담당자가 원문을 확인하기 전 자동 확정하지 않습니다.</li>
        </ul>
      </section>
    </div>
  );
}

function DemoView({ activeRole, onSelectRole, onOpenDemo }: { activeRole: ActiveRoleId; onSelectRole: (role: RoleId) => void; onOpenDemo: (view: ViewId) => void }) {
  return (
    <div className="view-stack">
      <section className="panel demo-hero-panel">
        <div className="panel-heading"><div><span className="eyebrow">역할 기반 업무 시연</span><h2>역할을 선택하거나 대표 사례를 바로 열어 보세요</h2></div><StatusChip tone={activeRole ? "teal" : "warning"}>{activeRole ? `현재 보기: ${ROLE_PROFILES[activeRole].label}` : "역할 선택 전"}</StatusChip></div>
        <p className="intro-text">주 사용자는 병리 전사 업무를 수행하는 보건의료정보관리사입니다. 병리의사는 원문 작성·판독 주체로서 전사 내용을 확인하고, 병리 검사 담당자는 검체·검사정보를 제공하며, 품질관리자는 개인정보가 제거된 현황을 조회합니다. PathoScribe의 AI는 원문 구조화와 오류 가능성 제시에만 사용되며 최종 확인은 사용자가 수행합니다.</p>
        <div className="demo-quick-actions">
          <button className="primary-button" onClick={() => onOpenDemo("gross")}><Microscope size={17} />육안 소견 대표 사례</button>
          <button className="secondary-button" onClick={() => onOpenDemo("pathology")}><ClipboardCheck size={17} />병리 결과 대표 사례</button>
          <button className="secondary-button" onClick={() => onOpenDemo("referral")}><FileScan size={17} />위탁검사 대표 사례</button>
        </div>
      </section>
      <section className="panel intro-role-panel">
        <div className="panel-heading"><div><span className="eyebrow">역할별 화면 보기</span><h2>직군별 접근 범위를 확인하세요</h2></div></div>
        <div className="intro-role-grid">
          {(Object.entries(ROLE_PROFILES) as Array<[RoleId, (typeof ROLE_PROFILES)[RoleId]]>).map(([id, profile]) => (
            <button type="button" className={`intro-role-card ${activeRole === id ? "active" : ""}`} aria-pressed={activeRole === id} onClick={() => onSelectRole(id)} key={id}>
              <span className="eyebrow">{profile.shortLabel}</span>
              <h3>{profile.label}</h3>
              <p>{profile.focus}</p>
              <div className="role-mini-list"><strong>대표 가능 작업</strong>{profile.allowed.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div>
              <span className="role-card-action">{activeRole === id ? <><Check size={14} />선택됨</> : <>이 역할로 보기<ChevronRight size={14} /></>}</span>
            </button>
          ))}
        </div>
        <p className="panel-note">역할 선택은 실제 인증이나 권한 부여가 아니라, 교육용 시제품에서 업무 관점을 전환하는 기능입니다.</p>
      </section>
    </div>
  );
}

type EvaluationMetricSummary = { key: string; label: string; value: number | null; numerator: number; denominator: number; direction?: "higher_is_better" | "lower_is_better" };
type EvaluationResultSummary = {
  available: boolean;
  latest: null | {
    evaluatedAt: string;
    model: string;
    promptVersion: string;
    caseVersion: string;
    totalCases: number;
    successCases: number;
    failedCases: number;
    excludedCases: number;
    metrics: EvaluationMetricSummary[];
    displayedMetricKeys: string[];
    detail?: {
      byCaseType?: Record<string, { totalCases: number; successCases: number; failedCases: number; excludedCases: number; latencyMs: number }>;
      errorTypeResults?: Array<{ code: string; expected: number; evaluated: number; detected: number }>;
      methodComparison?: Record<string, { evaluated: boolean; reason?: string; description?: string }>;
      evaluationExclusions?: Record<string, string | number>;
      representativeSuccessCases?: string[];
      representativeFailureCases?: string[];
      normalization?: Record<string, string>;
      limitations?: string[];
    };
  };
  disclaimer?: string;
};

function formatEvaluationRate(metric: EvaluationMetricSummary) {
  return metric.value === null || metric.denominator === 0 ? "N/A" : `${(metric.value * 100).toFixed(1)}%`;
}

function EvaluationSummary() {
  const [result, setResult] = useState<EvaluationResultSummary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/evaluation/results", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("result_status_unavailable")))
      .then((data) => active && setResult(data as EvaluationResultSummary))
      .catch(() => active && setError("평가 결과 상태를 불러오지 못했습니다."));
    return () => { active = false; };
  }, []);

  const latest = result?.latest ?? null;
  const displayedMetrics = latest
    ? latest.displayedMetricKeys.map((key) => latest.metrics.find((metric) => metric.key === key)).filter((metric): metric is EvaluationMetricSummary => Boolean(metric))
    : [];
  const detail = latest?.detail;
  return (
    <article className="panel intro-panel evaluation-verification-panel">
      <div className="panel-heading"><div><span className="eyebrow">AI 검증 요약</span><h2>측정된 결과만 표시</h2></div><StatusChip tone={latest ? "teal" : error ? "danger" : "warning"}>{latest ? "측정 결과 있음" : error || "평가 실행 전"}</StatusChip></div>
      <div className="evaluation-meta-grid">
        <div><span>평가사례</span><strong>{latest ? `${latest.successCases}/${latest.totalCases}건` : "35건"}</strong><small>{latest ? `실패 ${latest.failedCases} · 제외 ${latest.excludedCases}` : "고정 교육용 사례"}</small></div>
        <div><span>사용 모델</span><strong>{latest?.model ?? "평가 실행 전"}</strong><small>{latest ? `실행일 ${latest.evaluatedAt.slice(0, 10)}` : "실행 후 서버 응답으로 기록"}</small></div>
        <div><span>평가 기준</span><strong>ground truth</strong><small>공개 폐암 합성데이터에서 파생</small></div>
      </div>
      {displayedMetrics.length > 0 ? <div className="evaluation-summary-grid evaluation-measured-metrics">{displayedMetrics.map((metric) => <div key={metric.key}><span>{metric.label}</span><strong>{formatEvaluationRate(metric)}</strong><small>{metric.numerator}/{metric.denominator}{metric.direction === "lower_is_better" ? " · 낮을수록 좋음" : ""}</small></div>)}</div> : <p className="panel-note">전체 35건 실시간 평가는 자동 실행하지 않습니다. 명시적으로 실행된 결과가 없으므로 임의 지표를 표시하지 않습니다.</p>}
      <details className="evaluation-details"><summary>상세 평가 보기</summary><div className="service-detail-content">
        {latest ? <>
          <dl className="evaluation-detail-list">{Object.entries(detail?.byCaseType ?? {}).map(([caseType, summary]) => <div key={caseType}><dt>{caseType === "gross" ? "육안 소견" : caseType === "pathology" ? "병리 결과" : "위탁검사"}</dt><dd>성공 {summary.successCases}/{summary.totalCases} · 실패 {summary.failedCases} · 제외 {summary.excludedCases}</dd></div>)}</dl>
          <div className="evaluation-detail-section"><strong>평가 방식</strong>{Object.entries(detail?.methodComparison ?? {}).map(([method, value]) => <p key={method}><b>{method === "ruleBased" ? "규칙 기반" : method === "geminiOnly" ? "Gemini 단독" : "Gemini+규칙 하이브리드"}</b> · {value.evaluated ? value.description ?? "측정됨" : `N/A · ${value.reason ?? "미실행"}`}</p>)}</div>
          <div className="evaluation-detail-section"><strong>오류 유형별 결과</strong>{(detail?.errorTypeResults?.length ?? 0) > 0 ? detail?.errorTypeResults?.map((item) => <p key={item.code}><b>{item.code}</b> · {item.evaluated ? `${item.detected}/${item.evaluated} 탐지` : "N/A · 구현된 직접 매처 없음"}</p>) : <p>N/A · 오류 유형별 측정 결과가 없습니다.</p>}</div>
          <div className="evaluation-detail-section"><strong>대표 사례</strong><p>성공: {detail?.representativeSuccessCases?.join(", ") || "없음"}</p><p>실패: {detail?.representativeFailureCases?.join(", ") || "없음"}</p></div>
          <div className="evaluation-detail-section"><strong>평가 제외·정규화·한계</strong>{Object.entries(detail?.evaluationExclusions ?? {}).map(([key, value]) => <p key={key}>{key}: {String(value)}</p>)}{Object.entries(detail?.normalization ?? {}).map(([key, value]) => <p key={key}>{key}: {value}</p>)}{detail?.limitations?.map((item) => <p key={item}>{item}</p>)}</div>
        </> : <>
          <dl className="evaluation-detail-list"><div><dt>육안 소견</dt><dd>10건 · 정상 4건 · 오류 포함 6건</dd></div><div><dt>병리 결과</dt><dd>15건 · 정상 5건 · 오류 포함 10건</dd></div><div><dt>위탁검사</dt><dd>10건 · 정상 3건 · 오류 포함 7건</dd></div><div><dt>비교 결과</dt><dd>규칙 기반·Gemini 단독·하이브리드 모두 N/A</dd></div></dl><p>전체 평가 실행 전에는 대표 성공·실패 사례, 오류 유형별 결과, 실제 성능 지표를 생성하지 않습니다.</p>
        </>}
        <p>{result?.disclaimer ?? "결과 파일에는 API 키, 전체 내부 프롬프트, 실제 환자정보를 저장하지 않습니다."}</p>
      </div></details>
    </article>
  );
}

function ServiceDescriptionView({ onNavigate, onOpenDemo }: { onNavigate: (view: ViewId) => void; onOpenDemo: (view: ViewId) => void }) {
  return (
    <div className="view-stack">
      <section className="panel service-background-panel">
        <span className="eyebrow">제작 배경</span>
        <h2>반복 입력과 수작업 대조를 검수 흐름으로 정리합니다</h2>
        <p>PathoScribe는 생성형 AI가 병리 판독이나 진단을 대신하는 서비스가 아니라, 병리 결과 입력을 위한 비정형 가상 원문에서 필요한 정보를 구조화하고 보건의료정보관리사가 원문과 대조하도록 지원하는 교육용 검수 시제품입니다.</p>
      </section>

      <section className="service-core-work-panel" aria-label="해결하려는 세 가지 전사업무">
        <div className="panel-heading"><div><span className="eyebrow">해결하려는 세 가지 전사업무</span><h2>입력 단계마다 원문 대조를 지원합니다</h2></div></div>
        <div className="intro-task-grid">
          {INTRO_CORE_TASKS.map((task) => <article className="panel intro-task-card" key={task.title}><h3>{task.title}</h3><p>{task.detail}</p></article>)}
        </div>
      </section>

      <section className="panel intro-problem-panel">
        <div className="panel-heading"><div><span className="eyebrow">문제-기능-기대효과</span><h2>병리 전사 실무의 문제와 화면 기능을 연결했습니다</h2></div></div>
        <div className="intro-problem-table-wrap"><table className="intro-problem-table"><thead><tr><th scope="col">핵심 문제</th><th scope="col">연결된 웹 기능</th><th scope="col">기대효과</th></tr></thead><tbody>{INTRO_PROBLEM_ROWS.map((row) => <tr key={row.problem}><td>{row.problem}</td><td>{row.feature}</td><td>{row.effect}</td></tr>)}</tbody></table></div>
        <p className="panel-note">기대효과는 업무 흐름상 기대되는 변화이며, 정확도 향상률이나 시간 단축률을 실제 측정한 결과로 해석하지 않습니다.</p>
      </section>

      <section className="panel service-ai-panel">
        <div className="panel-heading"><div><span className="eyebrow">생성형 AI를 이렇게 활용했습니다</span><h2>원문 대조가 가능한 네 가지 보조 기능</h2></div></div>
        <div className="service-ai-grid">
          {AI_USAGE_ITEMS.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.detail}</p><button type="button" className="source-action-button" onClick={() => onOpenDemo(item.target)}>{item.action}<ChevronRight size={14} /></button></article>)}
        </div>
      </section>

      <EvaluationSummary />

      <section className="panel service-blocking-error-panel">
        <div className="panel-heading"><div><span className="eyebrow">중요 오류 대응</span><h2>경고 없이 넘어갈 수 있는 누락·불일치를 다시 확인합니다</h2></div></div>
        <p className="service-blocking-intro">PathoScribe는 중요한 오류를 자동으로 해결하거나 의료적 판단을 대신하지 않습니다. 원문 근거와 규칙 검수를 통해 담당자가 다시 확인해야 할 항목을 표시해, 오류가 경고 없이 넘어갈 가능성을 줄이는 교육용 검수 흐름입니다.</p>
        <div className="service-blocking-grid">
          {BLOCKING_ERROR_ITEMS.map((item) => <article key={item.title}><h3>{item.title}</h3><p><strong>예시:</strong> {item.example}</p><p><strong>대응:</strong> {item.response}</p></article>)}
        </div>
        <p className="panel-note">개발 상세 보기에서는 이를 중대 오류(blocking error) 또는 위음성(false negative) 위험으로 설명합니다. 실제 오류 미탐률은 전체 평가를 실행해 측정하기 전까지 수치로 표시하지 않습니다.</p>
      </section>

      <section className="panel service-data-safety-panel">
        <div className="panel-heading"><div><span className="eyebrow">사용 데이터와 안전장치</span><h2>가상 사례와 검증 근거를 명확히 구분합니다</h2></div><button type="button" className="source-action-button" onClick={() => onNavigate("sources")}><Database size={15} />데이터 출처 보기</button></div>
        <ul className="service-data-list">
          <li>국립암센터 폐암 합성데이터를 바탕으로 만든 평가사례</li>
          <li>ICCR 공개 보고항목과 레지스트리 메타정보를 참고한 프로젝트 자체 데이터 스키마</li>
          <li>실제 환자정보가 없는 교육용 가상 원문·위탁검사 자료</li>
          <li>암정보사전·세부진단·면역병리·레지스트리 메타정보를 활용한 로컬 용어 검수</li>
          <li>ground truth 기반 추출·누락·불일치 평가와 실제 실행 결과만 성능 표시</li>
        </ul>
        <div className="service-safety-chips" aria-label="공개 배포 안전장치"><StatusChip tone="teal">API 키 서버 보관</StatusChip><StatusChip tone="teal">가상사례만 실시간 분석</StatusChip><StatusChip tone="warning">사용자 최종 확인</StatusChip><StatusChip tone="danger">실제 환자정보 입력 금지</StatusChip></div>
        <SafetyBanner />
        <div className="intro-pill-list service-scope-pills">{INTRO_NOT_THIS.map((item) => <span key={item}>{item}</span>)}</div>
      </section>

      <details className="panel service-detail-panel">
        <summary>개발 상세 보기</summary>
        <div className="service-detail-content">
          <section><h3>Gemini 구조화와 응답 검증</h3><p>서버 Route가 <code>GEMINI_MODEL</code> 환경변수의 모델을 호출하며, 미설정 시 코드 기본값은 <code>gemini-3.6-flash</code>입니다. 응답은 JSON Schema로 허용된 필드 키·필수 키·추가 키 금지를 검사하고, 런타임에서 중복·누락 필드를 다시 검증합니다.</p><p>각 추출 필드는 <code>value</code>, <code>evidenceText</code>, <code>status</code>로 정리합니다. 원문 근거가 없거나 원문에 없는 항목은 <code>value: null</code>, <code>evidenceText: null</code>, <code>status: not_found</code>으로 정규화합니다.</p></section>
          <section><h3>구조화 템플릿과 용어 검수</h3><p>병리 결과 화면은 검체·장기·좌우·부위·시술·수술·진단·조직학적 유형·종양 크기·분화도·절제연·림프절·면역병리·분자병리·원문 병기 필드를 자체 템플릿으로 배치합니다. AI 추출값, 템플릿 배치값, 담당자 확정값은 서로 다른 상태로 유지합니다.</p><p>확정값은 항목 성격에 따라 교육용 선택 후보 또는 원문 표기 직접 입력을 사용합니다. 장기·부위·진단·유형·분화도는 필요한 경우 `기타 직접 입력`을 제공하지만, 좌우·절제연·pT/pN/pM·Stage는 원문에서 추출된 값 또는 `확인 필요`만 직접 선택합니다.</p><p><code>lib/medical-term-review.ts</code>는 암정보사전 고정 스냅샷, 세부진단·면역병리 참고 데이터, 레지스트리 메타정보, 프로젝트 용어·평가사례 목록을 정규화하고 편집거리 후보를 계산합니다. 기존 Gemini 응답의 원문 근거를 함께 표시하며 별도의 외부 용어 API나 추가 Gemini 호출은 사용하지 않습니다.</p><p>단순 철자 후보는 담당자가 적용할 때만 확정값에 복사됩니다. 양성·음성, 좌우, 병기, 크기·단위, 절제연, 림프절, 유전자·면역표지자, 검사번호·검체명은 자동수정하지 않고 원문 확인 상태로 남깁니다.</p></section>
          <section><h3>환각 방지와 RAG 범위</h3><p>Gemini 프롬프트는 원문에 명시된 값만 추출하고 진단·병기 산출·치료 권고를 하지 않도록 제한합니다. 반환된 근거 구절이 원문에 실제로 존재하는지 서버에서 다시 확인합니다.</p><p>RAG 검색은 암정보사전 고정 스냅샷, 폐암 레지스트리 메타정보, 세부진단·면역병리 참고 데이터, 서비스 교육용 데이터 항목·안전정책으로 제한합니다. 근거 자료에 없는 내용은 답변하지 않으며 특정 기관의 실제 내부 지침으로 표현하지 않습니다.</p></section>
          <section><h3>규칙 기반 검수와 중요 오류 대응</h3><p>규칙은 필수항목, 날짜 형식, 숫자·단위, 좌우, 분자·분모를 점검하고, 위탁검사에서는 검사번호·검사명·검체명·접수일·보고일·결과를 가상 내부 의뢰정보와 대조합니다. 이 서비스에서 중대 오류(blocking error) 또는 위음성(false negative) 위험은 원문에 존재하는 중요한 누락·불일치가 경고 없이 넘어가는 경우입니다.</p><p>양성·음성, 좌우, 병기, 크기·단위, 절제연, 림프절, 면역표지자·유전자 결과, 검사번호·검체명은 자동수정하지 않고 원문 확인으로 남깁니다. 이 장치는 오류를 자동으로 해결하거나 오류 미탐을 0으로 보장하지 않습니다.</p><p>공개 배포에서는 고정 <code>caseId</code>와 서비스 제공 가상 문서만 허용하고, 요청 크기와 호출 횟수를 제한합니다. API 키는 서버에만 보관하며, Gemini 호출 실패 시 저장된 예시를 실시간 결과처럼 반환하지 않고 실패 상태를 표시합니다.</p></section>
          <section><h3>평가 기록</h3><p><code>promptVersion</code>, <code>caseVersion</code>, 응답시간, 실행 시각은 안전한 응답 메타정보로만 기록합니다. 35건 전체 평가는 개발 환경에서 명시적으로 실행할 때만 수행하며, 평가 결과에는 실제로 계산된 지표만 표시합니다.</p></section>
        </div>
      </details>

      <section className="panel service-next-panel"><div><span className="eyebrow">다음 단계</span><h2>대표 사례와 서비스 설명을 직접 확인하세요</h2></div><div className="intro-actions"><button className="primary-button" onClick={() => onNavigate("demo")}><Sparkles size={17} />업무 시연 열기</button><button className="secondary-button" onClick={() => onNavigate("sources")}><Database size={17} />데이터 출처 보기</button><button className="secondary-button" onClick={() => window.print()}><Download size={17} />서비스 설명 PDF 저장</button></div></section>
    </div>
  );
}

function DataCatalogView() {
  const grouped = DATA_CATALOG.reduce<Record<string, Array<(typeof DATA_CATALOG)[number]>>>((groups, entry) => {
    groups[entry.origin] ??= [];
    groups[entry.origin].push(entry);
    return groups;
  }, {});

  return (
    <div className="view-stack">
      <SafetyBanner />
      <div className="notice-strip">
        <Info size={17} />
        <span>이 화면은 서비스에 저장된 공개자료, 공공 API 스냅샷, 서비스 생성 가상자료를 구분합니다. API 키 값은 표시하지 않습니다.</span>
      </div>

      <section className="metric-grid data-source-metrics" aria-label="데이터 카탈로그 요약">
        <Metric label="카탈로그 항목" value={String(DATA_CATALOG.length)} detail="문서와 화면 동일 기준" icon={Database} accent="teal" />
        <Metric label="공공 API 스냅샷" value={String(DATA_CATALOG.filter((entry) => entry.origin === "공공 API 스냅샷").length)} detail="집계 데이터로만 사용" icon={FileCheck2} accent="blue" />
        <Metric label="미연결 API" value={String(DATA_CATALOG.filter((entry) => entry.origin === "미연결 API").length)} detail="임의 응답 표시 금지" icon={AlertTriangle} accent="amber" />
        <Metric label="가상자료" value={String(DATA_CATALOG.filter((entry) => entry.origin === "서비스 생성 가상데이터").length)} detail="실제 환자정보 없음" icon={ShieldCheck} accent="coral" />
      </section>

      {Object.entries(grouped).map(([origin, entries]) => (
        <section className="panel data-catalog-panel" key={origin}>
          <div className="panel-heading">
            <div><span className="eyebrow">데이터 구분</span><h2>{origin}</h2></div>
            <StatusChip tone={origin === "미연결 API" ? "warning" : origin === "서비스 생성 가상데이터" ? "teal" : "success"}>{entries.length}개</StatusChip>
          </div>
          <div className="data-catalog-list">
            {entries.map((entry) => (
              <article className="data-catalog-card" key={entry.id}>
                <div className="data-catalog-card-head">
                  <div>
                    <span className="eyebrow">{entry.provider}</span>
                    <h3>{entry.name}</h3>
                  </div>
                  <StatusChip tone={entry.origin === "미연결 API" ? "warning" : "teal"}>{entry.format}</StatusChip>
                </div>
                <dl className="data-catalog-fields">
                  <div><dt>위치/API</dt><dd>{entry.location}</dd></div>
                  <div><dt>건수</dt><dd>{entry.records}</dd></div>
                  <div><dt>갱신 방식</dt><dd>{entry.updateMethod}</dd></div>
                  <div><dt>단위</dt><dd>{entry.granularity}</dd></div>
                  <div><dt>사용 화면</dt><dd>{entry.screens.join(", ")}</dd></div>
                  <div><dt>기준일</dt><dd>{entry.referenceDate}</dd></div>
                  <div><dt>목적</dt><dd>{entry.purpose}</dd></div>
                  <div><dt>한계</dt><dd>{entry.limitations}</dd></div>
                </dl>
                <div className="api-source-line data-source-line">
                  <span>{entry.sourceUrl}</span>
                  {entry.sourceUrl.startsWith("http") && <a href={entry.sourceUrl} target="_blank" rel="noreferrer">출처 열기 <ExternalLink size={12} /></a>}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

type SessionReview = { edited: boolean; issueTitles: string[] };
type LinkedReviewContext = {
  view: "gross" | "pathology" | "referral";
  orderId: string;
  sourceRowId: string;
  evaluationCaseId: string;
};

type DiagnosisReferenceResponse = {
  candidates: Array<{ code: string; name: string; raw: string; observedRows: number; centers: string[]; years: string[] }>;
  source: { provider: string; service: string; sourcePage: string; fetchedAt: string; apiRows: number; uniqueTargets: number; filters: { centerNm: string; fromYear: string; toYear: string } };
  disclaimer: string;
};

type StageReferenceResponse = {
  candidates: Array<{ value: string; observedRows: number; observedCountSum: number; patientCountSum: number; years: string[] }>;
  quality: { referenceAvailable: boolean; warning: string | null };
  source: { provider: string; service: string; sourcePage: string; fetchedAt: string; apiRows: number; namedRows: number; uniqueTargets: number; filters: { centerNm: string; fromYear: string; toYear: string } };
  disclaimer: string;
};

type EvaluationTruthField = { key: string; label: string; value: string | null; evidenceText: string | null; status: "extracted" | "needs_review" | "missing"; sourceType: "public_synthetic" | "generated_demo" };
type EvaluationCase = {
  caseId: string;
  caseType: "gross" | "pathology" | "outsourced";
  scenario: "normal" | "error";
  sourceType: "generated_demo";
  sourceRowId: string;
  templateVersion: string;
  inputText: string;
  groundTruth: { expectedExtraction: EvaluationTruthField[]; referenceFields: EvaluationTruthField[] };
  injectedErrors: Array<{ code: string; fieldKeys: string[]; description: string }>;
  expectedWarnings: Array<{ code: string; fieldKeys: string[]; description: string }>;
  disclaimer: string;
};
type EvaluationCasesResponse = { fixtureVersion: string; generationMode: string; cases: EvaluationCase[]; disclaimer: string };
type GeminiRuntimeStatus = { publicDeployment: boolean; demoMode: boolean; canAnalyze: boolean; liveAvailable: boolean; reason: string | null; disclaimer: string };
type EvaluationComparisonStatus = "exact" | "missing" | "mismatch" | "generated";
type ReferralFixtureMeta = { id: string; label: string; file_name: string; asset_path: string; format: "pdf" | "image"; quality: "readable" | "poor"; watermark: string; evaluation_case_id: string };
type ReferralComparison = { key: string; label: string; extracted: string | null; expected: string; status: "match" | "mismatch" | "missing" };
type ReferralCompareResponse = {
  fixture: { id: string; label: string; fileName: string; assetPath: string; format: "pdf" | "image"; quality: "readable" | "poor"; watermark: string };
  extracted: Record<string, string | null>;
  internal: { order_id: string; institution: string; test_name: string; specimen: string; received_date: string; reported_date: string; amendment_status: string; expected_result: string; reference_note: string };
  comparisons: ReferralComparison[];
  ruleIssues: ReviewIssue[];
  overall: "match" | "mismatch" | "needs_review";
  revisedReport: { status: "not_marked" | "needs_review" | "revised"; label: string; evidence: string | null };
  disclaimer: string;
};
type GeminiReferralExtractResponse = {
  mode: "gemini";
  fields: Array<{ key: string; label: string; value: string | null; evidenceText: string | null; status: "extracted" | "needs_review" | "not_found" }>;
  ruleIssues: ReviewIssue[];
  disclaimer: string;
  model?: string;
  latencyMs?: number;
  promptVersion?: string;
  caseVersion?: string;
  evaluatedAt?: string;
};

function normalizeEvaluationValue(value: string | null | undefined) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function evaluationComparisonStatus(actual: string | null | undefined, expected: string | null | undefined): EvaluationComparisonStatus {
  if (expected === null || expected === undefined) return actual === null || actual === undefined || actual.trim() === "" ? "exact" : "generated";
  if (actual === null || actual === undefined || actual.trim() === "") return "missing";
  return normalizeEvaluationValue(actual) === normalizeEvaluationValue(expected) ? "exact" : "mismatch";
}

function evaluationStatusLabel(status: EvaluationComparisonStatus) {
  return status === "exact" ? "정확 일치" : status === "missing" ? "누락" : status === "mismatch" ? "불일치" : "원문 밖 생성값";
}

function evaluationDisplayLabel(status: EvaluationComparisonStatus, errorCase: boolean) {
  return errorCase && status === "exact" ? "원문 추출 일치" : evaluationStatusLabel(status);
}

function evaluationStatusTone(status: EvaluationComparisonStatus) {
  return status === "exact" ? "success" as const : status === "missing" ? "warning" as const : "danger" as const;
}

function evaluationWarningValueSummary(
  warning: EvaluationCase["expectedWarnings"][number],
  fields: ExtractedField[],
  referenceFields: Map<string, EvaluationTruthField>,
) {
  return warning.fieldKeys.map((key) => {
    const field = fields.find((candidate) => candidate.key === key);
    const reference = referenceFields.get(key)?.value ?? null;
    const actual = field?.value ?? null;
    const label = field?.label ?? referenceFields.get(key)?.label ?? key;
    const actualText = actual ?? "null · 확인 필요";
    const referenceText = reference && normalizeEvaluationValue(actual) !== normalizeEvaluationValue(reference)
      ? ` (기준: ${reference})`
      : "";
    return `${label}: ${actualText}${referenceText}`;
  }).join(" / ");
}

function evaluationWarningEvidenceSummary(
  warning: EvaluationCase["expectedWarnings"][number],
  fields: ExtractedField[],
) {
  const evidence = warning.fieldKeys.map((key) => {
    const field = fields.find((candidate) => candidate.key === key);
    return field?.evidenceText ?? field?.evidence ?? field?.value ?? null;
  }).filter((value): value is string => Boolean(value));
  return evidence.length ? evidence.join(" / ") : "원문 근거 없음";
}

function exportDashboardSummary(sessionReviewed: number, sessionEdited: number) {
  const rows = [
    ["지표", "값"],
    ["공개 합성 레코드", NCC_LUNG_SUMMARY.records.total],
    ["EGFR 유효 결과율", `${(NCC_LUNG_DERIVED.egfrKnownRate * 100).toFixed(1)}%`],
    ["현재 세션 검수 건수", sessionReviewed],
    ["현재 세션 수정 건수", sessionEdited],
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "pathoscribe-dashboard-summary.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function Dashboard({ sessionReviewed, sessionEdited, sessionIssues, onNavigate, role }: { sessionReviewed: number; sessionEdited: number; sessionIssues: Record<string, number>; onNavigate: (view: ViewId) => void; role: RoleId }) {
  const [diagnosisFilter, setDiagnosisFilter] = useState("");
  const editRate = sessionReviewed ? Math.round((sessionEdited / sessionReviewed) * 100) : 0;
  const histologyMax = Math.max(...NCC_LUNG_SUMMARY.histologyFlags.map((item) => item.count));
  const diagnosisTargets = NCC_LUNG_DIAGNOSIS_REFERENCE.targets
    .filter((item) => `${item.code} ${item.name} ${item.raw}`.toLowerCase().includes(diagnosisFilter.toLowerCase()))
    .slice(0, 5);
  const diagnosisMax = Math.max(1, ...diagnosisTargets.map((item) => item.observedRows));
  const immunopathologyTargets = NCC_LUNG_IMMUNOPATHOLOGY.targets.slice(0, 4);
  const immunopathologyMax = Math.max(1, ...immunopathologyTargets.map((item) => item.observedCountSum));
  const issueEntries = Object.entries(sessionIssues).sort((left, right) => right[1] - left[1]).slice(0, 4);
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const sameRow = NCC_LUNG_LINKAGE.statistics.sameRowAssociations;
  return (
    <div className="view-stack">
      <RoleAccessNotice role={role} area="dashboard" />
      <div className="view-toolbar">
        <div><span className="eyebrow">세션 집계</span><strong>원문·질문·결과는 저장하지 않습니다.</strong></div>
        <div className="toolbar-actions">
          <SourceActionButton sourceId="ncc-lung-synthetic-xlsx" onNavigate={onNavigate} />
          <button className="secondary-button" onClick={() => exportDashboardSummary(sessionReviewed, sessionEdited)}><Download size={16} />집계 CSV 내보내기</button>
        </div>
      </div>
      <div className="notice-strip">
        <Info size={17} />
        <span>국립암센터 폐암 공개 합성데이터 15,000행을 집계했습니다. 조직형과 병기는 독립 플래그이므로 단일 진단 분류로 해석하지 않습니다.</span>
      </div>

      <section className="metric-grid" aria-label="주요 품질 지표">
        <Metric label="공개 합성 레코드" value={NCC_LUNG_SUMMARY.records.total.toLocaleString()} detail="훈련 10,000 · 테스트 5,000" icon={Database} accent="coral" />
        <Metric label="EGFR 유효 결과" value={percent(NCC_LUNG_DERIVED.egfrKnownRate)} detail={`${NCC_LUNG_SUMMARY.completeness.egfrKnown.toLocaleString()}건 · 0/1 코드`} icon={CheckCircle2} accent="teal" />
        <Metric label="세션 검수 건수" value={String(sessionReviewed)} detail="브라우저 종료 시 초기화" icon={ClipboardCheck} accent="blue" />
        <Metric label="AI 결과 수정률" value={`${editRate}%`} detail={`${sessionEdited}건 수정 · 내용 미저장`} icon={Sparkles} accent="amber" />
      </section>

      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">폐암 합성데이터</span><h2>조직학적 진단 플래그 건수</h2></div>
            <StatusChip tone="teal">실데이터 집계</StatusChip>
          </div>
          <div className="bar-chart" aria-label="조직학적 진단 플래그 건수 막대 차트">
            {NCC_LUNG_SUMMARY.histologyFlags.map(({ label, count }) => (
              <div className="bar-row" key={label}>
                <span>{label}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round((count / histologyMax) * 100)}%` }} /></div><strong>{count.toLocaleString()}</strong>
              </div>
            ))}
          </div>
          <p className="panel-note">한 행에서 여러 조직형 플래그가 동시에 1일 수 있어 합계가 전체 레코드 수보다 큽니다.</p>
        </section>

        <section className="panel missing-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">완결성</span><h2>빈칸·의미상 미제공</h2></div>
            <CircleHelp size={18} aria-label="코드북 기준" />
          </div>
          <div className="missing-list">
            {[["실제 빈 셀", "0.0%", "low"], ["EGFR 해당사항 없음(99)", percent(NCC_LUNG_DERIVED.egfrNotApplicableRate), "high"], ["3개 조직형 모두 미표시", percent(NCC_LUNG_DERIVED.histologyUnflaggedRate), "medium"], ["면역병리 종류명", NCC_LUNG_IMMUNOPATHOLOGY.statistics.unnamedRows.toLocaleString() + "행 결측", "high"]].map(([name, value, level]) => (
              <div className="missing-row" key={name}><span className={`risk-dot ${level}`} /><span>{name}</span><strong>{value}</strong></div>
            ))}
          </div>
          <p className="panel-note">코드 99는 실제 빈 셀이 아니라 코드북상 ‘해당사항 없음’입니다.</p>
        </section>

        <section className="panel connection-panel linkage-panel">
          <div className="panel-heading"><div><span className="eyebrow">동일 원본 행 분석</span><h2>외과병리·분자병리 연관 현황</h2></div><StatusChip tone="warning">임상 연결 아님</StatusChip></div>
          <div className="connection-visual">
            <div className="donut" style={{ "--percent": Math.round(NCC_LUNG_LINKAGE_DERIVED.egfrKnownRate * 100) } as React.CSSProperties}>
              <div><strong>{percent(NCC_LUNG_LINKAGE_DERIVED.egfrKnownRate)}</strong><span>EGFR 유효값</span></div>
            </div>
            <div className="legend-list">
              <div><span className="legend teal" /><span>EGFR 0/1</span><strong>{sameRow.egfrKnown.toLocaleString()}건</strong></div>
              <div><span className="legend blue" /><span>+ 조직형 플래그</span><strong>{sameRow.egfrKnownWithHistologyFlag.toLocaleString()}건</strong></div>
              <div><span className="legend amber" /><span>+ 수술=1 + 조직형</span><strong>{sameRow.egfrKnownWithOperationAndHistologyFlag.toLocaleString()}건</strong></div>
              <div><span className="legend gray" /><span>임상 확정 연결</span><strong>{sameRow.clinicallyConfirmedLinks}건</strong></div>
            </div>
          </div>
          <div className="source-mapping" aria-label="원본 컬럼 매핑">
            <div><span>행 식별자</span><code>{NCC_LUNG_LINKAGE.mapping.sourceRecordId.expression}</code></div>
            <div><span>분자 관찰</span><code>{NCC_LUNG_LINKAGE.mapping.molecularObservation.sourceHeaders[0]}</code></div>
          </div>
          <p className="panel-note">원본에는 검체·블록·보고서·검사 ID가 없어 임상 관계를 확정할 수 없습니다. 별도 가상 연결 화면의 <code>ORD/SPC/BLK/RPT</code> 계열 ID는 시제품용입니다.</p>
          <div className="availability-list compact-availability">
            {NCC_LUNG_IMMUNOPATHOLOGY.quality.distributionAvailable
              ? <div><CheckCircle2 size={17} /><span><strong>면역병리 검사 분포</strong><small>{NCC_LUNG_IMMUNOPATHOLOGY.statistics.uniqueTargets}개 종류 집계</small></span></div>
              : <div className="unavailable"><AlertTriangle size={17} /><span><strong>면역병리 검사 분포</strong><small>API 연결됨 · 종류명 전 행 결측</small></span></div>}
          </div>
        </section>

        <section className="panel diagnosis-api-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">폐암 세부진단 API</span><h2>세부진단 필터와 참고 후보</h2></div>
            <SourceActionButton sourceId="lung13-diagnosis-reference" onNavigate={onNavigate} label="세부진단 출처" />
          </div>
          <label className="reference-filter"><Search size={16} /><input value={diagnosisFilter} onChange={(event) => setDiagnosisFilter(event.target.value)} placeholder="진단명, 코드, 통계 대상명 필터" /></label>
          <div className="bar-chart compact-bars" aria-label="세부진단 종류별 공개 집계 후보">
            {diagnosisTargets.map((item) => (
              <div className="bar-row" key={item.raw}>
                <span title={item.raw}>{item.code}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round((item.observedRows / diagnosisMax) * 100)}%` }} /></div>
                <strong>{item.observedRows.toLocaleString()}</strong>
              </div>
            ))}
          </div>
          <p className="panel-note">진단명 검색과 참고 후보를 보여주는 집계 화면입니다. 개인 진단을 자동 결정하거나 입력값을 자동 치환하지 않습니다.</p>
        </section>

        <section className="panel stage-api-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">병기 문자열 형식 참조</span><h2>pT·pN·pM 입력 형식 검수 범위</h2></div>
            <SourceActionButton sourceId="iaslc-lung-tnm-9th-format-reference" onNavigate={onNavigate} label="9판 형식 출처" />
          </div>
          <div className="stage-format-grid">
            {STAGE_FIELD_DEFINITIONS.map((field) => <div key={field.key}><span>{field.label}</span><strong>{STAGE_FORMAT_EXAMPLES[field.key]}</strong><small>원문 명시값만 추출</small></div>)}
          </div>
          <div className="api-source-line"><span>IASLC/AJCC 폐암 TNM 9판 · 교육용 문자열 형식 참조</span><a href={IASLC_LUNG_TNM_9TH_FORMAT_REFERENCE.sourceUrl} target="_blank" rel="noreferrer">IASLC 출처 <ExternalLink size={12} /></a></div>
          <div className="api-quality-empty compact-quality">
            <AlertTriangle size={20} />
            <div>
              <strong>공공 병기값 API 응답 {NCC_LUNG_PATHOLOGIC_STAGES.statistics.apiRows.toLocaleString()}행 중 병기값 통계 대상명 {NCC_LUNG_PATHOLOGIC_STAGES.statistics.namedRows.toLocaleString()}행</strong>
              <p>{NCC_LUNG_PATHOLOGIC_STAGES.quality.warning ?? "집계 참고만 제공하며 TNM 조합 규칙은 구현하지 않습니다."}</p>
            </div>
          </div>
          <p className="panel-note">9판 자료는 pN2a·pN2b·pM1c1·pM1c2처럼 원문에 적힌 문자열의 형식 검수에만 사용합니다. 자동 병기 판정, 병기 계산, 최종 Stage 산출에는 사용하지 않습니다.</p>
        </section>

        <section className="panel immunopathology-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">공공데이터 API</span><h2>면역병리 검사 종류 분포</h2></div>
            <div className="heading-actions">
              <SourceActionButton sourceId="lung18-immunopathology" onNavigate={onNavigate} label="면역병리 출처" />
              <StatusChip tone={NCC_LUNG_IMMUNOPATHOLOGY.quality.distributionAvailable ? "teal" : "warning"}>
                {NCC_LUNG_IMMUNOPATHOLOGY.quality.distributionAvailable ? "집계 가능" : "원천 결측"}
              </StatusChip>
            </div>
          </div>
          {immunopathologyTargets.length ? (
            <div className="bar-chart" aria-label="면역병리 검사 종류별 관찰 건수 막대 차트">
              {immunopathologyTargets.map(({ name, observedCountSum }) => (
                <div className="bar-row immunopathology-row" key={name}>
                  <span title={name}>{name}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: String(Math.round((observedCountSum / immunopathologyMax) * 100)) + "%" }} /></div>
                  <strong>{observedCountSum.toLocaleString()}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="api-quality-empty">
              <AlertTriangle size={22} />
              <div>
                <strong>종류별 분포를 계산할 수 없습니다</strong>
                <p>국립암센터 2010~2019 응답 {NCC_LUNG_IMMUNOPATHOLOGY.statistics.apiRows.toLocaleString()}행의 <code>statsTrgtNm</code>이 모두 비어 있습니다. 검사명을 추정하거나 보완하지 않습니다.</p>
              </div>
            </div>
          )}
          <div className="api-source-line">
            <span>{NCC_LUNG_IMMUNOPATHOLOGY.filters.fromYear}~{NCC_LUNG_IMMUNOPATHOLOGY.filters.toYear} · {NCC_LUNG_IMMUNOPATHOLOGY.source.provider}</span>
            <a href={NCC_LUNG_IMMUNOPATHOLOGY.source.sourcePage} target="_blank" rel="noreferrer">공식 출처 <ExternalLink size={12} /></a>
          </div>
          <p className="panel-note">개별 검사 결과가 아닌 집계 자료이며 진단, 판독 또는 입력 결과의 진위 판정에는 사용하지 않습니다.</p>
        </section>

        <section className="panel registry-metadata-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">폐암 레지스트리 메타정보</span><h2>외과병리 항목 보고 비율</h2></div>
            <StatusChip tone="teal">실제 컬럼 정의</StatusChip>
          </div>
          <div className="bar-chart registry-bars" aria-label="외과병리 메타정보상 항목 보고 비율">
            {NCC_LUNG_REGISTRY_DERIVED.dashboardFields.map((field) => (
              <div className="bar-row" key={field.columnId}>
                <span title={`${field.columnName} (${field.columnId})`}>{field.label}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round(field.reportedAvailabilityRate * 100)}%` }} /></div>
                <strong>{percent(field.reportedAvailabilityRate)}</strong>
              </div>
            ))}
          </div>
          <p className="panel-note"><code>colCnt</code>를 외과병리 <code>PT_SBST_NO</code> 보고 건수 {NCC_LUNG_REGISTRY_DERIVED.surgicalPathologyBaseCount.toLocaleString()}건과 비교한 값입니다. 공식 산정 정의가 없어 결측률이나 환자 비율로 해석하지 않습니다.</p>
          <div className="api-source-line"><span>{NCC_LUNG_REGISTRY_METADATA.statistics.metadataRows}개 필드 · {NCC_LUNG_REGISTRY_METADATA.statistics.tables}개 테이블</span><span>국립암센터 · 로컬 CSV</span></div>
        </section>

        <section className="panel issue-panel">
          <div className="panel-heading"><div><span className="eyebrow">세션 검수 패턴</span><h2>발견된 오류 유형</h2></div><BarChart3 size={18} /></div>
          {issueEntries.length ? <div className="issue-bars">
            {issueEntries.map(([label, value], index) => (
              <div key={label}><div className="issue-label"><span>{index + 1}. {label}</span><strong>{value}건</strong></div><div className="thin-track"><span style={{ width: `${Math.max(12, (value / issueEntries[0][1]) * 100)}%` }} /></div></div>
            ))}
          </div> : <div className="empty-state compact"><div className="empty-icon"><BarChart3 size={25} /></div><h3>아직 집계된 검수 오류가 없습니다</h3><p>오류 내용은 저장하지 않고 현재 브라우저 세션의 유형별 건수만 표시합니다.</p></div>}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, detail, icon: Icon, accent }: { label: string; value: string; detail: string; icon: typeof Database; accent: string }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${accent}`}><Icon size={20} /></div>
      <span>{label}</span><strong>{value}</strong><small>{detail}</small>
    </div>
  );
}

function DiagnosisReference({ diagnosis }: { diagnosis: string }) {
  const [response, setResponse] = useState<DiagnosisReferenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchedDiagnosis, setSearchedDiagnosis] = useState("");
  const isCurrentResult = searchedDiagnosis === diagnosis;

  async function compare() {
    setLoading(true);
    setError("");
    setSearchedDiagnosis(diagnosis);
    try {
      const result = await fetch("/api/reference-diagnoses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosis }),
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error ?? "공공 진단 참조 대조에 실패했습니다.");
      setResponse(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "공공 진단 참조 대조에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="diagnosis-reference">
      <div className="reference-heading">
        <div><span className="eyebrow">공공 통계 참조</span><h3>세부진단 분류 대조</h3></div>
        <button className="reference-button" disabled={!diagnosis || loading} onClick={compare}>{loading ? <span className="spinner" /> : <ListChecks size={16} />}{loading ? "대조 중" : "참조 목록 대조"}</button>
      </div>
      <p className="reference-intro">국립암센터 폐암 환자 집계에 등장한 ICD 계열 통계 대상명과만 비교합니다. 결과를 입력란에 자동 반영하지 않습니다.</p>
      {isCurrentResult && error && <div className="inline-error"><AlertCircle size={17} />{error}</div>}
      {isCurrentResult && response && (
        <div className="reference-results">
          {response.candidates.length ? response.candidates.map((candidate) => (
            <div className="reference-row" key={candidate.raw}>
              <StatusChip tone="teal">{candidate.code}</StatusChip>
              <span><strong>{candidate.name}</strong><small>공공 집계 관찰 {candidate.observedRows.toLocaleString()}행 · {candidate.years[0]}~{candidate.years.at(-1)}</small></span>
            </div>
          )) : <div className="reference-empty"><AlertTriangle size={18} /><span><strong>직접 일치하는 통계 대상명이 없습니다.</strong><small>입력한 진단명이 틀렸다는 의미가 아니며, 담당자가 원문과 기관 지침을 확인해야 합니다.</small></span></div>}
          <div className="reference-source">
            <span>{response.source.provider} · {response.source.service} · {response.source.apiRows.toLocaleString()}개 집계행 / {response.source.uniqueTargets}개 대상</span>
            <a href={response.source.sourcePage} target="_blank" rel="noreferrer">공식 출처 <ExternalLink size={13} /></a>
          </div>
          <p className="reference-warning"><ShieldCheck size={15} />{response.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

function StageReference({ stage }: { stage: string }) {
  const [response, setResponse] = useState<StageReferenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchedStage, setSearchedStage] = useState("");
  const isCurrentResult = searchedStage === stage;

  async function compare() {
    setLoading(true);
    setError("");
    setSearchedStage(stage);
    try {
      const result = await fetch("/api/reference-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error ?? "공공 병기값 참조 대조에 실패했습니다.");
      setResponse(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "공공 병기값 참조 대조에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="diagnosis-reference">
      <div className="reference-heading">
        <div><span className="eyebrow">공공 통계 참고</span><h3>병기 문자열 참고 대조</h3></div>
        <button className="reference-button" disabled={!stage || loading} onClick={compare}>{loading ? <span className="spinner" /> : <ListChecks size={16} />}{loading ? "대조 중" : "문자열 참고"}</button>
      </div>
      <p className="reference-intro">9판 교육용 형식 참조로 원문 문자열의 허용 여부를 확인하고, 로컬 공공 집계에 관찰되는지만 별도로 참고합니다. 병기를 계산하거나 입력란에 자동 반영하지 않습니다.</p>
      {isCurrentResult && error && <div className="inline-error"><AlertCircle size={17} />{error}</div>}
      {isCurrentResult && response && (
        <div className="reference-results">
          {response.candidates.length ? response.candidates.map((candidate) => (
            <div className="reference-row" key={candidate.value}>
              <StatusChip tone="teal">{candidate.value}</StatusChip>
              <span><strong>공공 집계에서 관찰된 병기값</strong><small>{candidate.observedRows.toLocaleString()}행 · {candidate.years[0]}~{candidate.years.at(-1)}</small></span>
            </div>
          )) : (
            <div className="reference-empty">
              <AlertTriangle size={18} />
              <span>
                <strong>{response.quality.referenceAvailable ? "직접 일치하는 병기값이 없습니다." : "공식 API의 병기값 필드가 비어 있습니다."}</strong>
                <small>{response.quality.warning ?? "입력값이 틀렸다는 의미가 아닙니다. 원문과 기관 지침을 확인하세요."}</small>
              </span>
            </div>
          )}
          <div className="reference-source">
            <span>{response.source.provider} · {response.source.apiRows.toLocaleString()}개 집계행 / 병기값 존재 {response.source.namedRows.toLocaleString()}행</span>
            <a href={IASLC_LUNG_TNM_9TH_FORMAT_REFERENCE.sourceUrl} target="_blank" rel="noreferrer">9판 형식 출처 <ExternalLink size={13} /></a>
          </div>
          <p className="reference-warning"><ShieldCheck size={15} />{STAGE_REVIEW_DISCLAIMER} {response.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

function ImmunopathologyGuide({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const [marker, setMarker] = useState<(typeof IMMUNOPATHOLOGY_MARKER_GUIDE)[number]["marker"]>("TTF-1");
  const selected = IMMUNOPATHOLOGY_MARKER_GUIDE.find((item) => item.marker === marker) ?? IMMUNOPATHOLOGY_MARKER_GUIDE[0];
  return (
    <div className="diagnosis-reference immunopathology-guide">
      <div className="reference-heading">
        <div><span className="eyebrow">면역병리 입력 형식 안내</span><h3>마커별 필터와 담당자 입력칸</h3></div>
        <SourceActionButton sourceId="lung18-immunopathology" onNavigate={onNavigate} label="면역병리 출처" />
      </div>
      <div className="marker-filter" role="list" aria-label="면역병리 마커 필터">
        {IMMUNOPATHOLOGY_MARKER_GUIDE.map((item) => (
          <button type="button" className={marker === item.marker ? "active" : ""} key={item.marker} onClick={() => setMarker(item.marker)}>
            {item.marker}
          </button>
        ))}
      </div>
      <div className="marker-guide-card">
        <strong>{selected.marker}</strong>
        <span>{selected.format}</span>
        <small>{selected.note}</small>
      </div>
      <p className="reference-warning"><ShieldCheck size={15} />공공 API는 집계 참고 자료이며, 현재 스냅샷의 검사 종류명은 전 행 결측입니다. 화면의 마커 안내는 입력 형식 예시이고 개인 검사 결과 판정이 아닙니다.</p>
    </div>
  );
}

const TERM_FIELD_LABELS: Record<string, string> = {
  organ: "장기",
  specimen: "검체",
  site: "부위",
  laterality: "좌우",
  diagnosis: "조직학적 진단",
  histologicType: "조직학적 유형",
  tumorSize: "종양 크기",
  margin: "절제연",
  lymphNodes: "림프절",
  pathologicT: "pT",
  pathologicN: "pN",
  pathologicM: "pM",
  pathologicStage: "Stage",
  immunopathology: "면역병리",
  molecularPathology: "분자병리",
  order_number: "검사번호",
  test_name: "검사명",
};

const HIGH_RISK_TERM_NOTICE = "중요 의료정보의 불일치 가능성이 있어 자동수정하지 않았습니다. 원문을 확인해 주세요.";
const HIGH_RISK_MATCH_NOTICE = "중요 의료정보는 원문 근거와 일치하지만 자동수정하지 않습니다. 담당자가 최종 확인해 주세요.";

function termStatusLabel(review: MedicalTermReview, decision?: { status: TermReviewStatus }) {
  if (decision?.status === "accepted") return "제안 적용됨";
  if (decision?.status === "rejected") return "원문 유지";
  if (decision?.status === "manually_edited") return "직접 수정";
  if (decision?.status === "needs_review") return "확인 필요";
  if (review.suggestionType === "exact_match") return review.riskLevel === "high" ? "원문 일치·최종 확인" : "정상 용어";
  if (review.suggestionType === "possible_typo") return "수정 후보";
  if (review.suggestionType === "high_risk_match") return "원문 일치·최종 확인";
  if (review.suggestionType === "high_risk_mismatch") return "원문 확인 필요";
  return "확인 필요";
}

function MedicalTermReviewPanel({
  reviews,
  decisions,
  canEdit,
  onAccept,
  onReject,
  onNeedsReview,
  onFocusField,
}: {
  reviews: MedicalTermReview[];
  decisions: Record<string, TermReviewDecision>;
  canEdit: boolean;
  onAccept: (review: MedicalTermReview) => void;
  onReject: (review: MedicalTermReview) => void;
  onNeedsReview: (review: MedicalTermReview) => void;
  onFocusField: (review: MedicalTermReview) => void;
}) {
  if (!reviews.length) return null;
  return (
    <section className="term-review-panel" aria-label="의학용어 및 표기 검수">
      <div className="term-review-heading">
        <div><span className="eyebrow">로컬 용어사전 기반</span><h3>의학용어·표기 검수</h3></div>
        <StatusChip tone="teal">원문 근거 확인</StatusChip>
      </div>
      <p className="panel-note">암정보사전 고정 스냅샷과 프로젝트 용어목록을 기준으로 후보를 표시합니다. 제안 적용은 담당자 확정값에만 반영되며 원문은 변경하지 않습니다.</p>
      <div className="term-review-list">
        {reviews.map((review) => {
          const decision = decisions[review.suggestionId];
          const highRisk = review.riskLevel === "high";
          return (
            <article className={`term-review-item ${highRisk ? "high-risk" : ""}`} key={review.suggestionId}>
              <div className="term-review-head">
                <div><strong>{TERM_FIELD_LABELS[review.fieldName] ?? review.fieldName}</strong><span>{review.originalValue ?? "값 없음"}</span></div>
                <StatusChip tone={review.suggestionType === "high_risk_mismatch" || (review.suggestionType === "not_found" && highRisk) ? "danger" : highRisk || review.suggestionType === "possible_typo" ? "warning" : "success"}>{termStatusLabel(review, decision)}</StatusChip>
              </div>
              {review.suggestedValue && <div className="term-review-suggestion"><span>수정 후보</span><strong>{review.suggestedValue}</strong></div>}
              {highRisk && <p className="term-review-risk">{review.suggestionType === "high_risk_match" || review.suggestionType === "exact_match" ? HIGH_RISK_MATCH_NOTICE : HIGH_RISK_TERM_NOTICE}</p>}
              {!highRisk && review.suggestionType === "not_found" && <p className="term-review-risk">사전에 일치하는 용어가 없어 원문 확인이 필요합니다.</p>}
              {review.evidenceText && <p className="term-review-evidence"><span>원문 근거</span><q>{review.evidenceText}</q></p>}
              <p className="term-review-source">출처: {review.source} · {review.sourceVersion}</p>
              {review.candidates.length > 0 && <p className="term-review-candidates">참고 후보: {review.candidates.map((candidate) => candidate.term).join(", ")}</p>}
              {canEdit && review.suggestionType !== "exact_match" && !decision && (
                <div className="term-review-actions">
                  {review.suggestedValue && !highRisk && <button type="button" className="secondary-button" onClick={() => onAccept(review)}>제안 적용</button>}
                  <button type="button" className="text-button" onClick={() => onReject(review)}>원문 유지</button>
                  <button type="button" className="text-button" onClick={() => onFocusField(review)}>직접 수정</button>
                  <button type="button" className="text-button" onClick={() => onNeedsReview(review)}>확인 필요</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function stageAuditStatus(source: string | null, entered: string | null): "match" | "mismatch" | "missing" {
  if (!source && !entered) return "missing";
  if (!source || !entered) return "mismatch";
  return stageValuesMatch(source, entered) ? "match" : "mismatch";
}

function AnalyzeWorkspace({ kind, sample, onReviewed, onNavigate, role, linkedEvaluationCaseId, linkedSourceRowId }: { kind: AnalyzeKind; sample: string; onReviewed: (review: SessionReview) => void; onNavigate: (view: ViewId) => void; role: RoleId; linkedEvaluationCaseId?: string; linkedSourceRowId?: string }) {
  const [text, setText] = useState("");
  const [confirmedSynthetic, setConfirmedSynthetic] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [fields, setFields] = useState<ExtractedField[]>([]);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [confirmedValues, setConfirmedValues] = useState<Record<string, string>>({});
  const [confirmedControlModes, setConfirmedControlModes] = useState<Record<string, string>>({});
  const [termDecisions, setTermDecisions] = useState<Record<string, TermReviewDecision>>({});
  const termDecisionLocks = useRef(new Set<string>());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [finalized, setFinalized] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);
  const [evaluationCases, setEvaluationCases] = useState<EvaluationCase[]>([]);
  const [selectedEvaluationCaseId, setSelectedEvaluationCaseId] = useState("");
  const [loadedEvaluationCase, setLoadedEvaluationCase] = useState<EvaluationCase | null>(null);
  const [evaluationLoading, setEvaluationLoading] = useState(true);
  const [geminiRuntime, setGeminiRuntime] = useState<GeminiRuntimeStatus | null>(null);
  const publicDeployment = geminiRuntime?.publicDeployment === true;
  const canEdit = role === "him" && !publicDeployment;
  const isPathologistReview = role === "pathologist";
  const edited = fields.some((field) => (confirmedValues[field.key] ?? "") !== (field.value ?? ""));
  const stageAudit = kind === "pathology"
    ? STAGE_FIELD_DEFINITIONS.map(({ key, label }) => {
      const source = result?.fields.find((field) => field.key === key)?.value ?? null;
       const entered = confirmedValues[key] ?? null;
      const formatStatus = source === null ? "missing" : isStageValueAllowed(source, key) ? "allowed" : "needs_review";
      return { key, label, source, entered, status: stageAuditStatus(source, entered), formatStatus };
    })
    : [];
  const evaluationTruthByKey = new Map(loadedEvaluationCase?.groundTruth.expectedExtraction.map((field) => [field.key, field]) ?? []);
  const evaluationReferenceByKey = new Map(loadedEvaluationCase?.groundTruth.referenceFields.map((field) => [field.key, field]) ?? []);
  // Keep the evaluation against the original AI response, not a value the user edited afterwards.
  const evaluationComparisons = result && loadedEvaluationCase
    ? result.fields.map((field) => ({ field, truth: evaluationTruthByKey.get(field.key), status: evaluationComparisonStatus(field.value, evaluationTruthByKey.get(field.key)?.value) }))
    : [];
  const evaluationWarningResults = result && loadedEvaluationCase
    ? loadedEvaluationCase.expectedWarnings.map((warning) => ({
      warning,
      detected: result.issues.some((issue) => issue.evaluationCode === warning.code),
    }))
    : [];
  const isErrorEvaluationCase = loadedEvaluationCase?.scenario === "error";
  const liveAnalysisUnavailable = geminiRuntime !== null && !geminiRuntime.canAnalyze;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/evaluation/cases?type=${kind}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("평가사례를 불러오지 못했습니다.");
        return response.json() as Promise<EvaluationCasesResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        const linkedCase = linkedEvaluationCaseId
          ? data.cases.find((item) => item.caseId === linkedEvaluationCaseId && (!linkedSourceRowId || item.sourceRowId === linkedSourceRowId)) ?? null
          : null;
        const firstCase = linkedEvaluationCaseId
          ? linkedCase
          : data.cases.find((item) => item.scenario === "normal") ?? data.cases[0] ?? null;
        setEvaluationCases(data.cases);
        setSelectedEvaluationCaseId(firstCase?.caseId ?? "");
        setLoadedEvaluationCase(firstCase);
        setText(firstCase?.inputText ?? "");
        setConfirmedSynthetic(Boolean(firstCase));
        setResult(null);
        setFields([]);
        setTemplateValues({});
        setConfirmedValues({});
        setConfirmedControlModes({});
        setTermDecisions({});
        termDecisionLocks.current.clear();
        setFinalized(false);
        setError(linkedEvaluationCaseId && !linkedCase ? "선택한 가상 작업과 정확히 연결된 실행 평가사례를 찾지 못했습니다. 임의의 평가사례는 불러오지 않습니다." : "");
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "평가사례를 불러오지 못했습니다.");
      })
      .finally(() => { if (!cancelled) setEvaluationLoading(false); });
    return () => { cancelled = true; };
  }, [kind, linkedEvaluationCaseId, linkedSourceRowId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gemini/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<GeminiRuntimeStatus> : null)
      .then((data) => { if (!cancelled && data) setGeminiRuntime(data); })
      .catch(() => { if (!cancelled) setGeminiRuntime({ publicDeployment: true, demoMode: false, canAnalyze: false, liveAvailable: false, reason: "status_unavailable", disclaimer: "실시간 분석 상태를 확인할 수 없습니다." }); });
    return () => { cancelled = true; };
  }, []);

  function loadEvaluationCase(item: EvaluationCase) {
    setLoadedEvaluationCase(item);
    setText(item.inputText);
    setConfirmedSynthetic(true);
    setResult(null);
    setFields([]);
    setTemplateValues({});
    setConfirmedValues({});
    setConfirmedControlModes({});
    setTermDecisions({});
    termDecisionLocks.current.clear();
    setFinalized(false);
    setReviewRequested(false);
    setError("");
  }

  async function analyze() {
    setError("");
    setFinalized(false);
    if (!confirmedSynthetic) return setError("가상·합성 데이터임을 먼저 확인해 주세요.");
    if (!text.trim()) return setError("분석할 가상 원문을 입력해 주세요.");
    setLoading(true);
    try {
      if (publicDeployment && !loadedEvaluationCase) throw new Error("공개 배포에서는 고정된 교육용 평가사례만 분석할 수 있습니다.");
      if (liveAnalysisUnavailable) throw new Error("실시간 Gemini 분석 설정이 필요합니다.");
      const requestBody = loadedEvaluationCase ? { caseId: loadedEvaluationCase.caseId, kind } : { text, kind };
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "분석 요청에 실패했습니다.");
      setResult(data);
      setFields(data.fields);
      setTemplateValues(Object.fromEntries(data.fields.map((field: ExtractedField) => [field.key, field.value ?? ""])));
      setConfirmedValues({});
      setConfirmedControlModes({});
      setTermDecisions({});
      termDecisionLocks.current.clear();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "분석 요청에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function editField(index: number, value: string) {
    if (!canEdit) return;
    const key = fields[index]?.key;
    if (!key) return;
    setConfirmedValues((current) => ({ ...current, [key]: value }));
    const suggestionId = `term-${kind}-${key}`;
    termDecisionLocks.current.add(suggestionId);
    setTermDecisions((current) => ({ ...current, [suggestionId]: createTermReviewDecision("manually_edited", value) }));
  }

  function clearConfirmedField(index: number) {
    if (!canEdit) return;
    const key = fields[index]?.key;
    if (!key) return;
    setConfirmedValues((current) => Object.fromEntries(Object.entries(current).filter(([fieldKey]) => fieldKey !== key)));
  }

  function selectConfirmedValue(index: number, value: string) {
    if (!canEdit) return;
    const key = fields[index]?.key;
    if (!key) return;
    setConfirmedControlModes((current) => ({ ...current, [key]: value }));
    if (!value || value === OTHER_CONFIRMED_VALUE) {
      clearConfirmedField(index);
      return;
    }
    editField(index, value);
  }

  function acceptTermSuggestion(review: MedicalTermReview) {
    if (!canEdit || !review.suggestedValue || termDecisionLocks.current.has(review.suggestionId)) return;
    termDecisionLocks.current.add(review.suggestionId);
    const nextDecision = createTermReviewDecision("accepted", review.suggestedValue);
    const confirmedValue = confirmedValueFromDecision(nextDecision);
    if (confirmedValue !== null) setConfirmedValues((current) => ({ ...current, [review.fieldName]: confirmedValue }));
    setTermDecisions((current) => ({ ...current, [review.suggestionId]: applyUniqueTermReviewDecision(current[review.suggestionId], nextDecision) }));
  }

  function rejectTermSuggestion(review: MedicalTermReview) {
    if (!canEdit || termDecisionLocks.current.has(review.suggestionId)) return;
    termDecisionLocks.current.add(review.suggestionId);
    const nextDecision = createTermReviewDecision("rejected");
    setTermDecisions((current) => ({ ...current, [review.suggestionId]: applyUniqueTermReviewDecision(current[review.suggestionId], nextDecision) }));
  }

  function markTermNeedsReview(review: MedicalTermReview) {
    if (!canEdit || termDecisionLocks.current.has(review.suggestionId)) return;
    termDecisionLocks.current.add(review.suggestionId);
    const nextDecision = createTermReviewDecision("needs_review");
    setTermDecisions((current) => ({ ...current, [review.suggestionId]: applyUniqueTermReviewDecision(current[review.suggestionId], nextDecision) }));
  }

  function focusTermField(review: MedicalTermReview) {
    document.getElementById(`${kind}-${review.fieldName}`)?.focus();
  }

  function finalize() {
    if (!canEdit) return;
    setFinalized(true);
    const stageIssues = stageAudit.filter((item) => item.status === "mismatch").map((item) => `${item.label} 원문 불일치`);
    onReviewed({ edited, issueTitles: [...(result?.issues.map((issue) => issue.title) ?? []), ...stageIssues] });
  }

  return (
    <div className="view-stack">
      <SafetyBanner />
      <RoleAccessNotice role={role} area="review" />
      <div className="view-toolbar">
        <div><span className="eyebrow">{kind === "gross" ? "자체 가상 병리문" : "공개 집계 API + 자체 가상 병리문"}</span><strong>모든 원문은 개인정보 없는 가상 자료로만 사용합니다.</strong></div>
        <div className="toolbar-actions">
          <SourceActionButton sourceId="prototype-pathology-referral-fixtures" onNavigate={onNavigate} label="가상자료 출처" />
          {kind === "pathology" && <SourceActionButton sourceId="lung13-diagnosis-reference" onNavigate={onNavigate} label="API 출처" />}
        </div>
      </div>
      {publicDeployment && <div className="notice-strip"><ShieldCheck size={17} /><span><strong>공개 시연 제한:</strong> 서비스가 제공하는 고정 평가사례만 실시간 Gemini 분석 대상으로 허용됩니다. 임의 원문과 실제 환자정보는 입력하거나 전송할 수 없습니다.</span></div>}
      {liveAnalysisUnavailable && <div className="inline-error"><AlertCircle size={17} />실시간 Gemini 분석 설정 또는 공개 호출 제한 설정이 필요합니다. 저장된 예시 결과를 실제 분석 결과로 표시하지 않습니다.</div>}
      <div className="workspace-grid">
        <section className="panel input-panel">
          <div className="panel-heading"><div><span className="step-label">STEP 1</span><h2>가상 원문 입력</h2></div>{!publicDeployment && <button className="text-button" onClick={() => { setLoadedEvaluationCase(null); setText(sample); setConfirmedSynthetic(true); setResult(null); setFields([]); setTemplateValues({}); setConfirmedValues({}); setConfirmedControlModes({}); setTermDecisions({}); termDecisionLocks.current.clear(); setFinalized(false); }}>직접 작성 예시</button>}</div>
          <div className="evaluation-case-picker">
            <div><span className="eyebrow">실행 가능한 평가사례</span><strong>{evaluationLoading ? "사례 준비 중" : loadedEvaluationCase ? `${loadedEvaluationCase.caseId} · ${loadedEvaluationCase.scenario === "normal" ? "정상" : "오류 포함"}` : "사례를 선택하세요"}</strong></div>
            <label>
              <span className="sr-only">평가사례 선택</span>
              <select value={selectedEvaluationCaseId} disabled={evaluationLoading || !evaluationCases.length} onChange={(event) => setSelectedEvaluationCaseId(event.target.value)}>
                {evaluationCases.map((item) => <option key={item.caseId} value={item.caseId}>{item.caseId} · {item.scenario === "normal" ? "정상" : "오류 포함"}</option>)}
              </select>
            </label>
            <button type="button" className="secondary-button" disabled={evaluationLoading || !selectedEvaluationCaseId} onClick={() => { const item = evaluationCases.find((candidate) => candidate.caseId === selectedEvaluationCaseId); if (item) loadEvaluationCase(item); }}><FileCheck2 size={16} />평가 사례 불러오기</button>
          </div>
          {loadedEvaluationCase && <div className="evaluation-case-meta"><span>원천 행: {loadedEvaluationCase.sourceRowId}</span><span>템플릿: {loadedEvaluationCase.templateVersion}</span><span>원문 값과 생성값은 사례 데이터에서 구분됨</span></div>}
          <label className="field-label" htmlFor={`${kind}-source`}>{kind === "gross" ? "육안 소견 문장 또는 음성 전사문" : "병리 결과문"}</label>
          <textarea id={`${kind}-source`} className="source-textarea" value={text} readOnly={!canEdit} onChange={(event) => { setText(event.target.value); setResult(null); setFinalized(false); }} placeholder={kind === "gross" ? "실제 환자정보가 없는 가상의 육안 소견을 입력하세요." : "실제 환자정보가 없는 가상의 병리 결과문을 입력하세요."} />
          <div className="input-meta"><span>{text.length.toLocaleString()} / 20,000자</span><span>질문·결과 미저장</span></div>
          <label className="check-row"><input type="checkbox" checked={confirmedSynthetic} disabled={!canEdit} onChange={(event) => setConfirmedSynthetic(event.target.checked)} /><span><strong>가상 또는 공개 합성데이터임을 확인했습니다.</strong><small>실제 환자정보가 포함된 경우 분석을 진행하지 않습니다.</small></span></label>
          {error && <div className="inline-error"><AlertCircle size={17} />{error}</div>}
          <button className="primary-button" disabled={loading || evaluationLoading || liveAnalysisUnavailable || (publicDeployment && !loadedEvaluationCase)} onClick={analyze}>{loading ? <span className="spinner" /> : <Sparkles size={18} />}{loading ? "분석 중" : "AI 구조화 분석 실행"}</button>
          <div className="guardrail-list">
            <span><ShieldCheck size={15} /> 원문 근거가 없는 값은 생성하지 않음</span>
            <span><Database size={15} /> 입력 원문과 결과를 서버에 저장하지 않음</span>
            {kind === "pathology" && <span><BookOpen size={15} /> 세부진단·면역병리 API는 용어 참고와 집계정보로만 사용</span>}
          </div>
        </section>

        <section className="panel output-panel">
          <div className="panel-heading"><div><span className="step-label">STEP 2</span><h2>추출 결과 검수</h2></div>{result && <StatusChip tone={result.mode === "demo" ? "warning" : "teal"}>{result.mode === "demo" ? "안전 데모" : "Gemini"}</StatusChip>}</div>
          {!result ? (
            <div className="empty-state"><LungEmptyIcon /><h3>분석 결과가 여기에 표시됩니다</h3><p>왼쪽 원문을 기준으로 항목별 값과 근거를 나란히 검수할 수 있습니다.</p></div>
          ) : (
            <>
              <div className="result-summary"><span><CheckCircle2 size={16} /> 근거 확인 {fields.filter((field) => field.status === "extracted").length}개</span><span><AlertTriangle size={16} /> 확인 필요 {fields.filter((field) => field.status === "needs_review" || field.status === "not_found").length}개</span>{edited && <span><Sparkles size={16} /> 사용자 수정 있음</span>}</div>
              <div className="evaluation-case-meta" aria-label="분석 실행 정보"><span>{result.mode === "gemini" ? "실시간 Gemini 분석" : "저장된 검증 예시·데모 분석"}</span><span>모델: {result.model ?? "실시간 모델 미사용"}</span><span>응답시간: {result.latencyMs ?? 0}ms</span><span>프롬프트: {result.promptVersion ?? "해당 없음"}</span><span>사례: {result.caseVersion ?? "직접 작성 예시"}</span><span>실행: {result.evaluatedAt ?? "해당 없음"}</span></div>
              {loadedEvaluationCase && <div className="evaluation-result-summary" aria-label="추출 정확도 대조 요약">
                <span><strong>{isErrorEvaluationCase ? "원문 추출 대조" : "추출 정확도 대조"}</strong><small>{loadedEvaluationCase.caseId} · {isErrorEvaluationCase ? "오류 여부는 아래 기준값과 오류 검수 결과를 확인" : "원문에 실제 있는 값 기준"}</small></span>
                <div>{(["exact", "missing", "mismatch", "generated"] as EvaluationComparisonStatus[]).map((status) => <StatusChip key={status} tone={evaluationStatusTone(status)}>{evaluationDisplayLabel(status, isErrorEvaluationCase)} {evaluationComparisons.filter((item) => item.status === status).length}</StatusChip>)}</div>
              </div>}
              {loadedEvaluationCase?.scenario === "error" && <div className="evaluation-warning-summary" aria-label="오류 검수 재현 결과">
                <div className="evaluation-warning-heading">
                  <span><strong>오류 검수 재현</strong><small>고정 평가사례의 기준값과 주입 오류를 대조합니다.</small></span>
                  <StatusChip tone={evaluationWarningResults.every((item) => item.detected) ? "success" : "danger"}>
                    탐지 {evaluationWarningResults.filter((item) => item.detected).length}/{evaluationWarningResults.length}
                  </StatusChip>
                </div>
                <ul>{evaluationWarningResults.map(({ warning, detected }) => <li key={warning.code} className={detected ? "detected" : "missed"}>
                  <span><strong>{warning.description}</strong><small>{warning.fieldKeys.join(" · ")}</small></span>
                  <StatusChip tone={detected ? "success" : "danger"}>{detected ? "탐지" : "미탐"}</StatusChip>
                </li>)}</ul>
              </div>}
              <div className="field-review-list">
                {fields.map((field, index) => {
                  const sourceField = result.fields.find((candidate) => candidate.key === field.key) ?? field;
                  const sourceValue = sourceField.value ?? null;
                  const templateValue = templateValues[field.key] || null;
                  const confirmedValue = confirmedValues[field.key] || null;
                  const confirmedControl = getConfirmedValueControl(kind, field.key, sourceValue);
                  const selectedControlValue = confirmedControlModes[field.key]
                    ?? (canonicalConfirmedValueOption(confirmedControl, confirmedValue) ?? (confirmedValue && confirmedControl.allowOther ? OTHER_CONFIRMED_VALUE : ""));
                  const usesOtherInput = confirmedControl.type === "select" && selectedControlValue === OTHER_CONFIRMED_VALUE;
                  const changedFromSource = Boolean(sourceValue && confirmedValue && sourceValue !== confirmedValue);
                  const evaluationTruth = evaluationTruthByKey.get(field.key);
                  const evaluationStatus = loadedEvaluationCase ? evaluationComparisonStatus(sourceValue, evaluationTruth?.value) : null;
                  const fieldWarningResults = evaluationWarningResults.filter(({ warning }) => warning.fieldKeys.includes(field.key));
                  return (
                    <div className={`review-field ${field.status} ${changedFromSource ? "mismatch" : ""}`} key={field.key}>
                      <div className="review-field-head"><label htmlFor={`${kind}-${field.key}`}>{field.label}</label><StatusChip tone={changedFromSource ? "danger" : field.status === "edited" ? "teal" : sourceField.status === "needs_review" || !sourceField.evidence ? "warning" : "success"}>{changedFromSource ? "불일치" : field.status === "edited" ? "사용자 수정" : sourceField.status === "needs_review" || !sourceField.evidence ? "확인 필요" : "AI 추출"}</StatusChip></div>
                      <div className="comparison-stack">
                        <div className="structured-template-value"><span>구조화 입력 템플릿</span><strong>{templateValue ?? "확인 필요"}</strong></div>
                        <div><span>원문</span><em>{sourceField.evidence ? `“${sourceField.evidence}”` : "원문에서 근거를 찾지 못함"}</em></div>
                        <div><span>AI 추출값</span><strong>{sourceValue ?? "null · 확인 필요"}</strong></div>
                        {evaluationTruth && evaluationStatus && <div className={`evaluation-truth ${evaluationStatus}`}><span>원문 추출 정답</span><strong>{evaluationTruth.value ?? "null · 원문에 없음"}</strong><StatusChip tone={evaluationStatusTone(evaluationStatus)}>{evaluationDisplayLabel(evaluationStatus, Boolean(isErrorEvaluationCase))}</StatusChip></div>}
                        {fieldWarningResults.map(({ warning, detected }) => <div className={`evaluation-error-context ${detected ? "detected" : "missed"}`} key={warning.code}>
                          <span>검수 비교값</span><strong>{evaluationWarningValueSummary(warning, result.fields, evaluationReferenceByKey)}</strong>
                          <small>{warning.description} · 원문 근거: {evaluationWarningEvidenceSummary(warning, result.fields)}</small>
                          <StatusChip tone={detected ? "success" : "danger"}>{detected ? "오류 탐지" : "오류 미탐"}</StatusChip>
                        </div>)}
                      </div>
                      <label className="confirmed-value-label" htmlFor={`${kind}-${field.key}`}>담당자 확정값</label>
                      {confirmedControl.type === "select" ? <div className="confirmed-value-control">
                        <select id={`${kind}-${field.key}`} value={selectedControlValue} disabled={!canEdit} onChange={(event) => selectConfirmedValue(index, event.target.value)}>
                          <option value="">확인 필요</option>
                          {confirmedControl.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          {confirmedControl.allowOther && <option value={OTHER_CONFIRMED_VALUE}>기타 직접 입력</option>}
                        </select>
                        {usesOtherInput && <input id={`${kind}-${field.key}-other`} value={confirmedValue ?? ""} readOnly={!canEdit} onChange={(event) => editField(index, event.target.value)} placeholder="원문 표현을 그대로 입력" />}
                        <small>{confirmedControl.hint}</small>
                      </div> : <div className="confirmed-value-control">
                        <input id={`${kind}-${field.key}`} inputMode={confirmedControl.inputMode} value={confirmedValue ?? ""} readOnly={!canEdit} onChange={(event) => editField(index, event.target.value)} placeholder="확인 필요" />
                        <small>{confirmedControl.hint}</small>
                      </div>}
                    </div>
                  );
                })}
              </div>
              <MedicalTermReviewPanel
                reviews={result.termReviews ?? []}
                decisions={termDecisions}
                canEdit={canEdit}
                onAccept={acceptTermSuggestion}
                onReject={rejectTermSuggestion}
                onNeedsReview={markTermNeedsReview}
                onFocusField={focusTermField}
              />
              {kind === "pathology" && <section className="stage-audit" aria-label="AJCC TNM 입력 형식 검수">
                <div className="stage-audit-head"><div><span className="eyebrow">병기 입력 형식 검수</span><h3>원문 병기와 입력값 대조</h3></div><StatusChip tone="warning">판정 기능 아님</StatusChip></div>
                <p className="stage-audit-disclaimer">{STAGE_REVIEW_DISCLAIMER}</p>
                <div className="stage-audit-grid">
                  {stageAudit.map((item) => <div className={`stage-audit-row ${item.status}`} key={item.key}>
                    <strong>{item.label}</strong>
                    <span><small>원문 추출</small>{item.source ?? "null · 확인 필요"}</span>
                    <span><small>9판 형식 참조</small>{item.formatStatus === "allowed" ? "허용 형식" : item.formatStatus === "missing" ? "원문 없음" : "확인 필요"}</span>
                    <span><small>현재 입력</small>{item.entered ?? "null · 확인 필요"}</span>
                    <StatusChip tone={item.status === "match" ? "success" : item.status === "mismatch" ? "danger" : "warning"}>{item.status === "match" ? "일치" : item.status === "mismatch" ? "불일치" : "확인 필요"}</StatusChip>
                  </div>)}
                </div>
                <p className="panel-note">원문 병기값, IASLC/AJCC 9판 교육용 형식 참조, 담당자 입력값을 연결해 표시합니다. TNM 조합, 최종 병기 산출은 구현하지 않습니다.</p>
              </section>}
              {kind === "pathology" && <DiagnosisReference diagnosis={fields.find((field) => field.key === "diagnosis")?.value ?? ""} />}
              {kind === "pathology" && <ImmunopathologyGuide onNavigate={onNavigate} />}
              {kind === "pathology" && <StageReference stage={result.fields.find((field) => field.key === "pathologicStage")?.value ?? ""} />}
              {result.issues.some((issue) => issue.origin === "rule") && <div className="validation-box hybrid-rule-box"><h3><ListChecks size={17} /> 규칙 기반 재검수</h3>{result.issues.filter((issue) => issue.origin === "rule").map((issue) => <div className={`validation-item ${issue.severity}`} key={issue.id}><span>{issue.title}</span><p>{issue.detail}</p></div>)}</div>}
              {result.issues.length > 0 && <div className="validation-box"><h3><AlertTriangle size={17} /> 검수 알림 {result.issues.length}건</h3>{result.issues.map((issue) => <div className={`validation-item ${issue.severity}`} key={issue.id}><span>{issue.title}</span><p>{issue.detail}</p></div>)}</div>}
              {isPathologistReview && <div className="role-review-action">
                <strong>병리의사 검토</strong>
                <span>원문과 구조화 결과를 확인한 뒤 교육용 수정 요청 상태만 표시합니다. 실제 전자서명이나 최종 판독 승인은 수행하지 않습니다.</span>
                <button type="button" className="secondary-button" disabled={reviewRequested} onClick={() => setReviewRequested(true)}>{reviewRequested ? <Check size={17} /> : <ClipboardCheck size={17} />}{reviewRequested ? "수정 요청 표시됨" : "수정 요청 표시"}</button>
              </div>}
              <div className="print-stage-disclaimer">
                교육용 가상 자료를 이용한 입력 검수 결과이며 실제 진단·판독·공식 의료기록에 사용할 수 없습니다. 모든 결과는 담당자의 원문 대조가 필요합니다.
                {kind === "pathology" ? ` ${STAGE_REVIEW_DISCLAIMER}` : ""}
              </div>
              <div className="finalize-row"><p><strong>자동 확정되지 않습니다.</strong><br />원문 대조 후 담당자가 직접 완료하세요.</p><div className="finalize-actions"><button type="button" className="secondary-button" disabled={!canEdit} onClick={() => window.print()}><Download size={17} />브라우저 인쇄·PDF 저장</button><button type="button" className="secondary-button" disabled={finalized || !canEdit} onClick={finalize}>{finalized ? <Check size={17} /> : <ClipboardCheck size={17} />}{finalized ? "세션 검수 완료" : "검수 완료 표시"}</button></div></div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ReferralView({ onNavigate, role, linkedEvaluationCaseId }: { onNavigate: (view: ViewId) => void; role: RoleId; linkedEvaluationCaseId?: string }) {
  const [fileName, setFileName] = useState("");
  const [fixtures, setFixtures] = useState<ReferralFixtureMeta[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState("");
  const [comparison, setComparison] = useState<ReferralCompareResponse | null>(null);
  const [geminiExtraction, setGeminiExtraction] = useState<GeminiReferralExtractResponse | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState("");
  const [geminiRuntime, setGeminiRuntime] = useState<GeminiRuntimeStatus | null>(null);
  const [confirmedValues, setConfirmedValues] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const publicDeployment = geminiRuntime?.publicDeployment === true;
  const canEdit = role === "him" && !publicDeployment;

  function chooseFixture(fixture: ReferralFixtureMeta) {
    setSelectedFixtureId(fixture.id);
    setFileName(fixture.file_name);
    setComparison(null);
    setGeminiExtraction(null);
    setGeminiError("");
    setConfirmedValues({});
    setReviewConfirmed(false);
    setConfirmed(true);
    setError("");
  }

  useEffect(() => {
    fetch("/api/referral/fixtures", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("교육용 가상 자료 목록을 불러오지 못했습니다.");
        const data = await response.json() as { fixtures: ReferralFixtureMeta[] };
        setFixtures(data.fixtures);
        const linkedFixture = linkedEvaluationCaseId
          ? data.fixtures.find((fixture) => fixture.evaluation_case_id === linkedEvaluationCaseId) ?? null
          : null;
        const firstFixture = linkedEvaluationCaseId
          ? linkedFixture
          : data.fixtures.find((fixture) => fixture.id === "outsourced-match") ?? data.fixtures[0];
        if (firstFixture) {
          setSelectedFixtureId(firstFixture.id);
          setFileName(firstFixture.file_name);
          setConfirmed(true);
        } else if (linkedEvaluationCaseId) {
          setSelectedFixtureId("");
          setFileName("");
          setConfirmed(false);
          setError("선택한 가상 작업과 정확히 연결된 위탁검사 평가자료를 찾지 못했습니다. 임의의 자료는 불러오지 않습니다.");
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "교육용 가상 자료 목록을 불러오지 못했습니다."));
  }, [linkedEvaluationCaseId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gemini/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<GeminiRuntimeStatus> : null)
      .then((data) => { if (!cancelled && data) setGeminiRuntime(data); })
      .catch(() => { if (!cancelled) setGeminiRuntime({ publicDeployment: true, demoMode: false, canAnalyze: false, liveAvailable: false, reason: "status_unavailable", disclaimer: "실시간 분석 상태를 확인할 수 없습니다." }); });
    return () => { cancelled = true; };
  }, []);

  const runComparison = async () => {
    if (!fileName) return;
    setLoading(true);
    setError("");
    setComparison(null);
    setConfirmedValues({});
    setReviewConfirmed(false);
    try {
      const response = await fetch("/api/referral/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId: selectedFixtureId || undefined, fileName }),
      });
      const data = await response.json() as ReferralCompareResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "위탁검사 결과 대조에 실패했습니다.");
      setComparison(data);
      setConfirmedValues(Object.fromEntries(data.comparisons.map((item) => [item.key, item.extracted ?? ""])));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "위탁검사 결과 대조에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const runGeminiExtraction = async () => {
    if (!selectedFixtureId) return;
    if (!geminiRuntime?.liveAvailable) return setGeminiError("실시간 Gemini 분석 설정 또는 공개 호출 제한 설정이 필요합니다.");
    setGeminiLoading(true);
    setGeminiError("");
    setGeminiExtraction(null);
    try {
      const response = await fetch("/api/referral/gemini-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId: selectedFixtureId }),
      });
      const data = await response.json() as GeminiReferralExtractResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Gemini 문서 재추출에 실패했습니다.");
      setGeminiExtraction(data);
    } catch (caught) {
      setGeminiError(caught instanceof Error ? caught.message : "Gemini 문서 재추출에 실패했습니다.");
    } finally {
      setGeminiLoading(false);
    }
  };

  const statusLabel = (status: ReferralComparison["status"]) => status === "match" ? "일치" : status === "mismatch" ? "불일치" : "확인 필요";
  const statusTone = (status: ReferralComparison["status"]) => status === "match" ? "success" as const : status === "mismatch" ? "danger" as const : "warning" as const;
  const referralEdited = comparison ? comparison.comparisons.some((item) => (confirmedValues[item.key] ?? "") !== (item.extracted ?? "")) : false;
  return (
    <div className="view-stack">
      <SafetyBanner />
      <RoleAccessNotice role={role} area="referral" />
      {geminiRuntime && !geminiRuntime.liveAvailable && <div className="inline-error"><AlertCircle size={17} />실시간 Gemini 문서 분석은 현재 사용할 수 없습니다. 고정된 교육용 문서의 저장된 검증 예시와 실시간 분석 결과는 구분하여 표시합니다.</div>}
      <div className="view-toolbar">
        <div><span className="eyebrow">자체 가상 위탁검사 PDF·이미지</span><strong>문서 항목 추출과 내부 가상 의뢰정보 매칭에만 사용합니다.</strong></div>
        <SourceActionButton sourceId="prototype-pathology-referral-fixtures" onNavigate={onNavigate} />
      </div>
      <div className="referral-grid">
        <section className="panel upload-panel">
          <div className="panel-heading"><div><span className="step-label">STEP 1</span><h2>가상 문서 선택</h2></div></div>
          <button className="upload-zone" type="button" disabled={!canEdit} onClick={() => inputRef.current?.click()}>
            <UploadCloud size={30} /><strong>{fileName || "PDF 또는 이미지 선택"}</strong><span>PDF, JPG, PNG · 최대 10MB</span>
          </button>
          <input ref={inputRef} hidden type="file" disabled={!canEdit} accept="application/pdf,image/png,image/jpeg" onChange={(event) => { setFileName(event.target.files?.[0]?.name ?? ""); setSelectedFixtureId(""); setComparison(null); setReviewConfirmed(false); setConfirmed(false); setError(""); }} />
          <label className="field-label" htmlFor="outsourced-fixture">평가 사례 불러오기</label>
          <select id="outsourced-fixture" className="fixture-select" value={selectedFixtureId} onChange={(event) => { const fixture = fixtures.find((candidate) => candidate.id === event.target.value); if (fixture) chooseFixture(fixture); }}>
            <option value="">파일을 직접 선택하거나 사례를 고르세요</option>
            {fixtures.map((fixture) => <option value={fixture.id} key={fixture.id}>{fixture.label} · {fixture.format.toUpperCase()}</option>)}
          </select>
          {selectedFixtureId && <div className="fixture-loaded-row"><span>{fixtures.find((fixture) => fixture.id === selectedFixtureId)?.watermark}</span><button type="button" className="text-button" onClick={() => { const fixture = fixtures.find((candidate) => candidate.id === selectedFixtureId); if (fixture) chooseFixture(fixture); }}>선택 사례 다시 불러오기</button></div>}
          <label className="check-row compact"><input type="checkbox" checked={confirmed} disabled={!canEdit} onChange={(event) => setConfirmed(event.target.checked)} /><span><strong>가상 위탁검사 문서임을 확인</strong><small>현재 데모 모드에서는 선택한 파일을 외부로 전송하지 않습니다.</small></span></label>
          {error && <div className="inline-error"><AlertCircle size={17} />{error}</div>}
          <button className="primary-button" disabled={(!confirmed && canEdit) || !fileName || loading} onClick={runComparison}>{loading ? <span className="spinner" /> : <Sparkles size={18} />}{loading ? "대조 중" : "추출 결과 대조"}</button>
          <button className="secondary-button" type="button" disabled={!selectedFixtureId || geminiLoading || geminiRuntime?.liveAvailable !== true} onClick={runGeminiExtraction}>{geminiLoading ? <span className="spinner" /> : <FileScan size={17} />}{geminiLoading ? "Gemini 문서 추출 중" : "Gemini 문서 재추출"}</button>
          {geminiError && <div className="inline-error"><AlertCircle size={17} />{geminiError}</div>}
          <div className="internal-order"><span className="eyebrow">대조 방식</span><p>선택한 교육용 fixture의 추출 결과를 서버에 저장하지 않고, 가상 내부 의뢰정보 JSON과 항목별로 비교합니다.</p><small>실제 파일은 외부 AI나 공공데이터 API로 전송하지 않습니다.</small></div>
        </section>
        <section className="panel referral-result">
          <div className="panel-heading"><div><span className="step-label">STEP 2</span><h2>의뢰정보 대조</h2></div>{comparison && <StatusChip tone="warning">자동 저장 안 함</StatusChip>}</div>
          <p className="panel-note referral-term-note">검사명·검체명 표기는 자동 수정하지 않고 내부 의뢰정보와의 일치 여부만 표시합니다.</p>
          {!comparison ? <div className="empty-state"><LungEmptyIcon /><h3>대조 결과가 여기에 표시됩니다</h3><p>가상 문서를 선택하고 확인한 뒤 추출 결과와 내부 의뢰정보를 비교하세요.</p></div> : <>
            <div className="referral-result-summary"><div><span className="eyebrow">{comparison.fixture.label}</span><strong>{comparison.fixture.fileName}</strong><a href={comparison.fixture.assetPath} target="_blank" rel="noreferrer">원본 가상 문서 열기 <ExternalLink size={12} /></a></div><StatusChip tone={comparison.overall === "match" ? "success" : comparison.overall === "mismatch" ? "danger" : "warning"}>{comparison.overall === "match" ? "전체 일치" : comparison.overall === "mismatch" ? "불일치 확인" : "확인 필요"}</StatusChip></div>
            {comparison.fixture.quality === "poor" && <div className="inline-warning"><AlertTriangle size={17} />촬영 상태가 좋지 않아 자동 추출하지 않았습니다. 아래 항목은 모두 원문 확인이 필요합니다.</div>}
            <div className="referral-fields">{comparison.comparisons.map((item) => {
              const changed = (confirmedValues[item.key] ?? "") !== (item.extracted ?? "");
              return <div className={`referral-field ${item.status} ${changed ? "edited" : ""}`} key={item.key}><div><span>{item.label}</span><StatusChip tone={changed ? "teal" : statusTone(item.status)}>{changed ? "사용자 수정" : statusLabel(item.status)}</StatusChip></div><strong>{item.extracted ?? "null · 확인 필요"}</strong><small>내부 의뢰: {item.expected}</small><label className="referral-confirmed-value"><span>담당자 확정값</span><input value={confirmedValues[item.key] ?? ""} readOnly={!canEdit} placeholder="확인 필요" onChange={(event) => setConfirmedValues((current) => ({ ...current, [item.key]: event.target.value }))} /></label></div>;
            })}</div>
            <div className={`referral-field revised-report-field ${comparison.revisedReport.status === "needs_review" ? "missing" : ""}`}><div><span>수정 보고서 여부</span><StatusChip tone={comparison.revisedReport.status === "needs_review" ? "warning" : "success"}>{comparison.revisedReport.label}</StatusChip></div><strong>{comparison.revisedReport.evidence ?? "null · 확인 필요"}</strong><small>원문에 명시된 경우에만 수정 보고서로 표시합니다.</small></div>
            <div className="referral-note"><span>추출 참고사항</span><strong>{comparison.extracted.reference_note ?? "null · 확인 필요"}</strong></div>
            <div className="internal-order"><span className="eyebrow">가상 내부 의뢰정보</span><dl><div><dt>의뢰번호</dt><dd>{comparison.internal.order_id}</dd></div><div><dt>검사기관</dt><dd>{comparison.internal.institution}</dd></div><div><dt>검사명</dt><dd>{comparison.internal.test_name}</dd></div><div><dt>검체</dt><dd>{comparison.internal.specimen}</dd></div></dl></div>
            {comparison.ruleIssues.length > 0 && <div className="validation-box hybrid-rule-box"><h3><ListChecks size={17} /> 규칙 기반 재검수</h3>{comparison.ruleIssues.map((issue) => <div className={`validation-item ${issue.severity}`} key={issue.id}><span>{issue.title}</span><p>{issue.detail}</p></div>)}</div>}
            {geminiExtraction && <div className="validation-box gemini-document-box"><h3><FileScan size={17} /> Gemini 문서 재추출</h3><div className="evaluation-case-meta"><span>실시간 Gemini 분석</span><span>모델: {geminiExtraction.model ?? "미표시"}</span><span>응답시간: {geminiExtraction.latencyMs ?? 0}ms</span><span>프롬프트: {geminiExtraction.promptVersion ?? "미표시"}</span><span>사례: {geminiExtraction.caseVersion ?? "미표시"}</span><span>실행: {geminiExtraction.evaluatedAt ?? "미표시"}</span></div><div className="gemini-document-fields">{geminiExtraction.fields.map((field) => <div key={field.key}><span>{field.label}</span><strong>{field.value ?? "null · 확인 필요"}</strong><small>{field.evidenceText ?? "원문 근거 없음"}</small></div>)}</div>{geminiExtraction.ruleIssues.length > 0 && <div className="hybrid-rule-inline">{geminiExtraction.ruleIssues.map((issue) => <span key={issue.id}>{issue.title}</span>)}</div>}<p>{geminiExtraction.disclaimer}</p></div>}
            <p className="panel-note">{comparison.disclaimer}</p>
            <div className="finalize-row"><p><strong>{reviewConfirmed ? "담당자 확인 표시됨" : "결과를 자동 확정하지 않습니다."}</strong><br />{reviewConfirmed ? "세션에만 표시되며 결과를 저장하지 않습니다." : referralEdited ? "담당자 수정값을 포함해 원문과 다시 대조한 뒤 확인하세요." : "모든 불일치·누락을 원문과 대조한 뒤 담당자가 직접 확인하세요."}</p><div className="finalize-actions"><button type="button" className="secondary-button" onClick={() => window.print()}><Download size={17} />브라우저 인쇄·PDF 저장</button><button className="secondary-button" disabled={reviewConfirmed || !canEdit} onClick={() => setReviewConfirmed(true)}>{reviewConfirmed ? <Check size={17} /> : <ClipboardCheck size={17} />}{reviewConfirmed ? "확인 완료 표시됨" : "담당자 확인 표시"}</button></div></div>
          </>}
        </section>
      </div>
    </div>
  );
}

type KnowledgeSource = {
  kind: "dictionary" | "registry_metadata" | "project_reference";
  provider: string;
  collection: string;
  sourcePage: string | null;
  sourceFile: string | null;
  acquisition: string;
  generatedAt: string;
  statistics: {
    entries: number;
    tables: number | null;
  };
};

type KnowledgeMatch = {
  kind: "dictionary" | "registry_metadata" | "project_reference";
  id: string;
  title: string;
  subtitle: string | null;
  definition: string;
  score: number;
  source: {
    provider: string;
    collection: string;
    sourcePage: string | null;
    sourceFile: string | null;
    sourceRecordId: string;
    asOf?: string;
  };
};

type KnowledgeSearchResponse = {
  query: string;
  answer: string | null;
  matches: KnowledgeMatch[];
  sources: KnowledgeSource[];
  disclaimer: string;
};

type KnowledgeBrowseCategory = {
  id: string;
  label: string;
  count: number;
};

type KnowledgeBrowseItem = {
  id: string;
  termKo: string;
  termEn: string | null;
};

type KnowledgeBrowseResponse = {
  available: boolean;
  category: string;
  initial: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  corpusTotal: number;
  generatedAt: string;
  classificationNote: string;
  categories: KnowledgeBrowseCategory[];
  items: KnowledgeBrowseItem[];
  message?: string;
};

const KNOWLEDGE_INITIAL_OPTIONS = [
  { value: "all", label: "가나다순 전체" },
  { value: "latin", label: "영문·숫자 시작" },
  ...["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"].map((value) => ({ value, label: `${value} 시작` })),
];

type WorklistTask = {
  id: string;
  kind: "gross" | "pathology" | "referral" | null;
  label: string;
  status: string;
  tone: "neutral" | "success" | "warning" | "danger" | "teal";
  detail: string;
  updated: string;
  sourceRowId?: string;
  evaluationCaseId?: string;
};

function workflowCaseToTask(item: WorkflowPreviewCase, evaluationCase?: EvaluationCase): WorklistTask {
  const kind: WorklistTask["kind"] = evaluationCase
    ? evaluationCase.caseType === "outsourced" ? "referral" : evaluationCase.caseType
    : null;
  const issueCount = item.transcription_review.issue_count;
  const isLinked = Boolean(evaluationCase);
  return {
    id: item.order.order_id,
    kind,
    label: kind === "gross" ? "육안 소견 입력·검수" : kind === "pathology" ? "병리 결과 입력·검수" : kind === "referral" ? "위탁검사 결과 입력·대조" : "가상 연결 데이터 확인",
    status: isLinked ? `${evaluationCase?.scenario === "error" ? "오류 포함" : "정상"} 평가사례 연결` : "연결된 실행 평가사례 없음",
    tone: isLinked ? evaluationCase?.scenario === "error" ? "danger" : "success" : issueCount > 0 ? "danger" : "warning",
    detail: `${item.specimen.specimen_id} · ${item.pathology_report.report_id} · ${item.order.source_record_id}`,
    updated: item.partition === "train" ? "합성 훈련 시트" : "합성 테스트 시트",
    sourceRowId: item.order.source_record_id,
    evaluationCaseId: evaluationCase?.caseId,
  };
}

function WorklistView({ onNavigate, onOpenLinkedTask, onOpenWorkflow, role }: { onNavigate: (view: ViewId) => void; onOpenLinkedTask: (context: LinkedReviewContext) => void; onOpenWorkflow: (orderId: string) => void; role: RoleId }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [workflowData, setWorkflowData] = useState<WorkflowPreviewResponse | null>(null);
  const [evaluationCases, setEvaluationCases] = useState<EvaluationCase[]>([]);
  const [workflowError, setWorkflowError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/data/pathology-workflow", { cache: "no-store" }),
      fetch("/api/evaluation/cases", { cache: "no-store" }),
    ])
      .then(async ([workflowResponse, evaluationResponse]) => {
        const workflowResult = await workflowResponse.json();
        const evaluationResult = await evaluationResponse.json();
        if (!workflowResponse.ok) throw new Error(workflowResult.error ?? "가상 작업목록을 불러오지 못했습니다.");
        if (!evaluationResponse.ok) throw new Error(evaluationResult.error ?? "평가사례를 불러오지 못했습니다.");
        return { workflowResult: workflowResult as WorkflowPreviewResponse, evaluationResult: evaluationResult as EvaluationCasesResponse };
      })
      .then((result) => {
        if (!active) return;
        setWorkflowData(result.workflowResult);
        setEvaluationCases(result.evaluationResult.cases);
      })
      .catch((reason) => active && setWorkflowError(reason instanceof Error ? reason.message : "가상 작업목록을 불러오지 못했습니다."));
    return () => { active = false; };
  }, []);

  const evaluationBySourceRowId = new Map(evaluationCases.map((item) => [item.sourceRowId, item]));
  const tasks: WorklistTask[] = workflowData?.cases.map((item) => workflowCaseToTask(item, evaluationBySourceRowId.get(item.order.source_record_id))) ?? [...WORK_QUEUE];
  const filtered = tasks.filter((task) => {
    const matchesQuery = `${task.id} ${task.label} ${task.detail}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || task.status === status;
    return matchesQuery && matchesStatus;
  });
  const openTask = (task: WorklistTask) => {
    if (role === "him" && task.kind && task.evaluationCaseId && task.sourceRowId) {
      onOpenLinkedTask({ view: task.kind, orderId: task.id, sourceRowId: task.sourceRowId, evaluationCaseId: task.evaluationCaseId });
      return;
    }
    onOpenWorkflow(task.id);
  };

  return (
    <div className="view-stack">
      <SafetyBanner />
      <RoleAccessNotice role={role} area="worklist" />
      <section className="panel worklist-panel">
        <div className="worklist-toolbar">
          <label className="worklist-search"><Search size={18} /><span className="sr-only">작업 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="작업 ID, 유형 또는 점검 내용을 검색" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="작업 상태 필터">
            <option value="all">모든 상태</option>
            <option value="검수 대기">검수 대기</option>
            <option value="확인 필요">확인 필요</option>
            <option value="대조 대기">대조 대기</option>
            <option value="검수 완료">검수 완료</option>
          </select>
          <SourceActionButton sourceId="ncc-lung-synthetic-xlsx" onNavigate={onNavigate} />
        </div>
        {workflowError && <div className="inline-error"><AlertCircle size={17} />{workflowError}</div>}
        <div className="worklist-summary"><span>공개 합성데이터 기반 가상 작업 {filtered.length}건</span><span>원천 행 ID가 정확히 일치한 평가사례만 업무 시연으로 엽니다.</span></div>
        <div className="task-list" role="list">
          {filtered.length ? filtered.map((task) => (
            <div className="task-row" role="listitem" key={task.id}>
              <div className="task-id"><strong>{task.id}</strong><small>{task.updated}</small></div>
              <div className="task-content"><strong>{task.label}</strong><span>{task.detail}</span></div>
              <StatusChip tone={task.tone}>{task.status}</StatusChip>
              <button className="task-open" onClick={() => openTask(task)}><span>{role === "him" && task.evaluationCaseId ? "업무 유형 시연 보기" : "연결 데이터 보기"}</span><ChevronRight size={16} /></button>
            </div>
          )) : (
            <div className="empty-state short"><div className="empty-icon"><Search size={26} /></div><h3>조건에 맞는 작업이 없습니다</h3><p>검색어 또는 상태 필터를 바꿔 다시 확인하세요.</p></div>
          )}
        </div>
        <p className="panel-note">작업 ID와 상태는 데모용 합성 예시입니다. 연결되지 않은 행은 임의의 평가사례를 불러오지 않고 가상 연결 데이터 화면에서만 확인합니다.</p>
      </section>
    </div>
  );
}

type WorkflowEntity = "order" | "specimen" | "gross" | "blocks" | "report" | "ihc" | "molecular" | "outsourced" | "review";

const WORKFLOW_ENTITY_LABELS: Record<WorkflowEntity, string> = {
  order: "검사 의뢰",
  specimen: "검체 접수",
  gross: "육안 소견",
  blocks: "블록",
  report: "병리 결과",
  ihc: "면역병리",
  molecular: "분자병리",
  outsourced: "위탁검사",
  review: "검수 완료",
};

const WORKFLOW_FIELD_LABELS: Record<string, string> = {
  order_id: "검사 ID",
  specimen_id: "검체 ID",
  gross_description_id: "육안 소견 ID",
  block_id: "블록 ID",
  report_id: "보고서 ID",
  ihc_result_id: "면역병리 결과 ID",
  molecular_result_id: "분자병리 결과 ID",
  outsourced_result_id: "위탁검사 결과 ID",
  outsourced_id: "위탁검사 ID",
  review_id: "검수 ID",
  internal_order_id: "가상 내부 의뢰 검사 ID",
  internal_specimen_id: "가상 내부 의뢰 검체 ID",
  reviewer_role: "검수 역할",
  review_step: "검수 단계",
  confirmed_value_policy: "확정값 정책",
  issue_count: "검수 이슈 수",
  external_request_id: "가상 외부 의뢰 ID",
  source_record_id: "합성 원본 행 ID",
  order_category: "검사 구분",
  requested_workflow: "요청 업무",
  workflow_sequence: "가상 업무 순서",
  review_status: "검수 상태",
  source_type: "값 출처 구분",
  organ: "장기",
  specimen_category: "검체 구분",
  laterality: "좌우 부위",
  specimen_count: "검체 개수",
  gross_text: "가상 육안 소견",
  lesion_location: "병변 위치",
  margin_description: "절제연 설명",
  block_label: "블록 라벨",
  material_type: "재료 구분",
  purpose: "용도",
  histology_source_flags: "원본 조직형 플래그",
  histology_flag_status: "조직형 플래그 상태",
  stage_t_source_flags: "원본 T 플래그",
  stage_n_source_flags: "원본 N 플래그",
  stage_m_source_flags: "원본 M 플래그",
  stage_flag_status: "TNM 플래그 상태",
  operation_source_value: "원본 수술 여부 값",
  report_status: "보고서 상태",
  marker_name: "가상 표지자",
  result_value: "결과 값",
  interpretation: "판정",
  test_name: "검사명",
  egfr_detection_source_value: "원본 EGFR 발견 여부 값",
  detected: "발견 여부",
  result_status: "결과 상태",
  organization: "가상 검사기관",
};

function workflowValue(value: unknown) {
  if (value === null || value === undefined) return "확인 필요";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "확인 필요";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key.toUpperCase()}: ${String(item)}`).join(" · ");
  return String(value).replaceAll("_", " ");
}

function sourceTone(sourceType: WorkflowSourceType) {
  if (sourceType === "public_synthetic") return "teal" as const;
  if (sourceType === "generated_demo") return "warning" as const;
  if (sourceType === "public_aggregate") return "success" as const;
  return "neutral" as const;
}

function sourceLabel(sourceType: WorkflowSourceType) {
  if (sourceType === "public_synthetic") return "공개 합성데이터 매핑값";
  if (sourceType === "generated_demo") return "시제품 생성 가상값";
  if (sourceType === "public_aggregate") return "공개 집계 API";
  return "메타정보·용어사전";
}

function workflowEntityRecord(item: WorkflowPreviewCase, entity: WorkflowEntity): Record<string, unknown> {
  if (entity === "order") return item.order as unknown as Record<string, unknown>;
  if (entity === "specimen") return item.specimen as unknown as Record<string, unknown>;
  if (entity === "gross") return item.gross_description as unknown as Record<string, unknown>;
  if (entity === "report") return item.pathology_report as unknown as Record<string, unknown>;
  if (entity === "ihc") return item.immunohistochemistry_result as Record<string, unknown>;
  if (entity === "molecular") return item.molecular_pathology_result as Record<string, unknown>;
  if (entity === "outsourced") return item.outsourced_test_result as Record<string, unknown>;
  if (entity === "review") return item.transcription_review as unknown as Record<string, unknown>;
  return {
    block_id: item.blocks.map((block) => block.block_id),
    order_id: item.blocks[0]?.order_id,
    specimen_id: item.blocks[0]?.specimen_id,
    block_label: item.blocks.map((block) => block.block_label),
    material_type: item.blocks.map((block) => block.material_type),
    purpose: item.blocks.map((block) => block.purpose),
    source_type: item.blocks[0]?.source_type,
  };
}

function StageDataConnection({ report, onNavigate }: { report: WorkflowPreviewCase["pathology_report"]; onNavigate: (view: ViewId) => void }) {
  const stageItems = [
    { label: "원본 T 플래그", value: workflowValue(report.stage_t_source_flags), detail: report.stage_flag_status.t },
    { label: "원본 N 플래그", value: workflowValue(report.stage_n_source_flags), detail: report.stage_flag_status.n },
    { label: "원본 M 플래그", value: workflowValue(report.stage_m_source_flags), detail: report.stage_flag_status.m },
  ];

  return (
    <section className="panel stage-data-connection">
      <div className="panel-heading">
        <div><span className="eyebrow">보고서-병기 참조 연결</span><h2>원본 플래그와 9판 형식 참조</h2></div>
        <div className="heading-actions"><SourceActionButton sourceId="ncc-lung-synthetic-xlsx" onNavigate={onNavigate} label="합성 원본 출처" /><SourceActionButton sourceId="iaslc-lung-tnm-9th-format-reference" onNavigate={onNavigate} label="9판 형식 출처" /></div>
      </div>
      <div className="auxiliary-grid">
        <div><span>가상 보고서 ID</span><strong>{report.report_id}</strong><small>보고서·검체·검수 타임라인에 연결된 교육용 가상 ID</small></div>
        <div><span>합성 원본 행 ID</span><strong>{report.source_record_id}</strong><small><code>public_synthetic</code> 직접 매핑값의 출처 행</small></div>
        {stageItems.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>플래그 상태: {item.detail}</small></div>)}
      </div>
      <p className="panel-note">원본 합성 XLSX의 병기 플래그는 해당 <code>report_id</code>에 연결해 보존합니다. IASLC/AJCC 9판 자료는 원문에 적힌 문자열의 형식 참조로만 별도 연결하며, 원본 플래그를 9판으로 재분류하거나 T/N/M을 조합해 최종 Stage를 계산하지 않습니다.</p>
    </section>
  );
}

function WorkflowView({ onNavigate, role, initialOrderId }: { onNavigate: (view: ViewId) => void; role: RoleId; initialOrderId?: string }) {
  const [data, setData] = useState<WorkflowPreviewResponse | null>(null);
  const [query, setQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [entity, setEntity] = useState<WorkflowEntity>("order");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/data/pathology-workflow", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.action ? `${result.error} ${result.action}` : result.error);
        return result as WorkflowPreviewResponse;
      })
      .then((result) => {
        if (!active) return;
        setData(result);
        const initialOrder = initialOrderId && result.cases.some((item) => item.order.order_id === initialOrderId)
          ? initialOrderId
          : result.cases[0]?.order.order_id ?? "";
        setSelectedOrderId(initialOrder);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "가상 연결 데이터를 불러올 수 없습니다."));
    return () => { active = false; };
  }, [initialOrderId]);

  const filteredCases = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!data || !normalized) return data?.cases ?? [];
    return data.cases.filter((item) => [item.order.order_id, item.specimen.specimen_id, item.pathology_report.report_id, item.order.source_record_id]
      .some((value) => value.toLowerCase().includes(normalized)));
  }, [data, query]);
  const selected = filteredCases.find((item) => item.order.order_id === selectedOrderId) ?? filteredCases[0] ?? null;

  if (error) return <div className="view-stack"><SafetyBanner /><div className="inline-error"><AlertCircle size={16} />{error}</div></div>;
  if (!data || !selected) return <div className="view-stack"><SafetyBanner /><section className="panel"><div className="empty-state short"><div className="spinner teal-spinner" /><h3>{data ? "검색 결과가 없습니다" : "가상 연결 데이터를 불러오는 중입니다"}</h3><p>{data ? "다른 가상 ID로 검색하세요." : "검증된 로컬 미리보기만 읽고 있습니다."}</p></div></section></div>;

  const allTabs: Array<{ id: WorkflowEntity; recordId: string }> = [
    { id: "order", recordId: selected.order.order_id },
    { id: "specimen", recordId: selected.specimen.specimen_id },
    { id: "gross", recordId: selected.gross_description.gross_description_id },
    { id: "blocks", recordId: `${selected.blocks.length}개 블록` },
    { id: "report", recordId: selected.pathology_report.report_id },
    { id: "ihc", recordId: String(selected.immunohistochemistry_result.ihc_result_id) },
    { id: "molecular", recordId: String(selected.molecular_pathology_result.molecular_result_id) },
    { id: "outsourced", recordId: String(selected.outsourced_test_result.outsourced_result_id) },
    { id: "review", recordId: selected.transcription_review.review_id },
  ];
  const tabs = role === "lab"
    ? allTabs.filter((tab) => ["order", "specimen", "blocks", "ihc", "molecular", "outsourced"].includes(tab.id))
    : allTabs;
  const activeEntity: WorkflowEntity = role === "lab" && ["gross", "report", "review"].includes(entity) ? "order" : entity;
  const record = workflowEntityRecord(selected, activeEntity);
  const recordSourceType = (record.source_type ?? "generated_demo") as WorkflowSourceType;

  return (
    <div className="view-stack">
      <SafetyBanner />
      <RoleAccessNotice role={role} area="workflow" />
      <div className="notice-strip"><Database size={17} /><span>전체 15,000개 연결 건 중 검증된 48건을 화면 미리보기로 제공합니다. 전체 JSON 테이블은 서버의 data/generated에 있습니다.</span><SourceActionButton sourceId="pathology-molecular-linkage" onNavigate={onNavigate} /></div>
      <section className="panel workflow-browser">
        <div className="workflow-browser-head">
          <label className="worklist-search"><Search size={18} /><span className="sr-only">가상 ID 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검사·검체·보고서·합성 원본 행 ID 검색" /></label>
          <select value={selected.order.order_id} onChange={(event) => { setSelectedOrderId(event.target.value); setEntity("order"); }} aria-label="가상 검사 선택">
            {filteredCases.map((item) => <option value={item.order.order_id} key={item.order.order_id}>{item.order.order_id} · {item.partition}</option>)}
          </select>
        </div>
        <div className="workflow-identity">
          <div><span className="eyebrow">가상 연결 기준</span><h2>{selected.order.order_id}</h2><p>{selected.order.source_record_id} · {selected.partition === "train" ? "훈련 시트" : "테스트 시트"}</p></div>
          <StatusChip tone="warning">모든 ID는 가상 ID</StatusChip>
        </div>
        <div className="workflow-link-strip" aria-label="연결 ID 바로가기">
          {tabs.map((tab, index) => (
            <Fragment key={tab.id}>
              {index > 0 && <ChevronRight size={16} />}
              <button onClick={() => setEntity(tab.id)}><span>{WORKFLOW_ENTITY_LABELS[tab.id]}</span><strong>{tab.recordId}</strong></button>
            </Fragment>
          ))}
        </div>
        <div className="workflow-tabs" role="tablist" aria-label="병리 업무 객체">
          {tabs.map((tab) => <button type="button" role="tab" id={`workflow-tab-${tab.id}`} aria-controls="workflow-detail-panel" aria-selected={activeEntity === tab.id} tabIndex={activeEntity === tab.id ? 0 : -1} className={activeEntity === tab.id ? "active" : ""} key={tab.id} onClick={() => setEntity(tab.id)}><strong>{WORKFLOW_ENTITY_LABELS[tab.id]}</strong><span>{tab.recordId}</span></button>)}
        </div>
        <div className="workflow-detail" id="workflow-detail-panel" role="tabpanel" aria-labelledby={`workflow-tab-${activeEntity}`}>
          <div className="panel-heading"><div><span className="eyebrow">{WORKFLOW_ENTITY_LABELS[activeEntity]} 화면</span><h2>연결 데이터 상세</h2></div><StatusChip tone={sourceTone(recordSourceType)}>{sourceLabel(recordSourceType)}</StatusChip></div>
          <dl className="workflow-field-grid">
            {Object.entries(record).map(([key, value]) => <div key={key} className={key.endsWith("_id") || key === "source_record_id" ? "id-field" : ""}><dt>{WORKFLOW_FIELD_LABELS[key] ?? key}</dt><dd>{workflowValue(value)}</dd></div>)}
          </dl>
          <p className="panel-note">`public_synthetic`은 원본 XLSX 실제 컬럼에서 직접 매핑한 값에만 적용됩니다. `ORD/SPC/BLK/RPT/IHC/MOL/EXT/REV` ID와 검수 상태, 원문 예시, 면역병리·위탁검사 값은 모두 교육용 가상 값이며 자동 확정되지 않습니다.</p>
        </div>
      </section>
      {role !== "lab" && <StageDataConnection report={selected.pathology_report} onNavigate={onNavigate} />}
      <section className="panel bronchoscopy-auxiliary-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">폐암 기관지내시경검사 종류별 API</span><h2>가상 병리 업무 흐름의 보조 집계</h2></div>
          <div className="heading-actions"><SourceActionButton sourceId="lung16-bronchoscopy" onNavigate={onNavigate} label="기관지내시경 출처" /><StatusChip tone={NCC_LUNG_BRONCHOSCOPY.quality.distributionAvailable ? "teal" : "warning"}>{NCC_LUNG_BRONCHOSCOPY.quality.distributionAvailable ? "집계 가능" : "원천 결측"}</StatusChip></div>
        </div>
        {NCC_LUNG_BRONCHOSCOPY.quality.distributionAvailable ? <div className="auxiliary-grid">
          {NCC_LUNG_BRONCHOSCOPY.targets.map((target) => <div key={target.name}><span>관찰된 검사 종류</span><strong>{target.name}</strong><small>연령·성별 집계 행 {target.observedRows.toLocaleString()}건 · 분자값 합계 {target.observedCountSum.toLocaleString()}</small></div>)}
        </div> : <div className="api-quality-empty"><AlertTriangle size={22} /><div><strong>검사 종류별 집계를 만들 수 없습니다</strong><p>{NCC_LUNG_BRONCHOSCOPY.quality.warning}</p></div></div>}
        <div className="api-source-line"><span>{NCC_LUNG_BRONCHOSCOPY.filters.fromYear}~{NCC_LUNG_BRONCHOSCOPY.filters.toYear} · {NCC_LUNG_BRONCHOSCOPY.source.provider} · API {NCC_LUNG_BRONCHOSCOPY.statistics.apiRows.toLocaleString()}행</span><a href={NCC_LUNG_BRONCHOSCOPY.source.sourcePage} target="_blank" rel="noreferrer">공식 출처 <ExternalLink size={12} /></a></div>
        <p className="panel-note">기관지내시경 API는 공개 집계 참고자료입니다. 가상 검사·검체·보고서 ID와 연결해 개별 환자의 검사 여부, 검체 채취 방법 또는 조직채취 사실을 추정하지 않습니다.</p>
      </section>
    </div>
  );
}

function HistoryView({ sessionReviewed, sessionEdited, sessionIssues, role }: { sessionReviewed: number; sessionEdited: number; sessionIssues: Record<string, number>; role: RoleId }) {
  const issueCount = Object.values(sessionIssues).reduce((total, value) => total + value, 0);
  const issueEntries = Object.entries(sessionIssues).sort((left, right) => right[1] - left[1]);
  return (
    <div className="view-stack">
      <SafetyBanner />
      <RoleAccessNotice role={role} area="history" />
      <section className="history-summary-grid">
        <Metric label="현재 세션 검수" value={String(sessionReviewed)} detail="브라우저 종료 시 초기화" icon={ClipboardCheck} accent="teal" />
        <Metric label="사용자 수정" value={String(sessionEdited)} detail="AI 결과와 구분해 집계" icon={History} accent="blue" />
        <Metric label="발견 오류 유형" value={String(issueEntries.length)} detail={`${issueCount}건 · 유형별 합계`} icon={AlertTriangle} accent="amber" />
      </section>
      <section className="panel history-panel">
        <div className="panel-heading"><div><span className="eyebrow">저장하지 않는 세션 기록</span><h2>검수 패턴 요약</h2></div><StatusChip tone="teal">세션 한정</StatusChip></div>
        {issueEntries.length ? <div className="history-list">{issueEntries.map(([label, count]) => <div className="history-row" key={label}><span>{label}</span><strong>{count}건</strong></div>)}</div> : <div className="empty-state short"><LungEmptyIcon /><h3>아직 검수 이력이 없습니다</h3><p>육안 소견 또는 병리 결과 검수를 완료하면 오류 유형만 집계됩니다.</p></div>}
        <p className="panel-note">안전장치에 따라 입력 원문, AI 응답, 첨부파일과 환자 식별정보는 저장하지 않습니다. 이 화면을 새로고침하거나 브라우저를 종료하면 세션 집계가 초기화됩니다.</p>
      </section>
    </div>
  );
}

function SettingsView() {
  const [syntheticOnly, setSyntheticOnly] = useState(true);
  const [sourceEvidence, setSourceEvidence] = useState(true);
  const [demoMode, setDemoMode] = useState(true);
  return (
    <div className="view-stack">
      <SafetyBanner />
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="panel-heading"><div><span className="eyebrow">사용 범위</span><h2>검수 안전장치</h2></div><ShieldCheck size={20} /></div>
          <label className="setting-row"><span><strong>합성데이터 전용 모드</strong><small>실제 환자정보가 포함된 입력은 분석하지 않습니다.</small></span><input type="checkbox" checked={syntheticOnly} onChange={(event) => setSyntheticOnly(event.target.checked)} /></label>
          <label className="setting-row"><span><strong>원문 근거 표시</strong><small>추출값과 원문 근거를 함께 표시하고 없는 값은 확인 필요로 둡니다.</small></span><input type="checkbox" checked={sourceEvidence} onChange={(event) => setSourceEvidence(event.target.checked)} /></label>
          <label className="setting-row"><span><strong>안전 데모 모드</strong><small>키가 없어도 가상 예시 검수 흐름을 확인할 수 있습니다.</small></span><input type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} /></label>
          <p className="panel-note">이 설정은 현재 브라우저에서만 유지되며 서버에 저장되지 않습니다.</p>
        </section>
        <section className="panel settings-panel">
          <div className="panel-heading"><div><span className="eyebrow">연동 상태</span><h2>데이터·API 출처</h2></div><Database size={20} /></div>
          <div className="integration-list">
            <div><span><strong>국립암센터 폐암 합성데이터</strong><small>로컬 집계 스냅샷 · 15,000행</small></span><StatusChip tone="success">사용 가능</StatusChip></div>
            <div><span><strong>암정보사전·레지스트리 RAG</strong><small>근거 자료와 컬럼 정의만 검색</small></span><StatusChip tone="teal">로컬 검색</StatusChip></div>
            <div><span><strong>Gemini·공공데이터 키</strong><small>키 값은 서버 환경변수로만 관리</small></span><StatusChip tone="warning">값 미표시</StatusChip></div>
          </div>
          <p className="panel-note">질문, 결과, 첨부파일은 API 요청 후 저장하지 않습니다. 이 도구는 진단·판독 시스템이 아닙니다.</p>
        </section>
      </div>
    </div>
  );
}

function KnowledgeView({ onNavigate }: { onNavigate: (view: ViewId) => void }) {
  const [query, setQuery] = useState("병리학적 병기란 무엇인가요?");
  const [answer, setAnswer] = useState<KnowledgeSearchResponse | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"search" | "browse">("search");
  const [browseCategory, setBrowseCategory] = useState("all");
  const [browseInitial, setBrowseInitial] = useState("all");
  const [browsePage, setBrowsePage] = useState(1);
  const [browseData, setBrowseData] = useState<KnowledgeBrowseResponse | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/knowledge/search", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        setAvailable(Boolean(data.available));
        setSources(data.sources ?? []);
        if (!data.available) setError(data.message ?? "근거 자료가 준비되지 않았습니다.");
      })
      .catch(() => active && setError("근거 자료 상태를 확인할 수 없습니다."));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (mode !== "browse") return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      category: browseCategory,
      initial: browseInitial,
      page: String(browsePage),
      pageSize: "40",
    });
    fetch(`/api/knowledge/browse?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as KnowledgeBrowseResponse;
        if (!response.ok) throw new Error(data.message ?? "암정보사전 목차를 불러오지 못했습니다.");
        setBrowseData(data);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setBrowseError(caught instanceof Error ? caught.message : "암정보사전 목차를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBrowseLoading(false);
      });
    return () => controller.abort();
  }, [browseCategory, browseInitial, browsePage, mode]);

  async function search(nextQuery = query) {
    const searchQuery = nextQuery.trim();
    if (!searchQuery) return;
    setLoading(true);
    setError("");
    setAnswer(null);
    try {
      const response = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "근거 자료 검색에 실패했습니다.");
      setAnswer(data);
      setSources(data.sources ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "근거 자료 검색에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function browseItem(item: KnowledgeBrowseItem) {
    setQuery(item.termKo);
    void search(item.termKo);
  }

  return (
    <div className="view-stack">
      <SafetyBanner />
      <div className="knowledge-grid">
        <aside className="panel source-library">
          <div className="panel-heading">
            <div><span className="eyebrow">근거 라이브러리</span><h2>등록 자료</h2></div>
            <div className="heading-actions">
              <SourceActionButton sourceId="cancer-dictionary-snapshot" onNavigate={onNavigate} label="RAG 출처" />
              <StatusChip tone={available ? "teal" : "warning"}>{sources.length ? sources.reduce((sum, source) => sum + source.statistics.entries, 0).toLocaleString() + "개" : "확인 중"}</StatusChip>
            </div>
          </div>
          <div className="source-summary-list">
            {sources.length ? sources.map((source) => (
              <div className="source-summary" key={source.kind}>
                {source.kind === "dictionary" ? <BookOpen size={20} /> : <Database size={20} />}
                <span>
                  <strong>{source.collection}</strong>
                  <small>{source.provider} · {source.statistics.entries.toLocaleString()}개{source.statistics.tables ? ` · ${source.statistics.tables}개 테이블` : ""}</small>
                </span>
              </div>
            )) : (
              <div className="source-summary"><BookOpen size={20} /><span><strong>근거 자료 확인 중</strong><small>로컬 스냅샷 상태를 확인하고 있습니다.</small></span></div>
            )}
          </div>
          {sources.length > 0 && (
            <dl className="source-stats">
              {sources.map((source) => <div key={source.kind}><dt>{source.kind === "dictionary" ? "암·의학 용어" : source.kind === "registry_metadata" ? "레지스트리 필드" : "서비스 교육 항목"}</dt><dd>{source.statistics.entries.toLocaleString()}개</dd></div>)}
            </dl>
          )}
          <p className="source-limitation">용어 설명과 데이터 항목 정의 자료입니다. 기관 업무 매뉴얼, 진단 기준 또는 환자별 레지스트리 값은 포함하지 않습니다.</p>
        </aside>
        <section className="panel rag-panel">
          <div className="panel-heading"><div><span className="step-label">근거 제한 답변</span><h2>암·병리 용어·데이터 항목 검색</h2></div><StatusChip tone="teal">로컬 검색</StatusChip></div>
          <div className="knowledge-mode-switch" role="tablist" aria-label="검색 방식">
            <button type="button" role="tab" aria-selected={mode === "search"} className={mode === "search" ? "active" : ""} onClick={() => setMode("search")}><Search size={14} />자유 검색</button>
            <button type="button" role="tab" aria-selected={mode === "browse"} className={mode === "browse" ? "active" : ""} onClick={() => { if (mode !== "browse") { setBrowseLoading(true); setBrowseError(""); setMode("browse"); } }}><BookOpen size={14} />목차 탐색</button>
          </div>
          {mode === "browse" && (
            <section className="knowledge-browse-panel" aria-label="암정보사전 용어 목차">
              <div className="knowledge-browse-heading">
                <div><span className="eyebrow">암정보사전 · 3,544개</span><h3>암·의학 용어 목차</h3></div>
                <StatusChip tone="warning">교육용 탐색 분류</StatusChip>
              </div>
              <p>{browseData?.classificationNote ?? "등록된 암정보사전 용어를 페이지 단위로 불러옵니다. 분류는 공식 의학 분류체계가 아닙니다."}</p>
              <div className="knowledge-browse-controls">
                <div className="knowledge-category-filter" aria-label="교육용 용어 분류">
                  {(browseData?.categories ?? []).map((category) => (
                    <button
                      type="button"
                      className={browseCategory === category.id ? "active" : ""}
                      aria-pressed={browseCategory === category.id}
                      onClick={() => { if (browseCategory !== category.id) { setBrowseLoading(true); setBrowseError(""); setBrowseCategory(category.id); setBrowsePage(1); } }}
                      key={category.id}
                    >
                      <span>{category.label}</span>
                      <small>{category.count.toLocaleString()}개</small>
                    </button>
                  ))}
                </div>
                <label className="knowledge-initial-filter">
                  <span>시작 글자</span>
                  <select value={browseInitial} onChange={(event) => { setBrowseLoading(true); setBrowseError(""); setBrowseInitial(event.target.value); setBrowsePage(1); }}>
                    {KNOWLEDGE_INITIAL_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="knowledge-browse-status" aria-live="polite">
                {browseLoading ? "용어 목록을 불러오는 중입니다." : browseData ? `${browseData.corpusTotal.toLocaleString()}개 중 ${browseData.rangeStart.toLocaleString()}~${browseData.rangeEnd.toLocaleString()}개 표시 · 현재 분류 ${browseData.total.toLocaleString()}개` : "용어 목록을 준비하고 있습니다."}
              </div>
              {browseError && <div className="inline-error"><AlertCircle size={17} />{browseError}</div>}
              {!browseLoading && browseData?.items.length === 0 && <div className="knowledge-browse-empty">선택한 조건에 해당하는 등록 용어가 없습니다.</div>}
              <div className="knowledge-browse-items" aria-busy={browseLoading}>
                {browseData?.items.map((item) => (
                  <button type="button" key={item.id} onClick={() => browseItem(item)}>
                    <span><strong>{item.termKo}</strong>{item.termEn && <small>{item.termEn}</small>}</span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
              {browseData && browseData.totalPages > 1 && (
                <div className="knowledge-pagination" aria-label="암정보사전 용어 페이지">
                  <button type="button" disabled={browseLoading || browseData.page <= 1} onClick={() => { setBrowseLoading(true); setBrowseError(""); setBrowsePage((page) => Math.max(1, page - 1)); }}>이전</button>
                  <span>{browseData.page.toLocaleString()} / {browseData.totalPages.toLocaleString()}</span>
                  <button type="button" disabled={browseLoading || browseData.page >= browseData.totalPages} onClick={() => { setBrowseLoading(true); setBrowseError(""); setBrowsePage((page) => Math.min(browseData.totalPages, page + 1)); }}>다음</button>
                </div>
              )}
            </section>
          )}
          <div className="search-box"><Search size={19} /><input value={query} maxLength={120} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && !loading && search()} aria-label="암·병리 용어 또는 데이터 항목 질문" /><button disabled={loading || !available} onClick={() => void search()}>{loading ? "검색 중" : "검색"}</button></div>
          <div className="suggestions"><span>예시 검색</span><button onClick={() => setQuery("병리학적 병기란 무엇인가요?")}>병리학적 병기</button><button onClick={() => setQuery("면역조직화학")}>면역조직화학</button><button onClick={() => setQuery("종양 크기 필드")}>종양 크기 필드</button><button onClick={() => setQuery("PATH_STAG")}>PATH_STAG</button></div>
          {error && <div className="inline-error"><AlertCircle size={17} />{error}</div>}
          {answer ? (
            <div className="answer-block">
              <div className="answer-head">{answer.matches[0]?.kind === "registry_metadata" ? <Database size={19} /> : <BookOpen size={19} />}<strong>{answer.matches[0]?.kind === "registry_metadata" ? "레지스트리 필드 근거 답변" : answer.matches[0]?.kind === "project_reference" ? "서비스 교육 자료 근거 답변" : "암정보사전 근거 답변"}</strong></div>
              {answer.answer ? (
                <>
                  <p>{answer.answer}</p>
                  <div className="citation">
                    <span>출처</span>
                    <strong>{answer.matches[0].title}{answer.matches[0].subtitle ? " · " + answer.matches[0].subtitle : ""}</strong>
                    <small>{answer.matches[0].source.provider} · {answer.matches[0].source.collection} · 항목 {answer.matches[0].source.sourceRecordId}</small>
                    <blockquote>“{answer.matches[0].definition}”</blockquote>
                    {answer.matches[0].source.sourcePage
                      ? <a href={answer.matches[0].source.sourcePage} target="_blank" rel="noreferrer">공식 출처 <ExternalLink size={12} /></a>
                      : <small className="local-source-file">로컬 출처 파일: {answer.matches[0].source.sourceFile}</small>}
                  </div>
                  {answer.matches.length > 1 && <div className="related-terms"><span>함께 확인된 항목</span>{answer.matches.slice(1).map((match) => <button key={match.id} onClick={() => setQuery(match.title)}>{match.title}</button>)}</div>}
                </>
              ) : (
                <div className="reference-empty"><AlertTriangle size={18} /><span><strong>등록된 근거 자료에서 충분한 내용을 찾지 못했습니다.</strong><small>답변을 임의로 생성하지 않았습니다. 다른 용어, 영문명 또는 컬럼 ID로 다시 확인하세요.</small></span></div>
              )}
              <div className="answer-warning"><ShieldCheck size={15} />{answer.disclaimer}</div>
            </div>
          ) : <div className="empty-state short"><LungEmptyIcon /><h3>등록 자료에서 근거를 찾습니다</h3><p>암 용어와 레지스트리 필드 정의를 출처와 함께 표시하며, 근거가 없으면 답변하지 않습니다.</p></div>}
        </section>
      </div>
    </div>
  );
}

export function PathoScribeApp() {
  const [activeView, setActiveView] = useState<ViewId>("intro");
  const [activeRole, setActiveRole] = useState<ActiveRoleId>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [sessionEdited, setSessionEdited] = useState(0);
  const [sessionIssues, setSessionIssues] = useState<Record<string, number>>({});
  const [linkedReviewContext, setLinkedReviewContext] = useState<LinkedReviewContext | null>(null);
  const [selectedWorkflowOrderId, setSelectedWorkflowOrderId] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const meta = VIEW_META[activeView];
  const activeNavItems = navItemsForRole(activeRole);
  const roleNavItems = activeNavItems.filter((item) => item.id !== "intro");
  const commonNavItems = NAV_ITEMS.filter((item) => SIDEBAR_COMMON_NAV_IDS.includes(item.id));
  const primaryAction = activeRole ? ROLE_PRIMARY_ACTION[activeRole] : null;
  const content = (() => {
    if (activeView === "intro") return <IntroView onNavigate={(view) => navigate(view)} />;
    if (activeView === "demo") return <DemoView activeRole={activeRole} onSelectRole={changeRole} onOpenDemo={openDemoCase} />;
    if (activeView === "service") return <ServiceDescriptionView onNavigate={navigate} onOpenDemo={openDemoCase} />;
    if (activeView === "sources") return <DataCatalogView />;
    if (!activeRole) return <IntroView onNavigate={(view) => navigate(view)} />;
    if (activeView === "dashboard") return <Dashboard sessionReviewed={sessionReviewed} sessionEdited={sessionEdited} sessionIssues={sessionIssues} onNavigate={navigate} role={activeRole} />;
    if (activeView === "worklist") return <WorklistView onNavigate={(view) => navigate(view)} onOpenLinkedTask={openLinkedTask} onOpenWorkflow={openWorkflowTask} role={activeRole} />;
    if (activeView === "workflow") return <WorkflowView onNavigate={navigate} role={activeRole} initialOrderId={selectedWorkflowOrderId ?? undefined} />;
    if (activeView === "gross") return <AnalyzeWorkspace kind="gross" sample={GROSS_SAMPLE} onReviewed={recordReview} onNavigate={navigate} role={activeRole} linkedEvaluationCaseId={linkedReviewContext?.view === "gross" ? linkedReviewContext.evaluationCaseId : undefined} linkedSourceRowId={linkedReviewContext?.view === "gross" ? linkedReviewContext.sourceRowId : undefined} />;
    if (activeView === "pathology") return <AnalyzeWorkspace kind="pathology" sample={PATHOLOGY_SAMPLE} onReviewed={recordReview} onNavigate={navigate} role={activeRole} linkedEvaluationCaseId={linkedReviewContext?.view === "pathology" ? linkedReviewContext.evaluationCaseId : undefined} linkedSourceRowId={linkedReviewContext?.view === "pathology" ? linkedReviewContext.sourceRowId : undefined} />;
    if (activeView === "referral") return <ReferralView onNavigate={navigate} role={activeRole} linkedEvaluationCaseId={linkedReviewContext?.view === "referral" ? linkedReviewContext.evaluationCaseId : undefined} />;
    if (activeView === "knowledge") return <KnowledgeView onNavigate={navigate} />;
    if (activeView === "history") return <HistoryView sessionReviewed={sessionReviewed} sessionEdited={sessionEdited} sessionIssues={sessionIssues} role={activeRole} />;
    return <SettingsView />;
  })();

  function recordReview(review: SessionReview) {
    setSessionReviewed((value) => value + 1);
    if (review.edited) setSessionEdited((value) => value + 1);
    if (review.issueTitles.length) {
      setSessionIssues((current) => {
        const next = { ...current };
        review.issueTitles.forEach((title) => { next[title] = (next[title] ?? 0) + 1; });
        return next;
      });
    }
  }

  function navigate(view: ViewId) {
    setLinkedReviewContext(null);
    setSelectedWorkflowOrderId(null);
    if (!activeRole) {
      setActiveView(COMMON_NAV_IDS.includes(view) ? view : "intro");
      setMobileNavOpen(false);
      return;
    }
    const canOpen = view === "settings" || COMMON_NAV_IDS.includes(view) || ROLE_PROFILES[activeRole].navViews.includes(view);
    setActiveView(canOpen ? view : ROLE_PROFILES[activeRole].defaultView);
    setMobileNavOpen(false);
  }

  function openDemoCase(view: ViewId) {
    setLinkedReviewContext(null);
    setSelectedWorkflowOrderId(null);
    setActiveRole("him");
    setActiveView(view);
    setMobileNavOpen(false);
  }

  function changeRole(role: ActiveRoleId) {
    setLinkedReviewContext(null);
    setSelectedWorkflowOrderId(null);
    setActiveRole(role);
    setActiveView(role ? ROLE_PROFILES[role].defaultView : "intro");
    setMobileNavOpen(false);
  }

  function openLinkedTask(context: LinkedReviewContext) {
    setLinkedReviewContext(context);
    setSelectedWorkflowOrderId(null);
    setActiveView(context.view);
    setMobileNavOpen(false);
  }

  function openWorkflowTask(orderId: string) {
    setLinkedReviewContext(null);
    setSelectedWorkflowOrderId(orderId);
    setActiveView("workflow");
    setMobileNavOpen(false);
  }
  useEffect(() => { mainRef.current?.focus(); }, [activeView]);
  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">본문 바로가기</a>
      {mobileNavOpen && <button className="mobile-scrim" aria-label="메뉴 닫기" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
        <div className="brand"><div className="brand-mark"><Image src="/images/pathoscribe-lung-mark.png" alt="" width={34} height={34} priority aria-hidden="true" /></div><div><strong>PathoScribe</strong><span>폐암 병리 전사·검수 지원</span></div><button type="button" className="mobile-close" aria-label="메뉴 닫기" onClick={() => setMobileNavOpen(false)}><X size={20} aria-hidden="true" /></button></div>
        <nav className="sidebar-primary-nav" aria-label="서비스 메뉴">
          {PRIMARY_MENU_ITEMS.filter(({ id }) => id !== "demo").map(({ id, label }) => <button type="button" key={id} className={activeView === id ? "active" : ""} onClick={() => navigate(id)} title={sidebarCollapsed ? label : undefined}><span>{label}</span>{activeView === id && <ChevronRight className="nav-chevron" size={16} />}</button>)}
        </nav>
        <label className="sidebar-role-picker">
          <span>업무 시연</span>
          <select value={activeRole ?? ""} onChange={(event) => changeRole((event.target.value || null) as ActiveRoleId)} aria-label="업무 시연 역할 선택">
            <option value="">역할 선택</option>
            {(Object.entries(ROLE_PROFILES) as Array<[RoleId, (typeof ROLE_PROFILES)[RoleId]]>).map(([id, profile]) => <option value={id} key={id}>{profile.label}</option>)}
          </select>
          <small>교육용 화면 범위 선택</small>
        </label>
        <nav className="sidebar-common-nav" aria-label="공통 옵션">
          {commonNavItems.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={activeView === id ? "active" : ""} onClick={() => navigate(id)} title={sidebarCollapsed ? label : undefined}><Icon size={19} /><span>{label}</span>{activeView === id && <ChevronRight className="nav-chevron" size={16} />}</button>)}
        </nav>
        {activeRole && primaryAction && <>
          <button type="button" className="sidebar-primary-button" onClick={() => navigate(primaryAction.view)}><Sparkles size={17} />{primaryAction.label}</button>
          <nav aria-label={`${ROLE_PROFILES[activeRole].label} 주요 기능`}>{roleNavItems.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={activeView === id ? "active" : ""} onClick={() => navigate(id)} title={sidebarCollapsed ? label : undefined}><Icon size={19} /><span>{label}</span>{activeView === id && <ChevronRight className="nav-chevron" size={16} />}</button>)}</nav>
        </>}
        <button type="button" className="collapse-button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"} title={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}><PanelLeftClose size={18} aria-hidden="true" /><span>사이드바 접기</span></button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button type="button" className="mobile-menu" aria-label="메뉴 열기" onClick={() => setMobileNavOpen(true)}><Menu size={21} aria-hidden="true" /></button>
          <div className="page-title"><h1>{meta.title}</h1><p>{meta.description}</p></div>
          <div className="top-actions">
            <StatusChip tone={activeRole ? "teal" : "warning"}>{activeRole ? `${ROLE_PROFILES[activeRole].shortLabel} 보기` : "역할 선택 필요"}</StatusChip>
            <StatusChip tone="warning"><span className="live-dot" />DEMO</StatusChip>
          </div>
        </header>
        <main id="main-content" ref={mainRef} tabIndex={-1}>{activeRole && !["intro", "demo", "service"].includes(activeView) && <RoleScopeBanner role={activeRole} onNavigate={navigate} />}{content}</main>
        <footer><span>PathoScribe v0.1 · 가상·공개 합성데이터 전용</span><strong>진단·판독 도구가 아닌 전사·검수 지원 도구입니다.</strong></footer>
      </div>
    </div>
  );
}
