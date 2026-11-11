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
    subtitle: 'Vibration, Sound Waves in Air, Pitch & Deep Bass Motion',
    accent: '#22d3ee',
    benchmarks: ['SC.5.P.10.1', 'SC.5.P.10.2'],
    benchmarkSummary:
      'Sound energy is produced by vibrating matter and travels as waves through air that can push objects into motion.',
    howToSteps: [
      'Choose Apparatus A (Tuning Fork) or Apparatus B (Deep-Bass Speaker Cone) at the top of the panel.',
      'Slide Fork Size (pitch) and Strike Force (volume), then click Strike Fork (or tap the 3D fork).',
      'Adjust the Ping-Pong Ball Air Gap slider: test 0 cm (touching prong for a big kick) AND 1–8 cm away to watch sound waves in the air push the ball without touching!',
      'Switch to Speaker Cone & Particles and turn up the Subwoofer Volume to hear the deep bass rumble and watch sprinkles bounce high into the air.'
    ],
    inquiries: [
      'Why does the ping-pong ball still sway when there is an air gap between it and the vibrating tuning fork?',
      'What happens to the ping-pong ball and speaker sprinkles when you increase volume versus when you change pitch?'
    ],
    scienceNote:
      'Vibrating prongs compress air molecules into invisible sound waves that travel across the gap and push the lightweight ping-pong ball! Touching the prong transfers mechanical vibrations directly for an even bigger kick.'
  },
  {
    id: 'light',
    number: 2,
    shortLabel: 'Light',
    title: 'Light Energy Optics Bench',
    subtitle: '4-Mirror Reflection, 0° Bounce-Back, Refraction & Shape Shadows',
    accent: '#38bdf8',
    benchmarks: ['SC.5.P.10.1'],
    benchmarkSummary:
      'Light travels in straight lines until it strikes a surface or new medium where it reflects, refracts, or is absorbed.',
    howToSteps: [
      'In Mode A (Reflection), rotate all 4 mirrors (in 3D or with sliders) to steer the laser around the barriers into the Sensor Target.',
      'Click "Straight-On Bounce Back (0°)" to aim Mirror 1 flat against the beam and see light reflect straight back along the exact same line!',
      'Switch to Mode B (Refraction) to observe the "broken" magnified pencil in water and rotate the glass prism to split white light into a rainbow.',
      'Switch to Mode C (Shadow Lab): click the 3D object on the stand to morph its shape (Block, Star, Circle, or Silly Puppet), and use the side panel to test Opaque, Translucent, and Transparent materials!'
    ],
    inquiries: [
      'What happens to a light ray when it strikes a mirror straight-on at a 0° angle along the normal line?',
      'How does changing the test material from Opaque to Translucent to Transparent change the puppet or star shadow on the screen?'
    ],
    scienceNote:
      'Light always obeys Angle of Incidence = Angle of Reflection—including at 0°, where straight-on light bounces straight back! In Shadow Lab, opaque objects block light completely, translucent materials scatter a blurry shadow, and transparent glass lets light pass right through.'
  },
  {
    id: 'thermal',
    number: 3,
    shortLabel: 'Thermal',
    title: 'Thermal Energy & Phase Chamber',
    subtitle: 'Water Benchmark Temperatures (0°C/32°F, 24°C/75°F, 100°C/212°F) & Heat',
    accent: '#fb923c',
    benchmarks: ['SC.5.P.10.1', 'SC.5.P.10.2'],
    benchmarkSummary:
      'Thermal energy measures particle motion; adding or removing heat changes temperature and state of matter.',
    howToSteps: [
      'In Apparatus A (Phase Chamber), use the continuous Heat / Cool slider or click the 3 Water Benchmark buttons: Solid (0°C / 32°F), Liquid (24°C / 75°F), and Gas (100°C / 212°F).',
      'Compare the °C / °F thermometer with how the 3D particles vibrate in place (Solid), slide past each other (Liquid), or zip rapidly everywhere (Gas).',
      'Switch to Apparatus B (Kitchen Toaster), pick a Toast Darkness level, and push down the Chrome Lever.',
      'Watch the glowing red-orange Nichrome coils radiate thermal energy to brown and toast the bread slices.'
    ],
    inquiries: [
      'What happens to particle speed and spacing as water warms from 0°C (32°F) to 24°C (75°F) to 100°C (212°F)?',
      'What observable evidence proves that thermal energy creates a change inside the toaster?'
    ],
    scienceNote:
      'Water freezes into solid ice at 0°C (32°F), flows as liquid water at room temperature (24°C / 75°F), and boils into water vapor gas at 100°C (212°F) as added thermal energy makes molecules move faster and spread apart!'
  },
  {
    id: 'mechanical',
    number: 4,
    shortLabel: 'Mechanical',
    title: 'Mechanical Energy Playground',
    subtitle: 'Adjustable Coaster Lift Hill, 1–2 Loop Challenge & 6-Pin Collisions',
    accent: '#34d399',
    benchmarks: ['SC.5.P.10.1', 'SC.5.P.10.2'],
    benchmarkSummary:
      'Mechanical energy combines stored potential energy (height) and moving kinetic energy (mass and speed).',
    howToSteps: [
      'In Apparatus A (Roller Coaster), drag the yellow Lift Tower up and down in 3D (or use the Starting Height slider) to physically raise or lower the start hill.',
      'Pick 0 Loops, 1 Loop, or 2 Loops, toggle Friction, and click Launch Cart to test if your starting height gives enough Potential Energy to clear every loop!',
      'Switch to Apparatus B (Ramp Collision) and compare the Heavy Steel Ball (5.0 kg) against the Light Tennis Ball (0.25 kg).',
      'Raise the Ramp Height and click Release Ball to see if you can scatter all 6 bowling pins in a chain reaction!'
    ],
    inquiries: [
      'Why must you raise the starting hill higher when you add a 2nd loop or turn Track Friction ON?',
      'Why can the 5.0 kg steel ball scatter all 6 pins while the 0.25 kg tennis ball from the same height cannot?'
    ],
    scienceNote:
      'A coaster cart can never climb higher than the Potential Energy stored at its starting hill (and friction turns some mechanical energy into heat). On the ramp, greater mass at the same speed carries far more Kinetic Energy into the pins!'
  },
  {
    id: 'chemical',
    number: 5,
    shortLabel: 'Chemical',
    title: 'Chemical Energy Transformation Bay',
    subtitle: 'Tire-Driven Dynamo Generator, Streetlights & Cutaway Car Engine',
    accent: '#facc15',
    benchmarks: ['SC.5.P.10.1', 'SC.5.P.10.4'],
    benchmarkSummary:
      'Chemical energy stored in food and fuel transforms into mechanical motion, electricity, light, and thermal energy.',
    howToSteps: [
      'In Apparatus A (Bike & Tiny Town), feed an Apple, Banana, or Energy Bar to give stored chemical energy to the cyclist.',
      'Watch the spinning back tire rub the copper Tire Dynamo Generator, sending electricity into Tiny Town to light up all the house windows and 8 streetlights!',
      'Switch to Apparatus B (Car Engine) and click Pump Gasoline to fill the tank with liquid chemical fuel.',
      'Turn the Ignition Key ON and slide the Throttle to watch spark plugs ignite fuel vapor and drive the pistons.'
    ],
    inquiries: [
      'Trace every energy transformation from the food snack through the bicycle tire generator to the glowing house windows and streetlights.',
      'What happens to the town lights and generator wheel as the cyclist uses up their stored chemical stamina?'
    ],
    scienceNote:
      'Food (Chemical Energy) → Pedaling Legs & Spinning Tire (Mechanical Energy) → Spinning Copper Dynamo on the Tire (Electrical Energy) → Glowing House Windows & Streetlights (Light + Thermal Energy)!'
  },
  {
    id: 'electrical',
    number: 6,
    shortLabel: 'Electrical',
    title: 'Snap-Grid Circuit Builder Kit',
    subtitle: 'Build Custom Closed Circuits with Wires, Switch, Lights, Fan & Siren',
    accent: '#f59e0b',
    benchmarks: ['SC.5.P.10.4'],
    benchmarkSummary:
      'Electricity flows only through a complete closed loop and transforms into light, sound, heat, and mechanical motion.',
    howToSteps: [
      'Your 7×5 Snap-Circuits pegboard starts empty so you can invent your own circuit! Pick parts from the Parts Kit (or click them in the 3D organizer tray).',
      'Snap down a Battery Pack, a Switch, Blue Wire strips (use Rotate 90° or press R to turn parts), and your choice of loads: White, Red, or Blue Lights, a Motor Fan, or an Alarm Siren!',
      'Connect a complete closed loop from Battery (+) back to Battery (–), then click your Switch on the board (or "Flip Switch ON/OFF") to test it!',
      'Swap loads or wire two loads side-by-side to compare single loads, series loops, and parallel branches.'
    ],
    inquiries: [
      'What must be true about the path from Battery (+) to Battery (–) before any light, fan, or siren will turn on?',
      'Which forms of energy are produced when you connect a Light, the Motor Fan, and the Alarm Siren?'
    ],
    scienceNote:
      'Electric current requires an unbroken closed loop! When you flip the switch ON, electrical energy transforms into Light + Heat (White/Red/Blue lamps), Mechanical motion (spinning Motor Fan), and Sound energy (Alarm Siren).'
  }
];
