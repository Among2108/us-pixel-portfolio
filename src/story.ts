export const worlds = [
  { id: 'about', title: 'About Me', theme: 'Space Meadow', tint: '#9bcab5' },
  { id: 'experience', title: 'Work Experience', theme: 'Rainbow Hollow', tint: '#c6b6e8' },
  { id: 'projects', title: 'Personal Projects', theme: 'Creative Sandbox', tint: '#f2c69a' },
  { id: 'contact', title: 'Contact', theme: 'Final Signal', tint: '#a9cfc9' },
] as const

export const profile = {
  name: 'Aslan Promjit',
  title: 'Junior Full-Stack Developer',
  subtitle: 'Customer Service & Technical Support Background',
  intro: "I'm Aslan, a Junior Full-Stack Developer with a background in customer service and basic technical support. I enjoy building practical web applications and clear, user-friendly experiences.",
  detail: [
    'My experience at iCare involved front-desk service, administrative tasks, and basic troubleshooting for Apple devices. At Tofu Skincare, I combined customer service with developing Google Apps Script tools for daily operations.',
    'I work with JavaScript, React, Node.js, and databases, and continue to build my skills through hands-on projects. I also use AI-assisted tools to explore ideas, understand code, support debugging, and develop interface prototypes.',
  ],
  aiDescription: 'I use AI tools to clarify requirements, explore interface ideas, understand unfamiliar code, and support debugging while continuing to develop my own programming skills.',
} as const

export const skills = [
  { id: 'languages', label: 'Languages', items: ['JavaScript', 'TypeScript', 'SQL', 'HTML', 'CSS'] },
  { id: 'frontend', label: 'Front end', items: ['React', 'Next.js', 'Tailwind CSS'] },
  { id: 'backend', label: 'Back end', items: ['Node.js', 'Express.js', 'REST APIs'] },
  { id: 'databases', label: 'Databases', items: ['MongoDB', 'PostgreSQL'] },
  { id: 'workflow', label: 'Workflow and design', items: ['Git', 'Figma', 'responsive interface design'] },
  { id: 'internal', label: 'Internal tools', items: ['Google Apps Script', 'Google Sheets'] },
  { id: 'ai', label: 'AI-assisted development', items: ['ChatGPT', 'Codex CLI', 'Figma Make'] },
  { id: 'service', label: 'Service and support', items: ['Customer communication', 'complaint handling', 'basic troubleshooting', 'coordination'] },
] as const

export const contact = {
  title: "Let's Connect",
  body: "I'm interested in opportunities where I can combine customer service, practical problem-solving, and growing full-stack development skills.",
  email: 'oassalam2108@gmail.com',
  phone: '+66 61 621 3960',
  phoneHref: 'tel:+66616213960',
  links: [
    { label: 'GitHub', href: 'https://github.com/Among2108' },
    { label: 'LINE', href: 'https://line.me/ti/p/~lokikilo' },
    { label: 'Instagram', href: 'https://www.instagram.com/among_uszq/' },
    { label: 'Facebook', href: 'https://www.facebook.com/share/18kyZLcN1h/?mibextid=wwXIfr' },
  ],
} as const

// Stable scene coordinates are independent of the expanded reading stops.
export const beats = [
  { id: 'profile', at: 0, world: 0, label: 'THE ADVENTURE BEGINS', title: 'HI, I’M|ASLAN.', copy: profile.intro },
  { id: 'skills', at: .88, world: 0, label: '01 / THE PLAYER', title: 'ABOUT|ME.', copy: 'Technologies I use and continue to learn through hands-on projects.' },
  { id: 'icare', at: 2.14, world: 1, label: '02 / RAINBOW HOLLOW', title: 'WORK|EXPERIENCE.', copy: 'Customer service, front-desk operations and basic Apple device support.' },
  { id: 'tofu', at: 3.1, world: 1, label: '02 / FIELD NOTE 02', title: 'TOFU|SKINCARE.', copy: 'Customer service and development of tools for everyday operations.' },
  { id: 'tofu-systems', at: 4.06, world: 1, label: '02 / FIELD NOTE 03', title: 'TOOLS FOR|THE TEAM.', copy: 'Five Google Apps Script applications supported everyday operations at Tofu Skincare.' },
  { id: 'pick-us', at: 5.13, world: 2, label: '03 / CREATIVE SANDBOX', title: 'PERSONAL|PROJECTS.', copy: 'Thai–English shopping assistance currently being prototyped and tested.' },
  { id: 'deck-forge', at: 6.09, world: 2, label: '03 / WORKBENCH 02', title: 'DECK|FORGE.', copy: 'A store and table-booking prototype currently being tested.' },
  { id: 'maipaws', at: 7.05, world: 2, label: '03 / WORKBENCH 03', title: 'MEET|MAIPAWS.', copy: 'A functional simulated pet e-commerce demo developed as a team project.' },
  { id: 'contact', at: 8.15, world: 3, label: '04 / SIGNAL ESTABLISHED', title: 'LET’S|CONNECT.', copy: contact.body },
] as const

