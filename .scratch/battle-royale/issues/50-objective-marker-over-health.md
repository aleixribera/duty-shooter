# Objective edge marker overlaps the Health number

Status: open
Severity: S3
Found by: 35

## Repro
Bot Match, Charge on Survival Town; turn so objective A is behind and to the left.

The edge marker "A 40 m" is clamped into the bottom-left corner, on top of the HEALTH "100".

## Evidence
- Screenshot `.scratch/battle-royale/shots/bugs/bot-runs/survival-town-charge-hvb.jpg`.

## Suspected area
The objective edge-marker clamp in the HUD: keep it out of the Bottom bars' area.
