// const axios = require('axios');
// const cheerio = require('cheerio');
// const URL = require('url-parse');

// // Extract URLs from text
// const extractUrls = (text) => {
//   const urlRegex = /(https?:\/\/[^\s]+)/g;
//   const urls = text.match(urlRegex) || [];
//   return urls.map(url => url.replace(/[.,;!?]$/, '')); // Remove trailing punctuation
// };

// // Fetch and extract content from URL
// const fetchUrlContent = async (url, timeout = 10000) => {
//   try {
//     const parsedUrl = new URL(url);
    
//     // Basic URL validation
//     if (!parsedUrl.hostname || !['http:', 'https:'].includes(parsedUrl.protocol)) {
//       throw new Error('Invalid URL protocol');
//     }

//     const response = await axios.get(url, {
//       timeout,
//       maxRedirects: 5,
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
//         'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
//         'Accept-Language': 'en-US,en;q=0.5',
//         'Accept-Encoding': 'gzip, deflate',
//         'Connection': 'keep-alive',
//       },
//       maxContentLength: 5 * 1024 * 1024, // 5MB limit
//     });

//     const contentType = response.headers['content-type'] || '';
    
//     if (!contentType.includes('text/html')) {
//       return {
//         url,
//         title: parsedUrl.hostname,
//         content: 'Non-HTML content detected',
//         description: `Content type: ${contentType}`,
//         error: null,
//         metadata: {
//           contentType,
//           size: response.data.length,
//           status: response.status
//         }
//       };
//     }

//     const $ = cheerio.load(response.data);
    
//     // Remove script and style elements
//     $('script, style, nav, footer, header, aside, .advertisement, .ads').remove();
    
//     // Extract metadata
//     const title = $('title').text().trim() || 
//                   $('meta[property="og:title"]').attr('content') || 
//                   $('h1').first().text().trim() || 
//                   parsedUrl.hostname;
    
//     const description = $('meta[name="description"]').attr('content') || 
//                        $('meta[property="og:description"]').attr('content') || 
//                        '';
    
//     // Extract main content
//     let content = '';
    
//     // Try to find main content areas
//     const contentSelectors = [
//       'main', 
//       'article', 
//       '.content', 
//       '.post-content', 
//       '.entry-content',
//       '.article-content',
//       '#content',
//       '.main-content'
//     ];
    
//     let mainContent = null;
//     for (const selector of contentSelectors) {
//       const element = $(selector);
//       if (element.length > 0 && element.text().trim().length > 100) {
//         mainContent = element;
//         break;
//       }
//     }
    
//     if (mainContent) {
//       content = mainContent.text();
//     } else {
//       // Fallback: extract from body, prioritizing paragraphs and headings
//       content = $('p, h1, h2, h3, h4, h5, h6, li').map((i, el) => $(el).text().trim()).get().join('\n');
//     }
    
//     // Clean up content
//     content = content
//       .replace(/\s+/g, ' ')
//       .replace(/\n\s*\n/g, '\n')
//       .trim()
//       .substring(0, 8000); // Limit content length
    
//     return {
//       url,
//       title: title.substring(0, 200),
//       content,
//       description: description.substring(0, 500),
//       error: null,
//       metadata: {
//         contentType,
//         size: response.data.length,
//         status: response.status,
//         hostname: parsedUrl.hostname,
//         extractedAt: new Date().toISOString()
//       }
//     };
    
//   } catch (error) {
//     console.error(`❌ Error fetching URL ${url}:`, error.message);
    
//     return {
//       url,
//       title: new URL(url).hostname,
//       content: '',
//       description: '',
//       error: error.message,
//       metadata: {
//         error: true,
//         errorType: error.code || 'UNKNOWN_ERROR',
//         extractedAt: new Date().toISOString()
//       }
//     };
//   }
// };

// // Process multiple URLs
// const processUrls = async (urls) => {
//   if (!urls || urls.length === 0) return [];
  
//   console.log(`🔗 Processing ${urls.length} URLs...`);
  
//   const results = await Promise.allSettled(
//     urls.map(url => fetchUrlContent(url))
//   );
  
//   return results.map((result, index) => {
//     if (result.status === 'fulfilled') {
//       return result.value;
//     } else {
//       return {
//         url: urls[index],
//         title: new URL(urls[index]).hostname,
//         content: '',
//         description: '',
//         error: result.reason.message,
//         metadata: { error: true }
//       };
//     }
//   });
// };

// module.exports = {
//   extractUrls,
//   fetchUrlContent,
//   processUrls
// };

const axios = require('axios');
const cheerio = require('cheerio');
const URL = require('url-parse');

