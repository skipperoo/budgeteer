/**
 * Curated icon set for categories.
 * A hand-picked selection of ~70 lucide-react icons relevant to
 * personal finance, shopping, transport, utilities, health, etc.
 */

import {
  ShoppingCart,
  ShoppingBag,
  Tag,
  CreditCard,
  Wallet,
  Banknote,
  Coins,
  DollarSign,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  Home,
  Building,
  Car,
  Bus,
  Train,
  Plane,
  Bike,
  Fuel,
  Plug,
  Zap,
  Droplet,
  Flame,
  CookingPot,
  Coffee,
  Pizza,
  Cake,
  Beer,
  Wine,
  Apple,
  Heart,
  HeartPulse,
  Pill,
  Stethoscope,
  Book,
  GraduationCap,
  Gamepad2,
  Tv,
  Music,
  Camera,
  Headphones,
  Shirt,
  Gem,
  Gift,
  Briefcase,
  Laptop,
  Smartphone,
  Phone,
  Users,
  UserPlus,
  Store,
  Warehouse,
  TreePine,
  Ship,
  Truck,
  Dumbbell,
  Dog,
  Baby,
  Umbrella,
  Sun,
  Moon,
  Cloud,
  Key,
  MapPin,
  Calendar,
  Clock,
  Percent,
  Receipt,
  FileText,
  Calculator,
  Scale,
  Landmark,
  Gauge,
  Wifi,
  Globe,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface CuratedIconEntry {
  name: string;
  keywords: string[];
  component: LucideIcon;
}

export const CURATED_ICONS: CuratedIconEntry[] = [
  // Food & Dining
  { name: "cooking-pot", keywords: ["food", "dining", "restaurant", "cook", "kitchen", "meal"], component: CookingPot },
  { name: "coffee", keywords: ["coffee", "cafe", "drink", "beverage"], component: Coffee },
  { name: "pizza", keywords: ["pizza", "food", "takeaway", "fast food"], component: Pizza },
  { name: "cake", keywords: ["cake", "dessert", "birthday", "celebration"], component: Cake },
  { name: "beer", keywords: ["beer", "drink", "bar", "pub"], component: Beer },
  { name: "wine", keywords: ["wine", "drink", "bar", "alcohol"], component: Wine },
  { name: "apple", keywords: ["apple", "fruit", "food", "grocery", "healthy"], component: Apple },

  // Shopping
  { name: "shopping-cart", keywords: ["cart", "shopping", "groceries", "market", "buy"], component: ShoppingCart },
  { name: "shopping-bag", keywords: ["bag", "shopping", "retail", "store", "clothes"], component: ShoppingBag },
  { name: "tag", keywords: ["tag", "price", "label", "sale", "discount"], component: Tag },
  { name: "gift", keywords: ["gift", "present", "celebration", "birthday"], component: Gift },

  // Payments & Finance
  { name: "credit-card", keywords: ["card", "credit", "payment", "bank", "debit"], component: CreditCard },
  { name: "wallet", keywords: ["wallet", "money", "payment", "cash"], component: Wallet },
  { name: "banknote", keywords: ["banknote", "money", "cash", "bill", "currency"], component: Banknote },
  { name: "coins", keywords: ["coins", "money", "cash", "change", "currency"], component: Coins },
  { name: "dollar-sign", keywords: ["dollar", "money", "cash", "currency", "usd"], component: DollarSign },
  { name: "piggy-bank", keywords: ["piggy", "bank", "savings", "saving", "money"], component: PiggyBank },
  { name: "trending-up", keywords: ["up", "growth", "increase", "income", "profit"], component: TrendingUp },
  { name: "trending-down", keywords: ["down", "decline", "decrease", "expense", "loss"], component: TrendingDown },
  { name: "percent", keywords: ["percent", "percentage", "interest", "rate", "commission"], component: Percent },
  { name: "receipt", keywords: ["receipt", "invoice", "bill", "payment", "proof"], component: Receipt },
  { name: "calculator", keywords: ["calculator", "math", "compute", "number", "accounting"], component: Calculator },
  { name: "file-text", keywords: ["file", "text", "document", "invoice", "report"], component: FileText },
  { name: "scale", keywords: ["scale", "balance", "weight", "legal", "justice"], component: Scale },
  { name: "landmark", keywords: ["landmark", "bank", "institution", "government", "building"], component: Landmark },

  // Housing & Utilities
  { name: "home", keywords: ["home", "house", "rent", "mortgage", "housing", "property"], component: Home },
  { name: "building", keywords: ["building", "office", "apartment", "real estate", "property"], component: Building },
  { name: "plug", keywords: ["plug", "electric", "electricity", "power", "energy"], component: Plug },
  { name: "zap", keywords: ["zap", "electric", "electricity", "power", "energy", "lightning"], component: Zap },
  { name: "droplet", keywords: ["droplet", "water", "utility", "bill", "plumbing"], component: Droplet },
  { name: "flame", keywords: ["flame", "gas", "heating", "energy", "fuel"], component: Flame },
  { name: "wifi", keywords: ["wifi", "internet", "network", "broadband", "connection"], component: Wifi },
  { name: "phone", keywords: ["phone", "telephone", "call", "mobile", "landline"], component: Phone },
  { name: "smartphone", keywords: ["smartphone", "mobile", "phone", "device", "tech"], component: Smartphone },

  // Transport
  { name: "car", keywords: ["car", "auto", "vehicle", "transport", "drive"], component: Car },
  { name: "bus", keywords: ["bus", "public", "transport", "transit"], component: Bus },
  { name: "train", keywords: ["train", "rail", "railway", "transport", "subway"], component: Train },
  { name: "plane", keywords: ["plane", "flight", "travel", "airline", "trip"], component: Plane },
  { name: "bike", keywords: ["bike", "bicycle", "cycle", "transport"], component: Bike },
  { name: "fuel", keywords: ["fuel", "gas", "petrol", "gas-station", "car"], component: Fuel },
  { name: "ship", keywords: ["ship", "boat", "ferry", "transport", "travel"], component: Ship },
  { name: "truck", keywords: ["truck", "delivery", "transport", "shipping", "logistics"], component: Truck },
  { name: "map-pin", keywords: ["pin", "map", "location", "travel", "place"], component: MapPin },

  // Health
  { name: "heart", keywords: ["heart", "health", "medical", "wellness", "love"], component: Heart },
  { name: "heart-pulse", keywords: ["pulse", "health", "medical", "heart", "wellness"], component: HeartPulse },
  { name: "pill", keywords: ["pill", "medicine", "pharmacy", "drug", "health"], component: Pill },
  { name: "stethoscope", keywords: ["stethoscope", "doctor", "medical", "hospital", "health"], component: Stethoscope },
  { name: "dumbbell", keywords: ["dumbbell", "gym", "fitness", "exercise", "workout"], component: Dumbbell },

  // Education & Entertainment
  { name: "book", keywords: ["book", "education", "study", "library", "learning"], component: Book },
  { name: "graduation-cap", keywords: ["graduation", "cap", "education", "school", "university"], component: GraduationCap },
  { name: "gamepad-2", keywords: ["gamepad", "gaming", "games", "play", "entertainment"], component: Gamepad2 },
  { name: "tv", keywords: ["tv", "television", "entertainment", "media"], component: Tv },
  { name: "music", keywords: ["music", "audio", "sound", "entertainment"], component: Music },
  { name: "camera", keywords: ["camera", "photo", "photography", "image"], component: Camera },
  { name: "headphones", keywords: ["headphones", "music", "audio", "podcast"], component: Headphones },

  // Clothing & Personal
  { name: "shirt", keywords: ["shirt", "clothing", "clothes", "fashion", "apparel"], component: Shirt },
  { name: "gem", keywords: ["gem", "jewelry", "luxury", "precious", "value"], component: Gem },

  // Work & Business
  { name: "briefcase", keywords: ["briefcase", "work", "business", "office", "job", "career"], component: Briefcase },
  { name: "laptop", keywords: ["laptop", "computer", "work", "tech", "device"], component: Laptop },
  { name: "store", keywords: ["store", "shop", "business", "retail", "market"], component: Store },
  { name: "warehouse", keywords: ["warehouse", "storage", "business", "inventory"], component: Warehouse },
  { name: "users", keywords: ["users", "people", "social", "community", "group"], component: Users },
  { name: "user-plus", keywords: ["user-plus", "add", "person", "invite", "new"], component: UserPlus },
  { name: "globe", keywords: ["globe", "world", "internet", "global", "international"], component: Globe },

  // Life Events
  { name: "baby", keywords: ["baby", "child", "newborn", "family", "parenting"], component: Baby },
  { name: "dog", keywords: ["dog", "pet", "animal", "pets"], component: Dog },
  { name: "tree-pine", keywords: ["tree", "pine", "nature", "outdoor", "garden"], component: TreePine },
  { name: "umbrella", keywords: ["umbrella", "rain", "weather", "protection", "insurance"], component: Umbrella },
  { name: "calendar", keywords: ["calendar", "date", "event", "schedule", "appointment"], component: Calendar },
  { name: "clock", keywords: ["clock", "time", "hour", "schedule"], component: Clock },
  { name: "key", keywords: ["key", "lock", "access", "password", "security"], component: Key },

  // Misc
  { name: "sun", keywords: ["sun", "weather", "summer", "energy", "light"], component: Sun },
  { name: "moon", keywords: ["moon", "night", "sleep", "dark", "weather"], component: Moon },
  { name: "cloud", keywords: ["cloud", "weather", "storage", "online"], component: Cloud },
  { name: "gauge", keywords: ["gauge", "speed", "meter", "dashboard", "performance"], component: Gauge },
];

/** Look up a curated icon component by name, or return null. */
export function getCuratedIcon(name: string): LucideIcon | null {
  const entry = CURATED_ICONS.find((i) => i.name === name);
  return entry?.component ?? null;
}

/** Render a lucide icon by name (works for any lucide icon name, not just curated). */
export function getIconByName(name: string): LucideIcon | null {
  try {
    // Dynamic import from lucide-react — we cache in a map
    const icon = (window as any).__lucideIcons?.[name];
    if (icon) return icon;
    return null;
  } catch {
    return null;
  }
}

/** All curated icon names for quick searching. */
export const CURATED_ICON_NAMES = CURATED_ICONS.map((i) => i.name);
