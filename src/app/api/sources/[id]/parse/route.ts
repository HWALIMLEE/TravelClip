import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AnthropicApiError, extractPlacesFromText } from "@/lib/anthropic";
import { logErrorEvent } from "@/lib/error-logger";
import type { ParsedPlace } from "@/types";

function debugLog(label: string, data: unknown) {
  console.log(`${label} ${JSON.stringify(data, null, 2)}`);
}

function normalizePlaceName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isSameAsHint(name: string, hint?: string) {
  if (!hint) return false;
  return normalizePlaceName(name) === normalizePlaceName(hint);
}

function isSpecificPlaceCandidate(place: ParsedPlace) {
  const normalizedName = normalizePlaceName(place.raw_name);
  if (!normalizedName) return false;
  if (
    isSameAsHint(place.raw_name, place.city_hint) ||
    isSameAsHint(place.raw_name, place.area_hint)
  ) {
    return false;
  }
  if ((place.confidence ?? 0) < 0.6) return false;

  return true;
}

function dedupeParsedPlaces(places: ParsedPlace[]) {
  const placesByName = new Map<string, ParsedPlace>();

  for (const place of places.filter(isSpecificPlaceCandidate)) {
    const key = normalizePlaceName(place.raw_name);
    const previous = placesByName.get(key);

    if (!previous || (place.confidence ?? 0) > (previous.confidence ?? 0)) {
      placesByName.set(key, place);
    }
  }

  return Array.from(placesByName.values());
}

const TEMP_PARSED_PLACES: ParsedPlace[] = [
  {
    raw_name: "카멜백 샌드위치 & 에스프레소",
    category: "cafe",
    city_hint: "도쿄",
    area_hint: "시부야",
    evidence_text: "카멜백 샌드위치 & 에스프레소",
    reason: "임시 fixture: 지도 저장 플로우 테스트용",
    confidence: 0.95,
    needs_reservation: false,
  },
  {
    raw_name: "멘야무사시 신주쿠 본점",
    category: "restaurant",
    city_hint: "도쿄",
    area_hint: "신주쿠",
    evidence_text: "멘야무사시 신주쿠 본점",
    reason: "임시 fixture: 지도 저장 플로우 테스트용",
    confidence: 0.95,
    needs_reservation: false,
  },
  {
    raw_name: "히노토리",
    category: "restaurant",
    city_hint: "도쿄",
    area_hint: "신주쿠",
    evidence_text: "히노토리",
    reason: "임시 fixture: 지도 저장 플로우 테스트용",
    confidence: 0.9,
    needs_reservation: false,
  },
  {
    raw_name: "스타벅스 미야시타 공원점",
    category: "cafe",
    city_hint: "도쿄",
    area_hint: "시부야",
    evidence_text: "스타벅스 미야시타 공원점",
    reason: "임시 fixture: 지도 저장 플로우 테스트용",
    confidence: 0.95,
    needs_reservation: false,
  },
  {
    raw_name: "요요기 공원",
    category: "park",
    city_hint: "도쿄",
    area_hint: "시부야",
    evidence_text: "요요기 공원",
    reason: "임시 fixture: 지도 저장 플로우 테스트용",
    confidence: 0.95,
    needs_reservation: false,
  },
];

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceSupabase = await createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 소스 조회
  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (sourceError || !source) {
    return NextResponse.json(
      { error: "소스를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  if (!source.raw_text) {
    return NextResponse.json(
      { error: "추출할 텍스트가 없습니다." },
      { status: 400 },
    );
  }

  // 상태를 parsing으로 업데이트
  await supabase.from("sources").update({ status: "parsing" }).eq("id", id);

  try {
    debugLog("[parse] Claude place extraction started", {
      sourceId: id,
      url: source.url,
      title: source.title,
      creator: source.creator,
      rawTextLength: source.raw_text.length,
    });

    // LLM으로 장소 추출
    const parsedPlaces = await extractPlacesFromText(source.raw_text);
    // const parsedPlaces = TEMP_PARSED_PLACES;
    debugLog("[parse] Claude extracted places", {
      sourceId: id,
      mode: "claude",
      count: parsedPlaces.length,
      places: parsedPlaces,
    });

    if (parsedPlaces.length === 0) {
      await supabase.from("sources").update({ status: "parsed" }).eq("id", id);
      return NextResponse.json({
        extractedPlaces: [],
        message: "추출된 장소가 없습니다.",
        debug: { parsedPlaces },
      });
    }

    const dedupedPlaces = dedupeParsedPlaces(parsedPlaces);
    debugLog("[parse] Deduped extracted places before Google matching", {
      sourceId: id,
      beforeCount: parsedPlaces.length,
      afterCount: dedupedPlaces.length,
    });

    if (dedupedPlaces.length === 0) {
      await serviceSupabase.from("extracted_places").delete().eq("source_id", id);
      await supabase.from("sources").update({ status: "parsed" }).eq("id", id);
      return NextResponse.json({
        extractedPlaces: [],
        candidateCount: 0,
        message: "추출된 장소가 없습니다.",
        debug: {
          parsedPlaces,
          filteredOutCount: parsedPlaces.length,
        },
      });
    }

    await serviceSupabase.from("extracted_places").delete().eq("source_id", id);

    const { data: insertedPlaces, error: insertError } = await serviceSupabase
      .from("extracted_places")
      .insert(
        dedupedPlaces.map((parsed) => ({
          source_id: id,
          raw_name: parsed.raw_name,
          category: parsed.category,
          city_hint: parsed.city_hint,
          area_hint: parsed.area_hint,
          evidence_text: parsed.evidence_text,
          confidence: parsed.confidence,
          needs_reservation: parsed.needs_reservation,
          place_id: null,
          status: "pending",
        })),
      )
      .select("*");

    if (insertError) {
      debugLog("Extracted places bulk insert error", {
        sourceId: id,
        count: dedupedPlaces.length,
        error: insertError,
      });
      throw insertError;
    }

    const savedExtractedPlaces = (insertedPlaces ?? []).map((place) => ({
      ...place,
      place: null,
    }));

    return NextResponse.json({
      extractedPlaces: savedExtractedPlaces,
      candidateCount: savedExtractedPlaces.length,
      debug: {
        parsedPlaces,
        dedupedCount: dedupedPlaces.length,
      },
    });
  } catch (err) {
    await supabase.from("sources").update({ status: "failed" }).eq("id", id);
    console.error("Parse error:", err);
    const message =
      err instanceof Error ? err.message : "파싱 중 오류가 발생했습니다.";
    await logErrorEvent({
      userId: user.id,
      feature: "sources",
      action: "parse_places",
      route: `/api/sources/${id}/parse`,
      message,
      error: err,
      metadata: {
        sourceId: id,
        platform: source.platform,
        rawTextLength: source.raw_text?.length ?? 0,
        provider: "anthropic",
        status: err instanceof AnthropicApiError ? err.status : undefined,
        type: err instanceof AnthropicApiError ? err.type : undefined,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