export const worldStops = [0, 2, 5, 8] as const
export const routeEnd = beats[beats.length - 1].at
export const portals = [
  { start: 1.38, end: 2.12, name: 'SPACE WARP' },
  { start: 4.56, end: 5.11, name: 'SANDBOX GATE' },
  { start: 7.55, end: 8.13, name: 'SIGNAL UPLINK' },
] as const

export const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n))
export const code = (n: number) => String(n).padStart(2, '0')

export function readRoute(position: number) {
  const world = portals.filter(({ start, end }) => position >= (start + end) / 2).length
  const portal = portals.findIndex(({ start, end }) => position > start && position < end)
  const phase = portal < 0 ? 0 : clamp((position - portals[portal].start) / (portals[portal].end - portals[portal].start))
  const cover = portal < 0 ? 0 : clamp(Math.min(phase / .43, (1 - phase) / .37))
  const nearest = beats.reduce((best, beat, index) => Math.abs(beat.at - position) < Math.abs(beats[best].at - position) ? index : best, 0)
  return { world, portal, phase, cover, nearest }
}

export type PortfolioImage = {
  id: string
  src?: string
  caption: string
  alt: string
  expectedFilename: string
  kind?: 'photo' | 'screenshot'
}

// Supplied assets use their actual encodings. Tofu screenshots are privacy-reviewed
// copies; optional images are omitted until a suitable portfolio view is supplied.
const availableImages: Record<string, string> = {
  aslan: 'aslan.jpg',
  'tofu-gift-01': 'tofu-gift-01.png',
  'tofu-delivery-01': 'tofu-delivery-01.png',
  'tofu-lostfound-01': 'tofu-lostfound-01.png',
  'tofu-lostcash-01': 'tofu-lostcash-01.png',
  'tofu-tour-01': 'tofu-tour-01.png',
  'icare-workplace-01': 'icare-workplace-01.jpg',
  'tofu-workplace-01': 'tofu-workplace-01.jpg',
  'generation-bootcamp': 'generation-bootcamp.jpg',
  'pick-us-01': 'pick-us-01.png',
  'deck-forge-01': 'deck-forge-01.png',
  'maipaws-01': 'maipaws-01.png',
}
const availableResumes: Record<string, string> = {
  'resume-en': 'Aslan_Promjit_Resume_EN.pdf',
  'resume-th': 'Aslan_Promjit_Resume_TH.pdf',
}

function image(id: string, caption: string, alt: string, kind: PortfolioImage['kind'] = 'screenshot'): PortfolioImage {
  const filename = availableImages[id]
  return {
    id,
    caption,
    alt,
    kind,
    expectedFilename: filename ?? `${id}.webp`,
    src: filename ? `/images/${filename}` : undefined,
  }
}

export const portraitSrc = availableImages.aslan ? `/images/${availableImages.aslan}` : undefined
export const resumeFiles = [
  { id: 'resume-en', label: 'Download Résumé — English', expectedFilename: 'Aslan_Promjit_Resume_EN.pdf' },
  { id: 'resume-th', label: 'ดาวน์โหลดเรซูเม่ — ภาษาไทย', expectedFilename: 'Aslan_Promjit_Resume_TH.pdf' },
].map(file => ({
  ...file,
  src: availableResumes[file.id] ? `/resume/${availableResumes[file.id]}` : undefined,
}))

export type Entry = {
  id: string
  parentId?: string
  name: string
  category: string
  copy: string
  detail: readonly string[]
  tags: readonly string[]
  art: string
  badge?: string
  images?: readonly PortfolioImage[]
  demoUrl?: string
}

export type TofuSystem = {
  id: string
  parentId: 'tofu'
  name: string
  summary: string
  detail: readonly string[]
  badge: string
  images: readonly PortfolioImage[]
}

const internalStatus = 'Used in daily operations'

