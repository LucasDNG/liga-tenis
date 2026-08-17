export const titleCase = (value = "") =>
  value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  first_name: user.first_name,
  last_name: user.last_name,
  dni: user.dni,
  phone: user.phone,
  email: user.email,
  city: user.city,
  gender: user.gender,
  rating: user.rating,
  matches_played: user.matches_played,
  verification_status: user.verification_status,
  verified_at: user.verified_at,
  created_at: user.created_at,
});
