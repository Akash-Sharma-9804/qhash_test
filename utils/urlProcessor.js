const axios = require('axios');
const cheerio = require('cheerio');
const URL = require('url-parse');

// Extract URLs from text
const extractUrls = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex) || [];
  return urls.map(url => url.replace(/[.,;!?]$/, '')); // Remove trailing punctuation
};

// Fetch and extract content from URL
const fetchUrlContent = async (url, timeout = 10000) => {
  try {
    const parsedUrl = new URL(url);
    
    // Basic URL validation
    if (!parsedUrl.hostname || !['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Invalid URL protocol');
    }

    const response = await axios.get(url, {
      timeout,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      maxContentLength: 5 * 1024 * 1024, // 5MB limit
    });

    const contentType = response.headers['content-type'] || '';
    
    if (!contentType.includes('text/html')) {
      return {
        url,
        title: parsedUrl.hostname,
        content: 'Non-HTML content detected',
        description: `Content type: ${contentType}`,
        error: null,
        metadata: {
          contentType,
          size: response.data.length,
          status: response.status
        }
      };
    }

    const $ = cheerio.load(response.data);
    
    // Remove script and style elements
    $('script, style, nav, footer, header, aside, .advertisement, .ads').remove();
    
    // Extract metadata
    const title = $('title').text().trim() || 
                  $('meta[property="og:title"]').attr('content') || 
                  $('h1').first().text().trim() || 
                  parsedUrl.hostname;
    
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') || 
                       '';
    
    // Extract main content
    let content = '';
    
    // Try to find main content areas
    const contentSelectors = [
      'main', 
      'article', 
      '.content', 
      '.post-content', 
      '.entry-content',
      '.article-content',
      '#content',
      '.main-content'
    ];
    
    let mainContent = null;
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length > 0 && element.text().trim().length > 100) {
        mainContent = element;
        break;
      }
    }
    
    if (mainContent) {
      content = mainContent.text();
    } else {
      // Fallback: extract from body, prioritizing paragraphs and headings
      content = $('p, h1, h2, h3, h4, h5, h6, li').map((i, el) => $(el).text().trim()).get().join('\n');
    }
    
    // Clean up content
    content = content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim()
      .substring(0, 8000); // Limit content length
    
    return {
      url,
      title: title.substring(0, 200),
      content,
      description: description.substring(0, 500),
      error: null,
      metadata: {
        contentType,
        size: response.data.length,
        status: response.status,
        hostname: parsedUrl.hostname,
        extractedAt: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error(`❌ Error fetching URL ${url}:`, error.message);
    
    return {
      url,
      title: new URL(url).hostname,
      content: '',
      description: '',
      error: error.message,
      metadata: {
        error: true,
        errorType: error.code || 'UNKNOWN_ERROR',
        extractedAt: new Date().toISOString()
      }
    };
  }
};

// Process multiple URLs
const processUrls = async (urls) => {
  if (!urls || urls.length === 0) return [];
  
  console.log(`🔗 Processing ${urls.length} URLs...`);
  
  const results = await Promise.allSettled(
    urls.map(url => fetchUrlContent(url))
  );
  
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        url: urls[index],
        title: new URL(urls[index]).hostname,
        content: '',
        description: '',
        error: result.reason.message,
        metadata: { error: true }
      };
    }
  });
};

module.exports = {
  extractUrls,
  fetchUrlContent,
  processUrls
};
