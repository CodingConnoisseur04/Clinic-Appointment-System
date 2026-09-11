/*
 * Binding brand copy. The clinic name's exact spelling is binding everywhere
 * the product names itself.
 *
 * There is deliberately no phone number here: the number the public sees is the
 * `receptionist_phone` clinic setting the front desk edits in Settings, and the
 * public page makes its own decision about what to show when it is still unset.
 */
export const CLINIC = {
  name: "Golden Friendship Family Clinic",
  tagline: "Compassionate family care, right here in Kagay-an.",
  doctorName: "Dr. Andrea Villaflor",
  doctorSpecialty: "Family Medicine",
  address: "Corrales Avenue, Cagayan de Oro City",
  services: [
    "General Consultation",
    "Health Certificates",
    "Minor Procedures & Wound Care",
    "Preventive Health Screening",
    "Walk-in Checkups",
  ],
} as const;
