"use client";

import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

const phrases = [
  "Готовим календарь матчей...",
  "Обновляем турнирную таблицу...",
  "Считаем голы и передачи...",
  "Проверяем составы команд...",
  "Расставляем команды по местам..."
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

export function Splash(props: {
  loading: boolean;
  error: string | null;
  userName: string;
  appName: string;
  logoUrl: string;
  primaryColor: string;
  onRetry: () => void;
}) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPhraseIndex((current) => (current + 1) % phrases.length);
    }, 1500);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="splash" style={{ "--accent": props.primaryColor } as React.CSSProperties}>
      <img className="splash-logo" src={props.logoUrl} alt={props.appName} />
      <h1>{greeting()}, {props.userName}</h1>
      {props.error ? (
        <>
          <span className="splash-error">{props.error}</span>
          <button onClick={props.onRetry}>
            <RotateCw size={18} />
            Повторить
          </button>
        </>
      ) : (
        <>
          <span>{phrases[phraseIndex]}</span>
          <div className="loader" aria-label="Загрузка" />
        </>
      )}
    </main>
  );
}
