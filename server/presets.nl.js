// The built-in assignments in Dutch (presets.js has them in English). Same variable names and
// numbers as the English version, so graphs, saved work and hand-ins fit both.
export const PRESETS_NL = {
    "standard-freefall": {
        title: "Vrije val",
        equipment: ["Een klein blokje", "Rolmaat", "Stopwatch of telefooncamera"],
        explanation: `# Vrije val

Een klein blokje valt van 10 m hoogte. Zonder luchtweerstand werkt alleen de zwaartekracht, dus de versnelling is constant: a = −g.

Het model rekent in kleine tijdstapjes dt. Elke stap gebruikt het de snelheid en de versnelling om de volgende waarden te berekenen:

- Δv = a · Δt
- Δh = v · Δt

## Leerdoelen

- Uitleggen hoe een numeriek model h(t) en v(t) opbouwt vanuit a = −g.
- Het model vergelijken met de formules h = h₀ − ½·g·t² en v = −g·t.
- Zien hoe de grootte van de tijdstap dt de uitkomst beïnvloedt.

## Opdrachten

1. Laat het model lopen. Hoe lang duurt de val? Controleer met t = √(2h/g).
2. Hoe groot is de snelheid vlak voor het blokje de grond raakt? Vergelijk met v = √(2·g·h).
3. Maak dt tien keer zo groot. Wat verandert er aan de valtijd, en waarom?
4. Laat het blokje vallen van een hoogte die je hebt gemeten, film het of neem de tijd op, en vergelijk met het model. Speelt luchtweerstand hier een rol?`,
        start: `t = 0        // s
dt = 0.01    // s
h = 10       // m, hoogte boven de vloer
v = 0        // m/s, omhoog is positief
g = 9.81     // m/s²
`,
        model: `a = -g
v = v + a * dt
h = h + v * dt
stop als h <= 0
`,
    },
    "harmonic-pendulum-drag": {
        title: "Slinger met luchtweerstand",
        equipment: ["Touwtje van ongeveer 1 m", "Een massa van ongeveer 200 g", "Statief met klem", "Stopwatch of telefooncamera"],
        explanation: `# Slinger met luchtweerstand

Een massa aan een touwtje zwaait heen en weer. De zwaartekracht trekt hem terug naar het laagste punt, terwijl luchtweerstand langzaam energie wegneemt, zodat de uitwijking kleiner wordt.

Voor de hoek θ (in radialen) van een slinger met lengte L gebruikt het model:

- α = −(g / L) · sin θ − (k / m) · ω (hoekversnelling)
- ω verandert met α · Δt, en θ met ω · Δt

## Leerdoelen

- Een harmonische trilling beschrijven met amplitude, trillingstijd en frequentie.
- De trillingstijd vergelijken met T = 2π·√(L/g) voor kleine hoeken.
- Uitleggen waarom demping de amplitude kleiner maakt maar de trillingstijd nauwelijks verandert.

## Opdrachten

1. Laat het model lopen en lees de trillingstijd T af uit de grafiek van θ. Vergelijk met T = 2π·√(L/g).
2. Maak k = 0. Wat gebeurt er nu met de amplitude?
3. Begin met een grote hoek (theta = 1.5). Is de trillingstijd nog hetzelfde? Waarom niet?
4. Bouw de slinger, film hem, voeg de video toe en zet de positie van de massa uit. Pas k aan tot het model bij je meting past.`,
        start: `t = 0         // s
dt = 0.001    // s
L = 1.0       // m, lengte van het touwtje
m = 0.2       // kg
g = 9.81      // m/s²
k = 0.02      // kg/s, luchtweerstand: F = -k·v
theta = 0.3   // rad, beginhoek
omega = 0     // rad/s
`,
        model: `alpha = -(g / L) * sin(theta) - (k / m) * omega
omega = omega + alpha * dt
theta = theta + omega * dt
x = L * sin(theta)    // m, zijwaartse positie van de massa
stop als t >= 20
`,
    },
    "double-star-orbit": {
        title: "Baan van een dubbelster",
        equipment: [],
        explanation: `# Een dubbelster

Veel sterren hebben een partner: twee sterren die om hun gemeenschappelijke massamiddelpunt draaien. Elke ster trekt aan de andere met de gravitatiekracht

- F = G · M₁ · M₂ / r²

Volgens de derde wet van Newton zijn de twee krachten even groot en tegengesteld. Het model splitst de kracht in een x- en een y-component en verplaatst beide sterren stap voor stap.

## Leerdoelen

- De gravitatiewet en de derde wet van Newton toepassen in twee dimensies.
- Uitleggen waarom beide sterren om het massamiddelpunt draaien, en waarom de zwaardere ster minder beweegt.
- De omlooptijd koppelen aan de afstand tussen de sterren (derde wet van Kepler).

## Opdrachten

1. Laat het model lopen. Voeg een grafiek toe van y1 tegen x1. Welke ster beschrijft de grootste baan? Verklaar dat met de massa's.
2. Lees de omlooptijd af uit de grafiek van r. Maak f = 1 en vergelijk met T = 2π·√(d³ / (G·(M₁ + M₂))).
3. Welke vorm heeft de baan bij f = 1? En bij f = 0.5?
4. Maak dt tien keer zo groot. Wat gaat er mis, en waarom?`,
        start: `t = 0            // s
dt = 3600        // s, één uur
G = 6.674e-11    // N·m²/kg²
M1 = 2.0e30      // kg, ongeveer de massa van de zon
M2 = 1.0e30      // kg
d = 1.5e11       // m, beginafstand tussen de sterren
f = 0.8          // 1 geeft een cirkelbaan, minder een ellips
// Beide sterren beginnen op de x-as, aan weerszijden van het massamiddelpunt, en bewegen tegengesteld
x1 = -d * M2 / (M1 + M2)
y1 = 0
x2 = d * M1 / (M1 + M2)
y2 = 0
vrel = f * wortel(G * (M1 + M2) / d)
vx1 = 0
vy1 = -vrel * M2 / (M1 + M2)
vx2 = 0
vy2 = vrel * M1 / (M1 + M2)
`,
        model: `dx = x2 - x1
dy = y2 - y1
r = wortel(dx^2 + dy^2)        // m, afstand tussen de sterren
F = G * M1 * M2 / r^2          // N, gravitatiekracht
Fx = F * dx / r                // op ster 1, naar ster 2 toe; ster 2 krijgt de tegengestelde kracht
Fy = F * dy / r
vx1 = vx1 + Fx / M1 * dt
vy1 = vy1 + Fy / M1 * dt
vx2 = vx2 - Fx / M2 * dt
vy2 = vy2 - Fy / M2 * dt
x1 = x1 + vx1 * dt
y1 = y1 + vy1 * dt
x2 = x2 + vx2 * dt
y2 = y2 + vy2 * dt
stop als t >= 8e7
`,
    },
    "ideal-gas-collisions": {
        title: "Ideaal gas: botsingen tegen de wand",
        equipment: [],
        explanation: `# Een gasmolecuul in een doos

Gasdruk ontstaat doordat moleculen tegen de wanden botsen. Hier vliegt één stikstofmolecuul heen en weer tussen twee wanden. Bij elke elastische botsing tegen de rechterwand keert de snelheid om, zodat de wand een impuls van 2·m·v krijgt.

Gemiddeld over de tijd tellen al die kleine duwtjes op tot een kracht F op de wand, en druk is kracht per oppervlak: p = F / A.

## Leerdoelen

- Gasdruk uitleggen met moleculen die tegen de wanden botsen.
- Impuls gebruiken: Δp = 2·m·v per elastische botsing en F = Δp / Δt.
- Het model koppelen aan de kinetische gastheorie: F = m·v² / L voor één molecuul.

## Opdrachten

1. Laat het model lopen. Bij welke waarde komt F uit? Vergelijk met m·v² / L.
2. Verdubbel de snelheid v. Wat gebeurt er met F? Wat betekent dat voor de temperatuur van het gas?
3. Maak de doos twee keer zo breed. Hoe verandert de druk? Verklaar met de wet van Boyle.
4. Een echte doos van 10 cm bevat ongeveer 2,5·10²² moleculen die in alle drie de richtingen bewegen. Schat de druk met p = N·m·v² / (3·L³) en vergelijk met de luchtdruk.`,
        start: `t = 0          // s
dt = 1e-6      // s
m = 4.65e-26   // kg, massa van één stikstofmolecuul (N₂)
L = 0.10       // m, breedte van de doos
x = 0.05       // m, het molecuul begint in het midden
v = 500        // m/s
impulse = 0    // N·s, totale impuls die de rechterwand heeft gekregen
`,
        model: `x = x + v * dt
als x >= L:
    x = L
    v = -v                               // elastisch: het kaatst terug met dezelfde snelheid
    impulse = impulse + 2 * m * abs(v)
als x <= 0:
    x = 0
    v = -v
F = impulse / (t + dt)                   // N, gemiddelde kracht op de rechterwand tot nu toe
p = F / L^2                              // Pa, de druk die dit ene molecuul veroorzaakt
stop als t >= 0.02
`,
    },
    "photon-interference": {
        title: "Interferentie van licht",
        equipment: ["Laserpen (kijk nooit in de straal)", "Dubbele spleet", "Scherm of witte muur", "Rolmaat"],
        explanation: `# Interferentie van licht

Een laser schijnt op twee smalle spleten dicht bij elkaar. Daarachter overlapt het licht van beide spleten op een scherm. Waar de golven in fase aankomen versterken ze elkaar (een lichte streep); waar ze een halve golflengte verschillen doven ze elkaar uit (donker).

Voor elk punt y op het scherm berekent het model de afstand tot beide spleten, het weglengteverschil Δs = r₂ − r₁ en de intensiteit I = cos²(π·Δs / λ).

Dit model stapt niet door de tijd maar langs het scherm: y wordt elke stap dy groter.

## Leerdoelen

- Lichte en donkere strepen uitleggen met het weglengteverschil: Δs = n·λ (licht) en Δs = (n + ½)·λ (donker).
- De afstand tussen de strepen gebruiken: Δy = λ·L / d.
- De golflengte van een laser bepalen uit een gemeten interferentiepatroon.

## Opdrachten

1. Laat het model lopen en meet de afstand tussen twee lichte strepen. Vergelijk met λ·L / d.
2. Verander de golflengte in die van een groene laser (532 nm). Wat verandert er?
3. Halveer de afstand d tussen de spleten. Wat gebeurt er met het patroon?
4. Schijn met een laserpen door een dubbele spleet op een muur, meet de afstand tussen de strepen en bepaal λ met het model.`,
        start: `lambda = 650e-9   // m, golflengte van een rode laser
d = 0.25e-3       // m, afstand tussen de twee spleten
L = 2.0           // m, afstand van de spleten tot het scherm
y = -0.02         // m, positie op het scherm (0 is recht vooruit)
dy = 0.00001      // m, stap langs het scherm
`,
        model: `y = y + dy
r1 = wortel(L^2 + (y - d / 2)^2)  // m, afstand tot spleet 1
r2 = wortel(L^2 + (y + d / 2)^2)  // m, afstand tot spleet 2
ds = r2 - r1                      // m, weglengteverschil
phase = 2 * pi * ds / lambda      // rad, faseverschil
I = cos(phase / 2)^2              // intensiteit, ten opzichte van de lichtste plek
stop als y >= 0.02
`,
    },
    "lorentz-field-trajectory": {
        title: "Baan in een magneetveld (Lorentzkracht)",
        equipment: [],
        explanation: `# Een geladen deeltje in een magneetveld

Een proton beweegt door een homogeen magneetveld. De lorentzkracht F = q·v·B staat altijd loodrecht op de snelheid, dus hij verandert de bewegingsrichting maar niet de grootte van de snelheid: het proton beschrijft een cirkel.

Het model berekent de kracht in x- en y-componenten (voor een veld dat uit het scherm wijst: Fx = q·vy·B en Fy = −q·vx·B) en verplaatst het proton in kleine stapjes.

## Leerdoelen

- De richting van de lorentzkracht bepalen met een handregel en uitleggen waarom de baan een cirkel is.
- r = m·v / (q·B) afleiden en gebruiken.
- Uitleggen hoe een massaspectrometer of cyclotron hier gebruik van maakt.

## Opdrachten

1. Laat het model lopen en lees de straal van de cirkel af uit de grafiek. Vergelijk met r = m·v / (q·B).
2. Verdubbel B. Wat gebeurt er met de straal, en met de tijd voor één rondje?
3. Vervang het proton door een elektron (q = -1.602e-19, m = 9.11e-31) en maak dt duizend keer zo klein. Welke kant draait het nu op?
4. Voeg een elektrisch veld toe: E = 500. Beschrijf de baan, en vergelijk hoe snel hij opschuift met E / B.`,
        start: `t = 0           // s
dt = 1e-9       // s
q = 1.602e-19   // C, lading van een proton
m = 1.673e-27   // kg, massa van een proton
B = 0.01        // T, magneetveld, wijst uit het scherm
E = 0           // V/m, elektrisch veld in de y-richting
x = 0           // m
y = 0           // m
vx = 1e5        // m/s
vy = 0          // m/s
`,
        model: `Fx = q * vy * B                // N, lorentzkracht F = q·v·B, loodrecht op v
vx = vx + Fx / m * dt
Fy = q * (E - vx * B)          // met de nieuwe vx, zodat de snelheid gelijk blijft
vy = vy + Fy / m * dt
x = x + vx * dt
y = y + vy * dt
v = wortel(vx^2 + vy^2)        // m/s, snelheid
stop als t >= 2e-5
`,
    },
    "damped-harmonic-motion": {
        title: "Gedempte harmonische trilling",
        equipment: ["Een veer", "Een massa van ongeveer 250 g", "Statief met klem", "Telefooncamera"],
        explanation: `# Gedempte harmonische trilling

Een massa aan een veer trilt om zijn evenwichtsstand. De veerkracht F = −C·x trekt hem terug; een dempende kracht F = −k·v (wrijving of luchtweerstand) neemt energie weg, zodat de trilling uitsterft.

## Leerdoelen

- De veerkracht F = −C·x en de tweede wet van Newton gebruiken om een trilling te modelleren.
- De trillingstijd koppelen aan T = 2π·√(m/C).
- De energie volgen: bewegingsenergie, veerenergie en het totaal dat door demping afneemt.

## Opdrachten

1. Laat het model lopen. Lees de trillingstijd af uit de grafiek van x en vergelijk met T = 2π·√(m/C).
2. Maak k = 0. Wat gebeurt er met de totale energie E? En bij k = 2?
3. Zoek de waarde van k waarbij de massa niet meer door de evenwichtsstand heen schiet (kritische demping). Vergelijk met k = 2·√(m·C).
4. Hang een massa aan een veer, film de trilling, voeg de video toe, zet de punten uit en pas m, C en k in het model aan tot het bij je meting past.`,
        start: `t = 0        // s
dt = 0.001   // s
m = 0.25     // kg
C = 10       // N/m, veerconstante
k = 0.2      // kg/s, demping: F = -k·v
x = 0.05     // m, uitwijking uit de evenwichtsstand
v = 0        // m/s
`,
        model: `Fv = -C * x             // N, veerkracht
Fw = -k * v             // N, dempende kracht
a = (Fv + Fw) / m
v = v + a * dt
x = x + v * dt
Ek = 0.5 * m * v^2      // J, bewegingsenergie
Ev = 0.5 * C * x^2      // J, veerenergie
E = Ek + Ev             // J, totaal
stop als t >= 10
`,
    },
};
