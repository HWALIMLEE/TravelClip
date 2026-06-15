"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Link2,
  ArrowRight,
  MapPin,
  Heart,
  Copy,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Zap,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Region = "전체" | "일본" | "동남아" | "유럽" | "미주" | "기타";

const TEMP_ITINERARY_URL = "/itinerary/eae1b469-926d-40d3-b6f7-9a5d8b8142ad";

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-800",
  red: "bg-red-800",
  green: "bg-green-900",
  yellow: "bg-yellow-900",
  purple: "bg-purple-900",
  slate: "bg-slate-700",
  orange: "bg-orange-900",
  cyan: "bg-cyan-900",
};

const CITY_FLAG: Record<string, string> = {
  도쿄: "🇯🇵",
  오사카: "🇯🇵",
  교토: "🇯🇵",
  후쿠오카: "🇯🇵",
  삿포로: "🇯🇵",
  나고야: "🇯🇵",
  나라: "🇯🇵",
  발리: "🇮🇩",
  방콕: "🇹🇭",
  싱가포르: "🇸🇬",
  하노이: "🇻🇳",
  다낭: "🇻🇳",
  호치민: "🇻🇳",
  푸켓: "🇹🇭",
  세부: "🇵🇭",
  쿠알라룸푸르: "🇲🇾",
  파리: "🇫🇷",
  런던: "🇬🇧",
  바르셀로나: "🇪🇸",
  로마: "🇮🇹",
  암스테르담: "🇳🇱",
  프라하: "🇨🇿",
  빈: "🇦🇹",
  베를린: "🇩🇪",
  리스본: "🇵🇹",
  뉴욕: "🇺🇸",
  로스앤젤레스: "🇺🇸",
  시카고: "🇺🇸",
  밴쿠버: "🇨🇦",
  토론토: "🇨🇦",
  시드니: "🇦🇺",
  멜버른: "🇦🇺",
};

const CITY_REGION: Record<string, string> = {
  도쿄: "일본",
  오사카: "일본",
  교토: "일본",
  후쿠오카: "일본",
  삿포로: "일본",
  나고야: "일본",
  나라: "일본",
  발리: "동남아",
  방콕: "동남아",
  싱가포르: "동남아",
  하노이: "동남아",
  다낭: "동남아",
  호치민: "동남아",
  푸켓: "동남아",
  세부: "동남아",
  쿠알라룸푸르: "동남아",
  파리: "유럽",
  런던: "유럽",
  바르셀로나: "유럽",
  로마: "유럽",
  암스테르담: "유럽",
  프라하: "유럽",
  빈: "유럽",
  베를린: "유럽",
  리스본: "유럽",
  뉴욕: "미주",
  로스앤젤레스: "미주",
  시카고: "미주",
  밴쿠버: "미주",
  토론토: "미주",
  시드니: "기타",
  멜버른: "기타",
};

const CATEGORY_LABEL: Record<string, string> = {
  restaurant: "식당",
  cafe: "카페",
  attraction: "관광지",
  hotel: "숙소",
  shopping: "쇼핑",
  park: "공원",
  bar: "바",
  other: "기타",
};

const REGION_FLAG: Record<string, string> = {
  일본: "🇯🇵",
  동남아: "🌴",
  유럽: "🇪🇺",
  미주: "🇺🇸",
  기타: "🗺️",
};

type FeedItem = {
  id: string;
  flag: string;
  city: string;
  days: string;
  title: string;
  places: number;
  route: string;
  likes: number;
  clones: number;
  color: string;
  region: string;
  link: string;
};

type PreviewPlace = {
  rawName: string;
  category?: string;
  cityHint?: string;
  place: {
    name: string;
    address: string;
    lat: number;
    lng: number;
    maps_url?: string;
    rating?: number;
  } | null;
};

type PreviewStep = "idle" | "content" | "ai" | "maps" | "done" | "error";

