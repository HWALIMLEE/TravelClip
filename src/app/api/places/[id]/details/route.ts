import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY

interface GooglePlaceReview {
  author_name?: string
  profile_photo_url?: string
  rating?: number
  relative_time_description?: string
  text?: string
  time?: number
}

interface GooglePlaceDetailsResponse {
  result?: {
    name?: string
    rating?: number
    user_ratings_total?: number
    price_level?: number
    formatted_address?: string
    formatted_phone_number?: string
    website?: string
    url?: string
    opening_hours?: {
      open_now?: boolean
      weekday_text?: string[]
    }
    photos?: Array<{
      photo_reference?: string
      width?: number
      height?: number
      html_attributions?: string[]
    }>
    reviews?: GooglePlaceReview[]
  }
  error_message?: string
  status?: string
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: placeId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!GOOGLE_PLACES_API_KEY) {
    return NextResponse.json({ error: 'Google Places API 키가 없습니다.' }, { status: 500 })
  }

  const { data: savedPlace, error } = await supabase
    .from('user_saved_places')
    .select('place:places(id, google_place_id)')
    .eq('user_id', user.id)
    .eq('place_id', placeId)
    .single()

  const place = Array.isArray(savedPlace?.place) ? savedPlace.place[0] : savedPlace?.place
  if (error || !place?.google_place_id) {
    return NextResponse.json({ error: '장소를 찾을 수 없습니다.' }, { status: 404 })
  }

  const fields = [
    'name',
    'rating',
    'user_ratings_total',
    'price_level',
    'formatted_address',
    'formatted_phone_number',
    'website',
    'url',
    'opening_hours',
    'photos',
    'reviews',
  ].join(',')

  const query = new URLSearchParams({
    place_id: place.google_place_id,
    fields,
    language: 'ko',
    reviews_sort: 'most_relevant',
    key: GOOGLE_PLACES_API_KEY,
  })

  const response = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${query}`, {
    next: { revalidate: 60 * 60 * 6 },
  })

  if (!response.ok) {
    return NextResponse.json({ error: 'Google Maps 장소 정보를 불러오지 못했습니다.' }, { status: 502 })
  }

  const data = (await response.json()) as GooglePlaceDetailsResponse
  if (data.status && data.status !== 'OK') {
    return NextResponse.json(
      { error: data.error_message ?? 'Google Maps 장소 정보를 불러오지 못했습니다.' },
      { status: 502 }
    )
  }

  const details = data.result
  return NextResponse.json({
    name: details?.name,
    rating: details?.rating,
    reviewCount: details?.user_ratings_total,
    priceLevel: details?.price_level,
    address: details?.formatted_address,
    phone: details?.formatted_phone_number,
    website: details?.website,
    googleMapsUrl: details?.url,
    openNow: details?.opening_hours?.open_now,
    weekdayText: details?.opening_hours?.weekday_text ?? [],
    photo: details?.photos?.[0]?.photo_reference
      ? {
          url: `/api/places/${placeId}/photo?reference=${encodeURIComponent(details.photos[0].photo_reference)}`,
          attributions: details.photos[0].html_attributions ?? [],
        }
      : null,
    reviews:
      details?.reviews?.slice(0, 3).map((review) => ({
        authorName: review.author_name,
        profilePhotoUrl: review.profile_photo_url,
        rating: review.rating,
        relativeTime: review.relative_time_description,
        text: review.text,
        time: review.time,
      })) ?? [],
  })
}
