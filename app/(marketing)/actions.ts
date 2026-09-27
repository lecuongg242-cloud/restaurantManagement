"use server";

import { headers } from "next/headers";
import { createLead, type LeadField } from "@/lib/marketing/leads";
import { RULES, checkRateLimit, clientIp, tooManyMessage } from "@/lib/security/rate-limit";

export type LeadFormState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "error"; field: LeadField; message: string };

/** Server action cho form "để lại liên hệ" (MKT-02). Dùng với `useActionState`. */
export async function submitLead(_prev: LeadFormState, formData: FormData): Promise<LeadFormState> {
  // TENANT-07: trang công khai, không có quán — khóa theo IP.
  const rl = await checkRateLimit(RULES.lead, [clientIp(await headers())]);
  if (!rl.ok) return { status: "error", field: "form", message: tooManyMessage(rl.retryAfterS) };

  const result = await createLead({
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    note: String(formData.get("note") ?? ""),
  });

  if (result.ok) return { status: "done" };
  return { status: "error", field: result.field, message: result.message };
}
