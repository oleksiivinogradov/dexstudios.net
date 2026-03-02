const axios = require('axios');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function fetchDappRadarLogo(dappSlug) {
    const url = `https://dappradar.com/dapp/${dappSlug}`;
    
    try {
        console.log(`Fetching: ${url}`);
        const res = await axios.get(url, {
            headers: { 
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none'
            },
            timeout: 20000,
            maxRedirects: 5
        });
        
        const html = res.data;
        
        // Look for various patterns where the logo might appear
        
        // 1. Try og:image meta tag
        const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
        if (ogImageMatch && ogImageMatch[1]) {
            console.log('\nFound og:image:', ogImageMatch[1]);
        }
        
        // 2. Try to find img tags with logo/icon in src or class
        const imgMatches = html.match(/<img[^>]+>/gi) || [];
        console.log(`\nFound ${imgMatches.length} img tags`);
        
        for (const img of imgMatches.slice(0, 20)) {
            const srcMatch = img.match(/src=["']([^"']+)["']/i);
            const altMatch = img.match(/alt=["']([^"']+)["']/i);
            if (srcMatch && srcMatch[1] && !srcMatch[1].startsWith('data:')) {
                const src = srcMatch[1];
                const alt = altMatch ? altMatch[1] : '';
                if (src.includes('logo') || src.includes('icon') || 
                    alt.toLowerCase().includes('logo') || alt.toLowerCase().includes('icon') ||
                    src.includes('wizverse')) {
                    console.log(`\nCandidate: ${src}`);
                    console.log(`  Alt text: ${alt}`);
                }
            }
        }
        
        // 3. Look for common CDN patterns
        const cdnMatches = html.match(/https:\/\/[^"'\s<>]+\.(jpg|jpeg|png|webp|svg)/gi) || [];
        const uniqueCdn = [...new Set(cdnMatches)].filter(url => 
            url.includes('logo') || url.includes('icon') || url.includes('wizverse')
        );
        
        if (uniqueCdn.length > 0) {
            console.log('\nCDN URLs with logo/icon/wizverse:');
            uniqueCdn.forEach(url => console.log(`  ${url}`));
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Headers:', error.response.headers);
        }
    }
}

fetchDappRadarLogo('wizverse');
