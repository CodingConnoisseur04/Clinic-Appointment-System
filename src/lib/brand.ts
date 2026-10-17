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
  doctorName: "Clinic Physician",
  doctorSpecialty: "Family Medicine",
  address: "Corrales Avenue, Cagayan de Oro City",
  services: [
    "General Consultation",
    "Health Certificates",
    "Minor Procedures & Wound Care",
    "Preventive Health Screening",
    "Walk-in Checkups",
  ],
  /*
   * Photography is a first-class material of the interface (see DESIGN.md).
   * Every file lives in public/images with provenance in
   * public/images/CREDITS.md (Pexels License — free, no attribution required).
   * Honesty rule: these are stock photos of models, not the real clinic's
   * people. The portrait carries an explicit illustration note wherever it
   * appears; replace it with a real photo of the physician before launch.
   */
  images: {
    heroFamily: {
      src: "/images/hero-family.jpg",
      alt: "A doctor talking with a mother and her child during a clinic visit",
    },
    consult: {
      src: "/images/hero-doctor.jpg",
      alt: "A smiling doctor in a white coat during a consultation",
    },
    bpCheck: {
      src: "/images/bp-check.jpg",
      alt: "A patient's blood pressure being checked at the clinic",
    },
    waitingRoom: {
      src: "/images/waiting-room.jpg",
      alt: "A bright waiting room with rows of seating",
    },
    reception: {
      src: "/images/reception.jpg",
      alt: "A clinic reception counter",
    },
    portrait: {
      src: "/images/doctor-portrait.jpg",
      alt: "Portrait of a smiling doctor outdoors",
      note: "Photograph for illustration",
    },
    texture: {
      src: "/images/texture-stethoscope.jpg",
      alt: "A stethoscope resting on a wooden desk",
    },
  },
} as const;

export type ClinicImage = { src: string; alt: string; note?: string };
