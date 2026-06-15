import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { matchPlaceToGoogle } from "@/lib/google-places";
import { logErrorEvent } from "@/lib/error-logger";

type ExtractedPlaceRow = {
  id: string;
  source_id: string;
  raw_name: string;
  category?: string | null;
  city_hint?: string | null;
  area_hint?: string | null;
  evidence_text?: string | null;
  confidence?: number | null;
  needs_reservation?: boolean | null;
  place_id?: string | null;
  status: string;
};

const DEFAULT_MATCH_CONCURRENCY = 5;
const MAX_MATCH_CONCURRENCY = 10;

function debugLog(label: string, data: unknown) {
  console.log(`${label} ${JSON.stringify(data, null, 2)}`);
}

function getMatchConcurrency() {
  const configured = Number(process.env.GOOGLE_PLACES_MATCH_CONCURRENCY);
  if (!Number.isFinite(configured) || configured < 1) return DEFAULT_MATCH_CONCURRENCY;
  return Math.min(Math.floor(configured), MAX_MATCH_CONCURRENCY);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

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

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (sourceError || !source) {
    return NextResponse.json(
      { error: "소스를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const { data: extractedPlaces, error: extractedError } = await serviceSupabase
    .from("extracted_places")
    .select("*")
    .eq("source_id", id)
    .order("confidence", { ascending: false });

  if (extractedError) {
    await logErrorEvent({
      userId: user.id,
      feature: "sources",
      action: "load_extracted_places_for_match",
      route: `/api/sources/${id}/match`,
      message: extractedError.message,
      error: extractedError,
      metadata: { sourceId: id },
    });
    return NextResponse.json(
      { error: extractedError.message },
      { status: 500 },
    );
  }

  const candidates = (extractedPlaces ?? []) as ExtractedPlaceRow[];

  try {
    await mapWithConcurrency(candidates, getMatchConcurrency(), async (candidate) => {
      // DB에 같은 raw_name + city_hint로 이미 매칭된 장소가 있으면 Google Places API 호출 스킵
      const { data: cachedMatch } = await serviceSupabase
        .from("extracted_places")
        .select("place_id")
        .eq("raw_name", candidate.raw_name)
        .eq("city_hint", candidate.city_hint ?? "")
        .eq("status", "matched")
        .not("place_id", "is", null)
        .neq("id", candidate.id)
        .maybeSingle();

      if (cachedMatch?.place_id) {
        await serviceSupabase
          .from("extracted_places")
          .update({ place_id: cachedMatch.place_id, status: "matched" })
          .eq("id", candidate.id);
        return;
      }

      const matched = await matchPlaceToGoogle(
        candidate.raw_name,
        candidate.city_hint ?? undefined,
        candidate.area_hint ?? undefined,
      );

      if (!matched) {
        await serviceSupabase
          .from("extracted_places")
          .update({ status: "pending", place_id: null })
          .eq("id", candidate.id);
        return;
      }

      const { data: upsertedPlace, error: upsertError } = await serviceSupabase
        .from("places")
        .upsert(
          {
            google_place_id: matched.google_place_id,
            name: matched.name,
            address: matched.address,
            lat: matched.lat,
            lng: matched.lng,
            city: matched.city,
            country: matched.country,
            category: matched.category,
            rating: matched.rating,
            review_count: matched.review_count,
            maps_url: matched.maps_url,
          },
          { onConflict: "google_place_id" },
        )
        .select("*")
        .single();

      if (upsertError || !upsertedPlace) {
        debugLog("[match] Place upsert error", {
          candidate,
          error: upsertError,
        });
        return;
      }

      await serviceSupabase
        .from("extracted_places")
        .update({ place_id: upsertedPlace.id, status: "matched" })
        .eq("id", candidate.id);
    });

    const { data: matchedExtractedPlaces, error: matchedError } =
      await serviceSupabase
        .from("extracted_places")
        .select("*")
        .eq("source_id", id)
        .order("confidence", { ascending: false });

    if (matchedError) {
      throw new Error(matchedError.message);
    }

    const rows = (matchedExtractedPlaces ?? []) as ExtractedPlaceRow[];
    const placeIds = Array.from(
      new Set(rows.map((row) => row.place_id).filter(Boolean) as string[]),
    );
    const { data: places, error: placesError } =
      placeIds.length > 0
        ? await serviceSupabase.from("places").select("*").in("id", placeIds)
        : { data: [], error: null };

    if (placesError) {
      throw new Error(placesError.message);
    }

    const placesById = new Map(
      (places ?? []).map((place) => [place.id as string, place]),
    );
    const seenPlaceIds = new Set<string>();
    const duplicateExtractedIds: string[] = [];
    const distinctRows = [];

    for (const row of rows) {
      const placeId = row.place_id ?? null;
      if (placeId && seenPlaceIds.has(placeId)) {
        duplicateExtractedIds.push(row.id);
        continue;
      }

      if (placeId) seenPlaceIds.add(placeId);
      distinctRows.push({
        ...row,
        place: placeId ? placesById.get(placeId) ?? null : null,
      });
    }

    if (duplicateExtractedIds.length > 0) {
      await serviceSupabase
        .from("extracted_places")
        .delete()
        .in("id", duplicateExtractedIds);
    }

    await supabase.from("sources").update({ status: "parsed" }).eq("id", id);

    return NextResponse.json({
      extractedPlaces: distinctRows,
      candidateCount: candidates.length,
      matchedCount: distinctRows.filter((row) => row.place).length,
      duplicateCount: duplicateExtractedIds.length,
    });
  } catch (err) {
    await supabase.from("sources").update({ status: "failed" }).eq("id", id);
    console.error("Google match error:", err);
    const message =
      err instanceof Error
        ? err.message
        : "Google Maps에서 장소를 찾는 중 오류가 발생했습니다.";
    await logErrorEvent({
      userId: user.id,
      feature: "sources",
      action: "match_google_places",
      route: `/api/sources/${id}/match`,
      message,
      error: err,
      metadata: {
        sourceId: id,
        candidateCount: candidates.length,
      },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
