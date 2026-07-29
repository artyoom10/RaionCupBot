import { format } from "date-fns";

export function formatMoscowDateTime(value: string | null) {
  if (!value) {
    return "Дата уточняется";
  }

  return format(new Date(value), "dd.MM.yyyy HH:mm");
}
