export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;
}

const MOBILE_UA =
  'Mozilla/5.0 (Android 10; Mobile; rv:91.0) Gecko/91.0 Firefox/91.0';

const SEARCH_KEYWORDS = [
  'search for', 'search', 'look up', 'find me', 'find information about',
  'google', 'bing', 'search the web', 'web search', "what's the latest",
  'latest news', 'recent', 'current', 'today', 'this week', 'what happened',
  'news about', 'recent news', 'latest update', 'what is happening',
  "what's happening", "what's new", 'what are the latest', 'now', 'currently',
  'at the moment', 'right now', "today's", 'stock price', 'weather',
  'temperature', 'forecast', 'price of', 'when is', 'schedule', 'events',
  'concerts', 'movies', 'release date', 'specs', 'reviews', 'latest version',
  'in my city', 'my city', 'my location', 'here', 'current location',
  'where i am', 'locally', 'nearby', 'around me',
];

const WEATHER_KEYWORDS = [
  'weather', 'temperature', 'forecast', 'rain', 'snow', 'sunny', 'cloudy',
  'hot', 'cold', 'warm', 'cool', 'humid', 'wind', 'storm', 'climate',
];

const CURRENT_INFO_KEYWORDS = [
  '2024', '2025', '2026', '2027', '2028', 'latest', 'newest', 'recent',
  'current', 'today', 'now', 'breaking', 'news', 'update', 'announcement',
];

const EXCLUDE_KEYWORDS = ['calculate', 'math', 'equation', 'solve'];
const LOW_QUALITY_SNIPPET_KEYWORDS = [
  'javascript', 'cookies', 'privacy', 'sign in', 'log in', 'navigation',
  'menu', 'enable javascript', 'terms of service',
];

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractDomain(url: string): string {
  try {
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
    const domain = new URL(cleanUrl).hostname;
    return domain.replace(/^www\./, '');
  } catch {
    return 'Unknown';
  }
}

function cleanHtml(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' '),
  );
}

function extractTextFromHtml(html: string): string {
  try {
    let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    cleaned = cleaned.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
    cleaned = cleanHtml(cleaned);

    const sentences = cleaned.split(/[.!?]+/).filter(sentence => {
      const trimmed = sentence.trim();
      const lower = trimmed.toLowerCase();
      return (
        trimmed.length > 30 &&
        trimmed.length < 400 &&
        trimmed.split(' ').length > 5 &&
        !LOW_QUALITY_SNIPPET_KEYWORDS.some(keyword => lower.includes(keyword))
      );
    });

    return normalizeWhitespace(sentences.slice(0, 5).join('. ')).substring(0, 1000);
  } catch {
    return '';
  }
}

function isLowQualitySnippet(text: string): boolean {
  const normalized = normalizeWhitespace(text).toLowerCase();
  return (
    normalized.length < 30 ||
    LOW_QUALITY_SNIPPET_KEYWORDS.some(keyword => normalized.includes(keyword))
  );
}

function scoreSearchResult(result: SearchResult, query: string): number {
  const lowerQuery = query.toLowerCase();
  const queryTokens = lowerQuery.split(/\s+/).filter(token => token.length > 2);
  const haystack = `${result.title} ${result.snippet} ${result.source}`.toLowerCase();

  let score = 0;
  queryTokens.forEach(token => {
    if (result.title.toLowerCase().includes(token)) {
      score += 5;
    }
    if (haystack.includes(token)) {
      score += 2;
    }
  });

  if (result.url) {
    score += 1;
  }
  if (!isLowQualitySnippet(result.snippet)) {
    score += 4;
  }
  return score;
}

function finalizeResults(
  results: SearchResult[],
  query: string,
  maxResults: number,
): SearchResult[] {
  const seen = new Set<string>();

  return results
    .map(result => ({
      ...result,
      title: normalizeWhitespace(result.title),
      snippet: normalizeWhitespace(result.snippet),
      url: normalizeUrl(result.url),
      source: normalizeWhitespace(result.source || extractDomain(result.url)),
    }))
    .filter(
      result =>
        result.title.length > 3 &&
        result.snippet.length > 20 &&
        !isLowQualitySnippet(result.snippet),
    )
    .sort((a, b) => scoreSearchResult(b, query) - scoreSearchResult(a, query))
    .filter(result => {
      const key = `${result.url || ''}|${result.title.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, maxResults);
}

function normalizeUrl(url: string): string {
  try {
    const normalized = new URL(url.startsWith('http') ? url : `https://${url}`);
    normalized.hash = '';
    return normalized.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

function isValidContentUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.startsWith('http') &&
    !lower.includes('duckduckgo.com') &&
    !lower.includes('javascript:') &&
    !lower.includes('#') &&
    !lower.includes('privacy') &&
    !lower.includes('settings') &&
    !lower.includes('ads') &&
    !lower.includes('tracking')
  );
}

async function fetchPageContent(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return '';
    }

    const html = await response.text();
    return extractTextFromHtml(html);
  } catch {
    clearTimeout(timeoutId);
    return '';
  }
}

