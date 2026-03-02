const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PROJECTS_DIR = path.join(__dirname, '..', 'projects');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function downloadImage(url, destPath) {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: { 'User-Agent': UA },
        timeout: 15000
    });
    return new Promise((resolve, reject) => {
        response.data.pipe(fs.createWriteStream(destPath))
            .on('finish', resolve)
            .on('error', reject);
    });
}

function extractMetaContent(html, ...names) {
    for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const patterns = [
            new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
        ];
        for (const re of patterns) {
            const m = html.match(re);
            if (m && m[1] && !m[1].startsWith('data:')) return m[1].trim();
        }
    }
    return null;
}

function extractAppleTouchIcon(html, base) {
    // Prefer sizes="180x180" or largest available
    const re = /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["'][^>]*>/gi;
    let best = null;
    let bestSize = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
        const href = m[1];
        const sizeM = m[0].match(/sizes=["'](\d+)x\d+["']/i);
        const sz = sizeM ? parseInt(sizeM[1]) : 1;
        if (sz > bestSize) { bestSize = sz; best = href; }
    }
    if (!best) return null;
    if (best.startsWith('//')) return 'https:' + best;
    if (best.startsWith('http')) return best;
    return new URL(best, base).toString();
}

async function fetchLogoUrl(projectUrl) {
    console.log(`  Fetching HTML: ${projectUrl}`);
    const res = await axios.get(projectUrl, {
        headers: { 'User-Agent': UA },
        timeout: 20000,
        maxRedirects: 5
    });
    const html = res.data;
    const base = new URL(projectUrl);

    // Prefer og:image / twitter:image
    const ogImage = extractMetaContent(html, 'og:image', 'twitter:image', 'twitter:image:src');
    if (ogImage) {
        return ogImage.startsWith('http') ? ogImage : new URL(ogImage, base).toString();
    }

    // Fall back to apple-touch-icon (typically square, brand logo)
    const ati = extractAppleTouchIcon(html, base);
    if (ati) {
        console.log(`  Using apple-touch-icon: ${ati}`);
        return ati;
    }

    return null;
}

async function fetchLogoUrlClearbit(domain) {
    const url = `https://logo.clearbit.com/${domain}?size=120`;
    console.log(`  Trying Clearbit: ${url}`);
    // HEAD request to check if logo exists (returns 200 or 404)
    await axios.head(url, { timeout: 10000 });
    return url;
}

async function scrapeProject(projectName) {
    const projDir = path.join(PROJECTS_DIR, projectName);
    const jsonPath = path.join(projDir, 'data.json');

    if (!fs.existsSync(jsonPath)) {
        console.warn(`  No data.json for ${projectName}, skipping`);
        return;
    }

    const existingData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const projectUrl = existingData.url;

    if (!projectUrl) {
        console.warn(`  No url in data.json for ${projectName}, skipping`);
        return;
    }

    const imgDir = path.join(projDir, 'images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    let logoUrl = null;

    // 1) Try og:image from project website
    if (!logoUrl) {
        try {
            logoUrl = await fetchLogoUrl(projectUrl);
            if (logoUrl) console.log(`  Found og:image: ${logoUrl}`);
        } catch (e) {
            console.warn(`  og:image fetch failed: ${e.message}`);
        }
    }

    // 2) Fallback: Clearbit logo API
    if (!logoUrl) {
        try {
            const domain = new URL(projectUrl).hostname;
            logoUrl = await fetchLogoUrlClearbit(domain);
        } catch (e) {
            console.warn(`  Clearbit fallback failed: ${e.message}`);
        }
    }

    if (!logoUrl) {
        console.log(`  No logo found for ${projectName}`);
        return;
    }

    let ext = path.extname(new URL(logoUrl).pathname);
    if (!ext || ext.length > 5) ext = '.png';
    const localLogoPath = `images/logo${ext}`;
    const destPath = path.join(projDir, localLogoPath);

    try {
        console.log(`  Downloading: ${logoUrl}`);
        await downloadImage(logoUrl, destPath);
        console.log(`  Saved → ${localLogoPath}`);

        // Update data.json logo field only; preserve everything else
        existingData.logo = localLogoPath;
        fs.writeFileSync(jsonPath, JSON.stringify(existingData, null, 2));
        console.log(`  Updated data.json for ${projectName}`);
    } catch (e) {
        console.error(`  Download failed: ${e.message}`);
    }
}

async function main() {
    const projects = fs.readdirSync(PROJECTS_DIR).filter(d =>
        fs.statSync(path.join(PROJECTS_DIR, d)).isDirectory()
    );

    console.log(`Found projects: ${projects.join(', ')}\n`);

    for (const project of projects) {
        console.log(`[${project}]`);
        await scrapeProject(project);
        console.log('');
    }

    console.log('Done.');
}

main().catch(console.error);
