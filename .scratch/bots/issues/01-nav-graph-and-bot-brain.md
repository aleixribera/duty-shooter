# 01 Nav graph and the bot brain

Status: resolved
Release: v1.3.0
Blocked by: none

## What to build

`fps-core/src/bots`: `buildNavGraph` from a map's collision (walk, drop and climb links, hints, the main component only), A*, and the `Bot` brain that turns a `BotView` into a usercmd (perception, aim, recoil, movement, roaming, unsticking). Survival Town's nav options and hints. See the spec.

## Acceptance

- [x] Survival Town's graph reaches the ground, the upper floors and the roofs, and is strongly connected.
- [x] Core bot tests pass, including the moderate band.
