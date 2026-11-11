// Datos iniciales de demostración. El dueño puede cambiarlos en el Panel de administración.

export const initialSettings = {
  businessName: 'TourRide CR',
  whatsapp: '50688880000', // número del negocio, sin "+" ni espacios
  exchangeRate: 520, // colones por dólar
  adminPin: '1234',
  hotelPickupPerPerson: 10,
  shuttleTimes: ['07:30', '14:00'], // salidas fijas del shuttle compartido
  highSeason: false,
  coupons: { TOUR10: 10, FIRST20: 20, CRADVENTURE: 15 },
};

export const initialPartners = [
  { id: 'p1', name: 'Aventura CR Tours', contact: 'Carlos Méndez', whatsapp: '50688881234', commission: 20, active: true },
  { id: 'p2', name: 'Selva Viva Tours', contact: 'María Fernández', whatsapp: '50688885678', commission: 18, active: true },
  { id: 'p3', name: 'Pacific Coast Adventures', contact: 'José Rodríguez', whatsapp: '50688889012', commission: 22, active: true },
];

export const initialTours = [
  {
    id: 't1', scene: 'volcano', category: 'nature', featured: true, active: true,
    name: { es: 'Caminata Volcán Arenal y aguas termales', en: 'Arenal Volcano hike & hot springs' },
    desc: {
      es: 'Visita el imponente Volcán Arenal y relájate en las aguas termales naturales de La Fortuna. Incluye caminata por senderos, vista al lago y tiempo en las termas.',
      en: "Visit the imposing Arenal Volcano and relax in La Fortuna's natural hot springs. Includes trail hiking, lake views and hot springs time.",
    },
    location: 'La Fortuna', partnerId: 'p1', duration: 10, schedules: ['05:00', '07:00'], capacity: 15,
    includes: { es: ['Transporte', 'Entrada al parque', 'Aguas termales', 'Guía bilingüe', 'Almuerzo'], en: ['Transport', 'Park entrance', 'Hot springs', 'Bilingual guide', 'Lunch'] },
    bring: { es: ['Traje de baño', 'Toalla', 'Protector solar', 'Repelente'], en: ['Swimsuit', 'Towel', 'Sunscreen', 'Bug spray'] },
    minAge: 5, difficulty: 'easy', priceAdult: 65, priceChild: 40, highAdult: 75, highChild: 48, rating: 4.9, reviews: 342,
  },
  {
    id: 't2', scene: 'kayak', category: 'water', featured: true, active: true,
    name: { es: 'Kayak Manuel Antonio', en: 'Manuel Antonio kayak' },
    desc: {
      es: 'Navega en kayak por la costa y los manglares de Manuel Antonio. Observa aves, monos y peces en su hábitat natural.',
      en: 'Kayak along the coast and mangroves of Manuel Antonio. Spot birds, monkeys and fish in their natural habitat.',
    },
    location: 'Manuel Antonio', partnerId: 'p3', duration: 4, schedules: ['06:30', '14:00'], capacity: 8,
    includes: { es: ['Kayak', 'Chaleco salvavidas', 'Guía naturalista', 'Snacks'], en: ['Kayak', 'Life vest', 'Naturalist guide', 'Snacks'] },
    bring: { es: ['Protector solar biodegradable', 'Gorra', 'Ropa que se pueda mojar'], en: ['Biodegradable sunscreen', 'Hat', 'Clothes that can get wet'] },
    minAge: 6, difficulty: 'easy', priceAdult: 55, priceChild: 35, highAdult: 65, highChild: 40, rating: 4.8, reviews: 203,
  },
  {
    id: 't3', scene: 'sloth', category: 'nature', featured: true, active: true,
    name: { es: 'Tour de perezosos en Monteverde', en: 'Monteverde sloth tour' },
    desc: {
      es: 'Descubre los perezosos de dos y tres dedos en el bosque nuboso. Tour guiado con telescopio para ver aves y monos.',
      en: 'Discover two- and three-toed sloths in the cloud forest. Guided tour with a telescope to spot birds and monkeys.',
    },
    location: 'Monteverde', partnerId: 'p2', duration: 3, schedules: ['06:00', '07:30', '14:30'], capacity: 10,
    includes: { es: ['Guía bilingüe', 'Binoculares', 'Repelente'], en: ['Bilingual guide', 'Binoculars', 'Bug spray'] },
    bring: { es: ['Zapatos cómodos', 'Cámara con zoom', 'Abrigo liviano'], en: ['Comfortable shoes', 'Zoom camera', 'Light jacket'] },
    minAge: 4, difficulty: 'easy', priceAdult: 45, priceChild: 30, highAdult: 55, highChild: 35, rating: 4.9, reviews: 687,
  },
  {
    id: 't4', scene: 'jungle', category: 'adventure', featured: false, active: true,
    name: { es: 'Canopy y puentes colgantes', en: 'Zipline & hanging bridges' },
    desc: {
      es: 'Vive la adrenalina del canopy sobre el bosque nuboso y cruza puentes colgantes a 60 metros de altura.',
      en: 'Feel the zipline rush over the cloud forest and cross hanging bridges 60 meters high.',
    },
    location: 'Monteverde', partnerId: 'p2', duration: 5, schedules: ['06:00', '08:00', '13:00'], capacity: 12,
    includes: { es: ['Equipo completo', 'Guía certificado', 'Seguro'], en: ['Full equipment', 'Certified guide', 'Insurance'] },
    bring: { es: ['Ropa cómoda', 'Zapatos cerrados', 'Agua'], en: ['Comfortable clothes', 'Closed shoes', 'Water'] },
    minAge: 8, difficulty: 'medium', priceAdult: 85, priceChild: 50, highAdult: 99, highChild: 60, rating: 4.9, reviews: 518,
  },
  {
    id: 't5', scene: 'river', category: 'adventure', featured: false, active: true,
    name: { es: 'Four wheel en ríos y cascadas', en: 'ATV rivers & waterfalls' },
    desc: {
      es: 'Aventura en cuadraciclo por ríos, senderos y cascadas escondidas en La Fortuna. Adrenalina pura en la selva.',
      en: 'ATV adventure through rivers, trails and hidden waterfalls in La Fortuna. Pure jungle adrenaline.',
    },
    location: 'La Fortuna', partnerId: 'p1', duration: 4, schedules: ['08:00', '13:00'], capacity: 16,
    includes: { es: ['Cuadraciclo', 'Guía', 'Parada en cascada', 'Snacks'], en: ['ATV', 'Guide', 'Waterfall stop', 'Snacks'] },
    bring: { es: ['Ropa que se pueda ensuciar', 'Toalla', 'Cambio de ropa'], en: ['Clothes that can get dirty', 'Towel', 'Change of clothes'] },
    minAge: 6, difficulty: 'medium', priceAdult: 75, priceChild: 45, highAdult: 89, highChild: 55, rating: 4.6, reviews: 156,
  },
  {
    id: 't6', scene: 'reef', category: 'water', featured: true, active: true,
    name: { es: 'Snorkel en Isla del Caño', en: 'Caño Island snorkeling' },
    desc: {
      es: 'Nada con tortugas, rayas y peces de arrecife en las aguas cristalinas de la Isla del Caño.',
      en: 'Swim with turtles, rays and reef fish in the crystal-clear waters of Caño Island.',
    },
    location: 'Bahía Drake', partnerId: 'p3', duration: 8, schedules: ['05:30'], capacity: 10,
    includes: { es: ['Lancha', 'Equipo de snorkel', 'Almuerzo', 'Guía marino'], en: ['Boat', 'Snorkel gear', 'Lunch', 'Marine guide'] },
    bring: { es: ['Traje de baño', 'Toalla', 'Cámara impermeable'], en: ['Swimsuit', 'Towel', 'Waterproof camera'] },
    minAge: 8, difficulty: 'medium', priceAdult: 130, priceChild: 80, highAdult: 150, highChild: 95, rating: 4.9, reviews: 421,
  },
  {
    id: 't7', scene: 'coffee', category: 'culture', featured: false, active: true,
    name: { es: 'Tour de café y cultura rural', en: 'Coffee & rural culture tour' },
    desc: {
      es: 'Conoce el proceso del café costarricense desde la siembra hasta la taza en una finca tradicional.',
      en: 'Learn the Costa Rican coffee process from plant to cup at a traditional farm.',
    },
    location: 'Monteverde', partnerId: 'p1', duration: 3, schedules: ['08:00', '13:00'], capacity: 20,
    includes: { es: ['Degustación de café', 'Guía', 'Entrada a la finca'], en: ['Coffee tasting', 'Guide', 'Farm entrance'] },
    bring: { es: ['Sombrero', 'Protector solar', 'Cámara'], en: ['Hat', 'Sunscreen', 'Camera'] },
    minAge: 3, difficulty: 'easy', priceAdult: 40, priceChild: 25, highAdult: 48, highChild: 30, rating: 4.7, reviews: 189,
  },
  {
    id: 't8', scene: 'waterfall', category: 'nature', featured: false, active: true,
    name: { es: 'Río Celeste y Volcán Tenorio', en: 'Rio Celeste & Tenorio Volcano' },
    desc: {
      es: 'Caminata por el Parque Nacional Volcán Tenorio hasta la cascada del río más celeste del país.',
      en: "Hike through Tenorio Volcano National Park to the waterfall of the country's bluest river.",
    },
    location: 'Río Celeste', partnerId: 'p2', duration: 9, schedules: ['05:00', '06:30'], capacity: 14,
    includes: { es: ['Transporte', 'Entrada al parque', 'Guía', 'Almuerzo'], en: ['Transport', 'Park entrance', 'Guide', 'Lunch'] },
    bring: { es: ['Zapatos de caminata', 'Repelente', 'Traje de baño'], en: ['Hiking shoes', 'Bug spray', 'Swimsuit'] },
    minAge: 7, difficulty: 'medium', priceAdult: 90, priceChild: 55, highAdult: 105, highChild: 65, rating: 4.8, reviews: 378,
  },
];