const MOCK_FEED: FeedItem[] = [
  {
    id: "mock-1",
    flag: "🇯🇵",
    city: "도쿄",
    days: "3박 4일",
    title: "도쿄 3박 4일 맛집 투어",
    places: 12,
    route: "시부야 → 신주쿠 → 아사쿠사",
    likes: 284,
    clones: 47,
    color: "bg-blue-800",
    region: "일본",
    link: TEMP_ITINERARY_URL,
  },
  {
    id: "mock-2",
    flag: "🇯🇵",
    city: "오사카",
    days: "2박 3일",
    title: "오사카 쇼핑 스팟 베스트",
    places: 9,
    route: "도톤보리 → 신사이바시 → 난바",
    likes: 193,
    clones: 31,
    color: "bg-red-800",
    region: "일본",
    link: TEMP_ITINERARY_URL,
  },
  {
    id: "mock-3",
    flag: "🇯🇵",
    city: "교토",
    days: "2박 3일",
    title: "교토 숨은 카페 여행",
    places: 7,
    route: "기온 → 아라시야마 → 니시키",
    likes: 156,
    clones: 28,
    color: "bg-green-900",
    region: "일본",
    link: TEMP_ITINERARY_URL,
  },
  {
    id: "mock-4",
    flag: "🇮🇩",
    city: "발리",
    days: "4박 5일",
    title: "발리 인스타 스팟 4일",
    places: 14,
    route: "우붓 → 스미냑 → 짱구",
    likes: 341,
    clones: 62,
    color: "bg-yellow-900",
    region: "동남아",
    link: TEMP_ITINERARY_URL,
  },
  {
    id: "mock-5",
    flag: "🇹🇭",
    city: "방콕",
    days: "3박 4일",
    title: "방콕 야시장 & 사원 코스",
    places: 11,
    route: "왓포 → 짜뚜짝 → 아시아티크",
    likes: 212,
    clones: 38,
    color: "bg-purple-900",
    region: "동남아",
    link: TEMP_ITINERARY_URL,
  },
  {
    id: "mock-6",
    flag: "🇫🇷",
    city: "파리",
    days: "5박 6일",
    title: "파리 5일 핵심 코스",
    places: 15,
    route: "에펠탑 → 루브르 → 마레",
    likes: 428,
    clones: 91,
    color: "bg-slate-700",
    region: "유럽",
    link: TEMP_ITINERARY_URL,
  },
];

function calcDays(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) return "";
  const diff = Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (diff <= 0) return "당일치기";
  return `${diff}박 ${diff + 1}일`;
}

function findCityMatch(city: string) {
  const normalized = city.trim();
  if (!normalized) return "";
  return (
    Object.keys(CITY_FLAG).find((knownCity) => normalized.includes(knownCity)) ??
    Object.keys(CITY_REGION).find((knownCity) => normalized.includes(knownCity)) ??
    normalized
  );
}

function getFeedRegion(city: string, displayRegion?: string) {
  const matchedCity = findCityMatch(city);
  return displayRegion ?? CITY_REGION[matchedCity] ?? "기타";
}

function getFeedFlag(city: string, region: string, displayFlag?: string) {
  const matchedCity = findCityMatch(city);
  return displayFlag ?? CITY_FLAG[matchedCity] ?? REGION_FLAG[region] ?? "🗺️";
}

const filters: Region[] = ["전체", "일본", "동남아", "유럽"];
const filterLabels: Record<string, string> = {
  전체: "전체",
  일본: "🇯🇵 일본",
  동남아: "🌴 동남아",
  유럽: "🇪🇺 유럽",
};

const stats = [
  { value: "3,248", label: "저장된 영상" },
  { value: "12,940", label: "추출된 장소" },
  { value: "142", label: "커버 도시" },
  { value: "1,830", label: "공유된 일정" },
];


const LOADING_PHASES: { step: PreviewStep; label: string }[] = [
  { step: "content", label: "콘텐츠 정보 확인 중" },
  { step: "ai", label: "AI가 장소 후보 찾는 중" },
  { step: "maps", label: "Google Maps에서 위치 확인 중" },
];

