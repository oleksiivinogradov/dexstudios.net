# Onchain Radar — Free Open-Source Dapp Analytics

**Live site:** [dexstudios.net/radar](https://dexstudios.net/radar/)

With DappRadar shutting down its free tier and removing public access to key onchain metrics, projects across every ecosystem lost the ability to show users, investors, and ecosystem teams what their traction actually looks like.

**Onchain Radar** fills that gap — for free, for everyone, forever.

---

## Why This Exists

| | DappRadar (closed free tier) | DefiLlama | Onchain Radar |
|---|---|---|---|
| UAW (Unique Active Wallets) | ✅ (was paywalled) | ❌ | ✅ |
| 24h / 7d / 30d / all-time UAW | ✅ (was paywalled) | ❌ | ✅ |
| Per-chain UAW breakdown | ✅ (was paywalled) | ❌ | ✅ |
| Transaction counts & daily history | ✅ (was paywalled) | ⚠️ TVL only | ✅ |
| Free to list | ❌ | ⚠️ TVL projects only | ✅ |
| Open-source | ❌ | ✅ | ✅ |
| Self-hostable | ❌ | ✅ | ✅ |

DefiLlama is excellent for TVL — but gaming, social, and utility dapps are wallet-driven, not liquidity-driven. UAW is the metric that actually reflects real user activity, and this is the only free open-source tool that tracks it.

---

## Currently Listed Projects

| Project | Chain(s) | Category | Link |
|---|---|---|---|
| [MotoDEX](projects/motodex/) | SKALE Nebula, Somnia | Blockchain Racing Game | [motodex.dexstudios.games](https://motodex.dexstudios.games/) |
| [DexGo](projects/dexgo/) | SKALE Nebula, Polygon | Move-to-Earn AR | [dexgo.club](https://www.dexgo.club/) |
| [Wizverse](projects/wizverse/) | SKALE Nebula | Fantasy RPG | [wizverse.net](https://wizverse.net/) |

---

## How to List Your Project

Listing is **free** and done entirely via Pull Request — no applications, no forms, no approvals from us.

### 1. Fork this repository

```
https://github.com/oleksiivinogradov/dexstudios.net
```

### 2. Create a project folder

```
radar/projects/your-project-name/
├── data.json          ← project metadata and contract addresses
├── images/
│   └── logo.png       ← square logo, min 200×200px
```

### 3. Fill in `data.json`

```json
{
  "name": "Your Project",
  "description": "One-line description shown in the directory.",
  "about": "Full description of your project.",
  "url": "https://yourproject.io",
  "logo": "images/logo.png",
  "category": "Games",
  "tags": ["NFT", "Play to Earn"],
  "socials": {
    "twitter": "https://x.com/yourproject",
    "telegram": "https://t.me/yourproject"
  },
  "contracts": [
    {
      "chain": "skale-nebula",
      "address": "0xYourContractAddress"
    },
    {
      "chain": "somnia",
      "address": "0xYourContractAddress"
    }
  ]
}
```

**Supported chains:** `skale-nebula`, `somnia` — more added on request.

### 4. Open a Pull Request

That's it. Once merged, the scanner picks up your contracts automatically on the next run (every 5 minutes) and starts tracking UAW and transaction stats from that point forward.

---

## What Gets Tracked Automatically

Once listed, every project gets:

- **UAW 24h / 7d / 30d / all-time** — unique wallet addresses that sent a transaction to your contracts, globally and per chain
- **Daily transaction counts** — rolling 30-day history
- **Recent transactions** — last 10 interactions per contract
- **Cross-chain aggregation** — wallets deduplicated across all chains a project is deployed on

All data is stored as plain JSON files in this repository and served as static files — no backend, no database, no API keys required.

---

## How the Scanner Works

A GitHub Actions workflow runs every 5 minutes:

```
.github/workflows/scanner.yml
```

1. Fetches the latest block from each supported chain via RPC
2. Scans new blocks in parallel (20× concurrent fetches on fast chains like Somnia)
3. Extracts wallet addresses from transactions to tracked contracts
4. Writes per-chain and cross-chain wallet buckets to `projects/{name}/wallets/`
5. Writes transaction stats to `projects/{name}/stats/`
6. Commits and pushes the updated data back to the repository

The scanner uses a **time-based budget** (not a fixed block count) so it automatically adapts to RPC speed and always processes as many blocks as possible within the available window — with no historical gaps.

**Source:** [`radar/scanner/index.js`](scanner/index.js)

---

## Data Format

```
radar/projects/{name}/
├── data.json              ← project metadata
├── uaw.json               ← computed UAW for all time windows
├── wallets/
│   ├── YYYY-MM-DD.json    ← cross-chain unique wallets per day
│   ├── alltime.json       ← cross-chain all-time wallet set
│   └── {chain}/
│       ├── YYYY-MM-DD.json
│       └── alltime.json
└── stats/
    └── {chain}_{address}.json   ← tx counts and recent activity
```

`uaw.json` example:

```json
{
  "uaw24h": 120,
  "uaw7d": 640,
  "uaw30d": 1820,
  "uawAlltime": 4200,
  "byChain": {
    "skale-nebula": { "uaw24h": 89, "uaw7d": 510, "uaw30d": 1400, "uawAlltime": 3100 },
    "somnia":       { "uaw24h": 41, "uaw7d": 180, "uaw30d": 620,  "uawAlltime": 1300 }
  },
  "lastUpdated": "2026-03-02T14:00:00.000Z"
}
```

---

## For Blockchain Ecosystems

If you run a chain or ecosystem fund and want your developers to know about this tool:

- **Share this repository** — any project can open a PR to get listed in minutes
- **Share the live directory** — [dexstudios.net/radar](https://dexstudios.net/radar/)
- **Request chain support** — open an issue with your chain name and a public RPC endpoint and we'll add it

No partnership agreements, no fees, no revenue share. The ask is simple: let your developers know this exists so they don't lose their analytics coverage.

---

## Self-Hosting

Want to run your own instance?

```bash
git clone https://github.com/oleksiivinogradov/dexstudios.net
cd dexstudios.net/radar/scanner
npm install
npm start
```

The scanner runs locally against any EVM-compatible chain. Point GitHub Pages (or any static host) at the `radar/` directory and you have a fully functional analytics dashboard.

---

## Contributing

- **Add a project:** open a PR with `data.json` + logo
- **Add a chain:** open an issue with chain name + RPC URL
- **Fix a bug or improve the scanner:** PRs welcome in [`radar/scanner/`](scanner/)
- **Improve the frontend:** PRs welcome in [`radar/`](./)

---

## License

MIT — use it, fork it, run your own instance.