export const tofuSkincare = {
  id: 'tofu',
  name: 'Tofu Skincare',
  category: 'Customer Service',
  copy: "Assisted Thai and international customers, answered questions, handled concerns, and coordinated with colleagues. I also developed internal web applications to support the team's everyday work.",
  detail: [],
  tags: ['Customer service', 'Operational coordination', 'Internal web applications'],
  art: 'tofu',
  images: [image('tofu-workplace-01', 'Shoppers and carts fill the entrance to Tofu Skincare Megamart.', 'Customers stand beside shopping carts near the entrance, with more shoppers visible in the cosmetics aisles. Faces are obscured.', 'photo')],
  internalApplications: {
    id: 'tofu-systems',
    name: 'Internal Web Applications',
    copy: 'Five Google Apps Script applications supported everyday operations at Tofu Skincare.',
    detail: ['I developed internal tools for stock and gift records, delivery coordination, lost-property records, found-cash records, and tour operations, using Google Apps Script and Google Sheets.'],
    badge: internalStatus,
    art: 'systems',
    systems: [
      {
        id: 'gift',
        parentId: 'tofu',
        name: 'Gift & Stock POS',
        summary: 'Records incoming stock and gift redemptions, shows remaining quantities and redemption history, and blocks receipt numbers that have already been used to claim a gift.',
        detail: ['Owner-reported outcome: Staff could check remaining stock and redemption history more easily, and duplicate gift claims became less frequent.'],
        badge: internalStatus,
        images: [
          image('tofu-gift-01', 'Gift-redemption eligibility and receipt-check form, with sensitive information hidden.', 'Gift & Stock POS gift-redemption eligibility and receipt-check form'),
          image('tofu-gift-02', 'Stock records show incoming items, gifts issued, and remaining quantities.', 'Gift & Stock POS stock balances and history'),
        ],
      },
      {
        id: 'delivery',
        parentId: 'tofu',
        name: 'Delivery Management',
        summary: 'Connects order intake, packing, and delivery updates, with photos and tracking information that help staff follow each delivery.',
        detail: [],
        badge: internalStatus,
        images: [
          image('tofu-delivery-01', 'Shipment tracking shows delivery status and the evidence area, with sensitive information hidden.', 'Delivery Management shipment tracking and delivery evidence view'),
          image('tofu-delivery-02', 'Status updates and photos provide a record of each delivery.', 'Delivery Management tracking and delivery evidence'),
        ],
      },
      {
        id: 'lostfound',
        parentId: 'tofu',
        name: 'Lost & Found',
        summary: 'Keeps records of found items and returns, including item details, photos, recipient information, and signatures, helping staff locate belongings and retain handover evidence.',
        detail: [],
        badge: internalStatus,
        images: [
          image('tofu-lostfound-01', 'The dashboard and search filters help staff find lost-property records; record values are hidden.', 'Lost & Found dashboard, search filters and record list'),
          image('tofu-lostfound-02', 'Recipient details, signatures, and evidence document the return of an item.', 'Lost & Found return and handover record'),
        ],
      },
      {
        id: 'lostcash',
        parentId: 'tofu',
        name: 'Lost Cash Log',
        summary: 'Records found cash by denomination, calculates totals, and keeps supporting photos and handover information for later checks.',
        detail: [],
        badge: internalStatus,
        images: [
          image('tofu-lostcash-01', 'The cash-entry form includes a denomination-calculator control and total field, with record information hidden.', 'Lost Cash Log cash-entry form and denomination-calculator control'),
          image('tofu-lostcash-02', 'Photos and handover information support later checks of found-cash records.', 'Lost Cash Log handover record'),
        ],
      },
      {
        id: 'tour',
        parentId: 'tofu',
        name: 'Tour Management & Operations Hub',
        summary: 'Coordinates guide registration, tour arrivals, arrival verification, sales records, and guide or tour-company payout records, with supporting documents.',
        detail: [],
        badge: internalStatus,
        images: [
          image('tofu-tour-01', 'Guide registration and check-in form for preparing incoming tour groups, with sensitive information hidden.', 'Tour Management & Operations Hub guide registration and tour check-in form'),
          image('tofu-tour-02', 'Sales and payout views help staff review tour activity and prepare supporting documents.', 'Tour Management & Operations Hub sales and payout records'),
        ],
      },
    ] satisfies readonly TofuSystem[],
  },
} as const

export const tofuSystems = tofuSkincare.internalApplications.systems

