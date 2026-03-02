const { chromium } = require('playwright');

async function getWizverseLogo() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox'
    ]
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    }
  });
  
  // Remove automation indicators
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false
    });
  });
  
  const page = await context.newPage();
  
  try {
    console.log('Navigating to DappRadar Wizverse page...');
    console.log('Please solve the Cloudflare challenge if it appears...');
    
    await page.goto('https://dappradar.com/dapp/wizverse', { 
      waitUntil: 'load',
      timeout: 90000 
    });
    
    console.log('Page loaded! Waiting 30 seconds for Cloudflare and content...');
    console.log('If you see a Cloudflare challenge, please click to verify...');
    
    // Wait for user to potentially solve Cloudflare
    await page.waitForTimeout(30000);
    
    // Take screenshot to see current state
    await page.screenshot({ path: 'after_wait.png' });
    console.log('Screenshot saved as after_wait.png');
    
    // Try to wait for images
    console.log('\nWaiting for images to load...');
    try {
      await page.waitForSelector('img[src]', { timeout: 10000 });
      console.log('Images found!');
    } catch (e) {
      console.log('No images detected with standard selector');
    }
    
    // Get page content to see what's there
    const pageText = await page.textContent('body');
    if (pageText.includes('Cloudflare') || pageText.includes('Checking if the site connection')) {
      console.log('\n⚠️  Still on Cloudflare challenge page!');
      console.log('The page requires manual verification. Please:');
      console.log('1. Click the verification checkbox in the browser');
      console.log('2. Wait for the page to load');
      console.log('\nWaiting 60 more seconds for you to complete the challenge...');
      await page.waitForTimeout(60000);
    }
    
    // Take another screenshot
    await page.screenshot({ path: 'after_challenge.png', fullPage: true });
    console.log('Screenshot saved as after_challenge.png');
    
    console.log('\nSearching for logo image...');
    
    // Get all images
    const allImages = await page.$$eval('img', imgs => 
      imgs.map(img => ({
        src: img.src,
        alt: img.alt || '',
        width: img.width,
        height: img.height,
        className: img.className
      }))
    );
    
    console.log(`\nFound ${allImages.length} total images:`);
    if (allImages.length > 0) {
      allImages.forEach((img, idx) => {
        console.log(`\n${idx + 1}. ${img.src}`);
        console.log(`   Alt: "${img.alt}", Size: ${img.width}x${img.height}`);
        console.log(`   Class: "${img.className}"`);
      });
      
      // Filter for likely logo images
      const likelyLogos = allImages.filter(img => {
        const aspectRatio = img.width / img.height;
        const isSquareish = aspectRatio > 0.8 && aspectRatio < 1.2;
        const isReasonableSize = img.width >= 40 && img.width <= 500;
        const hasLogoKeyword = img.src.toLowerCase().includes('logo') || 
                              img.src.toLowerCase().includes('icon') ||
                              img.src.toLowerCase().includes('wizverse') ||
                              img.alt.toLowerCase().includes('wizverse') ||
                              img.alt.toLowerCase().includes('logo');
        
        return (isSquareish && isReasonableSize) || hasLogoKeyword;
      });
      
      if (likelyLogos.length > 0) {
        console.log(`\n✅ Found ${likelyLogos.length} likely logo image(s):`);
        likelyLogos.forEach((img, idx) => {
          console.log(`\n${idx + 1}. ${img.src}`);
          console.log(`   Alt: "${img.alt}", Size: ${img.width}x${img.height}`);
        });
        console.log(`\n🎯 MAIN LOGO URL: ${likelyLogos[0].src}`);
      } else {
        console.log('\n⚠️  Could not identify a clear logo image from the results');
      }
    } else {
      console.log('\n❌ No images found on page');
    }
    
    console.log('\nBrowser will stay open for 20 seconds for inspection...');
    await page.waitForTimeout(20000);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    try {
      await page.screenshot({ path: 'error_screenshot.png' });
      console.log('Error screenshot saved as error_screenshot.png');
    } catch (e) {}
  } finally {
    await browser.close();
  }
}

getWizverseLogo();
