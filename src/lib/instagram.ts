interface ApifyRunResponse {
  data?: {
    id?: string
    status?: string
    defaultDatasetId?: string
  }
}

interface InstagramComment {
  text?: string
  ownerUsername?: string
  owner?: {
    username?: string
  }
}

interface InstagramItem {
  type?: string
  url?: string
  shortCode?: string
  caption?: string
  title?: string
  ownerUsername?: string
  ownerFullName?: string
  username?: string
  locationName?: string
  location?: {
    name?: string
  }
  displayUrl?: string
  imageUrl?: string
  videoUrl?: string
  images?: string[]
  latestComments?: InstagramComment[]
  comments?: InstagramComment[]
  firstComment?: string
}

export interface InstagramMetadata {
  title: string
  creator?: string
  thumbnailUrl?: string
  caption?: string
  locationName?: string
  comments: string[]
  mediaUrls: string[]
  rawItems: InstagramItem[]
}

const APIFY_ACTOR_URL = 'https://api.apify.com/v2/acts/apify~instagram-scraper/runs'

function getApifyToken() {
  return process.env.APIFY_API_TOKEN
}

function buildApifyUrl(path: string) {
  const token = getApifyToken()
  if (!token) throw new Error('APIFY_API_TOKEN is not configured')

  const url = new URL(path)
  url.searchParams.set('token', token)
  return url.toString()
}

async function waitForRun(runId: string, initialDatasetId?: string) {
  let datasetId = initialDatasetId

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const res = await fetch(buildApifyUrl(`https://api.apify.com/v2/actor-runs/${runId}`), {
      cache: 'no-store',
    })
    if (!res.ok) {
      throw new Error(`Apify run status request failed: ${res.status}`)
    }

    const body = (await res.json()) as ApifyRunResponse
    const status = body.data?.status
    datasetId = body.data?.defaultDatasetId ?? datasetId

    if (status === 'SUCCEEDED') {
      if (!datasetId) throw new Error('Apify run finished without dataset id')
      return datasetId
    }

    if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
      throw new Error(`Apify run did not finish successfully: ${status}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  throw new Error('Apify run timed out before results were ready')
}

function normalizeComment(comment: InstagramComment | string): string | null {
  if (typeof comment === 'string') return comment.trim() || null

  const text = comment.text?.trim()
  if (!text) return null

  const author = comment.ownerUsername ?? comment.owner?.username
  return author ? `${author}: ${text}` : text
}

function collectMediaUrls(item: InstagramItem): string[] {
  return [
    item.displayUrl,
    item.imageUrl,
    item.videoUrl,
    ...(item.images ?? []),
  ].filter(Boolean) as string[]
}

export async function fetchInstagramMetadata(url: string): Promise<InstagramMetadata> {
  const token = getApifyToken()
  if (!token) throw new Error('APIFY_API_TOKEN is not configured')

  const runRes = await fetch(buildApifyUrl(APIFY_ACTOR_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      addParentData: false,
      directUrls: [url],
      resultsLimit: 100,
      resultsType: 'posts',
      searchLimit: 10,
      searchType: 'hashtag',
    }),
  })

  if (!runRes.ok) {
    const body = await runRes.text()
    throw new Error(`Apify Instagram scraper failed to start: ${runRes.status} ${body}`)
  }

  const run = (await runRes.json()) as ApifyRunResponse
  const runId = run.data?.id
  if (!runId) throw new Error('Apify run id was not returned')

  const datasetId = await waitForRun(runId, run.data?.defaultDatasetId)
  const itemsRes = await fetch(
    buildApifyUrl(`https://api.apify.com/v2/datasets/${datasetId}/items`),
    { cache: 'no-store' }
  )

  if (!itemsRes.ok) {
    throw new Error(`Apify dataset request failed: ${itemsRes.status}`)
  }

  const items = (await itemsRes.json()) as InstagramItem[]
  const first = items[0]
  if (!first) {
    throw new Error('Apify dataset did not contain Instagram items')
  }

  const comments = items
    .flatMap((item) => [
      ...(item.latestComments ?? []),
      ...(item.comments ?? []),
      item.firstComment,
    ])
    .map((comment) => normalizeComment(comment as InstagramComment | string))
    .filter(Boolean)
    .slice(0, 100) as string[]

  const mediaUrls = Array.from(new Set(items.flatMap(collectMediaUrls)))
  const caption = items.map((item) => item.caption).find(Boolean)
  const creator = first.ownerUsername ?? first.ownerFullName ?? first.username
  const title = caption?.split('\n').find(Boolean)?.slice(0, 80) || first.title || 'Instagram content'

  return {
    title,
    creator,
    thumbnailUrl: first.displayUrl ?? first.imageUrl ?? mediaUrls[0],
    caption,
    locationName: first.locationName ?? first.location?.name,
    comments,
    mediaUrls,
    rawItems: items,
  }
}

export function buildInstagramRawText(metadata: InstagramMetadata): string {
  const sections = [
    `인스타 콘텐츠 제목:\n${metadata.title}`,
    metadata.creator ? `작성자:\n${metadata.creator}` : '',
    metadata.locationName ? `인스타 위치 태그:\n${metadata.locationName}` : '',
    metadata.caption ? `인스타 영상 설명란(caption):\n${metadata.caption}` : '',
    metadata.mediaUrls.length > 0
      ? `이미지/영상 URL:\n${metadata.mediaUrls.join('\n')}`
      : '',
  ]

  return sections.filter(Boolean).join('\n\n')
}
