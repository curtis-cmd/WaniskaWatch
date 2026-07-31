# Waniskâ Watch operations boundary

Waniskâ Watch is a standalone mining-intelligence product. It may use the same
Waniskâ provider accounts as Waniska Connect, but it must not share Connect's
repository, deployment project, database, environment variables, or production
data.

## Target production resources

- GitHub repository: `curtis-cmd/WaniskaWatch` (separate repository)
- Vercel team: `Waniskâ`
- Vercel project: `waniska-watch` (separate project)
- Neon project: `Waniskâ Watch` (`red-moon-35868453`; separate project and database)
- Preferred public route: `app.waniskaservices.ca/watch`

The Waniskâ Services application owns `app.waniskaservices.ca` and forwards
`/watch` to this separate deployment. The Watch codebase, project, database,
and operational access remain independent.

## Credential and data rules

- Store Neon connection strings only in the Waniskâ Watch Vercel environment.
- Never commit database credentials or copy Waniska Connect environment files.
- Use separate preview and production database branches before introducing
  application accounts or community-private records.
- Keep public Manitoba source data separate from future community-controlled
  information.
- Require explicit Nation authorization before publishing cultural, land-use,
  consultation, or other community-controlled records.

## Current application boundary

The current public application contains Manitoba mining records, official
historic-treaty boundary polygons used as a geographic index, and verified
public business contacts. It does not use the Waniska Connect application,
database, sessions, or user records.