// ✅ SIMPLE & ACCURATE URL EXTRACTION
const extractUrls = (text) => {
  if (!text || typeof text !== 'string') return [];

  // Enhanced regex for proper URL detection
  const urlRegex = /https?:\/\/(?:[-\w.])+(?:\:[0-9]+)?(?:\/(?:[\w\/_.])*(?:\?(?:[\w&=%.])*)?(?:\#(?:[\w.])*)?)?/g;
  
  const urls = text.match(urlRegex) || [];
  
  // Filter and validate URLs
  const validUrls = urls
    .map(url => url.trim().replace(/[.,;!?]+$/, '')) // Remove trailing punctuation
    .filter(url => {
      try {
        const parsed = new URL(url);
        return parsed.hostname && 
               parsed.hostname.includes('.') && 
               ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    })
    .filter((url, index, array) => array.indexOf(url) === index); // Remove duplicates

  console.log(`🔗 Found ${validUrls.length} valid URLs:`, validUrls);
  return validUrls;
};

// ✅ PROFESSIONAL URL CONTENT EXTRACTION (Like ChatGPT)
const fetchUrlContent = async (url, timeout = 15000) => {
  try {
    const parsedUrl = new URL(url);
    console.log(`🌐 Fetching: ${parsedUrl.hostname}${parsedUrl.pathname}`);

    // Professional headers to avoid blocking
    const response = await axios.get(url, {
      timeout,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      },
      maxContentLength: 10 * 1024 * 1024, // 10MB limit
    });

    const contentType = response.headers['content-type'] || '';
    
    // Handle non-HTML content
    if (!contentType.includes('text/html')) {
      return {
        url,
        title: parsedUrl.hostname,
        content: `Non-HTML content detected: ${contentType}`,
        description: `File type: ${contentType}`,
        error: null,
        metadata: {
          contentType,
          isHtml: false,
          size: response.data.length
        }
      };
    }

    const $ = cheerio.load(response.data);
    
    // ✅ COMPREHENSIVE CONTENT EXTRACTION
    
    // 1. Extract Title (Multiple fallbacks)
    const title = $('title').text().trim() ||
                  $('meta[property="og:title"]').attr('content') ||
                  $('meta[name="twitter:title"]').attr('content') ||
                  $('h1').first().text().trim() ||
                  parsedUrl.hostname;

    // 2. Extract Description
    const description = $('meta[name="description"]').attr('content') ||
                       $('meta[property="og:description"]').attr('content') ||
                       $('meta[name="twitter:description"]').attr('content') ||
                       '';

    // 3. Remove unwanted elements
    $(`script, style, noscript, iframe, embed, object,
       nav, header, footer, aside,
       .advertisement, .ads, .ad, .banner, .popup, .modal,
       .cookie-notice, .newsletter, .subscription,
       .social-share, .comments, .sidebar, .widget,
       [class*="ad-"], [id*="ad-"], [class*="ads-"], [id*="ads-"]`).remove();

    // 4. ✅ INTELLIGENT CONTENT EXTRACTION (Like ChatGPT Professional)
    let content = '';
    let extractionMethod = 'unknown';

    // Strategy 1: Look for main content containers
    const mainSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.main-content',
      '.content',
      '.post-content',
      '.article-content',
      '.entry-content',
      '#content',
      '.container .content'
    ];

    for (const selector of mainSelectors) {
      const element = $(selector);
      if (element.length > 0) {
        const text = element.text().trim();
        if (text.length > 200) {
          content = text;
          extractionMethod = `main-${selector}`;
          break;
        }
      }
    }

    // Strategy 2: E-commerce specific extraction
    if (!content && isEcommerceSite(parsedUrl.hostname)) {
      const ecommerceSelectors = [
        '.product-details, .product-info, .product-description',
        '.specifications, .features, .highlights',
        '.price, .pricing, .cost',
        '.reviews, .rating',
        // Flipkart specific
        '._1AtVbE, ._16Jk6d, ._7eSDEY, ._1AN07P',
        // Amazon specific
        '#feature-bullets, #productDescription, .a-unordered-list'
      ];

      for (const selector of ecommerceSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          const text = elements.map((i, el) => $(el).text().trim()).get().join('\n\n');
          if (text.length > 100) {
            content += text + '\n\n';
          }
        }
      }
      
      if (content) {
        extractionMethod = 'ecommerce-specific';
      }
    }

    // Strategy 3: Fallback to structured content
    if (!content || content.length < 300) {
      const fallbackElements = $('h1, h2, h3, h4, h5, h6, p, li, div')
        .filter((i, el) => {
          const $el = $(el);
          const text = $el.text().trim();
          return text.length > 20 && 
                 !$el.closest('nav, footer, header, aside, .menu, .sidebar').length;
        })
        .map((i, el) => $(el).text().trim())
        .get()
        .filter((text, index, arr) => arr.indexOf(text) === index); // Remove duplicates

      content = fallbackElements.join('\n\n');
      extractionMethod = 'fallback-structured';
    }

    // 5. ✅ CLEAN AND PROCESS CONTENT (Professional quality)
    content = content
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/\n\s*\n/g, '\n')      // Remove empty lines
      .replace(/[^\x20-\x7E\n\t\u00A0-\uFFFF]/g, '') // Remove non-printable chars
      .trim();

    // 6. Extract structured data
    const structuredData = extractStructuredData($);

    // 7. Determine site type
    const siteType = detectSiteType(parsedUrl.hostname, content);

    console.log(`✅ Successfully extracted from ${parsedUrl.hostname}:`);
    console.log(`   📄 Content: ${content.length} characters`);
    console.log(`   🔧 Method: ${extractionMethod}`);
    console.log(`   🏷️ Type: ${siteType}`);

    return {
      url,
      title: title.substring(0, 300),
      content, // ✅ FULL CONTENT - NO TRUNCATION
      description: description.substring(0, 500),
      error: null,
      metadata: {
        contentType,
        size: response.data.length,
        status: response.status,
        extractedAt: new Date().toISOString(),
        contentLength: content.length,
        extractionMethod,
        siteType,
        hasStructuredData: Object.keys(structuredData).length > 0,
        structuredData,
        hostname: parsedUrl.hostname,
        isEcommerce: siteType === 'ecommerce'
      }
    };

  } catch (error) {
    console.error(`❌ Error processing ${url}:`, error.message);
    
    return {
      url,
      title: new URL(url).hostname || 'Unknown Site',
      content: '',
      description: '',
      error: error.message,
      metadata: {
        error: true,
        errorType: getErrorType(error),
        extractedAt: new Date().toISOString()
      }
    };
  }
};

