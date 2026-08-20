# plant-intel

An MCP server that gives coding agents structured plant data for garden
planning: species care profiles, companion checks that explain themselves, and
frost-date planting windows derived from ten years of observed weather.

```
companion_check("tomato", "potato")
  -> bad: both are Solanaceae. Same-family crops share soilborne diseases and
     compete for the same rotation slot, so plant them apart and rotate the bed.
```

## Why an MCP server for this

A model asked about garden planning will happily produce plausible spacing
numbers and companion-planting advice. Most of it is folklore, and none of it
is traceable. Three things make this worth a server rather than a prompt:

1. **The data is real and cited.** Every record says where it came from and
   under what licence.
2. **The gaps are visible.** When an upstream tier withholds a field, the
   response says so. When no source publishes a number, it stays null with an
   explanation instead of being filled in.
3. **Verdicts carry mechanisms.** `companion_check` never says "these are good
   together" because a gardening blog said so. It says *why*, from evidence in
   the care data, and admits when it has no evidence at all.

## Tools

| Tool | What it does |
| --- | --- |
| `search_plants` | Search the species catalogue by name; returns candidates with ids. |
| `plant_details` | Care profile: sun, water, hardiness zones, mature height, edibility, toxicity to people and pets, known pests. |
| `companion_check` | Whether two plants belong near each other, with every mechanism behind the verdict. |
| `planting_window` | Frost envelope, season length, and USDA zone fit for a site, from observed daily minima. |
| `identify_plant` | *Experimental, off by default.* Identify a plant from image URLs. Requires Perenual beta access. |

Every tool returns compact JSON. No HTML, no page dumps.

### `companion_check` returns mechanisms, not folklore

No API in this server's source roster publishes plant antagonists —
Permapeople lists "companion to" links only — so a good/bad/neutral answer
cannot simply be looked up. Rather than restate garden lore, the negative case
is derived from evidence already in the care data:

| Mechanism | Verdict | Reasoning |
| --- | --- | --- |
| `shared-family` | bad | Same botanical family: shared soilborne disease, same rotation slot. |
| `shared-pest` | bad | Overlapping pest susceptibility: co-planting concentrates the pest. |
| `listed-companion` | good | Documented in Permapeople (requires that source to be configured). |

A risk mechanism outranks a positive listing, but **every** matched reason is
returned, including the overridden one, so a mixed pair stays legible. A
`neutral` verdict states plainly that it is an absence of evidence, not
evidence of compatibility.

### `planting_window` will not guess crop timing

Give it coordinates and it derives, from ten whole years of Open-Meteo daily
minima, the median last spring frost, first autumn frost, season length, and
the site's USDA zone — then checks that against the plant's published hardiness
range. Verified against published normals:

| Site | Last frost | First frost | Season | Derived zone |
| --- | --- | --- | --- | --- |
| Minneapolis, MN | 04-28 | 10-28 | 183 days | 4b |
| Portland, OR | 03-17 | 11-25 | 252 days | 8b |
| Honolulu, HI | — | — | — | 13a (frost free) |
| Sydney, AU | — | — | — | 10b (frost free) |

What it will *not* do is invent the crop half. No source in this roster
publishes days-to-maturity or a frost-hardiness class, so transplant and sow-by
dates appear only when you supply `days_to_maturity` and `frost_tolerance`
yourself. That division is deliberate: this server owns the climate half, and
the caller owns the crop half.

Southern-hemisphere sites are read on their own growing season. Grouping by
calendar year splits a southern summer in two and reports a frost-free window
of roughly one day.

## Install

Requires Node 20 or newer and a free Perenual API key.

```bash
npm install -g plant-intel-mcp
```

Or run it straight from the repo:

```bash
git clone https://github.com/wyattlindsey/plant-intel-mcp.git && cd plant-intel-mcp && npm install && npm run build
```

### Claude Code

```bash
claude mcp add plant-intel --env PERENUAL_API_KEY=your-key -- npx -y plant-intel-mcp
```

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "plant-intel": {
      "command": "npx",
      "args": ["-y", "plant-intel-mcp"],
      "env": {
        "PERENUAL_API_KEY": "your-key"
      }
    }
  }
}
```

### Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `PERENUAL_API_KEY` | yes | Species data. [Free key](https://perenual.com/docs/api). |
| `PERMAPEOPLE_KEY_ID` / `PERMAPEOPLE_KEY_SECRET` | no | Adds documented companion listings. [Free, self-service](https://permapeople.org/my/api_keys). |
| `PERENUAL_IDENTIFY_BETA` | no | Set to `1` to register `identify_plant`. Needs Perenual beta access. |
| `PLANT_INTEL_CACHE_DIR` | no | Cache location. Defaults under `XDG_CACHE_HOME` or `~/.cache`. |
| `PLANT_INTEL_CACHE_DISABLED` | no | Set to `1` to disable caching. |

Missing the Perenual key does not stop the server. The tools stay listed and
each call answers with the variable to set and where to get a key.

## Sources, and their limits

Stated plainly, because these constraints shape what the server can honestly
answer.

| Source | Licence | Limits that matter |
| --- | --- | --- |
| [Perenual](https://perenual.com/docs/api) | API terms; **free tier is non-commercial** | **100 requests/day.** Free keys cover species ids 1–3000 only, not the advertised 10,000+. Care guides and hardiness maps are paid. Withheld fields return upgrade prompts, which this server strips. |
| [Permapeople](https://permapeople.org) | **CC BY-SA 4.0** | Optional, off unless configured. Positive companion links only — no antagonists. Its upstream includes PFAF and Kew, whose terms are more restrictive than CC BY-SA implies; check before relying on it commercially. |
| [Open-Meteo](https://open-meteo.com) | CC BY 4.0 | Free, no key. ERA5 reanalysis on a ~9 km grid — **not station data**. Expect frost dates to differ from local normals, especially in hills, valleys, or near water. Every `planting_window` response says so. |

Because of the 100/day ceiling, the server caches aggressively (30 days for
species data, 90 for weather archives) and guards a daily budget, refusing to
spend a request it does not have and naming the reset time when it declines.
Cache hits are never charged against it.

`plant_details` never returns spacing. No source here publishes it, and a null
with a note is more useful than a number nobody stands behind.

## Development

```bash
npm test          # unit and protocol tests, no network
npm run typecheck
npm run build
npm run test:live # opt-in; hits real APIs and spends quota
```

The live suite exists for drift detection. Fixtures were built from published
documentation, so it asserts that every field the mapper reads is still present
upstream. Its Open-Meteo tests need no credential and run anywhere.

See [CLAUDE.md](CLAUDE.md) for architecture and conventions.

## Licence

MIT. See [LICENSE](LICENSE).

Data retrieved through this server remains under its own source's terms — see
the table above. In particular, Perenual's free tier is non-commercial, and
Permapeople's data is share-alike.
