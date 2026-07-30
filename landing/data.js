/* Paylez — mock marketplace data. Plain JS, attaches to window. */
(function () {
  const img = (seed, w = 800, h = 600) =>
    `https://picsum.photos/seed/${seed}/${w}/${h}`;

  const categories = [
    { id: "beauty", label: "Beauty & Spa", icon: "spa", tint: "#F43F5E" },
    { id: "food", label: "Food & Drink", icon: "food", tint: "#F97316" },
    { id: "activities", label: "Things to Do", icon: "ticket", tint: "#8B5CF6" },
    { id: "fitness", label: "Health & Fitness", icon: "dumbbell", tint: "#10B981" },
    { id: "travel", label: "Travel", icon: "plane", tint: "#0EA5E9" },
    { id: "home", label: "Home Services", icon: "home", tint: "#6366F1" },
    { id: "auto", label: "Automotive", icon: "car", tint: "#64748B" },
    { id: "goods", label: "Retail & Goods", icon: "tag", tint: "#EC4899" },
  ];

  const merchants = {
    m1: {
      id: "m1", name: "Lumière Day Spa", category: "beauty",
      cover: img("lumiere-cover", 1200, 500), logoSeed: "lumiere-logo",
      rating: 4.8, reviews: 1284, location: "SoHo, New York", since: 2014,
      verified: true, distanceMi: 0.8,
      blurb: "An award-winning urban retreat offering massage, facials, and holistic body treatments in a serene SoHo loft.",
      hours: "Mon–Sun · 9:00 AM – 9:00 PM",
      amenities: ["Free Wi-Fi", "Wheelchair accessible", "Gift cards", "Parking nearby"],
    },
    m2: {
      id: "m2", name: "Osteria Nove", category: "food",
      cover: img("osteria-cover", 1200, 500), logoSeed: "osteria-logo",
      rating: 4.7, reviews: 932, location: "West Village, New York", since: 2011,
      verified: true, distanceMi: 1.4,
      blurb: "Modern Italian dining rooted in seasonal ingredients and a hand-picked natural wine list.",
      hours: "Tue–Sun · 5:00 PM – 11:00 PM",
      amenities: ["Reservations", "Outdoor seating", "Full bar", "Vegan options"],
    },
    m3: {
      id: "m3", name: "Skyline Helicopters", category: "activities",
      cover: img("skyline-cover", 1200, 500), logoSeed: "skyline-logo",
      rating: 4.9, reviews: 421, location: "Downtown Heliport", since: 2009,
      verified: true, distanceMi: 2.1,
      blurb: "See the city from above with FAA-certified pilots and panoramic glass-cabin tours.",
      hours: "Daily · 8:00 AM – Sunset",
      amenities: ["Free parking", "Lockers", "Photos included", "Group rates"],
    },
    m4: {
      id: "m4", name: "Forge Fitness Collective", category: "fitness",
      cover: img("forge-cover", 1200, 500), logoSeed: "forge-logo",
      rating: 4.6, reviews: 2103, location: "Williamsburg, Brooklyn", since: 2017,
      verified: true, distanceMi: 3.0,
      blurb: "Strength, conditioning, and recovery under one roof, with expert coaches and small-group classes.",
      hours: "Mon–Sun · 5:00 AM – 11:00 PM",
      amenities: ["Showers", "Towel service", "Sauna", "App booking"],
    },
    m5: {
      id: "m5", name: "Coastal Escapes", category: "travel",
      cover: img("coastal-cover", 1200, 500), logoSeed: "coastal-logo",
      rating: 4.8, reviews: 658, location: "Montauk, NY", since: 2012,
      verified: true, distanceMi: 96,
      blurb: "Boutique seaside stays with ocean views, curated for a quiet luxury weekend.",
      hours: "Reception · 24/7",
      amenities: ["Free breakfast", "Beach access", "Spa", "Pet friendly"],
    },
    m6: {
      id: "m6", name: "Bright & Co. Home", category: "home",
      cover: img("bright-cover", 1200, 500), logoSeed: "bright-logo",
      rating: 4.7, reviews: 1490, location: "Serves all NYC", since: 2016,
      verified: true, distanceMi: 0,
      blurb: "Vetted, insured home cleaning and handyman pros — booked in under a minute.",
      hours: "Mon–Sat · 8:00 AM – 8:00 PM",
      amenities: ["Insured pros", "Flexible reschedule", "Eco supplies", "Satisfaction guarantee"],
    },
  };

  // helper to build a deal
  let _id = 0;
  const deal = (o) => ({
    id: "d" + ++_id,
    sold: o.sold ?? Math.floor(200 + Math.random() * 4000),
    reviews: o.reviews ?? Math.floor(40 + Math.random() * 1800),
    rating: o.rating ?? (4.3 + Math.random() * 0.6),
    ...o,
    discount: Math.round((1 - o.price / o.original) * 100),
  });

  const deals = [
    deal({ merchant: "m1", category: "beauty", title: "60-Minute Swedish Massage with Aromatherapy",
      image: img("massage", 800, 600), original: 150, price: 79, rating: 4.8, reviews: 642, sold: 5200,
      badges: ["Bestseller"], options: [
        { label: "60-min Swedish Massage", original: 150, price: 79 },
        { label: "90-min Deep Tissue Massage", original: 220, price: 119 },
        { label: "Couples Massage (2 people)", original: 300, price: 169 },
      ] }),
    deal({ merchant: "m1", category: "beauty", title: "Signature HydraGlow Facial",
      image: img("facial", 800, 600), original: 130, price: 69, rating: 4.7, reviews: 318,
      badges: ["Limited"], options: [
        { label: "Single HydraGlow Facial", original: 130, price: 69 },
        { label: "Series of 3 Facials", original: 390, price: 179 },
      ] }),
    deal({ merchant: "m2", category: "food", title: "Italian Tasting Menu for Two with Wine Pairing",
      image: img("tasting", 800, 600), original: 180, price: 99, rating: 4.7, reviews: 254,
      badges: ["Bestseller"], options: [
        { label: "Tasting Menu for Two", original: 180, price: 99 },
        { label: "Tasting Menu for Four", original: 360, price: 189 },
      ] }),
    deal({ merchant: "m2", category: "food", title: "Weekend Bottomless Brunch for Two",
      image: img("brunch", 800, 600), original: 96, price: 55, rating: 4.6, reviews: 189, options: [
        { label: "Brunch for Two", original: 96, price: 55 },
        { label: "Brunch for Four", original: 192, price: 105 },
      ] }),
    deal({ merchant: "m3", category: "activities", title: "City Skyline Helicopter Tour (15 Minutes)",
      image: img("heli", 800, 600), original: 249, price: 159, rating: 4.9, reviews: 421,
      badges: ["Top rated"], options: [
        { label: "Shared Tour — 1 seat", original: 249, price: 159 },
        { label: "Private Tour — up to 3", original: 720, price: 449 },
      ] }),
    deal({ merchant: "m3", category: "activities", title: "Sunset Sailing Cruise with Open Bar",
      image: img("sailing", 800, 600), original: 110, price: 65, rating: 4.8, reviews: 510, options: [
        { label: "Sunset Cruise — 1 ticket", original: 110, price: 65 },
        { label: "Sunset Cruise — 2 tickets", original: 220, price: 119 },
      ] }),
    deal({ merchant: "m4", category: "fitness", title: "One Month Unlimited Group Classes",
      image: img("fitness", 800, 600), original: 199, price: 89, rating: 4.6, reviews: 740,
      badges: ["Bestseller"], options: [
        { label: "1 Month Unlimited", original: 199, price: 89 },
        { label: "3 Months Unlimited", original: 540, price: 229 },
      ] }),
    deal({ merchant: "m4", category: "fitness", title: "5 Private Personal Training Sessions",
      image: img("pt", 800, 600), original: 425, price: 245, rating: 4.7, reviews: 162, options: [
        { label: "5 Sessions", original: 425, price: 245 },
        { label: "10 Sessions", original: 850, price: 449 },
      ] }),
    deal({ merchant: "m5", category: "travel", title: "2-Night Oceanview Getaway in Montauk",
      image: img("montauk", 800, 600), original: 720, price: 449, rating: 4.8, reviews: 203,
      badges: ["Limited"], options: [
        { label: "2 Nights — Oceanview King", original: 720, price: 449 },
        { label: "3 Nights — Oceanview King", original: 1080, price: 649 },
      ] }),
    deal({ merchant: "m5", category: "travel", title: "Coastal Spa & Wine Weekend Package",
      image: img("spaweekend", 800, 600), original: 540, price: 339, rating: 4.7, reviews: 98, options: [
        { label: "Couple's Package", original: 540, price: 339 },
      ] }),
    deal({ merchant: "m6", category: "home", title: "Deep Home Cleaning (up to 3 Bedrooms)",
      image: img("cleaning", 800, 600), original: 220, price: 129, rating: 4.7, reviews: 880,
      badges: ["Top rated"], options: [
        { label: "Studio / 1 Bedroom", original: 150, price: 89 },
        { label: "2–3 Bedrooms", original: 220, price: 129 },
        { label: "4+ Bedrooms", original: 320, price: 189 },
      ] }),
    deal({ merchant: "m6", category: "home", title: "Handyman — 3 Hours of Any Repairs",
      image: img("handyman", 800, 600), original: 270, price: 159, rating: 4.6, reviews: 312, options: [
        { label: "3 Hours", original: 270, price: 159 },
        { label: "Full Day (8 hrs)", original: 640, price: 379 },
      ] }),
  ];

  window.PAYLEZ = { categories, merchants, deals };
})();
