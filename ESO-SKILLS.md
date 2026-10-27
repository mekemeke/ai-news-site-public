# ESO class skills interface

- Entry point: `eso-skills.html`; navigation is linked from `eso.html`.
- Data: `data/skills.json`, schema version 1. Classes contain ordered trees. `category: "class-mastery"` renders a tree in a separate section, not among the three classic trees.
- Skills carry a unique ID, `classId`, `treeId`, `nameEn`, optional sourced `nameJa`, `type` (`active`, `ultimate`, `passive`), and nullable `baseSkillId`. Morphs must reference a base skill in the same class/tree/type. A missing base, chained morph, duplicate ID, or invalid class/tree fails loading safely.
- Optional descriptions are plain text (`descriptionJa` / `descriptionEn`). Optional `mechanics: [{label,value}]` requires string values. Sourced finite nonnegative `cost: {value,resource}` (`Magicka`, `Stamina`, `Ultimate`, `Health`), `castTimeSeconds`, `channelTimeSeconds`, `durationSeconds`, `rangeMeters`, and `radiusMeters` appear in detail as reference values, with `meta.numericNote`. Multiple-resource `costComponents` must all validate and are displayed together, never partially. `costNote`, `valueBasisJa`, and `verificationNote` retain unknown-cost, baseline-value, and conflicting-source caveats. Missing fields remain absent. Do not infer stats, translations, current-update compatibility, or sources.
- Metadata contains `version`, `verifiedAt`, `coverageNote`, `iconNote`, and `sources: [{label,url}]`. Per-skill `verifiedAt`, `sourceDataDate`, `gameUpdate`, `verificationStatus`, and `sourceUrl` (or `sources`) are shown without implying game testing.
- Sourced Japanese skill names retain `nameJaSourceUrl`, optional `nameJaSourceDate`, `nameJaVerificationStatus`, and `nameJaVerificationNote` in the detail source section. Official-reference names do not imply a current-client match.
- Icons must be existing local PNG/JPEG/WebP files at `assets/eso/skills/<safe-name>`, accompanied by `sourceUrl` and `permissionNote`. Unsupported, missing, unattributed, or failed images display an explicit text placeholder. No network image fetch, generated game icon, SVG, data URL, or remote image is accepted.
- Filter links use `#?class=...&tree=...&q=...&type=...&form=...`. Detail URLs use `#skill/<id>?...`, preserving filters on direct loads and back/forward navigation. Search normalizes width/case and matches every whitespace-separated search word. Base names also match their morphs.
- Search counts count individual basic skills, morphs, and passives, not unique families. Partial collection and unknown values must remain explicit in metadata.
- No existing article data, set data/display logic, API, shared stylesheet, index page, access scope, or noindex behavior is changed. The existing set page gains only the skills navigation link. Skills styles use `.eso-skills-page` exclusively, avoiding shared news-card grid regressions.

## Checks

```sh
node --check eso-skills.js
node --test tests/eso-skills.test.cjs tests/eso-display.test.cjs tests/news-display.test.cjs
python3 -m unittest discover -s tests -v
```

`tests/eso-skills.test.cjs` includes test-only fixtures plus a required production-data compatibility check. Test fixtures are not included in the public skills JSON. Runtime source URLs are HTTPS-only; editors must also verify source access and reuse rights. Metadata is evidence, not automatic permission to redistribute a source.
