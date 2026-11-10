# A Bot Match, heard through the sound system

Survival Town, Team deathmatch, `?matchtime=75`, headless and muted; read from `duty.sound.state` and `duty.sound.log` about six times a second.

| check | result | what was seen |
|---|---|---|
| silent until audio is allowed | ok | unlocked false, asked for 'menu', sounding 'silence', 0 sources (page visible) |
| audio starts on the first press | ok | running 3822 ms after the press |
| the stems come in | ok | the score is ready 3876 ms after the press (rendered off the main thread) |
| the menu has its theme | ok | sounding 'menu', 5 sources, cycle 1 |
| a hidden page plays nothing | ok | hidden: sounding 'silence', 0 sources |
| back in view the theme starts again | ok | shown: sounding 'menu', 3 sources |
| the menu theme stops for the match | ok | scene 'match' 74.9 s from the end |
| the match opens with its sting | ok | matchStart at 21.8 s (74.9 s on the clock) |
| the bed starts with the last minute | ok | 'lastMinute' first seen with 59.93 s left |
| the riser starts with the final ten | ok | 'final10' first seen with 9.95 s left |
| the match ends on its sting | ok | victory at 96.8 s (phase nuke); result {"winner":1,"winnerName":"Blue","draw":false,"reason":"timeLimit"} |
| the siren winds up as the last minute begins | ok | 1 wind-up, seen with 59.93 s left |
| the siren holds to the end and winds down once | ok | 17 held segments 3.10 s apart, 1 wind-down |
| the counter ticks faster and faster | ok | ticks seen per ten seconds, 60 s to 0: 4, 5, 14, 26, 24, 127 |
| voices stay under the cap | ok | most at once 55 of 64 (largest seen in a sample 54); the score's sources at most 8 |
| the per-frame audio calls and the score cost next to nothing | ok | over 119 s: 68450 per-frame calls (scene, health, listener) in 303.4 ms, 0.255 % of the time (mean 4.4 us, worst 3.00 ms); of that the score's own scheduling 11 calls, 3.80 ms, worst 1.50 ms |
| no sound takes a frame to start | ok | 2765 sounds started in 1206.6 ms, 1.013 % of the time (mean 436 us, worst 9.40 ms); lowest fps while playing 21 (the PC was busy with other work) |
| the page logs no errors | ok | none |

## Scenes and stings as they happened

| s into the watch | phase | live | s left | scene sounding | sting |
|---|---|---|---|---|---|
| 0.1 | - | - | - | menu |  |
| 16.3 | - | - | - | match |  |
| 16.8 | playing | false | 75.0 | match |  |
| 21.8 | playing | true | 74.9 | match |  |
| 21.8 | playing | - | 74.9 |  | matchStart |
| 36.8 | playing | true | 59.9 | lastMinute |  |
| 86.9 | playing | true | 10.0 | final10 |  |
| 96.8 | nuke | true | - | victory |  |
| 96.8 | nuke | - | - |  | victory |
| 103.0 | vote | true | - | victory |  |
| 112.9 | lobby | true | - | menu |  |

