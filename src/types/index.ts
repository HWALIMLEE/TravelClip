export type Platform = 'youtube' | 'instagram' | 'tiktok'
export type SourceStatus = 'pending' | 'parsing' | 'parsed' | 'failed'
export type ExtractedPlaceStatus = 'pending' | 'matched' | 'rejected'
export type Visibility = 'private' | 'link' | 'public'
export type ItineraryShareRole = 'owner' | 'editor' | 'viewer'
export type FlightType = 'departure' | 'return'

export interface ItineraryFlight {
  id: string
  itinerary_id: string
  flight_type: FlightType
  flight_num: string
  airline_korean?: string
  airline_english?: string
  airport?: string
  airport_code?: string
  city_code?: string
  scheduled_date: string
  scheduled_time: string
  io_type: 'IN' | 'OUT'
  created_at: string
}

export interface FlightSearchResult {
  flightNum: string
  airlineKorean?: string
  airlineEnglish?: string
  airport?: string
  airportCode?: string
  cityCode?: string
  scheduledTime: string
  ioType: 'IN' | 'OUT'
}

export interface FlightInput {
  flight_type: FlightType
  flight_num: string
  airline_korean?: string
  airline_english?: string
  airport?: string
  airport_code?: string
  city_code?: string
  scheduled_date: string
  scheduled_time: string
  io_type: 'IN' | 'OUT'
}

export interface User {
  id: string
  email: string
  name?: string
  avatar_url?: string
  created_at: string
}

export interface Source {
  id: string
  user_id: string
  platform: Platform
  url: string
  title?: string
  creator?: string
  thumbnail_url?: string
  raw_text?: string
  status: SourceStatus
  created_at: string
}

export interface ExtractedPlace {
  id: string
  source_id: string
  raw_name: string
  category?: string
  city_hint?: string
  area_hint?: string
  evidence_text?: string
  confidence?: number
  needs_reservation?: boolean
  place_id?: string
  status: ExtractedPlaceStatus
  place?: Place
  source?: Source
}

export interface Place {
  id: string
  google_place_id: string
  name: string
  address?: string
  lat?: number
  lng?: number
  city?: string
  country?: string
  category?: string
  rating?: number
  review_count?: number
  maps_url?: string
}

export interface UserSavedPlace {
  id: string
  user_id: string
  place_id: string
  source_id?: string
  note?: string
  priority: number
  created_at: string
  place: Place
  source?: Source
}

export interface FeaturedDisplay {
  color?: string
  region?: string
  route?: string
  likes?: number
  clones?: number
}

export interface Itinerary {
  id: string
  user_id: string
  title: string
  city?: string
  start_date?: string
  end_date?: string
  visibility: Visibility
  base_location?: string
  created_at: string
  items?: ItineraryItem[]
  flights?: ItineraryFlight[]
  can_edit?: boolean
  can_manage_share?: boolean
  can_add_to_my_itineraries?: boolean
  shared_role?: ItineraryShareRole
  is_featured?: boolean
  featured_order?: number | null
  featured_display?: FeaturedDisplay | null
  place_count?: number
}

export interface ItineraryItem {
  id: string
  itinerary_id: string
  place_id: string
  day: number
  order_index: number
  start_time?: string
  duration_minutes?: number
  transport_method?: string
  travel_minutes?: number
  schedule_note?: string
  place: Place
}

export interface ParsedPlace {
  raw_name: string
  category?: string
  city_hint?: string
  area_hint?: string
  evidence_text?: string
  confidence: number
  needs_reservation: boolean
  reason?: string
}

export interface GenerateItineraryInput {
  city: string
  days: number
  start_date?: string
  base_location?: string
  travel_style?: string[]
  must_visit_place_ids?: string[]
  departure_flight?: FlightInput
  return_flight?: FlightInput
}
