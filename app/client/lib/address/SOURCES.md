# Postal code data — sources and coverage

`@aivangogh/ph-address` (the PSGC region/province/city/barangay data) has no
postal codes, so the two JSON files here supply them, keyed by the PSGC code of
the city or municipality. A place that is in neither file has **no** code on
record: the address form then asks the user to type it. No code in these files
was inferred, interpolated or made up.

Compiled 2026-10-13. The server keeps a copy in
`app/server/src/common/postal-codes.data.ts`; `postal-codes.spec.ts` there
fails if the copies differ.

## `postal-codes.phlpost.json` — 881 places, from PHLPost

Source: the table on PHLPost's own **ZIP Code Locator** page,
<https://phlpost.gov.ph/zip-code-locator/> (Region | Province |
City/Municipality | Zip Code; 959 rows on the day it was read).

How a row became an entry:

1. Its province and its city/municipality name had to match exactly one PSGC
   city/municipality *in the region the row is labelled with*. Rows that did
   not (76 of them — a few are filed under the wrong province on the page, the
   rest are post offices or districts rather than whole municipalities) were
   dropped, not guessed at.
2. Where the archived Wikipedia list (below) also gives a code for the same
   place and the two disagree, the row was dropped: 1 case, Lake Sebu.

Coverage is whatever that page publishes — it is far from the whole country.
By province (mapped / total cities and municipalities):

Abra 27/27 · Agusan del Norte 11/11 · Agusan del Sur 14/14 · Albay 18/18 ·
Apayao 7/7 · Aurora 8/8 · Bataan 6/12 · Batanes 6/6 · Batangas 34/34 ·
Benguet 13/13 · Bukidnon 11/22 · Bulacan 23/24 · Cagayan 29/29 ·
Camarines Norte 12/12 · Camarines Sur 37/37 · Camiguin 5/5 ·
Catanduanes 11/11 · Cavite 21/23 · Cotabato 17/18 · Davao Occidental 5/5 ·
Davao Oriental 10/11 · Davao de Oro 11/11 · Davao del Norte 9/11 ·
Davao del Sur 10/10 · Dinagat Islands 6/7 · Ifugao 11/11 · Isabela 36/37 ·
Kalinga 7/8 · Laguna 29/30 · Lanao del Norte 22/22 · Marinduque 6/6 ·
Masbate 20/21 · Misamis Occidental 14/17 · Misamis Oriental 24/25 ·
Nueva Ecija 28/32 · Nueva Vizcaya 14/15 · Occidental Mindoro 10/11 ·
Oriental Mindoro 15/15 · Palawan 21/23 · Pampanga 21/21 · Pangasinan 22/48 ·
Quezon 39/40 · Quirino 6/6 · Rizal 14/14 · Romblon 16/17 · Samar 25/26 ·
Sarangani 6/7 · Sorsogon 15/15 · South Cotabato 9/11 · Sultan Kudarat 11/12 ·
Surigao del Norte 21/21 · Surigao del Sur 17/19 · Tarlac 18/18 ·
Zambales 12/13 · independent cities 11/57.

**Not on PHLPost's page at all, and so not covered:** Metro Manila, Regions I
(other than part of Pangasinan), VI, VII, most of VIII, IX, the Negros Island
Region and BARMM.

## `postal-codes.region-ix.json` — 71 places, Region IX, NOT from PHLPost

PHLPost's page lists nothing for Region IX — the region this school is in — so
these could not be taken from the official source. They come from three
secondary sources instead, and a code is included **only where at least two of
them agree**:

- Wikipedia, "ZIP codes in the Philippines", archived revision 1067628539 of
  24 January 2022 (the last with the full list, which the article cites to
  PHLPost):
  <https://en.wikipedia.org/w/index.php?title=ZIP_codes_in_the_Philippines&oldid=1067628539>
- FilipiKnow province pages: <https://filipiknow.net/zamboanga-del-norte-zip-code/>,
  <https://filipiknow.net/zamboanga-del-sur-zip-code/>,
  <https://filipiknow.net/basilan-zip-code/>
- PhilAtlas municipality pages (<https://www.philatlas.com/mindanao/r09.html>),
  used as the tie-breaker where the first two differed or one was silent.

Covered: Zamboanga del Norte 26 of 27, Zamboanga del Sur 27 of 27, Zamboanga
Sibugay 16 of 16, Zamboanga City, Isabela City.

Left out on purpose:

- **Godod, Zamboanga del Norte** — the sources give two different codes (7114
  and 7126) and none agree, so it has no entry and is typed by hand.
- **Sulu** (listed under Region IX in the PSGC data) — only one source.

One disagreement was settled by the two-of-three rule: Gutalac is 7118 in the
Wikipedia list and on PhilAtlas; FilipiKnow gives 7108, which is the code all
three give for Sergio Osmeña Sr.

**These 71 codes should be checked against PHLPost before they are relied on
for anything official.** If one is wrong, correct it in the JSON here *and* in
the server's copy.
