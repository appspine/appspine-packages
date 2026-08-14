"use server";

import type { Locale } from "../i18n/index.js";
import { setValueToCookie } from "./server-actions.js";

export async function setLocaleAction(next: Locale): Promise<void> {
  await setValueToCookie("locale", next);
}
