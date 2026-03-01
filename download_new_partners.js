import fs from 'fs';
import https from 'https';

const urls = [
    ["public/partners/partner-11.png", "https://logo.clearbit.com/somnia.network", "somnia.network"],
    ["public/partners/partner-12.png", "https://logo.clearbit.com/moonbeam.network", "moonbeam.network"],
    ["public/partners/partner-13.png", "https://logo.clearbit.com/blockdag.network", "blockdag.network"]
];

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, function (response) {
            response.pipe(file);
            file.on('finish', function () {
                file.close(resolve);
            });
        }).on('error', function (err) {
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

(async () => {
    for (const [filepath, url, domain] of urls) {
        console.log(`Downloading ${url}...`);
        try {
            await download(url, filepath);
            console.log(`Success ${url}`);
        } catch (e) {
            console.log(`Failed ${url}, trying favicon...`);
            try {
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
                await download(faviconUrl, filepath);
                console.log(`Success favicon ${domain}`);
            } catch (e2) {
                console.log(`Failed favicon ${domain}`);
            }
        }
    }
})();
