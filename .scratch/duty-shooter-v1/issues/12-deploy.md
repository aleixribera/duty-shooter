# 12 Deploy: container, GHCR workflow, hardened compose stack

Status: ready-for-agent
Milestone: 5 (deploy)
Blocked by: 11

## What to build

Spec "Deploy", stories 91-94. Model everything on the existing game at `C:/Users/Aleix/Documents/CLAUDE/3d-souls-low` (its Dockerfile, `.github/workflows`, `compose.yaml`, `deploy/` and docs). A Dockerfile for the server app (which serves the built client), a GitHub Actions workflow that builds and publishes to GHCR, a Compose stack with the same hardening (localhost-only binding, read-only filesystem, all capabilities dropped, memory limit, log rotation), an `.env.example` with passphrase and player-cap placeholders (real values never committed), and deploy docs for exposing it on the host's Tailscale Funnel at port 443 without touching the existing game on 8443.

## Acceptance criteria

- [ ] `docker build` succeeds (locally or in CI) and the container serves the game and passes a health check.
- [ ] The workflow is valid and publishes to GHCR on push.
- [ ] No secrets, passphrases or hostnames in the repo.