export default function HomePage() {
  const [activeFilter, setActiveFilter] = useState<string>("전체");
  const [feedItems, setFeedItems] = useState<FeedItem[]>(MOCK_FEED);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  // URL 미리보기 상태
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [previewStep, setPreviewStep] = useState<PreviewStep>("idle");
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewCreator, setPreviewCreator] = useState("");
  const [previewPlaces, setPreviewPlaces] = useState<PreviewPlace[]>([]);
  const [previewError, setPreviewError] = useState("");
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [savedSourceId, setSavedSourceId] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null),
    );
    return () => listener.subscription.unsubscribe();
  }, [supabase.auth]);

  useEffect(() => {
    fetch("/api/public/itineraries")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const items: FeedItem[] = data.map((item) => {
            const d = item.featured_display ?? {};
            const city = item.city ?? "";
            const region = getFeedRegion(city, d.region);
            return {
              id: item.id,
              flag: getFeedFlag(city, region, d.flag),
              city,
              days: calcDays(item.start_date, item.end_date),
              title: item.title,
              places: item.place_count ?? 0,
              route: d.route ?? "",
              likes: d.likes ?? 0,
              clones: d.clones ?? 0,
              color: COLOR_MAP[d.color ?? "blue"] ?? "bg-blue-800",
              region,
              link: `/itinerary/${item.id}`,
            };
          });
          setFeedItems(items);
        }
      })
      .catch(() => {
        /* mock 유지 */
      });
  }, []);

  // 클립보드에 YouTube/Instagram URL이 있으면 자동 감지
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return;
    navigator.clipboard.readText().then((text) => {
      const trimmed = text.trim();
      const isYouTube = trimmed.includes("youtube.com") || trimmed.includes("youtu.be");
      const isInstagram = trimmed.includes("instagram.com");
      if (isYouTube || isInstagram) {
        setClipboardUrl(trimmed);
      }
    }).catch(() => { /* 권한 없으면 무시 */ });
  }, []);

  const filtered =
    activeFilter === "전체"
      ? feedItems
      : feedItems.filter((i) => i.region === activeFilter);

  const runExtraction = async (url: string) => {
    setSubmittedUrl(url);
    setSavedSourceId(null);
    setPreviewPlaces([]);
    setPreviewTitle("");
    setPreviewCreator("");
    setPreviewError("");
    setPreviewStep("content");

    setTimeout(
      () =>
        previewRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      100,
    );

    try {
      if (user) {
        // 로그인 상태: DB에 저장하는 정식 플로우
        const sourceRes = await fetch("/api/sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const sourceData = await sourceRes.json();
        if (!sourceRes.ok) {
          setPreviewError(
            sourceData.error ?? "콘텐츠 정보를 가져오지 못했어요.",
          );
          setPreviewStep("error");
          return;
        }
        const sourceId: string = sourceData.id;
        setSavedSourceId(sourceId);
        setPreviewTitle(sourceData.title ?? "");
        setPreviewCreator(sourceData.creator ?? "");

        // 캐시 히트: parse/match 없이 이미 저장된 결과를 바로 로드
        if (sourceData.from_cache) {
          setPreviewStep("maps");
          const getRes = await fetch(`/api/sources/${sourceId}`);
          const getData = await getRes.json();
          if (!getRes.ok) {
            setPreviewError(getData.error ?? "결과를 불러오지 못했어요.");
            setPreviewStep("error");
            return;
          }
          const cachedPlaces: PreviewPlace[] = (getData.extractedPlaces ?? []).map(
            (ep: { raw_name: string; category?: string; city_hint?: string; place: PreviewPlace["place"] }) => ({
              rawName: ep.raw_name,
              category: ep.category,
              cityHint: ep.city_hint,
              place: ep.place,
            }),
          );
          setPreviewPlaces(cachedPlaces);
          setPreviewStep("done");
          return;
        }

        setPreviewStep("ai");
        const parseRes = await fetch(`/api/sources/${sourceId}/parse`, {
          method: "POST",
        });
        const parseData = await parseRes.json();
        if (!parseRes.ok) {
          setPreviewError(parseData.error ?? "AI 분석 중 오류가 발생했어요.");
          setPreviewStep("error");
          return;
        }

        setPreviewStep("maps");
        const matchRes = await fetch(`/api/sources/${sourceId}/match`, {
          method: "POST",
        });
        const matchData = await matchRes.json();
        if (!matchRes.ok) {
          setPreviewError(
            matchData.error ?? "Google Maps 매칭 중 오류가 발생했어요.",
          );
          setPreviewStep("error");
          return;
        }

        const places: PreviewPlace[] = (matchData.extractedPlaces ?? []).map(
          (ep: {
            raw_name: string;
            category?: string;
            city_hint?: string;
            place: PreviewPlace["place"];
          }) => ({
            rawName: ep.raw_name,
            category: ep.category,
            cityHint: ep.city_hint,
            place: ep.place,
          }),
        );
        setPreviewPlaces(places);
        setPreviewStep("done");
      } else {
        // 비로그인: 공개 미리보기 API (DB 저장 없음)
        await new Promise((r) => setTimeout(r, 600));
        setPreviewStep("ai");
        await new Promise((r) => setTimeout(r, 800));
        setPreviewStep("maps");

        const res = await fetch("/api/public/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPreviewError(data.error ?? "장소를 찾지 못했어요.");
          setPreviewStep("error");
          return;
        }
        setPreviewTitle(data.title ?? "");
        setPreviewCreator(data.creator ?? "");
        setPreviewPlaces(data.places ?? []);
        setPreviewStep("done");
      }
    } catch {
      setPreviewError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
      setPreviewStep("error");
    }
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError("");

    const trimmed = urlInput.trim();
    if (!trimmed) {
      setUrlError("URL을 입력해주세요.");
      return;
    }

    const isYouTube =
      trimmed.includes("youtube.com") || trimmed.includes("youtu.be");
    const isInstagram = trimmed.includes("instagram.com");
    if (!isYouTube && !isInstagram) {
      setUrlError("YouTube 또는 Instagram URL을 입력해주세요.");
      return;
    }

    await runExtraction(trimmed);
  };

  const handleSaveToMap = () => {
    if (user && savedSourceId) {
      // 이미 추출 완료 → 결과 화면으로 바로 이동
      router.push(`/sources/new?sourceId=${savedSourceId}`);
    } else if (user) {
      router.push("/sources/new");
    } else {
      router.push(
        `/login?redirectTo=${encodeURIComponent(`/sources/new?url=${encodeURIComponent(submittedUrl)}`)}`
      );
    }
  };

  const resetPreview = () => {
    setPreviewStep("idle");
    setPreviewPlaces([]);
    setPreviewTitle("");
    setPreviewCreator("");
    setPreviewError("");
    setUrlInput("");
    setSubmittedUrl("");
    setSavedSourceId(null);
  };

  const isLoading =
    previewStep === "content" || previewStep === "ai" || previewStep === "maps";
  const matchedCount = previewPlaces.filter((p) => p.place).length;

  return (
    <div className="flex flex-col bg-gray-900 min-h-screen">
      {/* Hero 섹션 */}
      <section className="py-20 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          {/* 지원 플랫폼 배지 */}
          <div className="inline-flex items-center gap-2 mb-8">
            <span className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-sm px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              YouTube
            </span>
            <span className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 text-gray-300 text-sm px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-pink-500 shrink-0" />
              Instagram
            </span>
            <span className="text-gray-600 text-sm">지원</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-4">
            저장만 해두고 잊어버린
            <br />
            <span className="text-blue-400">여행 릴스</span>
          </h1>

          <p className="text-gray-400 text-lg mb-8 leading-relaxed">
            링크 하나만 넣으면 AI가 장소를 찾아
            <br />
            <span className="text-gray-300">지도와 여행 코스</span>로 정리해드립니다
          </p>

          {/* 자동 Paste 배너 */}
          {clipboardUrl && !urlInput && (
            <div className="max-w-2xl mx-auto mb-3 flex items-center justify-between gap-3 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2.5">
              <span className="text-blue-300 text-sm truncate">
                복사한 링크를 발견했습니다
              </span>
              <button
                type="button"
                onClick={() => {
                  setUrlInput(clipboardUrl);
                  setClipboardUrl(null);
                }}
                className="shrink-0 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                붙여넣기
              </button>
            </div>
          )}

          {/* URL 입력 폼 */}
          <form onSubmit={handleUrlSubmit} className="max-w-2xl mx-auto mb-5">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <Link2 className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setUrlError("");
                    if (e.target.value) setClipboardUrl(null);
                  }}
                  placeholder="예) https://www.instagram.com/reel/... 또는 https://youtube.com/shorts/..."
                  disabled={isLoading}
                  className="w-full bg-gray-800 border border-gray-600 rounded-xl pl-9 pr-4 py-3.5 text-sm text-white placeholder-gray-500 outline-none focus:border-blue-500 transition disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !urlInput.trim()}
                className={`w-full sm:w-auto px-5 py-3.5 text-white text-sm font-medium rounded-xl transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 ${
                  isLoading || !urlInput.trim()
                    ? 'bg-gray-600 cursor-not-allowed opacity-60'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                여행 장소 찾기
              </button>
            </div>
            {urlError && (
              <p className="text-red-400 text-xs mt-2 text-left">{urlError}</p>
            )}
          </form>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <span className="text-gray-500 text-sm">무료 · 로그인 불필요</span>
          </div>
        </div>
      </section>

      {/* 미리보기 결과 영역 */}
      {previewStep !== "idle" && (
        <section ref={previewRef} className="px-4 pb-12">
          <div className="max-w-2xl mx-auto">
            {/* 로딩 중 */}
            {isLoading && (
              <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6">
                <div className="flex items-center gap-3 mb-5">
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
                  <span className="text-white font-medium">
                    {LOADING_PHASES.find((p) => p.step === previewStep)
                      ?.label ?? "분석 중..."}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {LOADING_PHASES.map((phase, idx) => {
                    const currentIdx = LOADING_PHASES.findIndex(
                      (p) => p.step === previewStep,
                    );
                    const isDone = idx < currentIdx;
                    const isActive = idx === currentIdx;
                    return (
                      <div
                        key={phase.step}
                        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${
                          isActive
                            ? "border-blue-500/40 bg-blue-500/10"
                            : isDone
                              ? "border-green-500/30 bg-green-500/10"
                              : "border-gray-700 bg-gray-900/50"
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                            isActive
                              ? "bg-blue-600 text-white"
                              : isDone
                                ? "bg-green-600 text-white"
                                : "bg-gray-700 text-gray-500"
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            idx + 1
                          )}
                        </div>
                        <span
                          className={`text-sm ${isActive || isDone ? "text-white" : "text-gray-500"}`}
                        >
                          {phase.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 에러 */}
            {previewStep === "error" && (
              <div className="bg-gray-800 rounded-2xl border border-red-500/30 p-6">
                <p className="text-red-400 font-medium mb-1">
                  장소를 찾지 못했어요
                </p>
                <p className="text-gray-400 text-sm mb-4">{previewError}</p>
                <button
                  onClick={resetPreview}
                  className="text-sm text-blue-400 border border-blue-500/40 px-4 py-2 rounded-lg hover:bg-blue-500/10 transition-colors"
                >
                  다시 시도
                </button>
              </div>
            )}

            {/* 결과 */}
            {previewStep === "done" && (
              <div className="flex flex-col gap-4">
                {/* 헤더 */}
                <div className="bg-gray-800 rounded-2xl border border-gray-700 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">
                          {previewTitle || "콘텐츠 분석 완료"}
                        </p>
                        {previewCreator && (
                          <p className="text-gray-400 text-xs">
                            {previewCreator}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-gray-400 text-xs">
                        {matchedCount}개 장소 발견
                      </span>
                      <button
                        onClick={resetPreview}
                        className="text-xs text-gray-500 border border-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        다른 URL
                      </button>
                    </div>
                  </div>
                </div>

                {/* 장소 없음 */}
                {previewPlaces.length === 0 && (
                  <div className="bg-gray-800 rounded-2xl border border-gray-700 p-8 text-center">
                    <p className="text-white font-medium mb-2">
                      장소 정보를 찾을 수 없어요
                    </p>
                    <p className="text-gray-400 text-sm">
                      설명란이나 댓글에서 장소를 찾지 못했어요.
                    </p>
                  </div>
                )}

                {/* 장소 목록 */}
                {previewPlaces.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {previewPlaces.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-800 rounded-xl border border-gray-700 px-4 py-3 flex items-start gap-3"
                      >
                        <div className="w-7 h-7 rounded-lg bg-blue-600/20 flex items-center justify-center shrink-0 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white text-sm font-medium">
                              {item.place?.name ?? item.rawName}
                            </span>
                            {item.category && (
                              <span className="text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded-md">
                                {CATEGORY_LABEL[item.category] ?? item.category}
                              </span>
                            )}
                          </div>
                          {item.place?.address && (
                            <p className="text-gray-400 text-xs mt-0.5 truncate">
                              {item.place.address}
                            </p>
                          )}
                          {!item.place && (
                            <p className="text-gray-500 text-xs mt-0.5">
                              Google Maps 매칭 실패
                            </p>
                          )}
                        </div>
                        {item.place?.maps_url && (
                          <a
                            href={item.place.maps_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 mt-0.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* 저장 CTA */}
                {previewPlaces.length > 0 && (
                  <button
                    onClick={handleSaveToMap}
                    className="w-full py-3.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <MapPin className="w-4 h-4" />
                    {user
                      ? "내 지도에 저장하기"
                      : "로그인하고 내 지도에 저장하기"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 통계 바 */}
      <section className="bg-gray-800 py-6 px-4 border-y border-gray-700">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-gray-400 text-sm mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 이렇게 사용하세요 — 3단계 */}
      <section className="py-14 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              이렇게 사용하세요
            </h2>
            <p className="text-gray-400 text-sm">
              링크 하나로 여행 일정까지, 모든 게 자동으로 연결됩니다
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Step 1 */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center mb-4">
                <Link2 className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-blue-400 text-xs font-semibold">STEP 1</span>
              </div>
              <h3 className="text-white font-semibold mb-2">링크 복사</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                인스타그램이나 유튜브에서 마음에 드는 여행 릴스·쇼츠의 URL을 복사하세요.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center mb-4">
                <Zap className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-blue-400 text-xs font-semibold">STEP 2</span>
              </div>
              <h3 className="text-white font-semibold mb-2">AI 장소 추출</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                입력창에 붙여넣고 버튼을 누르면 AI가 영상 속 장소를 자동으로 찾아냅니다.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center mb-4">
                <MapPin className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-blue-400 text-xs font-semibold">STEP 3</span>
              </div>
              <h3 className="text-white font-semibold mb-2">지도·코스 완성</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                장소들이 지도에 펼쳐지고, AI가 이동 동선과 영업시간을 고려해 여행 코스를 만들어줍니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 공개 일정 피드 */}
      <section id="feed" className="py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-white font-semibold text-lg">
              🔥 이 일정, 그대로 가져다 쓰세요
            </span>
          </div>

          <div className="flex gap-2 mb-6 flex-wrap">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeFilter === f
                    ? "bg-white text-gray-900"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
                }`}
              >
                {filterLabels[f]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <Link
                key={item.id}
                href={item.link}
                className="rounded-2xl overflow-hidden border border-gray-700 bg-gray-800 hover:border-gray-500 transition-colors block"
              >
                <div className={`${item.color} px-5 py-5`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white font-semibold text-lg">
                      <span>{item.flag}</span>
                      <span>{item.city}</span>
                    </div>
                    <span className="text-white/70 text-sm">{item.days}</span>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-2">
                    <MapPin className="w-3 h-3" />
                    <span>
                      {item.city} · {item.places}개 장소
                    </span>
                  </div>
                  <p className="text-white font-semibold text-sm mb-1">
                    {item.title}
                  </p>
                  <p className="text-gray-400 text-xs mb-4">{item.route}</p>

                  <div className="flex items-center gap-3 text-gray-400 text-sm">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5" />
                      {item.likes}
                    </span>
                    <span className="flex items-center gap-1">
                      <Copy className="w-3.5 h-3.5" />
                      {item.clones}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="h-16" />
    </div>
  );
}
