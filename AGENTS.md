# Waniskâ Watch operating boundaries

- The production source of truth is `curtis-cmd/WaniskaWatch` on GitHub.
- The canonical public application is `https://app.waniskaservices.ca/watch`, served by the separate `waniska-watch` Vercel project. Keep Connect, Payroll and their databases outside this repository and deployment.
- Consolidation is toward one public production application. The Sites remote and `.openai/hosting.json` are retained for recovery; their presence is not permission to republish a parallel public Watch application. Inspect the current access state before describing the legacy copy as private or retired.
- Deploy production through the approved GitHub/Vercel path. Do not delete historical deployments, repositories, data or credentials merely to achieve one production entry point. Testing previews are not a second production source of truth.
- Source-review candidates in `work/` are not production data. Never deploy them merely because individual audits passed; require complete applicable release checks and the user's publication authorization.
- Keep legal-risk triage, holder exports and correction evidence private in the ignored `work/` area or an explicitly approved secure store. Do not add a public legal-risk endpoint or label companies as risky/wrongdoers.
- A record can have no additional identified issue under a limited check, but must never be described as legally risk-free. Preserve source verification dates and distinguish source fidelity from registry-by-registry confirmation.