// Tipos de transporte. perPerson = el precio de la tarifa es por persona (shuttle compartido y lancha).
export const vehicleTypes = [
  { id: 'sedan', name: { es: 'Sedán', en: 'Sedan' }, note: { es: 'Privado', en: 'Private' }, capacity: 3, luggage: 3, icon: '🚗' },
  { id: 'suv', name: { es: 'SUV 4x4', en: '4x4 SUV' }, note: { es: 'Privado · ideal para caminos de lastre', en: 'Private · great for gravel roads' }, capacity: 4, luggage: 4, icon: '🚙' },
  { id: 'van6', name: { es: 'Buseta 6 pasajeros', en: '6-passenger van' }, note: { es: 'Privado', en: 'Private' }, capacity: 6, luggage: 6, icon: '🚐' },
  { id: 'van15', name: { es: 'Buseta 15 pasajeros', en: '15-passenger van' }, note: { es: 'Privado', en: 'Private' }, capacity: 15, luggage: 15, icon: '🚐' },
  { id: 'coaster', name: { es: 'Coaster 25 pasajeros', en: '25-seat coaster' }, note: { es: 'Privado', en: 'Private' }, capacity: 25, luggage: 25, icon: '🚌' },
  { id: 'bus', name: { es: 'Bus 45 pasajeros', en: '45-seat bus' }, note: { es: 'Privado', en: 'Private' }, capacity: 45, luggage: 45, icon: '🚌' },
  { id: 'shuttle', perPerson: true, name: { es: 'Shuttle compartido', en: 'Shared shuttle' }, note: { es: 'Precio por persona · horarios fijos', en: 'Per person · fixed departures' }, capacity: 12, luggage: 24, icon: '🚐' },
  { id: 'boat', perPerson: true, name: { es: 'Lancha', en: 'Boat' }, note: { es: 'Precio por persona', en: 'Per person' }, capacity: 25, luggage: 50, icon: '🚤' },
];