// ✅ SIMPLE & EFFICIENT URL PROCESSING
const processUrls = async (urls) => {
  if (!urls || urls.length === 0) return [];
  
  console.log(`🚀 Processing ${urls.length} URLs with professional extraction...`);
  
  const results = [];
  const startTime = Date.now();
  
  // Process URLs sequentially to avoid rate limiting
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`🌐 [${i + 1}/${urls.length}] Processing: ${url}`);
    
    try {
      const result = await fetchUrlContent(url);
      results.push(result);
      
      if (result.error) {
        console.log(`⚠️ [${i + 1}/${urls.length}] Partial success: ${url}`);
      } else {
        console.log(`✅ [${i + 1}/${urls.length}] Success: ${url} (${result.content.length} chars)`);
      }
    } catch (error) {
      console.error(`❌ [${i + 1}/${urls.length}] Failed: ${url}`, error.message);
      results.push({
        url,
        title: 'Failed to load',
        content: '',
        description: '',
        error: error.message,
        metadata: { error: true }
      });
    }
    
    // Respectful delay between requests
    if (i < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
  
  // Summary
  const processingTime = Date.now() - startTime;
  const successful = results.filter(r => !r.error).length;
  const totalContent = results.reduce((sum, r) => sum + (r.content?.length || 0), 0);
  
  console.log(`\n🎉 URL Processing Complete:`);
  console.log(`   ⏱️  Time: ${(processingTime / 1000).toFixed(1)}s`);
  console.log(`   ✅ Success: ${successful}/${urls.length}`);
  console.log(`   📄 Total Content: ${totalContent.toLocaleString()} characters`);
  
  return results;
};

// ✅ HELPER FUNCTIONS

// Detect if site is e-commerce
const isEcommerceSite = (hostname) => {
  const ecommerceIndicators = [
    'amazon', 'flipkart', 'ebay', 'etsy', 'shopify', 'myntra', 
    'snapdeal', 'paytm', 'shop', 'store', 'buy', 'cart'
  ];
  return ecommerceIndicators.some(indicator => hostname.includes(indicator));
};

// Extract structured data (JSON-LD, Open Graph, etc.)
const extractStructuredData = ($) => {
  const data = {};
  
  // JSON-LD
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const jsonData = JSON.parse($(el).html());
      if (jsonData['@type'] || jsonData.name) {
        data.jsonLd = jsonData;
      }
    } catch (e) {
      // Ignore invalid JSON
    }
  });
  
  // Open Graph
  const ogData = {};
  $('meta[property^="og:"]').each((i, el) => {
    const property = $(el).attr('property').replace('og:', '');
    const content = $(el).attr('content');
    if (content) ogData[property] = content;
  });
  if (Object.keys(ogData).length > 0) data.openGraph = ogData;
  
  return data;
};

// Detect site type
const detectSiteType = (hostname, content) => {
  const lowerHostname = hostname.toLowerCase();
  const lowerContent = content.toLowerCase();
  
  if (isEcommerceSite(lowerHostname) || 
      lowerContent.includes('price') || lowerContent.includes('buy now') || 
      lowerContent.includes('add to cart')) {
    return 'ecommerce';
  }
  
  if (lowerHostname.includes('news') || lowerHostname.includes('blog') || 
      lowerHostname.includes('medium') || lowerContent.includes('published')) {
    return 'news';
  }
  
  if (lowerHostname.includes('docs') || lowerHostname.includes('wiki') || 
      lowerHostname.includes('documentation')) {
    return 'documentation';
  }
  
  return 'general';
};

// Categorize error types
const getErrorType = (error) => {
  if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
    return 'TIMEOUT';
  }
  if (error.code === 'ENOTFOUND') {
    return 'DNS_ERROR';
  }
  if (error.response?.status) {
    return `HTTP_${error.response.status}`;
  }
  return 'UNKNOWN_ERROR';
};

module.exports = {
  extractUrls,
  fetchUrlContent,
  processUrls
};

