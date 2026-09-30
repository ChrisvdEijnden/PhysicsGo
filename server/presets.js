// The content of the built-in assignments: explanation (Markdown, see src/components/Markdown.tsx),
// starter code, the graphs a student starts with, equipment and time. Migration 12 in db.js writes it
// into the projects table; teachers can duplicate an assignment and change it.
export const PRESETS = [
    {
        id: "standard-freefall",
        minutes: 30,
        equipment: ["A small cube", "Measuring tape", "Stopwatch or phone camera"],
        graphs: [{ x: "t", ys: ["h"] }, { x: "t", ys: ["v"] }],
        explanation: `# Free fall

A small cube is dropped from a height of 10 m. Without air resistance only gravity acts on it, so its acceleration is constant: a = −g.

The model works in small time steps dt. Every step it uses the velocity and acceleration to work out the next values:

- Δv = a · Δt
- Δh = v · Δt

## Learning goals

- Explain how a numerical model builds up h(t) and v(t) from a = −g.
- Compare the model with the formulas h = h₀ − ½·g·t² and v = −g·t.
- See how the size of the time step dt affects the result.

## Tasks

1. Run the model. How long does the fall take? Check with t = √(2h/g).
2. What is the speed just before the cube lands? Compare with v = √(2·g·h).
3. Make dt ten times larger. What changes in the fall time, and why?
4. Drop the cube from a height you measured, film it or time it, and compare with the model. Is air resistance important here?`,
        start: `t = 0        // s
dt = 0.01    // s
h = 10       // m, height above the floor
v = 0        // m/s, upwards is positive
g = 9.81     // m/s²
`,
        model: `a = -g
v = v + a * dt
h = h + v * dt
stop als h <= 0
`,
    },
    {
        id: "harmonic-pendulum-drag",
        minutes: 45,
        equipment: ["String of about 1 m", "A mass of about 200 g", "Stand and clamp", "Stopwatch or phone camera"],
        graphs: [{ x: "t", ys: ["theta"] }, { x: "t", ys: ["x"] }],
        explanation: `# Pendulum with air resistance

A mass on a string swings back and forth. Gravity pulls it back towards the lowest point, while air resistance slowly takes energy away, so the swing gets smaller.

For the angle θ (in radians) of a pendulum with length L, the model uses:

- α = −(g / L) · sin θ − (k / m) · ω (angular acceleration)
- ω changes by α · Δt, and θ by ω · Δt

## Learning goals

- Describe a harmonic oscillation with amplitude, period and frequency.
- Compare the period with T = 2π·√(L/g) for small angles.
- Explain how damping makes the amplitude smaller but hardly changes the period.

## Tasks

1. Run the model and read the period T from the graph of θ. Compare with T = 2π·√(L/g).
2. Set k = 0. What happens to the amplitude now?
3. Start at a large angle (theta = 1.5). Is the period still the same? Why not?
4. Build the pendulum, film it, add the video and plot the position of the mass. Change k until the model matches your measurement.`,
        start: `t = 0         // s
dt = 0.001    // s
L = 1.0       // m, length of the string
m = 0.2       // kg
g = 9.81      // m/s²
k = 0.02      // kg/s, air resistance: F = -k·v
theta = 0.3   // rad, starting angle
omega = 0     // rad/s
`,
        model: `alpha = -(g / L) * sin(theta) - (k / m) * omega
omega = omega + alpha * dt
theta = theta + omega * dt
x = L * sin(theta)    // m, sideways position of the mass
stop als t >= 20
`,
    },
    {
        id: "double-star-orbit",
        minutes: 60,
        equipment: [],
        graphs: [{ x: "x2", ys: ["y2"] }, { x: "t", ys: ["r"] }],
        explanation: `# A double star

Many stars have a partner: two stars that orbit their common centre of mass. Each star pulls on the other with the gravitational force

- F = G · M₁ · M₂ / r²

By Newton's third law the two forces are equally large and opposite. The model splits the force into x- and y-components and moves both stars one step at a time.

## Learning goals

- Apply Newton's law of gravitation and his third law in two dimensions.
- Explain why both stars orbit the centre of mass, and why the heavier star moves less.
- Relate the orbital period to the distance between the stars (Kepler's third law).

## Tasks

1. Run the model. Add a graph of y1 against x1. Which star moves in the larger orbit? Explain with the masses.
2. Read the orbital period from the graph of r. Set f = 1 and compare with T = 2π·√(d³ / (G·(M₁ + M₂))).
3. What shape does the orbit have for f = 1? And for f = 0.5?
4. Make dt ten times larger. What goes wrong, and why?`,
        start: `t = 0            // s
dt = 3600        // s, one hour
G = 6.674e-11    // N·m²/kg²
M1 = 2.0e30      // kg, about the mass of the Sun
M2 = 1.0e30      // kg
d = 1.5e11       // m, starting distance between the stars
f = 0.8          // 1 gives a circular orbit, less an ellipse
// Both stars start on the x-axis, on either side of the centre of mass, moving in opposite directions
x1 = -d * M2 / (M1 + M2)
y1 = 0
x2 = d * M1 / (M1 + M2)
y2 = 0
vrel = f * sqrt(G * (M1 + M2) / d)
vx1 = 0
vy1 = -vrel * M2 / (M1 + M2)
vx2 = 0
vy2 = vrel * M1 / (M1 + M2)
`,
        model: `dx = x2 - x1
dy = y2 - y1
r = sqrt(dx^2 + dy^2)          // m, distance between the stars
F = G * M1 * M2 / r^2          // N, gravitational force
Fx = F * dx / r                // on star 1, towards star 2; star 2 gets the opposite force
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
    {
        id: "ideal-gas-collisions",
        minutes: 45,
        equipment: [],
        graphs: [{ x: "t", ys: ["x"] }, { x: "t", ys: ["F"] }],
        explanation: `# A gas molecule in a box

Gas pressure comes from molecules bouncing off the walls. Here one nitrogen molecule flies back and forth between two walls. Every elastic collision with the right-hand wall reverses its velocity, so the wall gets a momentum of 2·m·v.

Averaged over time, all these small pushes add up to a force F on the wall, and pressure is force per area: p = F / A.

## Learning goals

- Explain gas pressure with molecules colliding with the walls.
- Use momentum: Δp = 2·m·v per elastic collision and F = Δp / Δt.
- Connect the model to the kinetic theory of gases: F = m·v² / L for one molecule.

## Tasks

1. Run the model. What value does F settle at? Compare with m·v² / L.
2. Double the speed v. What happens to F? What does that mean for the temperature of the gas?
3. Make the box twice as wide. How does the pressure change? Explain with Boyle's law.
4. A real box of 10 cm contains about 2.5·10²² molecules moving in all three directions. Estimate the pressure with p = N·m·v² / (3·L³) and compare with the air pressure.`,
        start: `t = 0          // s
dt = 1e-6      // s
m = 4.65e-26   // kg, mass of one nitrogen molecule (N₂)
L = 0.10       // m, width of the box
x = 0.05       // m, the molecule starts in the middle
v = 500        // m/s
impulse = 0    // N·s, total momentum given to the right-hand wall
`,
        model: `x = x + v * dt
als x >= L:
    x = L
    v = -v                               // elastic: it bounces back at the same speed
    impulse = impulse + 2 * m * abs(v)
als x <= 0:
    x = 0
    v = -v
F = impulse / (t + dt)                   // N, average force on the right-hand wall so far
p = F / L^2                              // Pa, the pressure this one molecule causes
stop als t >= 0.02
`,
    },
    {
        id: "photon-interference",
        minutes: 45,
        equipment: ["Laser pointer (never look into the beam)", "Double slit", "Screen or white wall", "Measuring tape"],
        graphs: [{ x: "y", ys: ["I"] }, { x: "y", ys: ["ds"] }],
        explanation: `# Interference of light

A laser shines on two narrow slits close together. Behind them, light from both slits overlaps on a screen. Where the waves arrive in phase they reinforce each other (a bright fringe); where they are half a wavelength apart they cancel out (dark).

For every point y on the screen the model calculates the distance to both slits, the path difference Δs = r₂ − r₁ and the intensity I = cos²(π·Δs / λ).

This model doesn't step through time but along the screen: y goes up by dy every step.

## Learning goals

- Explain bright and dark fringes with the path difference: Δs = n·λ (bright) and Δs = (n + ½)·λ (dark).
- Use the distance between fringes: Δy = λ·L / d.
- Determine the wavelength of a laser from a measured interference pattern.

## Tasks

1. Run the model and measure the distance between two bright fringes. Compare with λ·L / d.
2. Change the wavelength to that of a green laser (532 nm). What changes?
3. Halve the distance d between the slits. What happens to the pattern?
4. Shine a laser pointer through a double slit onto a wall, measure the distance between the fringes and use the model to find λ.`,
        start: `lambda = 650e-9   // m, wavelength of a red laser
d = 0.25e-3       // m, distance between the two slits
L = 2.0           // m, distance from the slits to the screen
y = -0.02         // m, position on the screen (0 is straight ahead)
dy = 0.00001      // m, step along the screen
`,
        model: `y = y + dy
r1 = sqrt(L^2 + (y - d / 2)^2)    // m, distance to slit 1
r2 = sqrt(L^2 + (y + d / 2)^2)    // m, distance to slit 2
ds = r2 - r1                      // m, path difference
phase = 2 * pi * ds / lambda      // rad, phase difference
I = cos(phase / 2)^2              // intensity, relative to the brightest spot
stop als y >= 0.02
`,
    },
    {
        id: "lorentz-field-trajectory",
        minutes: 45,
        equipment: [],
        graphs: [{ x: "x", ys: ["y"] }, { x: "t", ys: ["v"] }],
        explanation: `# A charged particle in a magnetic field

A proton moves through a uniform magnetic field. The Lorentz force F = q·v·B is always perpendicular to its velocity, so it changes the direction of motion but not the speed: the proton goes round in a circle.

The model calculates the force in x- and y-components (for a field pointing out of the screen: Fx = q·vy·B and Fy = −q·vx·B) and moves the proton in small steps.

## Learning goals

- Find the direction of the Lorentz force with a right-hand rule and explain why the path is a circle.
- Derive and use r = m·v / (q·B).
- Explain how a mass spectrometer or cyclotron makes use of this.

## Tasks

1. Run the model and read the radius of the circle from the graph. Compare with r = m·v / (q·B).
2. Double B. What happens to the radius, and to the time for one round?
3. Replace the proton by an electron (q = -1.602e-19, m = 9.11e-31) and make dt a thousand times smaller. Which way does it turn now?
4. Add an electric field: E = 500. Describe the path, and compare how fast it drifts with E / B.`,
        start: `t = 0           // s
dt = 1e-9       // s
q = 1.602e-19   // C, charge of a proton
m = 1.673e-27   // kg, mass of a proton
B = 0.01        // T, magnetic field, pointing out of the screen
E = 0           // V/m, electric field in the y-direction
x = 0           // m
y = 0           // m
vx = 1e5        // m/s
vy = 0          // m/s
`,
        model: `Fx = q * vy * B                // N, Lorentz force F = q·v·B, perpendicular to v
vx = vx + Fx / m * dt
Fy = q * (E - vx * B)          // with the new vx, so the speed stays the same
vy = vy + Fy / m * dt
x = x + vx * dt
y = y + vy * dt
v = sqrt(vx^2 + vy^2)          // m/s, speed
stop als t >= 2e-5
`,
    },
    {
        id: "damped-harmonic-motion",
        minutes: 45,
        equipment: ["A spring", "A mass of about 250 g", "Stand and clamp", "Phone camera"],
        graphs: [{ x: "t", ys: ["x"] }, { x: "t", ys: ["Ek", "Ev", "E"] }],
        explanation: `# Damped harmonic motion

A mass on a spring vibrates around its equilibrium position. The spring force F = −C·x pulls it back; a damping force F = −k·v (friction or air resistance) takes energy away, so the vibration dies out.

## Learning goals

- Use the spring force F = −C·x and Newton's second law to model a vibration.
- Relate the period to T = 2π·√(m/C).
- Follow the energy: kinetic energy, the energy in the spring, and the total that decreases through damping.

## Tasks

1. Run the model. Read the period from the graph of x and compare with T = 2π·√(m/C).
2. Set k = 0. What happens to the total energy E? And with k = 2?
3. Find the value of k where the mass no longer swings through the equilibrium position (critical damping). Compare with k = 2·√(m·C).
4. Hang a mass from a spring, film it vibrating, add the video, plot the points and fit m, C and k in the model to your measurement.`,
        start: `t = 0        // s
dt = 0.001   // s
m = 0.25     // kg
C = 10       // N/m, spring constant
k = 0.2      // kg/s, damping: F = -k·v
x = 0.05     // m, distance from the equilibrium position
v = 0        // m/s
`,
        model: `Fv = -C * x             // N, spring force
Fw = -k * v             // N, damping force
a = (Fv + Fw) / m
v = v + a * dt
x = x + v * dt
Ek = 0.5 * m * v^2      // J, kinetic energy
Ev = 0.5 * C * x^2      // J, energy in the spring
E = Ek + Ev             // J, total
stop als t >= 10
`,
    },
];
