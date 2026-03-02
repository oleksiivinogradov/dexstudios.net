const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const PROJECTS = [
    { name: 'motodex', url: 'https://dappradar.com/dapp/motodex' },
    { name: 'dexgo', url: 'https://dappradar.com/dapp/dexgo' },
    { name: 'wizverse', url: 'https://dappradar.com/dapp/wizverse' }
];

const PROJECTS_DIR = path.join(__dirname, '..', 'projects');

async function downloadImage(url, destPath) {
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });
        return new Promise((resolve, reject) => {
            response.data.pipe(fs.createWriteStream(destPath))
                .on('finish', () => resolve())
                .on('error', e => reject(e));
        });
    } catch (error) {
        console.error(`Error downloading image ${url}:`, error.message);
    }
}

async function scrapeProject(browser, project) {
    console.log(`Scraping ${project.name}...`);
    const page = await browser.newPage();

    // Set user agent to avoid basic bot protections
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        await page.goto(project.url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for main content to load
        await page.waitForSelector('h1', { timeout: 10000 }).catch(() => console.log('h1 not found quickly, continuing anyway'));

        // Extract data
        const data = await page.evaluate(() => {
            // DappRadar has specific classes, but we can try generic selectors too
            const titleEl = document.querySelector('h1');
            const title = titleEl ? titleEl.innerText.trim() : '';

            // Description is usually in a paragraph below the title or explicitly marked as description
            // Trying to find a descriptive paragraph
            const paragraphs = Array.from(document.querySelectorAll('p'));
            let description = '';
            for (const p of paragraphs) {
                const text = p.innerText.trim();
                if (text.length > 50 && text.length < 1000) { // arbitrary heuristic for description length
                    description = text;
                    break;
                }
            }

            // Look for the main logo image (often a large square image near the top)
            // DappRadar often uses specific next/image structures
            const images = Array.from(document.querySelectorAll('img[src*="dappradar"]'));
            let logoUrl = '';
            if (images.length > 0) {
                // We assume the first decent logo-looking image is the one
                const logoImg = document.querySelector('img[alt*="logo"] i, img[alt*="Logo"] i') || images.find(img => img.width >= 50 && img.height >= 50 && img.width === img.height) || images[0];
                if (logoImg) {
                    logoUrl = logoImg.src;
                }
            } else {
                const allImgs = Array.from(document.querySelectorAll('img'));
                // Just take the first image if we can't find anything better
                if (allImgs.length > 0) {
                    logoUrl = allImgs[0].src;
                }
            }

            return { title, description, logoUrl };
        });

        // Ensure directory exists
        const projDir = path.join(PROJECTS_DIR, project.name);
        if (!fs.existsSync(projDir)) {
            fs.mkdirSync(projDir, { recursive: true });
        }

        // Create images dir
        const imgDir = path.join(projDir, 'images');
        if (!fs.existsSync(imgDir)) {
            fs.mkdirSync(imgDir, { recursive: true });
        }

        let localLogoPath = '';
        if (data.logoUrl) {
            // Fix relative URLs if any
            let finalUrl = data.logoUrl;
            if (finalUrl.startsWith('/')) {
                finalUrl = 'https://dappradar.com' + finalUrl;
            } else if (finalUrl.startsWith('data:image')) {
                // base64 image - save it directly? Let's skip base64 for now or save as text
                console.log("Found base64 image, skipping download");
                finalUrl = "";
            }

            if (finalUrl) {
                console.log(`Downloading logo: ${finalUrl}`);
                const ext = path.extname(new URL(finalUrl).pathname) || '.png';
                localLogoPath = `images/logo${ext}`;
                await downloadImage(finalUrl, path.join(projDir, localLogoPath));
            }
        }

        // Save data.json template
        const jsonPath = path.join(projDir, 'data.json');

        // If it exists, we read it to not overwrite existing contracts
        let existingData = {};
        if (fs.existsSync(jsonPath)) {
            existingData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        }

        const finalData = {
            name: data.title || existingData.name || project.name,
            description: data.description || existingData.description || 'Description not found',
            url: project.url,
            logo: localLogoPath || existingData.logo || '',
            contracts: existingData.contracts || [] // Preserving existings contracts!
        };

        fs.writeFileSync(jsonPath, JSON.stringify(finalData, null, 2));
        console.log(`Successfully scraped ${project.name}`);

    } catch (error) {
        console.error(`Error scraping ${project.name}:`, error.message);
    } finally {
        await page.close();
    }
}

async function main() {
    console.log('Launching Puppeteer...');
    // Use new headless mode for better compatibility
    const browser = await puppeteer.launch({ headless: 'new' });

    for (const project of PROJECTS) {
        await scrapeProject(browser, project);
    }

    await browser.close();
    console.log('Scraping complete!');
}

main().catch(console.error);