function extractUrlFromQuery(query: string): string | null {
  const patterns = [
    /https?:\/\/[^\s]+/,
    /www\.[^\s]+\.[a-zA-Z]{2,}[^\s]*/,
    /[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}(?:\/[^\s]*)?/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(query);
    if (match) {
      let url = match[0];
      if (url.split('.').length > 3) {
        continue;
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }
      return url;
    }
  }
  return null;
}

function isDirectUrl(query: string): boolean {
  const trimmed = query.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('www.')
  ) {
    return true;
  }

  if (
    trimmed.includes('.') &&
    !trimmed.includes(' ') &&
    trimmed.length > 4 &&
    trimmed.length < 100
  ) {
    return /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}([/?#].*)?$/.test(trimmed);
  }

  return false;
}

function extractUrlsFromHtml(html: string, maxResults: number): Array<{title: string; url: string}> {
  const seenUrls = new Set<string>();
  const results: Array<{title: string; url: string}> = [];
  const patterns = [
    /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([^<]*)<\/a>/gi,
    /href="(https?:\/\/[^"]*)"[^>]*>.*?([^<>]{10,})<\/a>/gi,
    /<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
  ];

  for (const pattern of patterns) {
    if (results.length >= maxResults) break;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      if (results.length >= maxResults) break;

      const url = normalizeUrl(match[1]);
      const title = cleanHtml(match[2]).trim();

      if (
        isValidContentUrl(url) &&
        title.length > 5 &&
        !seenUrls.has(url)
      ) {
        seenUrls.add(url);
        results.push({title: title.substring(0, 100), url});
      }
    }
  }

  return results.slice(0, maxResults);
}

async function getSearchUrls(query: string, maxResults: number): Promise<Array<{title: string; url: string}>> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    return extractUrlsFromHtml(html, maxResults);
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

async function searchWithContent(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  try {
    const extractedUrl = extractUrlFromQuery(query);
    if (extractedUrl) {
      const content = await fetchPageContent(extractedUrl);
      if (content.length > 50) {
        return finalizeResults(
          [
            {
              title: `Content from ${extractDomain(extractedUrl)}`,
              snippet: content.substring(0, 500),
              url: extractedUrl,
              source: extractDomain(extractedUrl),
            },
          ],
          query,
          maxResults,
        );
      }
    }

    const searchUrls = await getSearchUrls(query, maxResults * 3);
    if (searchUrls.length === 0) {
      return [];
    }

    const results: SearchResult[] = [];
    for (const urlData of searchUrls) {
      const content = await fetchPageContent(urlData.url);
      if (content.length > 50) {
        results.push({
          title: urlData.title,
          snippet: content.substring(0, 500),
          url: urlData.url,
          source: extractDomain(urlData.url),
        });
      }

      if (results.length >= maxResults * 2) {
        break;
      }
    }

    return finalizeResults(results, query, maxResults);
  } catch {
    return [];
  }
}

async function searchInstantAnswer(query: string): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {'User-Agent': 'Offline AI App'},
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return [];
    }

    const text = await response.text();
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      return [];
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return [];
    }

    const results: SearchResult[] = [];

    if (json.Abstract && json.Abstract.length > 50) {
      results.push({
        title: json.AbstractSource || 'Abstract',
        snippet: json.Abstract,
        url: json.AbstractURL || '',
        source: json.AbstractSource || 'DuckDuckGo',
      });
    }

    if (json.Definition && json.Definition.length > 50) {
      results.push({
        title: 'Definition',
        snippet: json.Definition,
        url: json.DefinitionURL || '',
        source: json.DefinitionSource || 'DuckDuckGo',
      });
    }

    if (json.RelatedTopics && Array.isArray(json.RelatedTopics)) {
      json.RelatedTopics.slice(0, 3).forEach((topic: any) => {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: 'Related Topic',
            snippet: topic.Text,
            url: topic.FirstURL,
            source: 'DuckDuckGo',
          });
        }
      });
    }

    return finalizeResults(results, query, 5);
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

function parseHTMLResults(
  html: string,
  maxResults: number,
  query: string,
): SearchResult[] {
  const results: SearchResult[] = [];
  const newFormatRegex =
    /<h2[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>.*?<\/h2>.*?<a[^>]*class="[^"]*result[^"]*snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let newMatch;

  while ((newMatch = newFormatRegex.exec(html)) !== null) {
    if (results.length >= maxResults * 2) {
      break;
    }

    const url = newMatch[1];
    const title = cleanHtml(newMatch[2]);
    const snippet = cleanHtml(newMatch[3]);

    if (title.length > 5 && snippet.length > 20) {
      results.push({title, snippet, url, source: extractDomain(url)});
    }
  }

  if (results.length === 0) {
    const resultBlockPattern =
      /<a class="result__url"[^>]*href="([^"]*)"[^>]*>[\s\S]*?<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let blockMatch;
    while ((blockMatch = resultBlockPattern.exec(html)) !== null) {
      if (results.length >= maxResults) break;
      const url = blockMatch[1];
      const snippet = cleanHtml(blockMatch[2]);
      const blockStart = Math.max(0, blockMatch.index - 500);
      const contextBefore = html.substring(blockStart, blockMatch.index);
      const titleMatch = contextBefore.match(/<a class="result__a"[^>]*>([\s\S]*?)<\/a>[^<]*$/i);
      const title = titleMatch ? cleanHtml(titleMatch[1]) : '';
      if (title.length > 5 && snippet.length > 20) {
        results.push({title, snippet, url, source: extractDomain(url)});
      }
    }
  }

  return finalizeResults(results, query, maxResults);
}