// These six original artwork associations and their relative order are preserved.
export const entries: readonly Entry[] = [
  {
    id: 'icare',
    name: 'iCare',
    category: 'Customer Service, Front Desk & Basic Technical Support',
    copy: 'Supported customers at the front desk, handled administrative tasks, and helped troubleshoot iPhone, iPad, and MacBook issues before escalating cases to technicians.',
    detail: [
      'Answered customer questions and explained the next steps in the service process.',
      'Performed basic checks for software and device issues.',
      'Coordinated service cases with technicians and assisted with limited hands-on repair tasks.',
    ],
    tags: ['Customer service', 'Front desk', 'Basic troubleshooting'],
    art: 'care',
    images: [image('icare-workplace-01', 'iCare reception and service-counter area.', 'iCare front desk and service-counter interior', 'photo')],
  },
  tofuSkincare,
  {
    id: tofuSkincare.internalApplications.id,
    parentId: tofuSkincare.id,
    name: tofuSkincare.internalApplications.name,
    category: tofuSkincare.name,
    copy: tofuSkincare.internalApplications.copy,
    detail: tofuSkincare.internalApplications.detail,
    tags: ['Google Apps Script', 'Google Sheets'],
    badge: tofuSkincare.internalApplications.badge,
    art: tofuSkincare.internalApplications.art,
  },
  {
    id: 'pick-us',
    name: 'PICK US',
    demoUrl: 'https://pick-us-v2-pilot-ce0a1f.netlify.app/',
    category: 'Thai–English Shopping Assistance Web App',
    badge: 'Prototype · Testing',
    copy: 'A bilingual shopping-assistance prototype for international customers requesting products from Thailand, with customer and admin workflows under development and testing.',
    detail: ['The prototype is designed around purchase requests, quotations, payment notifications, and order tracking. Its scope includes a custom API and separate customer and admin workflows for reviewing requests and payment information.'],
    tags: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'PostgreSQL'],
    art: 'package',
    images: [image('pick-us-01', 'Customer-facing catalogue preview. Requests and photo enquiries are not open yet.', 'PICK US catalogue homepage with language selection and shopping navigation')],
  },
  {
    id: 'deck-forge',
    name: 'DECK FORGE',
    demoUrl: 'https://toykan-merchant-review-production.up.railway.app/',
    category: 'Board Game & Trading Card Store Web App',
    badge: 'Prototype · Testing',
    copy: 'A store and table-booking prototype that brings together service information, booking details, and price-and-deposit estimates.',
    detail: ['The project explores choosing a date, time, and party size, checking booking availability, and reviewing the cost before checkout. Its scope includes server-side pricing, customer and admin access, and a single-booking checkout flow. Payment integration uses Omise Test Mode, with a LINE notification prototype.'],
    tags: ['Next.js', 'React', 'TypeScript', 'Auth.js', 'Prisma', 'PostgreSQL', 'Omise', 'Railway'],
    art: 'cards',
    images: [image('deck-forge-01', 'Table-service information and entry points for price and deposit estimates.', 'DECK FORGE table-service homepage with service details, price information and booking estimate actions')],
  },
  {
    id: 'maipaws',
    name: 'MaiPaws',
    demoUrl: 'https://jsd-project-group-2.vercel.app/',
    category: 'Simulated Pet E-commerce Web App',
    badge: 'Functional Demo',
    copy: 'A working full-stack demo of a pet e-commerce store, built as a team project with product browsing, shopping-cart, and order workflows.',
    detail: [
      'MaiPaws is a simulated online store with categories for dogs, cats, birds, and fish. The project uses a responsive React interface and a Node.js/Express API with MongoDB. Its demo includes authentication, separate user and admin access, product management, image uploads, cart handling, and order processing.',
      'Developed through a Git-based collaborative workflow.',
    ],
    tags: ['React', 'Vite', 'Tailwind CSS', 'Node.js', 'Express.js', 'MongoDB', 'REST APIs', 'JWT'],
    art: 'pet',
    images: [image('maipaws-01', 'Simulated storefront showing categories for dogs, cats, fish and birds.', 'MaiPaws simulated storefront with four pet-product category links')],
  },
]

export const training = {
  id: 'training',
  name: 'Generation Thailand — Software Development Bootcamp',
  category: 'Training',
  copy: 'Built a foundation in web development through hands-on work with JavaScript and React, Git-based workflows, and collaborative projects.',
  detail: ['The bootcamp strengthened my problem-solving, communication, and adaptability, and helped me connect technical learning with practical team development.'],
  images: [image('generation-bootcamp', 'A group activity at the Generation Thailand bootcamp.', 'Bootcamp participants in blue Generation Thailand shirts smile as a seated teammate holds a crumpled paper ball.', 'photo')],
} as const
