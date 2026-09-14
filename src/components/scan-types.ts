// API response types for the home-page feature sections.
// These mirror the JSON shapes returned by the /api routes.


export type ScoreResult = {
  score: number;
  breakdown: { label: string; got: number; max: number }[];
};

export type LayerResult = {
  id: string;
  name: string;
  status: "protected" | "partial" | "absent" | "info";
  summary: string;
  details: string[];
  points: number;
  maxPoints: number;
};

export type RemediationStep = {
  step: number;
  title: string;
  description: string;
  code?: string;
};

export type CloudflareCheckResult = {
  isCloudflare: boolean;
  riskLevel: "HIGH_RISK" | "WARNING" | "GOOD" | "NEUTRAL" | "SKIPPED";
  googleExtendedStatus: "CORRECT" | "DANGEROUS" | "MISSING" | "ALLOW" | null;
  scoreDelta: number;
  headline: string;
  detail: string;
  remediation: RemediationStep[] | null;
};

export const LAYER_STATUS_LABEL: Record<LayerResult["status"], string> = {
  protected: "PROTECTED",
  partial: "PARTIAL",
  absent: "MISSING",
  info: "NOTE",
};

export type ScanResponse = {
  scan: {
    url: string;
    reachable: boolean;
    robotsFound: boolean;
    blockedCrawlers: string[];
    openCrawlers: string[];
    verdicts: { userAgent: string; allowed: boolean; reason: string }[];
    metaTagsFound: string[];
    aiTxtFound: boolean;
    xRobotsTagHeaders: string[];
    llmsTxtFound: boolean;
    aiPrefSignals: string[];
    cloudflare: CloudflareCheckResult;
    layers: LayerResult[];
    scannedAt: string;
  };
  artifacts: {
    robotsSnippet: string;
    fullRobotsTxt: string;
    aiTxt: string;
    metaTags: string;
    legalNotice: string;
    rslXml: string;
  };
  score: ScoreResult;
};

export type VerifyResponse = {
  score: ScoreResult;
  layers?: LayerResult[];
  blockedCrawlers: string[];
  openCrawlers: string[];
};

export type ProbeData = {
  domain: string;
  probes: string[];
  sourceHash: string;
  wordCount: number;
};

export type CcCrawl = { id: string; name: string; captures: number | null; error?: string };
export type CcResponse = {
  domain: string;
  inCorpus: boolean;
  totalCaptures: number;
  indexesChecked: number;
  crawls: CcCrawl[];
  checkedAt: string;
};

export type TimelineProbe = {
  timestamp: string;
  at: string;
  archiveUrl: string;
  reserved: boolean;
  blocked: number;
  total: number;
};

export type TimelineResponse = {
  domain: string;
  robotsUrl: string;
  history: {
    reservedSince: TimelineProbe | null;
    lastUnreserved: TimelineProbe | null;
    probes: TimelineProbe[];
    monthsSearched: number;
    complete: boolean;
    bracketed: boolean;
  };
  current: { reserved: boolean; blocked: number; total: number; checked: boolean };
  crawls: {
    id: string;
    name: string;
    from: string;
    to: string;
    phase: "pre" | "post" | "straddles" | "unknown";
    note: string;
  }[];
  verdict: string;
  builtAt: string;
  record: string;
};

export const PHASE_LABEL: Record<TimelineResponse["crawls"][number]["phase"], string> = {
  pre: "BEFORE",
  post: "AFTER",
  straddles: "SPANS",
  unknown: "UNDATED",
};

export type EngineAnalysis = {
  engine: string;
  containment: number;
  level: "CLEAN" | "SUSPICIOUS" | "COPIED";
  matches: { source: string; answer: string }[];
};