async function searchHTML(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    return parseHTMLResults(html, maxResults, query);
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

function isSimpleMathQuestion(query: string): boolean {
  return (
    /^\s*\d+\s*[+\-*/]\s*\d+\s*$/.test(query) ||
    /^\s*what\s+is\s+\d+\s*[+\-*/]\s*\d+\s*\??\s*$/.test(query)
  );
}

function isBasicFactualQuestion(query: string): boolean {
  const basicPatterns = [
    'what is', 'what are', 'who is', 'who was', 'when was', 'where is',
    'how do', 'how does', 'why is', 'why does', 'define', 'explain',
  ];

  return basicPatterns.some(
    pattern =>
      query.startsWith(pattern) &&
      !query.includes('today') &&
      !query.includes('now') &&
      !query.includes('current') &&
      !query.includes('latest') &&
      !query.includes('2024') &&
      !query.includes('2025') &&
      !query.includes('2026') &&
      !query.includes('recent'),
  );
}

function detectSearchIntent(message: string): {needsSearch: boolean; query: string} {
  const lower = message.toLowerCase().trim();

  if (EXCLUDE_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return {needsSearch: false, query: ''};
  }

  if (
    lower.includes('http://') ||
    lower.includes('https://') ||
    isDirectUrl(message)
  ) {
    return {needsSearch: true, query: message};
  }

  if (isSimpleMathQuestion(lower) || isBasicFactualQuestion(lower)) {
    return {needsSearch: false, query: ''};
  }

  const hasSearchKeywords = SEARCH_KEYWORDS.some(keyword => lower.includes(keyword));
  const isWeatherQuery = WEATHER_KEYWORDS.some(keyword => lower.includes(keyword));
  const needsCurrentInfo = CURRENT_INFO_KEYWORDS.some(keyword =>
    lower.includes(keyword),
  );
  const isCurrentInfoQuestion =
    /.*what.*(happening|new|latest|current).*/.test(lower) ||
    /.*when.*(is|was|will).*/.test(lower) ||
    /.*who.*(won|winning|elected).*/.test(lower) ||
    /.*how.*(much|many).*cost.*/.test(lower) ||
    /.*price.*of.*/.test(lower);

  return {
    needsSearch:
      hasSearchKeywords || needsCurrentInfo || isCurrentInfoQuestion || isWeatherQuery,
    query: message,
  };
}

function extractSearchQuery(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (
    lower.includes('temperature') &&
    (lower.includes('my city') || lower.includes('here'))
  ) {
    return 'current temperature weather today';
  }
  if (lower.includes('weather') && (lower.includes('my city') || lower.includes('here'))) {
    return 'current weather today forecast';
  }

  const cleaned = prompt
    .replace(/search for /gi, '')
    .replace(/look up /gi, '')
    .replace(/find information about /gi, '')
    .replace(/what's the latest on /gi, '')
    .replace(/tell me about /gi, '')
    .replace(/please /gi, '')
    .replace(/what's the /gi, '')
    .replace(/what is the /gi, '')
    .trim()
    .substring(0, 120);

  return cleaned.length > 0 ? cleaned : prompt.substring(0, 120);
}

async function performWebSearchInternal(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
  const searchQuery = extractSearchQuery(query);

  const contentResults = await searchWithContent(searchQuery, maxResults);
  if (contentResults.length > 0) {
    return contentResults;
  }

  const instantResults = await searchInstantAnswer(searchQuery);
  if (instantResults.length > 0) {
    return instantResults.slice(0, maxResults);
  }

  return searchHTML(searchQuery, maxResults);
}

export async function performWebSearch(
  query: string,
  maxResults = 5,
): Promise<SearchResult[]> {
  try {
    return await performWebSearchInternal(query, maxResults);
  } catch {
    return [];
  }
}

export function shouldSearchWeb(message: string): boolean {
  return detectSearchIntent(message).needsSearch;
}

export function getSearchQuery(message: string): string {
  return extractSearchQuery(message);
}

export function formatSearchResultsForPrompt(
  results: SearchResult[],
  userMessage: string,
): string {
  const resultsText = results
    .map(
      (result, index) =>
        `SOURCE ${index + 1}: ${result.source}\nTITLE: ${result.title}\nURL: ${
          result.url
        }\nCONTENT: ${result.snippet}`,
    )
    .join('\n\n---\n\n');

  return `CURRENT WEB SEARCH RESULTS:
${resultsText}

Based on the web search results above, answer the user's question: "${userMessage}"

IMPORTANT INSTRUCTIONS:
- Prefer the search results above for time-sensitive facts
- If the results are incomplete, say that clearly instead of guessing
- Cite sources when possible using [Source N] format
- Keep the answer concise and directly relevant to the user's request`;
}
