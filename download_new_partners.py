import urllib.request
import os

urls = [
    ("public/partners/partner-11.png", "https://logo.clearbit.com/somnia.network"),
    ("public/partners/partner-12.png", "https://logo.clearbit.com/moonbeam.network"),
    ("public/partners/partner-13.png", "https://logo.clearbit.com/blockdag.network")
]

req = urllib.request.Request(
    urls[0][1], 
    data=None, 
    headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.47 Safari/537.36'
    }
)

for filepath, url in urls:
    print(f"Downloading {url} to {filepath}...")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response, open(filepath, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        print("Done.")
    except Exception as e:
        print(f"Failed {url}, trying favicon...")
        try:
            domain = url.split("clearbit.com/")[1]
            favicon_url = f"https://www.google.com/s2/favicons?domain={domain}&sz=128"
            req = urllib.request.Request(favicon_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response, open(filepath, 'wb') as out_file:
                data = response.read()
                out_file.write(data)
            print("Done with favicon.")
        except Exception as e2:
            print("Failed favicon too:", e2)
