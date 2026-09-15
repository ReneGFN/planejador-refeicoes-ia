"use client";

import { useState } from "react";
import { Utensils } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface MealRatingProps {
  value: number | null;
  onRate: (rating: number) => void;
  onRemove: () => void;
  pending?: boolean;
  className?: string;
}

const ratingText = (rating: number | null) => rating === null ? "Ainda sem avaliação" : `${rating} de 5 pratos`;

export function MealRating({ value, onRate, onRemove, pending = false, className }: MealRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const highlighted = hover ?? value ?? 0;

  return <section className={cn("meal-rating", pending && "meal-rating-pending", className)} aria-label={`Avaliação da refeição: ${ratingText(value)}`}>
    <div className="meal-rating-heading"><span>Como foi essa refeição?</span><strong aria-live="polite">{pending ? "Salvando avaliação…" : ratingText(value)}</strong></div>
    <div className="meal-rating-controls" aria-label={`Escolha uma nota. Atual: ${ratingText(value)}`} onMouseLeave={() => setHover(null)}>
      {Array.from({ length: 5 }, (_, index) => index + 1).map(rating => <motion.button
        key={rating}
        type="button"
        className={cn("meal-rating-choice", highlighted >= rating && "is-highlighted", value === rating && "is-selected")}
        aria-label={`Avaliar com ${rating} ${rating === 1 ? "prato" : "pratos"}`}
        aria-pressed={value === rating}
        disabled={pending}
        onClick={() => onRate(rating)}
        onMouseEnter={() => !pending && setHover(rating)}
        whileHover={!pending ? { scale: 1.22, rotate: -8 } : undefined}
        whileTap={!pending ? { scale: 0.92, rotate: 10 } : undefined}
        transition={{ duration: 0.2, ease: "easeOut" }}
      ><Utensils aria-hidden="true" /></motion.button>)}
      {value !== null && <button type="button" className="meal-rating-remove" disabled={pending} onClick={onRemove}>Remover avaliação</button>}
    </div>
  </section>;
}
