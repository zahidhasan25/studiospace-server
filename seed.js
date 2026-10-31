// Seed data for StudioSpace. Shared by index.js on startup; also runnable
// standalone with `npm run seed` (it only prints the data in that mode).
//
// NOTE (BetterAuth branch): the examiner account is NOT seeded here with
// a hand-written password hash. BetterAuth hashes email/password accounts
// in its own format, so index.js creates the examiner account through
// BetterAuth's signUpEmail API on startup instead (see index.js seed()).
// A bcrypt hash in a legacy "users" collection would never verify.

const img = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=80`;

const SEED_STUDIOS = [
  {
    title: "Dhanmondi Daylight Photo Studio",
    category: "Photo Studio",
    hourlyRate: 45,
    deposit: 100,
    capacity: 12,
    location: "Dhanmondi, Dhaka, Bangladesh",
    image: img("photo-1554048612-b6a482bc67e5"),
    images: [
      img("photo-1554048612-b6a482bc67e5"),
      img("photo-1516035069371-29a1b244cc32"),
      img("photo-1520390138845-fd2d229dd553"),
    ],
    amenities: ["Cyc Wall", "Natural Light", "Lighting Kit", "Backdrop Sets", "Makeup Room", "Wi-Fi"],
    overview:
      "A bright, daylight-filled photography studio in Dhanmondi with a seamless white cyc wall, professional lighting kit and a comfortable makeup corner. Ideal for portraits, product shoots and fashion editorial work.",
    ownerName: "Ayesha Rahman",
    ownerEmail: "ayesha@studiospace.host",
    ownerPhoto: "",
    rating: 4.9,
    reviewsCount: 132,
  },
  {
    title: "Gulshan Portrait & Product Studio",
    category: "Photo Studio",
    hourlyRate: 60,
    deposit: 150,
    capacity: 10,
    location: "Gulshan-1, Dhaka, Bangladesh",
    image: img("photo-1516035069371-29a1b244cc32"),
    images: [
      img("photo-1516035069371-29a1b244cc32"),
      img("photo-1554048612-b6a482bc67e5"),
    ],
    amenities: ["Cyc Wall", "Softbox Lighting", "Product Table", "Changing Room", "Wi-Fi", "Parking"],
    overview:
      "A polished studio for portrait and e-commerce product photography, with softbox lighting, a dedicated product table and a private changing room close to Gulshan Avenue.",
    ownerName: "Tanvir Ahmed",
    ownerEmail: "tanvir@studiospace.host",
    ownerPhoto: "",
    rating: 4.8,
    reviewsCount: 98,
  },
  {
    title: "Mirpur Cinema Sound Stage",
    category: "Film Stage",
    hourlyRate: 120,
    deposit: 400,
    capacity: 40,
    location: "Mirpur DOHS, Dhaka, Bangladesh",
    image: img("photo-1485846234645-a62644f84728"),
    images: [
      img("photo-1485846234645-a62644f84728"),
      img("photo-1478720568477-152d9b164e26"),
    ],
    amenities: ["Green Screen", "Lighting Grid", "Soundproofing", "Dressing Rooms", "Grip Equipment", "Parking"],
    overview:
      "A large cinema sound stage with a lighting grid, green screen and sound-treated walls. Built for short films, music videos, commercials and live-streamed productions.",
    ownerName: "Farhan Kabir",
    ownerEmail: "farhan@studiospace.host",
    ownerPhoto: "",
    rating: 4.9,
    reviewsCount: 87,
  },
  {
    title: "East London Film & Green Screen Stage",
    category: "Film Stage",
    hourlyRate: 150,
    deposit: 500,
    capacity: 35,
    location: "Shoreditch, London, United Kingdom",
    image: img("photo-1478720568477-152d9b164e26"),
    images: [
      img("photo-1478720568477-152d9b164e26"),
      img("photo-1485846234645-a62644f84728"),
    ],
    amenities: ["Green Screen", "Lighting Grid", "Camera Crane", "Dressing Rooms", "Catering Area", "Wi-Fi"],
    overview:
      "A versatile East London stage for film, branded content and virtual production, with a full lighting grid, green screen and space for a crew of up to 35 people.",
    ownerName: "Sophie Bennett",
    ownerEmail: "sophie@studiospace.host",
    ownerPhoto: "",
    rating: 5.0,
    reviewsCount: 214,
  },
  {
    title: "Banani Podcast Lounge",
    category: "Podcast Lounge",
    hourlyRate: 35,
    deposit: 80,
    capacity: 6,
    location: "Banani, Dhaka, Bangladesh",
    image: img("photo-1590602847861-f357a9332bbc"),
    images: [
      img("photo-1590602847861-f357a9332bbc"),
      img("photo-1589903308904-1010c2294adc"),
    ],
    amenities: ["4 Microphones", "Acoustic Panels", "Video Recording", "Mixer Desk", "Coffee Bar", "Wi-Fi"],
    overview:
      "A cosy, acoustically treated podcast lounge in Banani with four broadcast microphones, video recording and a mixer desk. Perfect for interviews, talk shows and audio series.",
    ownerName: "Nusrat Jahan",
    ownerEmail: "nusrat@studiospace.host",
    ownerPhoto: "",
    rating: 4.8,
    reviewsCount: 156,
  },
  {
    title: "Brooklyn Creator Podcast Room",
    category: "Podcast Lounge",
    hourlyRate: 55,
    deposit: 120,
    capacity: 5,
    location: "Brooklyn, New York, USA",
    image: img("photo-1589903308904-1010c2294adc"),
    images: [
      img("photo-1589903308904-1010c2294adc"),
      img("photo-1590602847861-f357a9332bbc"),
    ],
    amenities: ["4 Microphones", "Acoustic Panels", "Video Recording", "Soundproofing", "Wi-Fi"],
    overview:
      "A quiet Brooklyn podcast room with broadcast microphones, acoustic treatment and multi-camera video recording for creators who want a clean, professional episode every time.",
    ownerName: "Daniel Ross",
    ownerEmail: "daniel@studiospace.host",
    ownerPhoto: "",
    rating: 4.7,
    reviewsCount: 73,
  },
  {
    title: "Uttara Music Recording Suite",
    category: "Music Suite",
    hourlyRate: 70,
    deposit: 200,
    capacity: 8,
    location: "Uttara, Dhaka, Bangladesh",
    image: img("photo-1598550476439-6847785fcea6"),
    images: [
      img("photo-1598550476439-6847785fcea6"),
      img("photo-1511379938547-c1f69419868d"),
    ],
    amenities: ["Vocal Booth", "Mixing Console", "Studio Monitors", "Instruments", "Soundproofing", "Wi-Fi"],
    overview:
      "A soundproof recording suite with a vocal booth, mixing console and studio monitors. Suitable for vocal tracking, songwriting sessions, mixing and small band rehearsals.",
    ownerName: "Rafiul Islam",
    ownerEmail: "rafiul@studiospace.host",
    ownerPhoto: "",
    rating: 4.9,
    reviewsCount: 141,
  },
  {
    title: "Grand Piano & Keys Suite",
    category: "Music Suite",
    hourlyRate: 85,
    deposit: 250,
    capacity: 6,
    location: "Toronto, Ontario, Canada",
    image: img("photo-1520523839897-bd0b52f945a0"),
    images: [
      img("photo-1520523839897-bd0b52f945a0"),
      img("photo-1511379938547-c1f69419868d"),
    ],
    amenities: ["Grand Piano", "Keyboards", "Vocal Booth", "Mixing Console", "Soundproofing", "Wi-Fi"],
    overview:
      "A warm, piano-led music suite with a grand piano, keyboards and a vocal booth. Ideal for composers, pianists, vocalists and intimate acoustic sessions.",
    ownerName: "Emily Chen",
    ownerEmail: "emily@studiospace.host",
    ownerPhoto: "",
    rating: 4.9,
    reviewsCount: 109,
  },
  {
    title: "Chattogram DJ & Production Room",
    category: "Music Suite",
    hourlyRate: 50,
    deposit: 150,
    capacity: 10,
    location: "GEC Circle, Chattogram, Bangladesh",
    image: img("photo-1470225620780-dba8ba36b745"),
    images: [
      img("photo-1470225620780-dba8ba36b745"),
      img("photo-1508700115892-45ecd05ae2ad"),
    ],
    amenities: ["DJ Decks", "Studio Monitors", "Mixing Console", "Soundproofing", "Wi-Fi", "Parking"],
    overview:
      "A beat-ready production room in Chattogram with DJ decks, studio monitors and a mixing console for electronic producers, DJs and beat-making sessions.",
    ownerName: "Imran Hossain",
    ownerEmail: "imran@studiospace.host",
    ownerPhoto: "",
    rating: 4.6,
    reviewsCount: 64,
  },
  {
    title: "Sylhet Art & Pottery Workshop",
    category: "Workshop",
    hourlyRate: 30,
    deposit: 60,
    capacity: 20,
    location: "Zindabazar, Sylhet, Bangladesh",
    image: img("photo-1513364776144-60967b0f800f"),
    images: [
      img("photo-1513364776144-60967b0f800f"),
      img("photo-1460661419201-fd4cecdf8a8b"),
    ],
    amenities: ["Work Tables", "Art Supplies", "Kiln Access", "Sink & Cleanup Area", "Wi-Fi", "Parking"],
    overview:
      "A hands-on art workshop with large work tables, art supplies and kiln access. Great for painting classes, pottery sessions, craft workshops and small creative meetups.",
    ownerName: "Mitu Akter",
    ownerEmail: "mitu@studiospace.host",
    ownerPhoto: "",
    rating: 4.8,
    reviewsCount: 91,
  },
  {
    title: "Old Dhaka Print & Craft Workshop",
    category: "Workshop",
    hourlyRate: 28,
    deposit: 50,
    capacity: 16,
    location: "Old Dhaka, Dhaka, Bangladesh",
    image: img("photo-1547891654-e66ed7ebb968"),
    images: [
      img("photo-1547891654-e66ed7ebb968"),
      img("photo-1513364776144-60967b0f800f"),
    ],
    amenities: ["Work Tables", "Print Press", "Art Supplies", "Display Wall", "Wi-Fi"],
    overview:
      "A characterful workshop space for printmaking, crafts and small exhibitions, with a print press, display wall and plenty of table space for group work.",
    ownerName: "Shakib Hasan",
    ownerEmail: "shakib@studiospace.host",
    ownerPhoto: "",
    rating: 4.7,
    reviewsCount: 58,
  },
  {
    title: "Bashundhara Creator Studio Loft",
    category: "Photo Studio",
    hourlyRate: 55,
    deposit: 120,
    capacity: 15,
    location: "Bashundhara R/A, Dhaka, Bangladesh",
    image: img("photo-1492691527719-9d1e07e534b4"),
    images: [
      img("photo-1492691527719-9d1e07e534b4"),
      img("photo-1554048612-b6a482bc67e5"),
    ],
    amenities: ["Cyc Wall", "Natural Light", "Lighting Kit", "Video Recording", "Makeup Room", "Wi-Fi", "Parking"],
    overview:
      "A loft-style creator studio with tall windows, a cyc wall and video-ready lighting. Works equally well for photo shoots, YouTube recordings and brand content days.",
    ownerName: "Ayesha Rahman",
    ownerEmail: "ayesha@studiospace.host",
    ownerPhoto: "",
    rating: 4.8,
    reviewsCount: 117,
  },
];

if (require.main === module) {
  console.log(`Seed file contains ${SEED_STUDIOS.length} studios.`);
  console.log("Run the server (npm start) to seed the database automatically.");
  console.log("The examiner account (examiner@studiospace.test / Examiner123) is created by the server via BetterAuth on startup.");
}

module.exports = { SEED_STUDIOS };
