# Editing the submission artifacts

The supplied [editable PowerPoint deck](deliverables/groundproof-pitch.pptx) can be opened and edited directly in PowerPoint or another compatible presentation editor. The [pilot brief PDF](deliverables/groundproof-pilot-brief.pdf) is ready to share. You do not need either builder to run GroundProof or use these files.

Builders write final files to the clone's `outputs/` directory by default. Intermediate deck files go to `work/artifacts/pitch/`. Set `WORKSPACE_DIR` explicitly to use a different output root. The scripts do not assume a particular username, home directory, or checkout location.

## Pilot brief PDF

The PDF builder uses standard Python packages and Liberation Sans fonts:

```sh
python3 -m venv work/artifact-venv
. work/artifact-venv/bin/activate
python -m pip install reportlab pypdf
# Set this if Liberation Sans is not installed in a standard Linux font location:
export ARTIFACT_FONT_DIR=/absolute/path/to/liberation-fonts
python scripts/artifacts/build-pilot-brief.py
```

The font directory must contain `LiberationSans-Regular.ttf` and `LiberationSans-Bold.ttf`. Without an override, the builder checks standard Linux Liberation font directories. On other systems, point the variable to those font files. Missing packages or fonts produce a prerequisite error before the PDF is written. The PDF builder does not need Codex, LibreOffice, an API key, or the web application.

The content and layout are editable in `scripts/artifacts/build-pilot-brief.py`. It writes `outputs/groundproof-pilot-brief.pdf` and checks the page count and extracted text. After a content change, render and visually inspect both pages, for example with `pdftoppm -png outputs/groundproof-pilot-brief.pdf work/pilot` after creating `work/`.

## Editable pitch deck

The optional deck builder uses the Codex artifact runtime, which is **not included in this repository or installed by `npm ci`**. It requires a compatible Node runtime, `@oai/artifact-tool`, the presentations skill's validation helpers, and Python with those helpers' dependencies. In Codex, resolve the installed locations using `load_workspace_dependencies` and the available presentations skill. Do not copy another computer's runtime paths.

```sh
export ARTIFACT_NODE_MODULES=/absolute/path/to/runtime/node_modules
export PRESENTATION_SKILL_DIR=/absolute/path/to/skills/presentations
export RUNTIME_PYTHON=/absolute/path/to/runtime/python3
node scripts/artifacts/build-pitch.mjs
```

`ARTIFACT_NODE_MODULES` may be omitted only if the clone's `node_modules` already contains the compatible `@oai/artifact-tool` package. `PRESENTATION_SKILL_DIR` and `RUNTIME_PYTHON` are required. Set `WORKSPACE_DIR` if the working directory for final outputs is outside the clone. A configured Codex bundled Node executable can replace `node` in the command.

To reproduce the product screenshots in the slides, place `groundproof-mission-board.png` and `source-review.png` in the selected output root's `outputs/` folder. Copies are supplied under `docs/deliverables/`. The builder uses text fallbacks if those images are absent.

The builder exports editable native slide text and tables, validates the package, and renders review images under `work/artifacts/pitch/`. Its default final file is `outputs/groundproof-pitch.pptx`. The finalizer refuses to overwrite an existing final file, so set a new filename when rebuilding, for example `PITCH_FILENAME=groundproof-pitch-revised.pptx node scripts/artifacts/build-pitch.mjs`. Inspect the rendered slides before replacing the delivered deck.

## Narrated product video and release package

Install FFmpeg and the Playwright Chromium browser. The full video builder records genuine product actions, generates a disclosed OpenAI narrator, aligns captions to the actual speech and verifies codecs, duration and loudness. Anakin must be configured on the target server for the genuine capture scene. No fixture is substituted for a failed capture.

```sh
export DEMO_URL=https://groundproof-flight.web.app
export DEMO_OUTPUT_DIR=/absolute/path/to/deliverables
export OPENAI_API_KEY_FILE=/private/path/outside/the/repository
node scripts/build-demo.mjs
```

Narration and transcription responses are cached under ignored `work/media/`. Use `--use-recording` to refine captions without another live capture. Inspect the resulting storyboard, full-resolution frames and speech transcripts before publication. Set the generated verification record's `visualReview` to an object with `passed: true`, `reviewedAt`, and the actual review method only after that review succeeds.

After committing the final source, `DEMO_OUTPUT_DIR=/absolute/path/to/deliverables node scripts/package-release.mjs` copies the specified public documents, exports Git HEAD, records the release identity, hashes every listed artifact and creates the submission ZIP. It reads an explicit file allowlist and does not collect credentials or environment files. Set `YOUTUBE_URL` and `DEVPOST_SUBMITTED=true` only after those outcomes are actually verified.
