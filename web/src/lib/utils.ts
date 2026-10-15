import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** The standard `cn` helper that shadcn-style registry components (Magic UI, Aceternity UI, React Bits) import from "@/lib/utils". */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