export const zones = ['Aeropuerto SJO', 'Aeropuerto LIR', 'San José', 'La Fortuna', 'Monteverde', 'Manuel Antonio', 'Tamarindo', 'Playa Conchal', 'Liberia', 'La Pavona', 'Tortuguero', 'Sierpe', 'Bahía Drake', 'Jacó', 'Montezuma'];

// Tarifas en USD por ruta (sirven en ambos sentidos). 0 = ese transporte no se ofrece en esa ruta.
// Vehículos privados: precio por viaje. shuttle y boat: precio por persona.
const R = (id, from, to, sedan, suv, van6, van15, coaster, bus, shuttle, boat = 0) => ({ id, from, to, sedan, suv, van6, van15, coaster, bus, shuttle, boat });
export const initialRates = [
  R('r1', 'Aeropuerto SJO', 'La Fortuna', 75, 105, 95, 180, 300, 450, 55),
  R('r2', 'Aeropuerto SJO', 'Manuel Antonio', 70, 100, 90, 170, 280, 420, 50),
  R('r3', 'Aeropuerto SJO', 'Monteverde', 80, 115, 100, 190, 310, 470, 60),
  R('r4', 'Aeropuerto SJO', 'Tamarindo', 90, 125, 110, 210, 330, 500, 60),
  R('r5', 'Aeropuerto SJO', 'San José', 25, 35, 35, 60, 90, 130, 0),
  R('r6', 'Aeropuerto LIR', 'La Fortuna', 70, 100, 90, 170, 280, 420, 55),
  R('r7', 'Aeropuerto LIR', 'Tamarindo', 40, 55, 55, 100, 160, 240, 25),
  R('r8', 'Aeropuerto LIR', 'Playa Conchal', 35, 50, 50, 95, 150, 230, 25),
  R('r9', 'Aeropuerto LIR', 'Liberia', 15, 25, 25, 45, 70, 110, 0),
  R('r10', 'La Fortuna', 'Monteverde', 60, 90, 80, 150, 250, 380, 35),
  R('r11', 'Monteverde', 'Manuel Antonio', 85, 120, 105, 200, 320, 480, 55),
  R('r12', 'Aeropuerto SJO', 'La Pavona', 120, 160, 150, 260, 380, 560, 60),
  R('r13', 'Manuel Antonio', 'Sierpe', 90, 125, 110, 210, 330, 500, 50),
  R('r14', 'La Pavona', 'Tortuguero', 0, 0, 0, 0, 0, 0, 0, 15),
  R('r15', 'Sierpe', 'Bahía Drake', 0, 0, 0, 0, 0, 0, 0, 25),
  R('r16', 'Jacó', 'Montezuma', 0, 0, 0, 0, 0, 0, 0, 45),
];
