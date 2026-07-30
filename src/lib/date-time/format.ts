import { format } from "date-fns";
import { ru } from "date-fns/locale";

export function formatMoscowDateTime(value: string | null) {
  if (!value) {
    return "Дата уточняется";
  }

  return format(new Date(value), "dd.MM.yyyy HH:mm");
}

export function formatMatchDateParts(value: string | null) {
  if (!value) {
    return {
      date: "Дата уточняется",
      time: ""
    };
  }

  const date = new Date(value);
  return {
    date: format(date, "d MMMM, EEEE", { locale: ru }),
    time: format(date, "HH:mm")
  };
}
