# Gemini and RAG Policy

## Gemini extraction

- The server route is `app/api/analyze/route.ts`; the browser never receives `GEMINI_API_KEY`.
- The response schema requires each allow-listed field key exactly once, with `value`, `evidenceText`, and `status`.
- `confidence` is intentionally omitted: Gemini does not provide a calibrated confidence score reliable enough for this workflow.
- Runtime validation rejects malformed responses, unsupported or duplicate fields, and incomplete field sets.
- A non-null value must have an `evidenceText` that occurs verbatim in the submitted source. A field absent from the source is normalized to `value: null`, `evidenceText: null`, and `status: not_found`.
- pT, pN, pM, and Stage are only copied when explicitly present. No stage calculation, diagnosis, treatment recommendation, or automatic confirmation is performed.
- Explicit `PATHOSCRIBE_DEMO_MODE=true` uses the labeled rule-based educational demo. When demo mode is off, a missing key or upstream Gemini failure returns an error and never returns a fabricated AI result.

## RAG corpus

The local search route uses only these sources:

- Cancer dictionary snapshot: `data/processed/cancer-dictionary-rag.json`.
- Lung registry metadata: `lib/data/ncc-lung-registry-metadata.ts`.
- Project references: `lib/data/project-rag.ts` (input format, educational workflow, fictional error cases, AI safety, and stage-review scope).

Each match returns the provider, collection, record identifier, and local file or official source. If no match is found, `answer` is `null`; the route does not ask Gemini to fill the gap.

## v1.1 terminology review

The terminology review does not add a separate Gemini or external medical terminology endpoint. The existing Gemini extraction supplies source-bound `evidenceText`; local server rules normalize terms, calculate limited edit-distance candidates, attach local sources, and block automatic correction of high-risk fields. If Gemini extraction fails, the route returns an error and does not emit terminology reviews as a successful live result.

## Verification

The environment name check confirms `GEMINI_API_KEY` is declared in `.env` and referenced only by server code. `.env` is ignored by Git. A server-side request for the allow-listed `EVAL-PATH-001` case succeeded with HTTP 200 using `gemini-3.6-flash`; the 17-field schema passed, 15 fields contained source evidence, and 2 absent fields were normalized to `not_found`. The key and source text were not printed or stored. Detailed v1.1 results are recorded in `docs/v1.1-verification.md`.
