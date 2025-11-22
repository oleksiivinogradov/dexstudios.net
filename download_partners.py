import urllib.request
import os

urls = [
    "https://static.wixstatic.com/media/287f6f_7bd3085b4ab9408d9f54746a1774210f~mv2.png",
    "https://static.wixstatic.com/media/287f6f_98345b0806af44c2bc05fa8f7cf31d76~mv2.png",
    "https://static.wixstatic.com/media/287f6f_1da442b779b3458baf83bc5d086d7f5f~mv2.png",
    "https://static.wixstatic.com/media/287f6f_2678e2bd40994dc094a05cba7262dae1~mv2.png",
    "https://static.wixstatic.com/media/287f6f_9b16475395e44a79bea3429e984b6702~mv2.png",
    "https://static.wixstatic.com/media/287f6f_9c34c2459e0a477481fb8759cf919778~mv2.png",
    "https://static.wixstatic.com/media/287f6f_dbe00938ccb8454b87868916ce74cbea~mv2.png",
    "https://static.wixstatic.com/media/287f6f_c003a9c8f3fe49e983d13257120fadc2~mv2.png",
    "https://static.wixstatic.com/media/287f6f_aba88469cd5b45ae9cb82f6792cc53d8~mv2.png",
    "https://static.wixstatic.com/media/287f6f_6af354dd9880407cb7dafadb76a4d759~mv2.png"
]

output_dir = "public/partners"

for i, url in enumerate(urls):
    filename = f"partner-{i+1}.png"
    filepath = os.path.join(output_dir, filename)
    print(f"Downloading {url} to {filepath}...")
    try:
        urllib.request.urlretrieve(url, filepath)
        print("Done.")
    except Exception as e:
        print(f"Failed: {e}")
