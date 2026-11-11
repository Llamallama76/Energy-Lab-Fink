/**
 * Florida 5th Grade NGSSS Science Standards & Station Curriculum Content
 * Benchmarks: SC.5.P.10.1, SC.5.P.10.2, SC.5.P.10.4
 */

export const FLORIDA_STANDARDS = {
  'SC.5.P.10.1': {
    code: 'SC.5.P.10.1',
    strand: 'Big Idea 10: Forms of Energy',
    title: 'Basic Forms of Energy',
    description:
      'Investigate and describe some basic forms of energy, including light, heat (thermal), sound, electrical, chemical, and mechanical.'
  },
  'SC.5.P.10.2': {
    code: 'SC.5.P.10.2',
    strand: 'Big Idea 10: Forms of Energy',
    title: 'Energy Causes Motion & Change',
    description:
      'Investigate and explain that energy has the ability to cause motion or create change.'
  },
  'SC.5.P.10.4': {
    code: 'SC.5.P.10.4',
    strand: 'Big Idea 11: Energy Transfer & Transformations',
    title: 'Electrical & Multi-Form Energy Transformations',
    description:
      'Investigate and explain that electrical energy can be transformed into heat, light, and sound energy, as well as the energy of motion.'
  }
};

export const STATIONS_META = [
  {
    id: 'sound',
    number: 1,
    shortLabel: 'Sound',
    title: 'Sound Energy & Vibration Lab',
    subtitle: 'Vibration, Pitch, Volume & Acoustic Motion',
    accent: '#22d3ee',
    benchmarks: ['SC.5.P.10.1', 'SC.5.P.10.2'],
    benchmarkSummary: 'Sound energy is produced by vibrating matter and transfers energy that can push objects into motion.',
    howToSteps: [
      'Choose Apparatus A (Tuning Fork) or Apparatus B (Subwoofer Cone) at the top of the control deck.',
      'In Tuning Fork mode, slide Fork Size to change pitch (frequency in Hz) and Strike Force to change volume, then tap Strike Fork (or click the tuning fork directly in 3D!).',
      'Slide the Ping-Pong Ball into contact with the vibrating metal prong and watch how sound vibrations transfer motion.',
      'Switch to Speaker Cone & Particles and turn up the Volume slider to observe what happens to the colorful sprinkles on the pulsing speaker membrane.'
    ],
    inquiries: [
      'What happens to the ping-pong ball when you increase volume (strike force) versus when you only change pitch (fork size)?',
      'What proof do you see at both apparatuses that sound energy causes physical motion?'
    ],
    scienceNote:
      'Smaller tuning forks vibrate faster (higher frequency = higher pitch), while harder strikes make the prongs swing wider (larger amplitude = louder volume), kicking the ping-pong ball much further!'
  },
  {
    id: 'light',
    number: 2,
    shortLabel: 'Light',
    title: 'Light Energy Optics Bench',
    subtitle: 'Reflection, Refraction, Dispersion & Absorption',
    accent: '#38bdf8',
    benchmarks: ['SC.5.P.10.1'],
    benchmarkSummary: 'Light travels in straight lines until it strikes an object or new medium where it reflects, refracts, or absorbs.',
    howToSteps: [
      'In Mode A (Laser & Mirror Puzzle), drag the 3D mirror mounts (or adjust Mirror Angle sliders) to bounce the laser beam around the barriers and hit the glowing Sensor Target.',
      'Notice the dashed Normal Line at each mirror: compare the Angle of Incidence (incoming) to the Angle of Reflection (outgoing).',
      'Switch to Mode B (Refraction Chamber) to inspect the Pencil in Water beaker and rotate the White Light Prism to split white light into a rainbow spectrum.',
      'Switch to Mode C (Shadow Lab) to swap Opaque Wood, Translucent Frosted Glass, and Transparent Clear Glass blocks while sliding the light source.'
    ],
    inquiries: [
      'Why does the straight pencil look bent and magnified right where it enters the water?',
      'What causes white light to separate into a rainbow of colors inside the glass prism?'
    ],
    scienceNote:
      'Light slows down when moving from air into water or glass, causing the ray to bend (refract). Each color wavelength bends by a slightly different amount inside a prism, spreading white light into ROYGBIV!'
  },
  {
    id: 'thermal',
    number: 3,
    shortLabel: 'Thermal',
    title: 'Thermal Energy & Phase Chamber',
    subtitle: 'Particle Motion, Phase Change & Heat Transfer',
    accent: '#fb923c',
    benchmarks: ['SC.5.P.10.1', 'SC.5.P.10.2'],
    benchmarkSummary: 'Thermal energy measures the motion of particles in matter; adding or removing heat causes changes in state and material properties.',
    howToSteps: [
      'In Apparatus A (Molecular Motion Chamber), drag the Heat / Cool slider between the Cryo Ice Block (-30°C) and the Bunsen Burner Flame (150°C).',
      'Watch both the live °C / °F thermometer and how the 3D particles rearrange from a vibrating Solid lattice to a sliding Liquid and a fast-bouncing Gas.',
      'Switch to Apparatus B (Kitchen Toaster Demo), pick a Toast Darkness setting, and push down the Chrome Toaster Lever (or click the lever in 3D!).',
      'Observe the Nichrome heating coils glow orange-red as thermal energy toasts and browns the bread slices before popping up.'
    ],
    inquiries: [
      'What happens to the speed and spacing of the particles when thermal energy is added?',
      'What observable evidence shows that thermal energy is creating a physical and chemical change inside the toaster?'
    ],
    scienceNote:
      'Adding thermal energy makes molecules move faster and spread apart (solid → liquid → gas). Inside the toaster, electrical energy becomes intense radiant heat in the coils, evaporating moisture and browning the bread crust!'
  },
  {
    id: 'mechanical',
    number: 4,
    shortLabel: 'Mechanical',
    title: 'Mechanical Energy Playground',
    subtitle: 'Potential vs. Kinetic Energy, Mass & Collisions',
    accent: '#34d399',
    benchmarks: ['SC.5.P.10.1', 'SC.5.P.10.2'],
    benchmarkSummary: 'Mechanical energy combines stored potential energy (position/height) and moving kinetic energy (mass and speed).',
    howToSteps: [
      'In Apparatus A (Roller Coaster), set the Release Height and Cart Mass sliders, toggle Track Friction on or off, and click Launch Cart.',
      'Watch the live PE / KE / Thermal Energy bar chart as the cart climbs and dives through the vertical loop.',
      'Switch to Apparatus B (Ramp Collision Test) and choose either the Heavy Steel Bowling Ball (5.0 kg) or Light Tennis Ball (0.25 kg).',
      'Set the ramp Release Height and click Release Ball to measure how far the target pins scatter upon collision.'
    ],
    inquiries: [
      'Where along the roller coaster track is Potential Energy highest, and where is Kinetic Energy highest?',
      'Why does the heavy steel ball knock the target pins much further than the light tennis ball when released from the exact same height?'
    ],
    scienceNote:
      'Potential Energy peaks at the highest hill crest and converts into fast Kinetic Energy in the lowest valleys. Because mechanical energy depends on both speed and mass, a heavier ball carries far more kinetic energy into the pins!'
  },
  {
    id: 'chemical',
    number: 5,
    shortLabel: 'Chemical',
    title: 'Chemical Energy Transformation Bay',
    subtitle: 'Stored Energy in Food & Fuel Powering Motion & Light',
    accent: '#facc15',
    benchmarks: ['SC.5.P.10.1', 'SC.5.P.10.4'],
    benchmarkSummary: 'Chemical energy stored inside food and fuel can be released and transformed into motion, electricity, light, and heat.',
    howToSteps: [
      'In Apparatus A (Bicycle Generator & Tiny Town), click an Apple, Banana, or Energy Bar to feed stored chemical energy to the cyclist.',
      'Watch the Stamina Bar charge as the cyclist pedals the mechanical turbine, sending electricity through the cables to light up Sunshine Bay!',
      'Switch to Apparatus B (Cutaway Car Engine) and click Pump Gasoline to fill the translucent tank with liquid chemical fuel.',
      'Turn the Ignition Key ON and adjust Throttle RPM to watch spark plugs ignite fuel, driving the chrome pistons and releasing exhaust heat.'
    ],
    inquiries: [
      'Trace the complete chain of energy transformations starting from the apple all the way to the glowing streetlights in the tiny town.',
      'Where and in what form is the energy stored before the car engine is started?'
    ],
    scienceNote:
      'Apple (Chemical) → Cyclist Pedaling (Mechanical) → Generator Coils (Electrical) → Streetlamps (Light + Thermal). In a car, energy waits as Chemical Energy in the gasoline molecules until combustion converts it into piston motion and exhaust heat!'
  },
  {
    id: 'electrical',
    number: 6,
    shortLabel: 'Electrical',
    title: 'Electrical Circuit Bench',
    subtitle: 'Closed Loops & Multi-Form Energy Outputs',
    accent: '#f59e0b',
    benchmarks: ['SC.5.P.10.4'],
    benchmarkSummary: 'Electricity flows only through a unbroken closed circuit loop and transforms into light, heat, sound, and mechanical motion.',
    howToSteps: [
      'Inspect the wooden magnetic snap-bench: a circuit needs a power source (9V Battery), unbroken Connecting Wires, output devices, and a closed Knife Switch.',
      'Click or drag components from the Component Tray (Light Bulb, Electric Buzzer, Motor Propeller, or Jumper Wires) into the bench bays and wire slots.',
      'Click the Copper Knife Switch in 3D (or toggle Close Switch in the controls) to complete the loop and watch glowing electrons flow!',
      'Try removing a single wire or opening the Knife Switch to test what happens when a gap breaks the circuit path.'
    ],
    inquiries: [
      'What happens immediately to every device in the loop when the knife switch is opened or one wire is removed?',
      'Name at least three different forms of energy produced by electrical energy in your completed circuit.'
    ],
    scienceNote:
      'Opening the knife switch creates an air gap (open circuit) that stops electric current everywhere in the loop at once. When closed, electrical energy transforms into Light + Heat (bulb), Sound (buzzer), and Mechanical motion (spinning motor fan)!'
  }
];
