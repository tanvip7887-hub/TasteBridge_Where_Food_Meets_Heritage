const image = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=400&q=80`;

export const foodCategories = [
  { id: "maharashtrian", name: "Maharashtrian", image: image("photo-1601050690597-df0568f70950") },
  { id: "punjabi", name: "Punjabi", image: image("photo-1546833999-b9f581a1996d") },
  { id: "gujarati", name: "Gujarati", image: image("photo-1617692855027-33b14f061079") },
  { id: "rajasthani", name: "Rajasthani", image: image("photo-1626777552726-4a6b54c97e46") },
  { id: "bengali", name: "Bengali", image: image("photo-1589301760014-d929f3979dbc") },
  { id: "south-indian", name: "South Indian", image: image("photo-1610192244261-3f33de3f55e4") },
  { id: "kerala", name: "Kerala", image: image("photo-1596797038530-2c107229654b") },
  { id: "tamil", name: "Tamil", image: image("photo-1610192244261-3f33de3f55e4") },
  { id: "andhra", name: "Andhra", image: image("photo-1603894584373-5ac82b2ae398") },
  { id: "goan", name: "Goan", image: image("photo-1519708227418-c8fd9a32b7a2") },
  { id: "kashmiri", name: "Kashmiri", image: image("photo-1596797038530-2c107229654b") },
  { id: "hyderabadi", name: "Hyderabadi", image: image("photo-1563379091339-03b21ab4a4f8") },
  { id: "north-indian", name: "North Indian", image: image("photo-1603894584373-5ac82b2ae398") },
];

export default foodCategories;
