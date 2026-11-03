# A bot lands in a pit beside Ground Zero's concrete and can't get out

Status: claimed
Blocked by: 17
Labels: bug

From ticket 64's Comments: in the Solos pace soak (seed 2) one bot stood stuck 110 s in a pocket at about (-432, -392) under the terrain beside the Ground Zero concrete, with no nav node in reach (its nearest 80 m off); it was 35 s stuck there before ticket 64 too.

Fix the map or the nav so no pit is unreachable or inescapable, check all of Ground Zero for similar holes, and rebuild the nav. Regression test: no landing spot in Ground Zero is without a nav node in reach, and no such pocket remains.

## Comments
