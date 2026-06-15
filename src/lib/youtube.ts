export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function getPlatformFromUrl(url: string): 'youtube' | 'instagram' | 'tiktok' | null {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  if (url.includes('instagram.com')) return 'instagram'
  if (url.includes('tiktok.com')) return 'tiktok'
  return null
}

interface YouTubeMetadata {
  title: string
  description: string
  channelTitle: string
  channelId?: string
  thumbnailUrl: string
  creatorComments?: string[]
}

interface YouTubeCommentSnippet {
  textDisplay?: string
  textOriginal?: string
  authorDisplayName?: string
  authorChannelId?: { value?: string }
}

interface YouTubeCommentThread {
  snippet?: {
    topLevelComment?: {
      snippet?: YouTubeCommentSnippet
    }
  }
}

function debugLog(label: string, data: unknown) {
  console.log(`${label} ${JSON.stringify(data, null, 2)}`)
}

export async function fetchYouTubeMetadata(videoId: string): Promise<YouTubeMetadata | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    debugLog('[youtube] missing api key', { videoId })
    return {
      title: `YouTube video ${videoId}`,
      description: '',
      channelTitle: '',
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    }
  }

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${apiKey}`
  )
  if (!res.ok) {
    debugLog('[youtube] video metadata request failed', {
      videoId,
      status: res.status,
      body: await res.text(),
    })
    return null
  }

  const data = await res.json()
  const item = data.items?.[0]?.snippet
  if (!item) {
    debugLog('[youtube] video metadata not found', { videoId, data })
    return null
  }

  return {
    title: item.title,
    description: item.description,
    channelTitle: item.channelTitle,
    channelId: item.channelId,
    thumbnailUrl: item.thumbnails?.high?.url ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    creatorComments: await fetchCreatorComments(videoId, item.channelId, apiKey),
  }
}

export function buildRawText(metadata: YouTubeMetadata): string {
  const sections = [
    `영상 제목:\n${metadata.title}`,
    metadata.channelTitle ? `채널명:\n${metadata.channelTitle}` : '',
    metadata.description ? `영상 설명란:\n${metadata.description}` : '',
    ...(metadata.creatorComments?.map((comment) => `유튜버 고정/작성 댓글:\n${comment}`) ?? []),
  ]

  return sections
    .filter(Boolean)
    .join('\n\n')
}

async function fetchCreatorComments(
  videoId: string,
  channelId: string | undefined,
  apiKey: string
): Promise<string[]> {
  if (!channelId) {
    debugLog('[youtube] missing channel id for comments', { videoId })
    return []
  }

  const allItems: YouTubeCommentThread[] = []
  let pageToken: string | undefined
  let page = 0
  const maxCommentsForDebug = 500

  while (allItems.length < maxCommentsForDebug) {
    page += 1
    const params = new URLSearchParams({
      videoId,
      part: 'snippet',
      maxResults: '100',
      order: 'relevance',
      textFormat: 'plainText',
      key: apiKey,
    })
    if (pageToken) params.set('pageToken', pageToken)

    const res = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?${params}`)
    const body = await res.text()

    debugLog('[youtube] commentThreads response', {
      videoId,
      page,
      status: res.status,
      ok: res.ok,
      bodyPreview: body.slice(0, 1000),
    })

    if (!res.ok) return []

    const data = JSON.parse(body)
    const items = (data.items ?? []) as YouTubeCommentThread[]
    allItems.push(...items)
    pageToken = data.nextPageToken

    if (!pageToken || items.length === 0) break
  }

  const comments = allItems
    .slice(0, maxCommentsForDebug)
    .map((item) => item.snippet?.topLevelComment?.snippet)
    .filter(Boolean) as YouTubeCommentSnippet[]

  debugLog('[youtube] fetched comments', {
    videoId,
    channelId,
    count: comments.length,
    cappedAt: maxCommentsForDebug,
    comments: comments.map((comment, index) => ({
      index,
      author: comment.authorDisplayName,
      authorChannelId: comment.authorChannelId?.value,
      text: comment.textOriginal ?? comment.textDisplay ?? '',
      isCreator: comment.authorChannelId?.value === channelId,
    })),
  })

  const creatorComments = comments
    .filter((comment) => comment.authorChannelId?.value === channelId)
    .map((comment) =>
      comment.textOriginal ?? comment.textDisplay ?? ''
    )
    .filter(Boolean)
    .slice(0, 5)

  debugLog('[youtube] selected creator comments', {
    videoId,
    count: creatorComments.length,
    comments: creatorComments,
  })

  return creatorComments
}
